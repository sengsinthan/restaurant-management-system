import "server-only";

import { prisma } from "@/lib/prisma";
import { round2 } from "@/lib/money";
import { plain } from "@/lib/serialize";
import type { Prisma } from "@/generated/prisma/client";
import type { PaymentMethod } from "@/generated/prisma/enums";
import { BusinessRuleError, recalculateOrder } from "./orders";
import { deductOrderInventory } from "./inventory";

export type TenderInput = {
  method: PaymentMethod;
  amount: number;
  received?: number;
  reference?: string | null;
};

export type PaymentResult = {
  orderId: string;
  orderNumber: string;
  total: number;
  paid: number;
  change: number;
  completed: boolean;
};

/**
 * Records one or more tenders against an order (split payments are just
 * several tenders in the same call) and, once the order is fully covered,
 * completes it and deducts inventory — all in a single transaction so an
 * order can never be marked paid without its stock movement, or vice versa.
 */
export async function recordPayment(
  orderId: string,
  tenders: TenderInput[],
  userId: string,
  options: { completeOrder?: boolean } = {},
): Promise<PaymentResult> {
  if (tenders.length === 0) throw new BusinessRuleError("Add at least one payment.");

  for (const tender of tenders) {
    if (!(tender.amount > 0)) throw new BusinessRuleError("Payment amounts must be greater than zero.");
    if (tender.method === "CASH" && tender.received !== undefined && tender.received < tender.amount) {
      throw new BusinessRuleError("Cash received cannot be less than the amount applied.");
    }
    if (tender.method !== "CASH" && !tender.reference?.trim() && tender.method !== "OTHER") {
      throw new BusinessRuleError(
        `${tender.method === "BANK_TRANSFER" ? "Bank transfer" : tender.method} payments need a transaction reference.`,
      );
    }
  }

  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        total: true,
        paidTotal: true,
        tableId: true,
        payments: { where: { state: "COMPLETED" }, select: { amount: true } },
      },
    });

    if (order.status === "CANCELLED") throw new BusinessRuleError("A cancelled order cannot be paid.");

    const alreadyPaid = round2(order.payments.reduce((acc, p) => acc + Number(p.amount), 0));
    const outstanding = round2(Number(order.total) - alreadyPaid);
    if (outstanding <= 0.005) throw new BusinessRuleError("This order is already fully paid.");

    const tendered = round2(tenders.reduce((acc, t) => acc + t.amount, 0));
    // Overpayment is only legitimate for cash, where the difference is change.
    if (tendered - outstanding > 0.005) {
      throw new BusinessRuleError(
        `Payments total ${tendered.toFixed(2)} but only ${outstanding.toFixed(2)} is outstanding.`,
      );
    }

    let changeGiven = 0;
    for (const tender of tenders) {
      const received = tender.method === "CASH" ? (tender.received ?? tender.amount) : tender.amount;
      const change = tender.method === "CASH" ? round2(received - tender.amount) : 0;
      changeGiven = round2(changeGiven + change);

      await tx.payment.create({
        data: {
          orderId,
          method: tender.method,
          amount: round2(tender.amount),
          received: round2(received),
          change,
          reference: tender.reference?.trim() || null,
          userId,
        },
      });
    }

    if (changeGiven > 0) {
      await tx.order.update({
        where: { id: orderId },
        data: { changeGiven: { increment: changeGiven } },
      });
    }

    const updated = await recalculateOrder(tx, orderId);

    // Fully paid: settle the order and move stock in the same transaction.
    let completed = false;
    if (updated.paymentStatus === "PAID" && options.completeOrder !== false) {
      if (order.status !== "COMPLETED") {
        await tx.order.update({
          where: { id: orderId },
          data: { status: "COMPLETED", completedAt: new Date() },
        });
        await tx.orderItem.updateMany({
          where: { orderId, status: { notIn: ["CANCELLED", "SERVED"] } },
          data: { status: "SERVED" },
        });
      }
      await deductOrderInventory(tx, orderId, userId);

      if (order.tableId) {
        const live = await tx.order.count({
          where: { tableId: order.tableId, status: { notIn: ["COMPLETED", "CANCELLED"] } },
        });
        if (live === 0) {
          await tx.restaurantTable.update({
            where: { id: order.tableId },
            data: { status: "CLEANING", occupiedAt: null },
          });
        }
      }
      completed = true;
    }

    return {
      orderId,
      orderNumber: order.orderNumber,
      total: Number(updated.total),
      paid: Number(updated.paidTotal),
      change: changeGiven,
      completed,
    };
  });
}

/**
 * Voids a payment and reverses the order's settled state — including
 * returning any inventory that was deducted when it completed.
 */
export async function refundPayment(paymentId: string, userId: string, reason: string) {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUniqueOrThrow({
      where: { id: paymentId },
      select: { id: true, orderId: true, state: true, amount: true },
    });
    if (payment.state !== "COMPLETED") throw new BusinessRuleError("This payment is not refundable.");

    await tx.payment.update({
      where: { id: paymentId },
      data: { state: "REFUNDED", note: reason.trim() || null },
    });

    const order = await tx.order.findUniqueOrThrow({
      where: { id: payment.orderId },
      select: { id: true, status: true, inventoryDeducted: true },
    });

    if (order.status === "COMPLETED") {
      await tx.order.update({
        where: { id: order.id },
        data: { status: "SERVED", completedAt: null },
      });
      if (order.inventoryDeducted) {
        const { reverseOrderInventory } = await import("./inventory");
        await reverseOrderInventory(tx, order.id, userId);
      }
    }

    const updated = await recalculateOrder(tx, payment.orderId);
    if (Number(updated.paidTotal) === 0) {
      await tx.order.update({ where: { id: order.id }, data: { paymentStatus: "REFUNDED" } });
    }

    return { orderId: payment.orderId, amount: Number(payment.amount) };
  });
}

export async function listPayments(
  restaurantId: string,
  filters: { from?: Date; to?: Date; method?: PaymentMethod | "ALL"; search?: string } = {},
) {
  const where: Prisma.PaymentWhereInput = {
    order: { restaurantId },
    ...(filters.method && filters.method !== "ALL" ? { method: filters.method } : {}),
    ...(filters.from || filters.to
      ? { createdAt: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) } }
      : {}),
    ...(filters.search
      ? {
          OR: [
            { reference: { contains: filters.search, mode: "insensitive" as const } },
            { order: { orderNumber: { contains: filters.search, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  const [payments, totals] = await Promise.all([
    prisma.payment.findMany({
      where,
      include: {
        order: { select: { id: true, orderNumber: true, type: true, total: true } },
        user: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.payment.groupBy({
      by: ["method"],
      where: { ...where, state: "COMPLETED" },
      _sum: { amount: true },
      _count: { _all: true },
    }),
  ]);

  return {
    payments: plain(payments),
    byMethod: totals.map((t) => ({
      method: t.method,
      total: Number(t._sum.amount ?? 0),
      count: t._count._all,
    })),
  };
}

/** Orders waiting to be settled — the payments queue. */
export async function getUnpaidOrders(restaurantId: string) {
  const orders = await prisma.order.findMany({
    where: {
      restaurantId,
      status: { notIn: ["CANCELLED", "COMPLETED"] },
      paymentStatus: { in: ["UNPAID", "PARTIALLY_PAID"] },
    },
    include: {
      table: { select: { number: true } },
      customer: { select: { name: true } },
      _count: { select: { items: true } },
    },
    orderBy: { placedAt: "asc" },
  });
  return plain(orders);
}

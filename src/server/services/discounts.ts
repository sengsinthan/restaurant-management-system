import "server-only";

import { prisma } from "@/lib/prisma";
import { round2 } from "@/lib/money";
import { plain } from "@/lib/serialize";
import { PERMISSIONS } from "@/lib/permissions";
import type { SessionUser } from "@/server/auth/session";
import type { Prisma } from "@/generated/prisma/client";
import type { DiscountType, OrderStatus, PaymentStatus } from "@/generated/prisma/enums";
import { BusinessRuleError, recalculateOrder } from "./orders";

/**
 * A bill can be discounted right up until it is settled — which is when it
 * usually happens, with the order already SERVED and the guest at the till.
 * Once money has been taken in full, or the order is closed, the total is
 * fixed; changing it then would leave `paid_total` above `total`.
 */
function assertDiscountable(order: { status: OrderStatus; paymentStatus: PaymentStatus }) {
  if (order.status === "COMPLETED" || order.status === "CANCELLED") {
    throw new BusinessRuleError(
      `A ${order.status.toLowerCase()} order can no longer be discounted.`,
    );
  }
  if (order.paymentStatus === "PAID") {
    throw new BusinessRuleError("This order is already paid in full — refund it to change the total.");
  }
}

export type ApplyDiscountInput =
  | { kind: "code"; code: string; reason?: string }
  | { kind: "manual"; type: DiscountType; value: number; label?: string; reason?: string };

/**
 * Applies a discount to an order.
 *
 * A discount worth more than the restaurant's approval threshold (as a
 * percentage of the order subtotal) requires `discounts.approve` — a cashier
 * cannot give away 50% of the bill without a manager's permission. The
 * approving user is recorded on the row for the audit trail.
 */
export async function applyDiscount(
  orderId: string,
  input: ApplyDiscountInput,
  user: SessionUser,
) {
  if (!user.permissions.includes(PERMISSIONS.DISCOUNTS_APPLY)) {
    throw new BusinessRuleError("You don't have permission to apply discounts.");
  }

  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findFirstOrThrow({
      where: { id: orderId, restaurantId: user.restaurantId },
      select: {
        id: true,
        status: true,
        paymentStatus: true,
        subtotal: true,
        paidTotal: true,
        restaurantId: true,
      },
    });
    assertDiscountable(order);

    const restaurant = await tx.restaurant.findUniqueOrThrow({
      where: { id: order.restaurantId },
      select: { discountApprovalThreshold: true },
    });

    const subtotal = Number(order.subtotal);
    if (subtotal <= 0) throw new BusinessRuleError("Add items before applying a discount.");

    let discountId: string | null = null;
    let label: string;
    let type: DiscountType;
    let value: number;
    let amount: number;

    if (input.kind === "code") {
      const code = input.code.trim().toUpperCase();
      const discount = await tx.discount.findFirst({
        where: { restaurantId: order.restaurantId, code, deletedAt: null },
      });
      if (!discount) throw new BusinessRuleError(`No discount found for code "${code}".`);
      if (!discount.isActive) throw new BusinessRuleError(`${discount.name} is no longer active.`);

      const now = new Date();
      if (discount.startsAt && discount.startsAt > now) {
        throw new BusinessRuleError(`${discount.name} is not valid yet.`);
      }
      if (discount.endsAt && discount.endsAt < now) {
        throw new BusinessRuleError(`${discount.name} has expired.`);
      }
      if (discount.usageLimit !== null && discount.usageCount >= discount.usageLimit) {
        throw new BusinessRuleError(`${discount.name} has reached its usage limit.`);
      }
      if (subtotal < Number(discount.minOrderAmount)) {
        throw new BusinessRuleError(
          `${discount.name} needs a minimum order of ${Number(discount.minOrderAmount).toFixed(2)}.`,
        );
      }

      const already = await tx.orderDiscount.findFirst({ where: { orderId, discountId: discount.id } });
      if (already) throw new BusinessRuleError(`${discount.name} is already applied to this order.`);

      discountId = discount.id;
      label = discount.name;
      type = discount.type;
      value = Number(discount.value);
      amount =
        type === "PERCENTAGE" ? round2((subtotal * value) / 100) : round2(value);
      if (discount.maxDiscount) amount = Math.min(amount, Number(discount.maxDiscount));
    } else {
      value = Number(input.value);
      if (!(value > 0)) throw new BusinessRuleError("Enter a discount greater than zero.");
      type = input.type;
      if (type === "PERCENTAGE" && value > 100) {
        throw new BusinessRuleError("A percentage discount cannot exceed 100%.");
      }
      label = input.label?.trim() || (type === "PERCENTAGE" ? `${value}% off` : `${value.toFixed(2)} off`);
      amount = type === "PERCENTAGE" ? round2((subtotal * value) / 100) : round2(value);
    }

    // Never let discounts exceed the value of the goods.
    const existing = await tx.orderDiscount.aggregate({
      where: { orderId },
      _sum: { amount: true },
    });
    const alreadyDiscounted = Number(existing._sum.amount ?? 0);
    amount = Math.min(amount, round2(subtotal - alreadyDiscounted));
    if (amount <= 0) throw new BusinessRuleError("The order is already fully discounted.");

    // On a part-paid bill the new total must still cover what has been taken.
    const paidTotal = Number(order.paidTotal);
    if (paidTotal > 0) {
      const projectedTotal = await projectTotal(tx, orderId, round2(alreadyDiscounted + amount));
      if (projectedTotal < paidTotal - 0.005) {
        throw new BusinessRuleError(
          `That discount would drop the total below the ${paidTotal.toFixed(2)} already paid.`,
        );
      }
    }

    const effectivePercent = round2(((alreadyDiscounted + amount) / subtotal) * 100);
    const threshold = Number(restaurant.discountApprovalThreshold);
    const needsApproval = effectivePercent > threshold;
    if (needsApproval && !user.permissions.includes(PERMISSIONS.DISCOUNTS_APPROVE)) {
      throw new BusinessRuleError(
        `A discount of ${effectivePercent.toFixed(1)}% is above the ${threshold}% limit and needs manager approval.`,
      );
    }

    await tx.orderDiscount.create({
      data: {
        orderId,
        discountId,
        label,
        type,
        value,
        amount,
        reason: input.reason?.trim() || null,
        appliedById: user.id,
        approvedById: needsApproval ? user.id : null,
      },
    });

    if (discountId) {
      await tx.discount.update({
        where: { id: discountId },
        data: { usageCount: { increment: 1 } },
      });
    }

    const updated = await recalculateOrder(tx, orderId);
    return { amount, label, total: Number(updated.total) };
  });
}

/** Recomputes what an order's total would become under a different discount. */
async function projectTotal(
  tx: Prisma.TransactionClient,
  orderId: string,
  discountTotal: number,
): Promise<number> {
  const order = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
    select: {
      subtotal: true,
      taxRate: true,
      serviceChargeRate: true,
    },
  });
  const taxable = round2(Number(order.subtotal) - discountTotal);
  return round2(
    taxable +
      (taxable * Number(order.taxRate)) / 100 +
      (taxable * Number(order.serviceChargeRate)) / 100,
  );
}

export async function removeOrderDiscount(orderDiscountId: string, restaurantId: string) {
  return prisma.$transaction(async (tx) => {
    const record = await tx.orderDiscount.findFirstOrThrow({
      where: { id: orderDiscountId, order: { restaurantId } },
      select: {
        id: true,
        orderId: true,
        discountId: true,
        order: { select: { status: true, paymentStatus: true } },
      },
    });
    assertDiscountable(record.order);

    await tx.orderDiscount.delete({ where: { id: record.id } });
    if (record.discountId) {
      await tx.discount.update({
        where: { id: record.discountId },
        data: { usageCount: { decrement: 1 } },
      });
    }
    await recalculateOrder(tx, record.orderId);
    return { orderId: record.orderId };
  });
}

export async function listDiscounts(restaurantId: string) {
  const discounts = await prisma.discount.findMany({
    where: { restaurantId, deletedAt: null },
    orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
    include: { _count: { select: { orders: true } } },
  });
  return plain(discounts);
}

export async function listActiveDiscounts(restaurantId: string) {
  const now = new Date();
  const discounts = await prisma.discount.findMany({
    where: {
      restaurantId,
      deletedAt: null,
      isActive: true,
      OR: [{ startsAt: null }, { startsAt: { lte: now } }],
      AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
    },
    orderBy: { name: "asc" },
  });
  return plain(discounts);
}

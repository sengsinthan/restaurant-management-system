"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { PERMISSIONS } from "@/lib/permissions";
import { authorize } from "@/server/auth/rbac";
import { writeAudit } from "@/server/audit";
import { publish } from "@/server/events";
import { notify } from "@/server/notifications";
import { recordPayment, refundPayment, type TenderInput } from "@/server/services/payments";
import { run, type ActionResult } from "./result";

const tenderSchema = z.object({
  method: z.enum(["CASH", "CARD", "QR", "BANK_TRANSFER", "OTHER"]),
  amount: z.number().positive().max(1_000_000),
  received: z.number().min(0).max(1_000_000).optional(),
  reference: z.string().max(120).nullable().optional(),
});

export async function recordPaymentAction(
  orderId: string,
  tenders: z.input<typeof tenderSchema>[],
): Promise<
  ActionResult<{ orderNumber: string; total: number; paid: number; change: number; completed: boolean }>
> {
  return run(async () => {
    const user = await authorize(PERMISSIONS.PAYMENTS_PROCESS);
    const parsed = z.array(tenderSchema).min(1, "Add at least one payment.").parse(tenders);

    const result = await recordPayment(orderId, parsed as TenderInput[], user.id);

    await writeAudit(user, {
      action: "PAYMENT",
      entity: "Order",
      entityId: orderId,
      newValue: {
        tenders: parsed.map((t) => ({ method: t.method, amount: t.amount })),
        paid: result.paid,
        change: result.change,
      },
      description: `Processed payment for ${result.orderNumber} (${result.paid.toFixed(2)})`,
    });

    if (result.completed) {
      await notify({
        restaurantId: user.restaurantId,
        type: "PAYMENT",
        title: `Order ${result.orderNumber} settled`,
        message: `Payment of ${result.paid.toFixed(2)} received. Inventory has been updated.`,
        entity: "Order",
        entityId: orderId,
        link: `/orders/${orderId}`,
      });
    }

    publish("payment.recorded", user.restaurantId, orderId);
    publish("order.updated", user.restaurantId, orderId);
    if (result.completed) {
      publish("order.completed", user.restaurantId, orderId);
      publish("inventory.updated", user.restaurantId);
      publish("table.updated", user.restaurantId);
      publish("kitchen.updated", user.restaurantId, orderId);
    }
    for (const path of ["/dashboard", "/orders", "/tables", "/kitchen", "/payments", "/pos"]) {
      revalidatePath(path);
    }
    revalidatePath(`/orders/${orderId}`);

    return {
      orderNumber: result.orderNumber,
      total: result.total,
      paid: result.paid,
      change: result.change,
      completed: result.completed,
    };
  });
}

export async function refundPaymentAction(
  paymentId: string,
  reason: string,
): Promise<ActionResult> {
  return run(async () => {
    const user = await authorize(PERMISSIONS.PAYMENTS_REFUND);
    if (!reason.trim()) throw new Error("A refund reason is required.");

    const result = await refundPayment(paymentId, user.id, reason);

    await writeAudit(user, {
      action: "REFUND",
      entity: "Payment",
      entityId: paymentId,
      newValue: { amount: result.amount, reason },
      description: `Refunded ${result.amount.toFixed(2)} — ${reason}`,
    });

    publish("payment.recorded", user.restaurantId, result.orderId);
    publish("inventory.updated", user.restaurantId);
    for (const path of ["/dashboard", "/orders", "/payments", "/reports"]) revalidatePath(path);
    revalidatePath(`/orders/${result.orderId}`);
    return undefined;
  });
}

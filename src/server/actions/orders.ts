"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { PERMISSIONS } from "@/lib/permissions";
import { authorize } from "@/server/auth/rbac";
import { writeAudit } from "@/server/audit";
import { publish } from "@/server/events";
import { notify } from "@/server/notifications";
import {
  addItemsToOrder,
  cancelOrder,
  createOrder,
  setOrderPriority,
  updateOrderItemNotes,
  updateOrderItemQuantity,
  updateOrderStatus,
  type CartItemInput,
} from "@/server/services/orders";
import { applyDiscount, removeOrderDiscount, type ApplyDiscountInput } from "@/server/services/discounts";
import { checkStockForItems } from "@/server/services/inventory";
import { run, type ActionResult } from "./result";

const cartItemSchema = z.object({
  menuItemId: z.string().uuid(),
  variantId: z.string().uuid().nullable().optional(),
  quantity: z.number().int().min(1).max(99),
  notes: z.string().max(200).nullable().optional(),
  addonIds: z.array(z.string().uuid()).optional(),
});

const createOrderSchema = z.object({
  type: z.enum(["DINE_IN", "TAKEAWAY", "DELIVERY"]),
  tableId: z.string().uuid().nullable().optional(),
  customerId: z.string().uuid().nullable().optional(),
  guestCount: z.number().int().min(1).max(50).optional(),
  notes: z.string().max(500).nullable().optional(),
  deliveryAddress: z.string().max(300).nullable().optional(),
  items: z.array(cartItemSchema).min(1, "Add at least one item to the order."),
});

function revalidateService() {
  for (const path of ["/dashboard", "/pos", "/orders", "/tables", "/kitchen", "/payments"]) {
    revalidatePath(path);
  }
}

export async function createOrderAction(
  input: z.input<typeof createOrderSchema>,
): Promise<ActionResult<{ orderId: string; orderNumber: string; total: number }>> {
  return run(async () => {
    const user = await authorize(PERMISSIONS.ORDERS_CREATE);
    const data = createOrderSchema.parse(input);

    const order = await createOrder({
      restaurantId: user.restaurantId,
      staffId: user.id,
      type: data.type,
      tableId: data.tableId ?? null,
      customerId: data.customerId ?? null,
      guestCount: data.guestCount,
      notes: data.notes ?? null,
      deliveryAddress: data.deliveryAddress ?? null,
      items: data.items as CartItemInput[],
    });

    await writeAudit(user, {
      action: "CREATE",
      entity: "Order",
      entityId: order.id,
      newValue: { orderNumber: order.orderNumber, total: Number(order.total), type: data.type },
      description: `Created order ${order.orderNumber}`,
    });

    await notify({
      restaurantId: user.restaurantId,
      type: "ORDER",
      title: `New order ${order.orderNumber}`,
      message: `${data.items.length} item${data.items.length === 1 ? "" : "s"} sent to the kitchen.`,
      entity: "Order",
      entityId: order.id,
      link: `/orders/${order.id}`,
    });

    publish("order.created", user.restaurantId, order.id);
    publish("kitchen.updated", user.restaurantId, order.id);
    if (order.tableId) publish("table.updated", user.restaurantId, order.tableId);
    revalidateService();

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      total: Number(order.total),
    };
  });
}

export async function addOrderItemsAction(
  orderId: string,
  items: z.input<typeof cartItemSchema>[],
): Promise<ActionResult<{ total: number }>> {
  return run(async () => {
    const user = await authorize(PERMISSIONS.ORDERS_UPDATE);
    const parsed = z.array(cartItemSchema).min(1).parse(items);
    const order = await addItemsToOrder(orderId, parsed as CartItemInput[]);

    await writeAudit(user, {
      action: "UPDATE",
      entity: "Order",
      entityId: orderId,
      newValue: { addedItems: parsed.length, total: Number(order.total) },
      description: `Added ${parsed.length} item(s) to ${order.orderNumber}`,
    });

    publish("order.updated", user.restaurantId, orderId);
    publish("kitchen.updated", user.restaurantId, orderId);
    revalidateService();
    revalidatePath(`/orders/${orderId}`);
    return { total: Number(order.total) };
  });
}

export async function updateOrderItemQuantityAction(
  orderItemId: string,
  quantity: number,
): Promise<ActionResult<{ total: number }>> {
  return run(async () => {
    const user = await authorize(PERMISSIONS.ORDERS_UPDATE);
    const order = await updateOrderItemQuantity(orderItemId, Math.trunc(quantity));

    publish("order.updated", user.restaurantId, order.id);
    publish("kitchen.updated", user.restaurantId, order.id);
    revalidateService();
    revalidatePath(`/orders/${order.id}`);
    return { total: Number(order.total) };
  });
}

export async function updateOrderItemNotesAction(
  orderItemId: string,
  notes: string,
): Promise<ActionResult> {
  return run(async () => {
    const user = await authorize(PERMISSIONS.ORDERS_UPDATE);
    const orderId = await updateOrderItemNotes(orderItemId, notes);
    publish("kitchen.updated", user.restaurantId, orderId);
    revalidatePath(`/orders/${orderId}`);
    revalidatePath("/kitchen");
    return undefined;
  });
}

export async function updateOrderStatusAction(
  orderId: string,
  status: "PENDING" | "CONFIRMED" | "PREPARING" | "READY" | "SERVED" | "COMPLETED",
): Promise<ActionResult<{ status: string }>> {
  return run(async () => {
    // Kitchen staff advance tickets with kitchen.update; everyone else needs
    // the broader order permission.
    const kitchenTransition = status === "PREPARING" || status === "READY";
    const user = await authorize(
      kitchenTransition ? PERMISSIONS.KITCHEN_UPDATE : PERMISSIONS.ORDERS_UPDATE,
    );

    const result = await updateOrderStatus(orderId, status, user.id);

    await writeAudit(user, {
      action: "STATUS_CHANGE",
      entity: "Order",
      entityId: orderId,
      previousValue: { status: result.previous },
      newValue: { status: result.next },
      description: `Order moved from ${result.previous} to ${result.next}`,
    });

    if (status === "READY") {
      await notify({
        restaurantId: user.restaurantId,
        type: "KITCHEN",
        title: "Order ready",
        message: "An order is ready to be served.",
        entity: "Order",
        entityId: orderId,
        link: `/orders/${orderId}`,
      });
    }

    publish("order.status", user.restaurantId, orderId, { status });
    publish("kitchen.updated", user.restaurantId, orderId);
    publish("table.updated", user.restaurantId);
    if (status === "COMPLETED") {
      publish("order.completed", user.restaurantId, orderId);
      publish("inventory.updated", user.restaurantId);
    }
    revalidateService();
    revalidatePath(`/orders/${orderId}`);
    return { status };
  });
}

export async function cancelOrderAction(
  orderId: string,
  reason: string,
): Promise<ActionResult> {
  return run(async () => {
    const user = await authorize(PERMISSIONS.ORDERS_CANCEL);
    if (!reason.trim()) throw new Error("A cancellation reason is required.");

    await cancelOrder(orderId, reason, user.id);

    await writeAudit(user, {
      action: "CANCEL",
      entity: "Order",
      entityId: orderId,
      newValue: { reason },
      description: `Cancelled order — ${reason}`,
    });

    publish("order.cancelled", user.restaurantId, orderId);
    publish("kitchen.updated", user.restaurantId, orderId);
    publish("table.updated", user.restaurantId);
    publish("inventory.updated", user.restaurantId);
    revalidateService();
    revalidatePath(`/orders/${orderId}`);
    return undefined;
  });
}

export async function setOrderPriorityAction(
  orderId: string,
  priority: "NORMAL" | "HIGH" | "RUSH",
): Promise<ActionResult> {
  return run(async () => {
    const user = await authorize(PERMISSIONS.KITCHEN_UPDATE);
    await setOrderPriority(orderId, priority);
    publish("kitchen.updated", user.restaurantId, orderId);
    revalidatePath("/kitchen");
    revalidatePath(`/orders/${orderId}`);
    return undefined;
  });
}

export async function applyDiscountAction(
  orderId: string,
  input: ApplyDiscountInput,
): Promise<ActionResult<{ amount: number; label: string; total: number }>> {
  return run(async () => {
    const user = await authorize(PERMISSIONS.DISCOUNTS_APPLY);
    const result = await applyDiscount(orderId, input, user);

    await writeAudit(user, {
      action: "DISCOUNT_APPLIED",
      entity: "Order",
      entityId: orderId,
      newValue: { label: result.label, amount: result.amount },
      description: `Applied ${result.label} (-${result.amount.toFixed(2)})`,
    });

    publish("order.updated", user.restaurantId, orderId);
    revalidateService();
    revalidatePath(`/orders/${orderId}`);
    return result;
  });
}

export async function removeDiscountAction(orderDiscountId: string): Promise<ActionResult> {
  return run(async () => {
    const user = await authorize(PERMISSIONS.DISCOUNTS_APPLY);
    const { orderId } = await removeOrderDiscount(orderDiscountId, user.restaurantId);

    await writeAudit(user, {
      action: "DISCOUNT_REMOVED",
      entity: "Order",
      entityId: orderId,
      description: "Removed a discount from the order",
    });

    publish("order.updated", user.restaurantId, orderId);
    revalidateService();
    revalidatePath(`/orders/${orderId}`);
    return undefined;
  });
}

/** Pre-flight stock warning shown in the POS before an order is sent. */
export async function checkStockAction(
  items: { menuItemId: string; quantity: number }[],
): Promise<ActionResult<{ name: string; required: number; available: number; unit: string }[]>> {
  return run(async () => {
    await authorize(PERMISSIONS.POS_USE);
    return checkStockForItems(items);
  });
}

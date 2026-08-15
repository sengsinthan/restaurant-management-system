import "server-only";

import { prisma } from "@/lib/prisma";
import { round2 } from "@/lib/money";
import { plain } from "@/lib/serialize";
import { ORDER_STATUS_FLOW } from "@/lib/status";
import type { Prisma } from "@/generated/prisma/client";
import type { OrderStatus, OrderType, PaymentStatus } from "@/generated/prisma/enums";

type Tx = Prisma.TransactionClient;

export class BusinessRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BusinessRuleError";
  }
}

export type CartItemInput = {
  menuItemId: string;
  variantId?: string | null;
  quantity: number;
  notes?: string | null;
  addonIds?: string[];
};

/** Statuses in which an order's contents may still be edited. */
const EDITABLE_STATUSES: OrderStatus[] = ["PENDING", "CONFIRMED", "PREPARING"];

export function isEditable(status: OrderStatus): boolean {
  return EDITABLE_STATUSES.includes(status);
}

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

/**
 * Recomputes every monetary field on an order from its current lines and
 * discounts. Called after any mutation so totals can never drift from the
 * items they describe.
 *
 * Order of operations: line totals → discounts → tax and service charge on
 * the discounted subtotal → grand total.
 */
export async function recalculateOrder(tx: Tx, orderId: string) {
  const order = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
    select: {
      id: true,
      type: true,
      taxRate: true,
      serviceChargeRate: true,
      total: true,
      items: { where: { status: { not: "CANCELLED" } }, select: { lineTotal: true } },
      discounts: { select: { amount: true } },
      payments: { where: { state: "COMPLETED" }, select: { amount: true } },
    },
  });

  const subtotal = round2(order.items.reduce((acc, i) => acc + Number(i.lineTotal), 0));
  const rawDiscount = round2(order.discounts.reduce((acc, d) => acc + Number(d.amount), 0));
  const discountTotal = Math.min(rawDiscount, subtotal);
  const taxable = round2(subtotal - discountTotal);
  const taxTotal = round2((taxable * Number(order.taxRate)) / 100);
  const serviceChargeTotal = round2((taxable * Number(order.serviceChargeRate)) / 100);
  const total = round2(taxable + taxTotal + serviceChargeTotal);
  const paidTotal = round2(order.payments.reduce((acc, p) => acc + Number(p.amount), 0));

  const paymentStatus: PaymentStatus =
    paidTotal <= 0 ? "UNPAID" : paidTotal + 0.005 >= total ? "PAID" : "PARTIALLY_PAID";

  return tx.order.update({
    where: { id: orderId },
    data: { subtotal, discountTotal, taxTotal, serviceChargeTotal, total, paidTotal, paymentStatus },
  });
}

/**
 * Prices a cart against the live menu and validates availability.
 * Prices are read from the database, never trusted from the client.
 */
async function priceCartItems(tx: Tx, restaurantId: string, items: CartItemInput[]) {
  if (items.length === 0) throw new BusinessRuleError("An order needs at least one item.");

  const menuItems = await tx.menuItem.findMany({
    where: { id: { in: items.map((i) => i.menuItemId) }, restaurantId, deletedAt: null },
    include: { variants: true, addons: true },
  });

  return items.map((input) => {
    if (!Number.isInteger(input.quantity) || input.quantity < 1) {
      throw new BusinessRuleError("Item quantity must be a whole number of at least 1.");
    }

    const menuItem = menuItems.find((m) => m.id === input.menuItemId);
    if (!menuItem) throw new BusinessRuleError("One of the items is no longer on the menu.");
    if (menuItem.status !== "AVAILABLE") {
      throw new BusinessRuleError(`${menuItem.name} is currently ${menuItem.status.toLowerCase()}.`);
    }

    let unitPrice = Number(menuItem.price);
    let unitCost = Number(menuItem.cost);
    let variantName: string | null = null;

    if (input.variantId) {
      const variant = menuItem.variants.find((v) => v.id === input.variantId);
      if (!variant || !variant.isActive || variant.deletedAt) {
        throw new BusinessRuleError(`That option for ${menuItem.name} is no longer available.`);
      }
      unitPrice = Number(variant.price);
      unitCost = Number(variant.cost);
      variantName = variant.name;
    }

    const addons = (input.addonIds ?? []).map((addonId) => {
      const addon = menuItem.addons.find((a) => a.id === addonId);
      if (!addon || !addon.isActive || addon.deletedAt) {
        throw new BusinessRuleError(`An add-on for ${menuItem.name} is no longer available.`);
      }
      return { addonId: addon.id, nameSnap: addon.name, price: Number(addon.price) };
    });

    const addonsTotal = round2(addons.reduce((acc, a) => acc + a.price, 0) * input.quantity);
    const lineTotal = round2(unitPrice * input.quantity + addonsTotal);

    return {
      menuItemId: menuItem.id,
      variantId: input.variantId ?? null,
      nameSnap: menuItem.name,
      variantSnap: variantName,
      unitPrice,
      unitCost,
      quantity: input.quantity,
      addonsTotal,
      lineTotal,
      notes: input.notes?.trim() || null,
      addons,
    };
  });
}

// ---------------------------------------------------------------------------
// Order number
// ---------------------------------------------------------------------------

async function nextOrderNumber(tx: Tx): Promise<string> {
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(
    now.getDate(),
  ).padStart(2, "0")}`;

  const last = await tx.order.findFirst({
    where: { orderNumber: { startsWith: `ORD-${stamp}-` } },
    orderBy: { orderNumber: "desc" },
    select: { orderNumber: true },
  });

  const sequence = last ? Number(last.orderNumber.split("-")[2]) + 1 : 1;
  return `ORD-${stamp}-${String(sequence).padStart(4, "0")}`;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

export type CreateOrderInput = {
  restaurantId: string;
  staffId: string;
  type: OrderType;
  tableId?: string | null;
  customerId?: string | null;
  guestCount?: number;
  notes?: string | null;
  deliveryAddress?: string | null;
  items: CartItemInput[];
};

export async function createOrder(input: CreateOrderInput) {
  return prisma.$transaction(async (tx) => {
    const restaurant = await tx.restaurant.findUniqueOrThrow({
      where: { id: input.restaurantId },
      select: { taxRate: true, serviceChargeRate: true },
    });

    if (input.type === "DINE_IN") {
      if (!input.tableId) throw new BusinessRuleError("Select a table for a dine-in order.");
      const table = await tx.restaurantTable.findFirst({
        where: { id: input.tableId, restaurantId: input.restaurantId, deletedAt: null },
      });
      if (!table) throw new BusinessRuleError("That table no longer exists.");
      if (table.status === "OUT_OF_SERVICE") {
        throw new BusinessRuleError(`Table ${table.number} is out of service.`);
      }
    }
    if (input.type === "DELIVERY" && !input.deliveryAddress?.trim()) {
      throw new BusinessRuleError("A delivery order needs a delivery address.");
    }

    const priced = await priceCartItems(tx, input.restaurantId, input.items);
    const orderNumber = await nextOrderNumber(tx);
    const serviceChargeRate = input.type === "DINE_IN" ? Number(restaurant.serviceChargeRate) : 0;

    const order = await tx.order.create({
      data: {
        restaurantId: input.restaurantId,
        orderNumber,
        type: input.type,
        status: "PENDING",
        paymentStatus: "UNPAID",
        tableId: input.type === "DINE_IN" ? input.tableId : null,
        customerId: input.customerId ?? null,
        staffId: input.staffId,
        guestCount: input.type === "DINE_IN" ? Math.max(1, input.guestCount ?? 1) : 1,
        notes: input.notes?.trim() || null,
        deliveryAddress: input.type === "DELIVERY" ? input.deliveryAddress!.trim() : null,
        taxRate: restaurant.taxRate,
        serviceChargeRate,
        items: {
          create: priced.map((line) => ({
            menuItemId: line.menuItemId,
            variantId: line.variantId,
            nameSnap: line.nameSnap,
            variantSnap: line.variantSnap,
            unitPrice: line.unitPrice,
            unitCost: line.unitCost,
            quantity: line.quantity,
            addonsTotal: line.addonsTotal,
            lineTotal: line.lineTotal,
            notes: line.notes,
            addons: line.addons.length
              ? { create: line.addons.map((a) => ({ addonId: a.addonId, nameSnap: a.nameSnap, price: a.price })) }
              : undefined,
          })),
        },
      },
    });

    if (input.type === "DINE_IN" && input.tableId) {
      await tx.restaurantTable.update({
        where: { id: input.tableId },
        data: { status: "OCCUPIED", occupiedAt: new Date() },
      });
    }

    return recalculateOrder(tx, order.id);
  });
}

export async function addItemsToOrder(orderId: string, items: CartItemInput[]) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { id: true, status: true, restaurantId: true },
    });
    if (!isEditable(order.status)) {
      throw new BusinessRuleError(`A ${order.status.toLowerCase()} order can no longer be changed.`);
    }

    const priced = await priceCartItems(tx, order.restaurantId, items);
    for (const line of priced) {
      await tx.orderItem.create({
        data: {
          orderId,
          menuItemId: line.menuItemId,
          variantId: line.variantId,
          nameSnap: line.nameSnap,
          variantSnap: line.variantSnap,
          unitPrice: line.unitPrice,
          unitCost: line.unitCost,
          quantity: line.quantity,
          addonsTotal: line.addonsTotal,
          lineTotal: line.lineTotal,
          notes: line.notes,
          addons: line.addons.length
            ? { create: line.addons.map((a) => ({ addonId: a.addonId, nameSnap: a.nameSnap, price: a.price })) }
            : undefined,
        },
      });
    }

    return recalculateOrder(tx, orderId);
  });
}

export async function updateOrderItemQuantity(orderItemId: string, quantity: number) {
  return prisma.$transaction(async (tx) => {
    const item = await tx.orderItem.findUniqueOrThrow({
      where: { id: orderItemId },
      select: {
        id: true,
        orderId: true,
        unitPrice: true,
        quantity: true,
        addonsTotal: true,
        order: { select: { status: true } },
        addons: { select: { price: true } },
      },
    });
    if (!isEditable(item.order.status)) {
      throw new BusinessRuleError("This order can no longer be changed.");
    }

    if (quantity <= 0) {
      await tx.orderItem.delete({ where: { id: orderItemId } });
    } else {
      const addonUnit = round2(item.addons.reduce((acc, a) => acc + Number(a.price), 0));
      const addonsTotal = round2(addonUnit * quantity);
      await tx.orderItem.update({
        where: { id: orderItemId },
        data: {
          quantity,
          addonsTotal,
          lineTotal: round2(Number(item.unitPrice) * quantity + addonsTotal),
        },
      });
    }

    const remaining = await tx.orderItem.count({ where: { orderId: item.orderId } });
    if (remaining === 0) {
      throw new BusinessRuleError("An order must keep at least one item — cancel it instead.");
    }

    return recalculateOrder(tx, item.orderId);
  });
}

export async function updateOrderItemNotes(orderItemId: string, notes: string | null) {
  const item = await prisma.orderItem.findUniqueOrThrow({
    where: { id: orderItemId },
    select: { orderId: true, order: { select: { status: true } } },
  });
  if (!isEditable(item.order.status)) {
    throw new BusinessRuleError("This order can no longer be changed.");
  }
  await prisma.orderItem.update({
    where: { id: orderItemId },
    data: { notes: notes?.trim() || null },
  });
  return item.orderId;
}

/**
 * Moves an order along its lifecycle. Only transitions declared in
 * ORDER_STATUS_FLOW are permitted, and COMPLETED additionally requires the
 * order to be fully paid — completing also deducts inventory atomically.
 */
export async function updateOrderStatus(
  orderId: string,
  next: OrderStatus,
  userId: string,
): Promise<{ orderId: string; previous: OrderStatus; next: OrderStatus }> {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      select: {
        id: true,
        status: true,
        total: true,
        paidTotal: true,
        tableId: true,
        kitchenAt: true,
        inventoryDeducted: true,
      },
    });

    if (order.status === next) return { orderId, previous: order.status, next };

    const allowed = ORDER_STATUS_FLOW[order.status];
    if (!allowed.includes(next)) {
      throw new BusinessRuleError(
        `An order that is ${order.status.toLowerCase()} cannot become ${next.toLowerCase()}.`,
      );
    }

    if (next === "COMPLETED") {
      const outstanding = round2(Number(order.total) - Number(order.paidTotal));
      if (outstanding > 0.005) {
        throw new BusinessRuleError(
          `Order still has ${outstanding.toFixed(2)} outstanding — take payment before completing it.`,
        );
      }
    }

    const now = new Date();
    const timestamps: Prisma.OrderUpdateInput = {};
    // Stamp the moment the ticket first reaches the kitchen, whichever route
    // it took to get there (pending → preparing, or via confirmed).
    if (next === "PREPARING" && !order.kitchenAt) timestamps.kitchenAt = now;
    if (next === "READY") timestamps.readyAt = now;
    if (next === "SERVED") timestamps.servedAt = now;
    if (next === "COMPLETED") timestamps.completedAt = now;

    await tx.order.update({ where: { id: orderId }, data: { status: next, ...timestamps } });

    if (next === "COMPLETED") {
      await deductInventoryFor(tx, orderId, userId);
      await releaseTableIfIdle(tx, order.tableId);
    }

    return { orderId, previous: order.status, next };
  });
}

export async function cancelOrder(orderId: string, reason: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { id: true, status: true, tableId: true, inventoryDeducted: true, paidTotal: true },
    });

    if (order.status === "CANCELLED") throw new BusinessRuleError("This order is already cancelled.");
    if (order.status === "COMPLETED" && Number(order.paidTotal) > 0) {
      throw new BusinessRuleError(
        "A paid, completed order must be refunded from the payment screen before it can be cancelled.",
      );
    }

    // Returning stock is what keeps a cancellation from quietly losing
    // inventory that was already deducted at completion.
    if (order.inventoryDeducted) {
      const { reverseOrderInventory } = await import("./inventory");
      await reverseOrderInventory(tx, orderId, userId);
    }

    await tx.order.update({
      where: { id: orderId },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason.trim() || null },
    });
    await tx.orderItem.updateMany({ where: { orderId }, data: { status: "CANCELLED" } });
    await releaseTableIfIdle(tx, order.tableId);

    return { orderId };
  });
}

export async function setOrderPriority(orderId: string, priority: "NORMAL" | "HIGH" | "RUSH") {
  await prisma.order.update({ where: { id: orderId }, data: { priority } });
}

async function deductInventoryFor(tx: Tx, orderId: string, userId: string) {
  const { deductOrderInventory } = await import("./inventory");
  await deductOrderInventory(tx, orderId, userId);
}

/** Frees a table once it has no live orders left. */
async function releaseTableIfIdle(tx: Tx, tableId: string | null) {
  if (!tableId) return;
  const live = await tx.order.count({
    where: { tableId, status: { notIn: ["COMPLETED", "CANCELLED"] } },
  });
  if (live === 0) {
    await tx.restaurantTable.update({
      where: { id: tableId },
      data: { status: "CLEANING", occupiedAt: null },
    });
  }
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export const ORDER_DETAIL_INCLUDE = {
  items: { include: { addons: true }, orderBy: { createdAt: "asc" } },
  table: { select: { id: true, number: true, name: true, zone: true } },
  customer: { select: { id: true, name: true, phone: true, email: true } },
  staff: { select: { id: true, name: true } },
  payments: { include: { user: { select: { name: true } } }, orderBy: { createdAt: "asc" } },
  discounts: {
    include: {
      appliedBy: { select: { name: true } },
      approvedBy: { select: { name: true } },
    },
  },
} satisfies Prisma.OrderInclude;

export async function getOrder(orderId: string, restaurantId: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, restaurantId },
    include: ORDER_DETAIL_INCLUDE,
  });
  return order ? plain(order) : null;
}

export type OrderFilters = {
  status?: OrderStatus | "ALL";
  type?: OrderType | "ALL";
  paymentStatus?: PaymentStatus | "ALL";
  tableId?: string | "ALL";
  search?: string;
  from?: Date;
  to?: Date;
  page?: number;
  pageSize?: number;
};

export async function listOrders(restaurantId: string, filters: OrderFilters = {}) {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, filters.pageSize ?? 25);

  const where: Prisma.OrderWhereInput = {
    restaurantId,
    ...(filters.status && filters.status !== "ALL" ? { status: filters.status } : {}),
    ...(filters.type && filters.type !== "ALL" ? { type: filters.type } : {}),
    ...(filters.paymentStatus && filters.paymentStatus !== "ALL"
      ? { paymentStatus: filters.paymentStatus }
      : {}),
    ...(filters.tableId && filters.tableId !== "ALL" ? { tableId: filters.tableId } : {}),
    ...(filters.from || filters.to
      ? { placedAt: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) } }
      : {}),
    ...(filters.search
      ? {
          OR: [
            { orderNumber: { contains: filters.search, mode: "insensitive" as const } },
            { customer: { name: { contains: filters.search, mode: "insensitive" as const } } },
            { table: { number: { contains: filters.search, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: {
        table: { select: { number: true } },
        customer: { select: { name: true } },
        staff: { select: { name: true } },
        _count: { select: { items: true } },
      },
      orderBy: { placedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.order.count({ where }),
  ]);

  return {
    orders: plain(orders),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** Live tickets for the kitchen display, oldest first within each column. */
export async function getKitchenOrders(restaurantId: string) {
  const orders = await prisma.order.findMany({
    where: {
      restaurantId,
      status: { in: ["PENDING", "CONFIRMED", "PREPARING", "READY", "SERVED"] },
    },
    include: {
      items: { include: { addons: true }, orderBy: { createdAt: "asc" } },
      table: { select: { number: true } },
    },
    orderBy: [{ priority: "desc" }, { placedAt: "asc" }],
  });
  return plain(orders);
}

export async function getActiveOrderForTable(tableId: string) {
  const order = await prisma.order.findFirst({
    where: { tableId, status: { notIn: ["COMPLETED", "CANCELLED"] } },
    include: ORDER_DETAIL_INCLUDE,
    orderBy: { placedAt: "desc" },
  });
  return order ? plain(order) : null;
}

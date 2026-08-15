import "server-only";

import { prisma } from "@/lib/prisma";
import { round2 } from "@/lib/money";
import { plain } from "@/lib/serialize";
import type { Prisma } from "@/generated/prisma/client";
import type { InventoryTxType } from "@/generated/prisma/enums";

type Tx = Prisma.TransactionClient;

export class InventoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InventoryError";
  }
}

/**
 * Deducts every ingredient required by an order's items.
 *
 * Runs inside the caller's transaction and takes a row lock on each
 * ingredient (`SELECT … FOR UPDATE`) before reading its quantity, so two
 * concurrent completions cannot both read the same starting stock and write
 * conflicting `quantity_after` values. If any part fails the whole
 * transaction rolls back and stock is untouched.
 */
export async function deductOrderInventory(
  tx: Tx,
  orderId: string,
  userId: string,
): Promise<void> {
  const order = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { id: true, orderNumber: true, inventoryDeducted: true },
  });
  if (order.inventoryDeducted) return; // Idempotent: never double-deduct.

  const items = await tx.orderItem.findMany({
    where: { orderId, status: { not: "CANCELLED" } },
    select: {
      quantity: true,
      menuItem: {
        select: { recipe: { select: { yield: true, items: { select: { ingredientId: true, quantity: true } } } } },
      },
    },
  });

  // Roll every line up into one delta per ingredient — an order with three
  // dishes sharing an ingredient produces a single ledger entry.
  const required = new Map<string, number>();
  for (const item of items) {
    const recipe = item.menuItem.recipe;
    if (!recipe) continue;
    const batch = recipe.yield > 0 ? recipe.yield : 1;
    for (const ri of recipe.items) {
      const amount = (Number(ri.quantity) * item.quantity) / batch;
      required.set(ri.ingredientId, round3((required.get(ri.ingredientId) ?? 0) + amount));
    }
  }
  if (required.size === 0) {
    await tx.order.update({ where: { id: orderId }, data: { inventoryDeducted: true } });
    return;
  }

  const ids = [...required.keys()];
  await lockIngredients(tx, ids);

  const ingredients = await tx.ingredient.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, quantity: true, cost: true, unit: true },
  });

  for (const ingredient of ingredients) {
    const amount = required.get(ingredient.id) ?? 0;
    const after = round3(Number(ingredient.quantity) - amount);

    await tx.ingredient.update({
      where: { id: ingredient.id },
      data: { quantity: Math.max(0, after) },
    });
    await tx.inventoryTransaction.create({
      data: {
        ingredientId: ingredient.id,
        type: "SALE_DEDUCTION",
        quantity: -amount,
        quantityAfter: Math.max(0, after),
        unitCost: ingredient.cost,
        reference: order.orderNumber,
        orderId,
        userId,
      },
    });
  }

  await tx.order.update({ where: { id: orderId }, data: { inventoryDeducted: true } });
}

/**
 * Reverses a previous deduction — used when a completed order is cancelled,
 * so stock returns to where it was rather than silently disappearing.
 */
export async function reverseOrderInventory(
  tx: Tx,
  orderId: string,
  userId: string,
): Promise<void> {
  const order = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { id: true, orderNumber: true, inventoryDeducted: true },
  });
  if (!order.inventoryDeducted) return;

  const previous = await tx.inventoryTransaction.findMany({
    where: { orderId, type: "SALE_DEDUCTION" },
    select: { ingredientId: true, quantity: true, unitCost: true },
  });
  if (previous.length === 0) {
    await tx.order.update({ where: { id: orderId }, data: { inventoryDeducted: false } });
    return;
  }

  await lockIngredients(tx, previous.map((p) => p.ingredientId));

  for (const entry of previous) {
    const ingredient = await tx.ingredient.findUniqueOrThrow({
      where: { id: entry.ingredientId },
      select: { quantity: true },
    });
    const amount = Math.abs(Number(entry.quantity));
    const after = round3(Number(ingredient.quantity) + amount);

    await tx.ingredient.update({ where: { id: entry.ingredientId }, data: { quantity: after } });
    await tx.inventoryTransaction.create({
      data: {
        ingredientId: entry.ingredientId,
        type: "SALE_REVERSAL",
        quantity: amount,
        quantityAfter: after,
        unitCost: entry.unitCost,
        reference: order.orderNumber,
        orderId,
        userId,
        note: "Order cancelled — stock returned",
      },
    });
  }

  await tx.order.update({ where: { id: orderId }, data: { inventoryDeducted: false } });
}

/** Manual stock movement: stock in / out / adjustment / transfer / waste. */
export async function recordStockMovement(
  tx: Tx,
  input: {
    ingredientId: string;
    type: InventoryTxType;
    /** Absolute amount for stock in/out/waste/transfer; target level for ADJUSTMENT. */
    amount: number;
    unitCost?: number;
    note?: string | null;
    reference?: string | null;
    userId: string;
  },
): Promise<{ quantityAfter: number; delta: number }> {
  await lockIngredients(tx, [input.ingredientId]);

  const ingredient = await tx.ingredient.findUniqueOrThrow({
    where: { id: input.ingredientId },
    select: { id: true, name: true, quantity: true, cost: true },
  });
  const current = Number(ingredient.quantity);

  let delta: number;
  switch (input.type) {
    case "STOCK_IN":
      delta = Math.abs(input.amount);
      break;
    case "STOCK_OUT":
    case "WASTE":
    case "TRANSFER":
      delta = -Math.abs(input.amount);
      break;
    case "ADJUSTMENT":
      // The amount is the counted level, not a delta.
      delta = round3(input.amount - current);
      break;
    default:
      throw new InventoryError(`Unsupported movement type: ${input.type}`);
  }

  const after = round3(current + delta);
  if (after < 0) {
    throw new InventoryError(
      `${ingredient.name}: cannot remove ${Math.abs(delta)} — only ${current} in stock.`,
    );
  }

  await tx.ingredient.update({ where: { id: ingredient.id }, data: { quantity: after } });
  await tx.inventoryTransaction.create({
    data: {
      ingredientId: ingredient.id,
      type: input.type,
      quantity: delta,
      quantityAfter: after,
      unitCost: input.unitCost ?? Number(ingredient.cost),
      reference: input.reference ?? null,
      note: input.note ?? null,
      userId: input.userId,
    },
  });

  return { quantityAfter: after, delta };
}

/**
 * Ingredients an order would consume that aren't currently in stock.
 * Surfaced as a warning at the point of sale rather than a hard block —
 * kitchens routinely finish service on stock that hasn't been counted in.
 */
export async function checkStockForItems(
  items: { menuItemId: string; quantity: number }[],
): Promise<{ name: string; required: number; available: number; unit: string }[]> {
  if (items.length === 0) return [];

  const menuItems = await prisma.menuItem.findMany({
    where: { id: { in: items.map((i) => i.menuItemId) } },
    select: {
      id: true,
      recipe: {
        select: {
          yield: true,
          items: {
            select: {
              quantity: true,
              ingredient: { select: { id: true, name: true, quantity: true, unit: true } },
            },
          },
        },
      },
    },
  });

  const required = new Map<string, { name: string; unit: string; available: number; required: number }>();
  for (const item of items) {
    const menuItem = menuItems.find((m) => m.id === item.menuItemId);
    const recipe = menuItem?.recipe;
    if (!recipe) continue;
    const batch = recipe.yield > 0 ? recipe.yield : 1;
    for (const ri of recipe.items) {
      const key = ri.ingredient.id;
      const entry = required.get(key) ?? {
        name: ri.ingredient.name,
        unit: ri.ingredient.unit,
        available: Number(ri.ingredient.quantity),
        required: 0,
      };
      entry.required = round3(entry.required + (Number(ri.quantity) * item.quantity) / batch);
      required.set(key, entry);
    }
  }

  return [...required.values()].filter((entry) => entry.required > entry.available);
}

export async function listIngredients(restaurantId: string, search?: string) {
  const ingredients = await prisma.ingredient.findMany({
    where: {
      restaurantId,
      deletedAt: null,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" as const } },
              { sku: { contains: search, mode: "insensitive" as const } },
              { category: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    include: { supplier: { select: { id: true, name: true } } },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
  return plain(ingredients);
}

export async function getInventoryAlerts(restaurantId: string) {
  const ingredients = await prisma.ingredient.findMany({
    where: { restaurantId, deletedAt: null, isActive: true },
    select: {
      id: true,
      name: true,
      sku: true,
      unit: true,
      quantity: true,
      minQuantity: true,
      expiresAt: true,
    },
  });

  const soon = new Date(Date.now() + 3 * 86400000);
  const outOfStock = ingredients.filter((i) => Number(i.quantity) <= 0);
  const lowStock = ingredients.filter(
    (i) => Number(i.quantity) > 0 && Number(i.quantity) <= Number(i.minQuantity),
  );
  const expiring = ingredients.filter(
    (i) => i.expiresAt !== null && i.expiresAt <= soon && Number(i.quantity) > 0,
  );

  return {
    outOfStock: plain(outOfStock),
    lowStock: plain(lowStock),
    expiring: plain(expiring),
    counts: {
      outOfStock: outOfStock.length,
      lowStock: lowStock.length,
      expiring: expiring.length,
    },
  };
}

export async function getInventoryValue(restaurantId: string): Promise<number> {
  const ingredients = await prisma.ingredient.findMany({
    where: { restaurantId, deletedAt: null },
    select: { quantity: true, cost: true },
  });
  return round2(
    ingredients.reduce((acc, i) => acc + Number(i.quantity) * Number(i.cost), 0),
  );
}

function round3(value: number): number {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

/** Serialises concurrent writers on the same ingredient rows. */
async function lockIngredients(tx: Tx, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await tx.$queryRawUnsafe(
    `SELECT id FROM ingredients WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE`,
    ids,
  );
}

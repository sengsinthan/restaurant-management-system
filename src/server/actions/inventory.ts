"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { PERMISSIONS } from "@/lib/permissions";
import { authorize } from "@/server/auth/rbac";
import { writeAudit } from "@/server/audit";
import { publish } from "@/server/events";
import { notify } from "@/server/notifications";
import { recordStockMovement } from "@/server/services/inventory";
import { run, type ActionResult } from "./result";

const ingredientSchema = z.object({
  name: z.string().trim().min(2, "Enter an ingredient name").max(120),
  sku: z.string().trim().min(2, "Enter a SKU").max(40),
  category: z.string().trim().min(1).max(60),
  unit: z.string().trim().min(1).max(20),
  minQuantity: z.coerce.number().min(0).max(1_000_000),
  cost: z.coerce.number().min(0).max(1_000_000),
  supplierId: z.string().uuid().nullable().optional(),
  expiresAt: z.string().optional().or(z.literal("")),
  isActive: z.boolean().default(true),
});

const movementSchema = z.object({
  ingredientId: z.string().uuid(),
  type: z.enum(["STOCK_IN", "STOCK_OUT", "ADJUSTMENT", "TRANSFER", "WASTE"]),
  amount: z.coerce.number().min(0).max(1_000_000),
  unitCost: z.coerce.number().min(0).max(1_000_000).optional(),
  note: z.string().trim().max(300).optional().or(z.literal("")),
  reference: z.string().trim().max(120).optional().or(z.literal("")),
});

const supplierSchema = z.object({
  name: z.string().trim().min(2, "Enter a supplier name").max(120),
  contactName: z.string().trim().max(120).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  email: z.string().trim().email("Enter a valid email").max(160).optional().or(z.literal("")),
  address: z.string().trim().max(300).optional().or(z.literal("")),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
  isActive: z.boolean().default(true),
});

function revalidateInventory() {
  for (const path of [
    "/inventory/ingredients",
    "/inventory/stock",
    "/inventory/suppliers",
    "/dashboard",
    "/reports",
    "/menu/items",
  ]) {
    revalidatePath(path);
  }
}

export async function saveIngredientAction(
  id: string | null,
  input: z.input<typeof ingredientSchema>,
): Promise<ActionResult> {
  return run(async () => {
    const user = await authorize(PERMISSIONS.INVENTORY_MANAGE);
    const data = ingredientSchema.parse(input);
    const expiresAt = data.expiresAt ? new Date(data.expiresAt) : null;

    if (id) {
      const previous = await prisma.ingredient.findFirstOrThrow({
        where: { id, restaurantId: user.restaurantId, deletedAt: null },
      });
      await prisma.ingredient.update({
        where: { id },
        data: {
          name: data.name,
          sku: data.sku.toUpperCase(),
          category: data.category,
          unit: data.unit,
          minQuantity: data.minQuantity,
          cost: data.cost,
          supplierId: data.supplierId ?? null,
          expiresAt,
          isActive: data.isActive,
        },
      });
      await writeAudit(user, {
        action: "UPDATE",
        entity: "Ingredient",
        entityId: id,
        previousValue: { name: previous.name, cost: Number(previous.cost), min: Number(previous.minQuantity) },
        newValue: { name: data.name, cost: data.cost, min: data.minQuantity },
        description: `Updated ingredient ${data.name}`,
      });
    } else {
      const created = await prisma.ingredient.create({
        data: {
          restaurantId: user.restaurantId,
          name: data.name,
          sku: data.sku.toUpperCase(),
          category: data.category,
          unit: data.unit,
          quantity: 0,
          minQuantity: data.minQuantity,
          cost: data.cost,
          supplierId: data.supplierId ?? null,
          expiresAt,
          isActive: data.isActive,
        },
      });
      await writeAudit(user, {
        action: "CREATE",
        entity: "Ingredient",
        entityId: created.id,
        newValue: { name: data.name, sku: data.sku },
        description: `Added ingredient ${data.name}`,
      });
    }

    publish("inventory.updated", user.restaurantId);
    revalidateInventory();
    return undefined;
  });
}

export async function deleteIngredientAction(id: string): Promise<ActionResult> {
  return run(async () => {
    const user = await authorize(PERMISSIONS.INVENTORY_MANAGE);
    const ingredient = await prisma.ingredient.findFirstOrThrow({
      where: { id, restaurantId: user.restaurantId, deletedAt: null },
      include: { _count: { select: { recipeItems: true } } },
    });
    if (ingredient._count.recipeItems > 0) {
      throw new Error(
        `${ingredient.name} is used in ${ingredient._count.recipeItems} recipe(s). Remove it from those first.`,
      );
    }

    await prisma.ingredient.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
    await writeAudit(user, {
      action: "DELETE",
      entity: "Ingredient",
      entityId: id,
      previousValue: { name: ingredient.name },
      description: `Removed ingredient ${ingredient.name}`,
    });

    publish("inventory.updated", user.restaurantId);
    revalidateInventory();
    return undefined;
  });
}

/**
 * Applies a manual stock movement. The ledger write and the ingredient's new
 * quantity commit together, and a low-stock alert is raised if the movement
 * takes the ingredient to or below its minimum.
 */
export async function recordStockMovementAction(
  input: z.input<typeof movementSchema>,
): Promise<ActionResult<{ quantityAfter: number }>> {
  return run(async () => {
    const user = await authorize(PERMISSIONS.INVENTORY_MANAGE);
    const data = movementSchema.parse(input);

    const ingredient = await prisma.ingredient.findFirstOrThrow({
      where: { id: data.ingredientId, restaurantId: user.restaurantId, deletedAt: null },
      select: { id: true, name: true, unit: true, quantity: true, minQuantity: true },
    });

    const result = await prisma.$transaction(async (tx) => {
      const movement = await recordStockMovement(tx, {
        ingredientId: data.ingredientId,
        type: data.type,
        amount: data.amount,
        unitCost: data.unitCost,
        note: data.note || null,
        reference: data.reference || null,
        userId: user.id,
      });

      await writeAudit(
        user,
        {
          action: data.type,
          entity: "Ingredient",
          entityId: data.ingredientId,
          previousValue: { quantity: Number(ingredient.quantity) },
          newValue: { quantity: movement.quantityAfter, delta: movement.delta },
          description: `${data.type.replace("_", " ").toLowerCase()} — ${ingredient.name}: ${
            movement.delta > 0 ? "+" : ""
          }${movement.delta}${ingredient.unit}`,
        },
        tx,
      );

      return movement;
    });

    if (result.quantityAfter <= Number(ingredient.minQuantity)) {
      await notify({
        restaurantId: user.restaurantId,
        type: "INVENTORY",
        title: result.quantityAfter <= 0 ? "Out of stock" : "Low stock alert",
        message: `${ingredient.name} is at ${result.quantityAfter}${ingredient.unit} (minimum ${Number(
          ingredient.minQuantity,
        )}${ingredient.unit}).`,
        entity: "Ingredient",
        entityId: ingredient.id,
        link: "/inventory/stock",
      });
    }

    publish("inventory.updated", user.restaurantId, data.ingredientId);
    revalidateInventory();
    return { quantityAfter: result.quantityAfter };
  });
}

export async function saveSupplierAction(
  id: string | null,
  input: z.input<typeof supplierSchema>,
): Promise<ActionResult> {
  return run(async () => {
    const user = await authorize(PERMISSIONS.INVENTORY_MANAGE);
    const data = supplierSchema.parse(input);

    const payload = {
      name: data.name,
      contactName: data.contactName || null,
      phone: data.phone || null,
      email: data.email || null,
      address: data.address || null,
      notes: data.notes || null,
      isActive: data.isActive,
    };

    if (id) {
      await prisma.supplier.findFirstOrThrow({
        where: { id, restaurantId: user.restaurantId, deletedAt: null },
      });
      await prisma.supplier.update({ where: { id }, data: payload });
      await writeAudit(user, {
        action: "UPDATE",
        entity: "Supplier",
        entityId: id,
        newValue: { name: data.name },
        description: `Updated supplier ${data.name}`,
      });
    } else {
      const created = await prisma.supplier.create({
        data: { ...payload, restaurantId: user.restaurantId },
      });
      await writeAudit(user, {
        action: "CREATE",
        entity: "Supplier",
        entityId: created.id,
        newValue: { name: data.name },
        description: `Added supplier ${data.name}`,
      });
    }

    revalidateInventory();
    return undefined;
  });
}

export async function deleteSupplierAction(id: string): Promise<ActionResult> {
  return run(async () => {
    const user = await authorize(PERMISSIONS.INVENTORY_MANAGE);
    const supplier = await prisma.supplier.findFirstOrThrow({
      where: { id, restaurantId: user.restaurantId, deletedAt: null },
      include: { _count: { select: { ingredients: { where: { deletedAt: null } } } } },
    });
    if (supplier._count.ingredients > 0) {
      throw new Error(
        `${supplier.name} still supplies ${supplier._count.ingredients} ingredient(s). Reassign them first.`,
      );
    }

    await prisma.supplier.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
    await writeAudit(user, {
      action: "DELETE",
      entity: "Supplier",
      entityId: id,
      previousValue: { name: supplier.name },
      description: `Removed supplier ${supplier.name}`,
    });

    revalidateInventory();
    return undefined;
  });
}

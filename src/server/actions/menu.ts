"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { round2 } from "@/lib/money";
import { PERMISSIONS } from "@/lib/permissions";
import { authorize } from "@/server/auth/rbac";
import { writeAudit } from "@/server/audit";
import { run, type ActionResult } from "./result";

const categorySchema = z.object({
  name: z.string().trim().min(2, "Enter a category name").max(80),
  description: z.string().trim().max(300).optional().or(z.literal("")),
  color: z.string().trim().max(20).optional().or(z.literal("")),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
  isActive: z.boolean().default(true),
});

const menuItemSchema = z.object({
  name: z.string().trim().min(2, "Enter an item name").max(120),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  imageUrl: z.string().trim().url("Enter a valid image URL").max(500).optional().or(z.literal("")),
  categoryId: z.string().uuid("Choose a category"),
  sku: z.string().trim().min(2, "Enter a SKU").max(40),
  price: z.coerce.number().min(0).max(100000),
  cost: z.coerce.number().min(0).max(100000),
  status: z.enum(["AVAILABLE", "UNAVAILABLE", "HIDDEN"]),
  prepTimeMin: z.coerce.number().int().min(0).max(600),
  isFeatured: z.boolean().default(false),
  variants: z
    .array(
      z.object({
        id: z.string().optional(),
        name: z.string().trim().min(1).max(60),
        price: z.coerce.number().min(0).max(100000),
        isDefault: z.boolean().default(false),
      }),
    )
    .default([]),
  addons: z
    .array(
      z.object({
        id: z.string().optional(),
        name: z.string().trim().min(1).max(60),
        price: z.coerce.number().min(0).max(100000),
      }),
    )
    .default([]),
  recipe: z
    .array(
      z.object({
        ingredientId: z.string().uuid(),
        quantity: z.coerce.number().min(0.001).max(100000),
      }),
    )
    .default([]),
});

function revalidateMenu() {
  for (const path of ["/menu/items", "/menu/categories", "/pos", "/reports"]) revalidatePath(path);
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export async function saveCategoryAction(
  id: string | null,
  input: z.input<typeof categorySchema>,
): Promise<ActionResult> {
  return run(async () => {
    const user = await authorize(PERMISSIONS.MENU_MANAGE);
    const data = categorySchema.parse(input);

    if (id) {
      const previous = await prisma.menuCategory.findFirstOrThrow({
        where: { id, restaurantId: user.restaurantId, deletedAt: null },
      });
      await prisma.menuCategory.update({
        where: { id },
        data: {
          name: data.name,
          description: data.description || null,
          color: data.color || null,
          sortOrder: data.sortOrder,
          isActive: data.isActive,
        },
      });
      await writeAudit(user, {
        action: "UPDATE",
        entity: "MenuCategory",
        entityId: id,
        previousValue: { name: previous.name, isActive: previous.isActive },
        newValue: { name: data.name, isActive: data.isActive },
        description: `Updated category ${data.name}`,
      });
    } else {
      const created = await prisma.menuCategory.create({
        data: {
          restaurantId: user.restaurantId,
          name: data.name,
          description: data.description || null,
          color: data.color || null,
          sortOrder: data.sortOrder,
          isActive: data.isActive,
        },
      });
      await writeAudit(user, {
        action: "CREATE",
        entity: "MenuCategory",
        entityId: created.id,
        newValue: { name: data.name },
        description: `Created category ${data.name}`,
      });
    }

    revalidateMenu();
    return undefined;
  });
}

export async function deleteCategoryAction(id: string): Promise<ActionResult> {
  return run(async () => {
    const user = await authorize(PERMISSIONS.MENU_MANAGE);
    const category = await prisma.menuCategory.findFirstOrThrow({
      where: { id, restaurantId: user.restaurantId, deletedAt: null },
      include: { _count: { select: { items: { where: { deletedAt: null } } } } },
    });
    if (category._count.items > 0) {
      throw new Error(
        `${category.name} still has ${category._count.items} item(s). Move or remove them first.`,
      );
    }

    await prisma.menuCategory.update({ where: { id }, data: { deletedAt: new Date() } });
    await writeAudit(user, {
      action: "DELETE",
      entity: "MenuCategory",
      entityId: id,
      previousValue: { name: category.name },
      description: `Deleted category ${category.name}`,
    });

    revalidateMenu();
    return undefined;
  });
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

export async function saveMenuItemAction(
  id: string | null,
  input: z.input<typeof menuItemSchema>,
): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const user = await authorize(PERMISSIONS.MENU_MANAGE);
    const data = menuItemSchema.parse(input);

    // Exactly one default variant, when variants exist at all.
    if (data.variants.length > 0 && !data.variants.some((v) => v.isDefault)) {
      data.variants[0].isDefault = true;
    }

    const itemId = await prisma.$transaction(async (tx) => {
      const previous = id
        ? await tx.menuItem.findFirstOrThrow({
            where: { id, restaurantId: user.restaurantId, deletedAt: null },
            include: { variants: true, addons: true, recipe: { include: { items: true } } },
          })
        : null;

      const payload = {
        name: data.name,
        description: data.description || null,
        imageUrl: data.imageUrl || null,
        categoryId: data.categoryId,
        sku: data.sku.toUpperCase(),
        price: data.price,
        cost: data.cost,
        status: data.status,
        prepTimeMin: data.prepTimeMin,
        isFeatured: data.isFeatured,
      };

      const item = previous
        ? await tx.menuItem.update({ where: { id: previous.id }, data: payload })
        : await tx.menuItem.create({ data: { ...payload, restaurantId: user.restaurantId } });

      // --- Variants: soft-delete removed ones so historical order lines keep
      // resolving, upsert the rest.
      const keptVariantIds = data.variants.map((v) => v.id).filter(Boolean) as string[];
      await tx.menuItemVariant.updateMany({
        where: { menuItemId: item.id, id: { notIn: keptVariantIds.length ? keptVariantIds : ["-"] } },
        data: { deletedAt: new Date(), isActive: false },
      });
      for (const [index, variant] of data.variants.entries()) {
        const variantCost = data.price > 0 ? round2((data.cost * variant.price) / data.price) : 0;
        if (variant.id) {
          await tx.menuItemVariant.update({
            where: { id: variant.id },
            data: {
              name: variant.name,
              price: variant.price,
              cost: variantCost,
              isDefault: variant.isDefault,
              sortOrder: index,
              isActive: true,
              deletedAt: null,
            },
          });
        } else {
          await tx.menuItemVariant.create({
            data: {
              menuItemId: item.id,
              name: variant.name,
              price: variant.price,
              cost: variantCost,
              isDefault: variant.isDefault,
              sortOrder: index,
            },
          });
        }
      }

      // --- Add-ons
      const keptAddonIds = data.addons.map((a) => a.id).filter(Boolean) as string[];
      await tx.menuItemAddon.updateMany({
        where: { menuItemId: item.id, id: { notIn: keptAddonIds.length ? keptAddonIds : ["-"] } },
        data: { deletedAt: new Date(), isActive: false },
      });
      for (const [index, addon] of data.addons.entries()) {
        if (addon.id) {
          await tx.menuItemAddon.update({
            where: { id: addon.id },
            data: { name: addon.name, price: addon.price, sortOrder: index, isActive: true, deletedAt: null },
          });
        } else {
          await tx.menuItemAddon.create({
            data: { menuItemId: item.id, name: addon.name, price: addon.price, sortOrder: index },
          });
        }
      }

      // --- Recipe (replace wholesale; recipe rows carry no history)
      if (data.recipe.length > 0) {
        const recipe = await tx.recipe.upsert({
          where: { menuItemId: item.id },
          create: { menuItemId: item.id, yield: 1 },
          update: {},
        });
        await tx.recipeItem.deleteMany({ where: { recipeId: recipe.id } });
        await tx.recipeItem.createMany({
          data: data.recipe.map((line) => ({
            recipeId: recipe.id,
            ingredientId: line.ingredientId,
            quantity: line.quantity,
          })),
        });
      } else {
        await tx.recipe.deleteMany({ where: { menuItemId: item.id } });
      }

      await writeAudit(
        user,
        {
          action: previous ? "UPDATE" : "CREATE",
          entity: "MenuItem",
          entityId: item.id,
          previousValue: previous
            ? { name: previous.name, price: Number(previous.price), status: previous.status }
            : undefined,
          newValue: { name: data.name, price: data.price, status: data.status },
          description: previous
            ? `Updated menu item ${data.name}${
                Number(previous.price) !== data.price
                  ? ` (price ${Number(previous.price)} → ${data.price})`
                  : ""
              }`
            : `Created menu item ${data.name}`,
        },
        tx,
      );

      return item.id;
    });

    revalidateMenu();
    return { id: itemId };
  });
}

export async function setMenuItemStatusAction(
  id: string,
  status: "AVAILABLE" | "UNAVAILABLE" | "HIDDEN",
): Promise<ActionResult> {
  return run(async () => {
    const user = await authorize(PERMISSIONS.MENU_MANAGE);
    const item = await prisma.menuItem.findFirstOrThrow({
      where: { id, restaurantId: user.restaurantId, deletedAt: null },
    });

    await prisma.menuItem.update({ where: { id }, data: { status } });
    await writeAudit(user, {
      action: "STATUS_CHANGE",
      entity: "MenuItem",
      entityId: id,
      previousValue: { status: item.status },
      newValue: { status },
      description: `${item.name} set to ${status.toLowerCase()}`,
    });

    revalidateMenu();
    return undefined;
  });
}

export async function deleteMenuItemAction(id: string): Promise<ActionResult> {
  return run(async () => {
    const user = await authorize(PERMISSIONS.MENU_MANAGE);
    const item = await prisma.menuItem.findFirstOrThrow({
      where: { id, restaurantId: user.restaurantId, deletedAt: null },
    });

    // Soft delete: past order lines reference this row.
    await prisma.menuItem.update({
      where: { id },
      data: { deletedAt: new Date(), status: "HIDDEN" },
    });

    await writeAudit(user, {
      action: "DELETE",
      entity: "MenuItem",
      entityId: id,
      previousValue: { name: item.name, price: Number(item.price) },
      description: `Removed menu item ${item.name}`,
    });

    revalidateMenu();
    return undefined;
  });
}

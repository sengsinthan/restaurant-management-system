import "server-only";

import { prisma } from "@/lib/prisma";
import { plain } from "@/lib/serialize";
import type { Prisma } from "@/generated/prisma/client";
import type { MenuItemStatus } from "@/generated/prisma/enums";

/** Everything the POS needs to render its menu grid in one round trip. */
export async function getPosMenu(restaurantId: string) {
  const categories = await prisma.menuCategory.findMany({
    where: { restaurantId, deletedAt: null, isActive: true },
    orderBy: { sortOrder: "asc" },
    include: {
      items: {
        where: { deletedAt: null, status: { not: "HIDDEN" } },
        orderBy: [{ isFeatured: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
        include: {
          variants: { where: { isActive: true, deletedAt: null }, orderBy: { sortOrder: "asc" } },
          addons: { where: { isActive: true, deletedAt: null }, orderBy: { sortOrder: "asc" } },
        },
      },
    },
  });
  return plain(categories);
}

export async function listCategories(restaurantId: string) {
  const categories = await prisma.menuCategory.findMany({
    where: { restaurantId, deletedAt: null },
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { items: { where: { deletedAt: null } } } } },
  });
  return plain(categories);
}

export type MenuItemFilters = {
  search?: string;
  categoryId?: string | "ALL";
  status?: MenuItemStatus | "ALL";
};

export async function listMenuItems(restaurantId: string, filters: MenuItemFilters = {}) {
  const where: Prisma.MenuItemWhereInput = {
    restaurantId,
    deletedAt: null,
    ...(filters.categoryId && filters.categoryId !== "ALL" ? { categoryId: filters.categoryId } : {}),
    ...(filters.status && filters.status !== "ALL" ? { status: filters.status } : {}),
    ...(filters.search
      ? {
          OR: [
            { name: { contains: filters.search, mode: "insensitive" as const } },
            { sku: { contains: filters.search, mode: "insensitive" as const } },
            { description: { contains: filters.search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const items = await prisma.menuItem.findMany({
    where,
    include: {
      category: { select: { id: true, name: true, color: true } },
      variants: { where: { deletedAt: null }, orderBy: { sortOrder: "asc" } },
      addons: { where: { deletedAt: null }, orderBy: { sortOrder: "asc" } },
      recipe: { include: { items: { include: { ingredient: true } } } },
      _count: { select: { orderItems: true } },
    },
    orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }, { name: "asc" }],
  });
  return plain(items);
}

export async function getMenuItem(id: string, restaurantId: string) {
  const item = await prisma.menuItem.findFirst({
    where: { id, restaurantId, deletedAt: null },
    include: {
      category: true,
      variants: { where: { deletedAt: null }, orderBy: { sortOrder: "asc" } },
      addons: { where: { deletedAt: null }, orderBy: { sortOrder: "asc" } },
      recipe: { include: { items: { include: { ingredient: true } } } },
    },
  });
  return item ? plain(item) : null;
}

/** Menu-item cost derived from its recipe — drives the margin column. */
export function recipeCost(
  recipe: { yield: number; items: { quantity: number; ingredient: { cost: number } }[] } | null,
): number {
  if (!recipe) return 0;
  const batch = recipe.yield > 0 ? recipe.yield : 1;
  const total = recipe.items.reduce((acc, i) => acc + i.quantity * i.ingredient.cost, 0);
  return Math.round((total / batch + Number.EPSILON) * 100) / 100;
}

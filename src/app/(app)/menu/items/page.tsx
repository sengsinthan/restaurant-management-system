import type { Metadata } from "next";

import { PageHeader, PageShell } from "@/components/shared/page-header";
import { prisma } from "@/lib/prisma";
import { PERMISSIONS } from "@/lib/permissions";
import { requirePermission } from "@/server/auth/rbac";
import { listCategories, listMenuItems } from "@/server/services/menu";
import { listIngredients } from "@/server/services/inventory";
import type { MenuItemStatus } from "@/generated/prisma/enums";

import { MenuItemsView } from "./menu-items-view";

export const metadata: Metadata = { title: "Menu items" };
export const dynamic = "force-dynamic";

export default async function MenuItemsPage({ searchParams }: PageProps<"/menu/items">) {
  const user = await requirePermission(PERMISSIONS.MENU_VIEW);
  const params = await searchParams;

  const search = typeof params.q === "string" ? params.q : undefined;
  const categoryId = typeof params.category === "string" ? params.category : "ALL";
  const status = (typeof params.status === "string" ? params.status : "ALL") as MenuItemStatus | "ALL";

  const [items, categories, ingredients, restaurant] = await Promise.all([
    listMenuItems(user.restaurantId, { search, categoryId, status }),
    listCategories(user.restaurantId),
    listIngredients(user.restaurantId),
    prisma.restaurant.findUniqueOrThrow({
      where: { id: user.restaurantId },
      select: { currencySymbol: true },
    }),
  ]);

  return (
    <PageShell>
      <PageHeader
        title="Menu items"
        description={`${items.length} item${items.length === 1 ? "" : "s"} across ${categories.length} categories.`}
      />
      <MenuItemsView
        items={items.map((item) => ({
          id: item.id,
          name: item.name,
          description: item.description,
          imageUrl: item.imageUrl,
          sku: item.sku,
          price: item.price,
          cost: item.cost,
          status: item.status,
          prepTimeMin: item.prepTimeMin,
          isFeatured: item.isFeatured,
          categoryId: item.categoryId,
          categoryName: item.category.name,
          categoryColor: item.category.color,
          timesOrdered: item._count.orderItems,
          variants: item.variants
            .filter((v) => !v.deletedAt)
            .map((v) => ({ id: v.id, name: v.name, price: v.price, isDefault: v.isDefault })),
          addons: item.addons
            .filter((a) => !a.deletedAt)
            .map((a) => ({ id: a.id, name: a.name, price: a.price })),
          recipe:
            item.recipe?.items.map((r) => ({
              ingredientId: r.ingredientId,
              quantity: r.quantity,
              name: r.ingredient.name,
              unit: r.ingredient.unit,
              cost: r.ingredient.cost,
            })) ?? [],
        }))}
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        ingredients={ingredients.map((i) => ({
          id: i.id,
          name: i.name,
          unit: i.unit,
          cost: i.cost,
        }))}
        currency={restaurant.currencySymbol}
        canManage={user.permissions.includes(PERMISSIONS.MENU_MANAGE)}
        filters={{ search: search ?? "", categoryId, status }}
      />
    </PageShell>
  );
}

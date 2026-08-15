import type { Metadata } from "next";

import { PageHeader, PageShell } from "@/components/shared/page-header";
import { prisma } from "@/lib/prisma";
import { PERMISSIONS } from "@/lib/permissions";
import { requirePermission } from "@/server/auth/rbac";
import { listIngredients } from "@/server/services/inventory";

import { IngredientsView } from "./ingredients-view";

export const metadata: Metadata = { title: "Ingredients" };
export const dynamic = "force-dynamic";

export default async function IngredientsPage({ searchParams }: PageProps<"/inventory/ingredients">) {
  const user = await requirePermission(PERMISSIONS.INVENTORY_VIEW);
  const params = await searchParams;
  const search = typeof params.q === "string" ? params.q : undefined;

  const [ingredients, suppliers, restaurant] = await Promise.all([
    listIngredients(user.restaurantId, search),
    prisma.supplier.findMany({
      where: { restaurantId: user.restaurantId, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.restaurant.findUniqueOrThrow({
      where: { id: user.restaurantId },
      select: { currencySymbol: true },
    }),
  ]);

  return (
    <PageShell>
      <PageHeader
        title="Ingredients"
        description="The master list of everything the kitchen consumes. Recipes draw on these."
      />
      <IngredientsView
        ingredients={ingredients.map((i) => ({
          id: i.id,
          name: i.name,
          sku: i.sku,
          category: i.category,
          unit: i.unit,
          quantity: i.quantity,
          minQuantity: i.minQuantity,
          cost: i.cost,
          supplierId: i.supplierId,
          supplierName: i.supplier?.name ?? null,
          expiresAt: i.expiresAt,
          isActive: i.isActive,
        }))}
        suppliers={suppliers}
        currency={restaurant.currencySymbol}
        canManage={user.permissions.includes(PERMISSIONS.INVENTORY_MANAGE)}
        search={search ?? ""}
      />
    </PageShell>
  );
}

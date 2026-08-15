import type { Metadata } from "next";

import { PageHeader, PageShell } from "@/components/shared/page-header";
import { prisma } from "@/lib/prisma";
import { PERMISSIONS } from "@/lib/permissions";
import { requirePermission } from "@/server/auth/rbac";

import { SuppliersView } from "./suppliers-view";

export const metadata: Metadata = { title: "Suppliers" };
export const dynamic = "force-dynamic";

export default async function SuppliersPage() {
  const user = await requirePermission(PERMISSIONS.INVENTORY_VIEW);

  const suppliers = await prisma.supplier.findMany({
    where: { restaurantId: user.restaurantId, deletedAt: null },
    include: {
      ingredients: {
        where: { deletedAt: null },
        select: { id: true, quantity: true, cost: true },
      },
    },
    orderBy: { name: "asc" },
  });

  const restaurant = await prisma.restaurant.findUniqueOrThrow({
    where: { id: user.restaurantId },
    select: { currencySymbol: true },
  });

  return (
    <PageShell>
      <PageHeader
        title="Suppliers"
        description="Who you buy from, and what they supply."
      />
      <SuppliersView
        suppliers={suppliers.map((s) => ({
          id: s.id,
          name: s.name,
          contactName: s.contactName,
          phone: s.phone,
          email: s.email,
          address: s.address,
          notes: s.notes,
          isActive: s.isActive,
          ingredientCount: s.ingredients.length,
          stockValue:
            Math.round(
              (s.ingredients.reduce((acc, i) => acc + Number(i.quantity) * Number(i.cost), 0) +
                Number.EPSILON) *
                100,
            ) / 100,
        }))}
        currency={restaurant.currencySymbol}
        canManage={user.permissions.includes(PERMISSIONS.INVENTORY_MANAGE)}
      />
    </PageShell>
  );
}

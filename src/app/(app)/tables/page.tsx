import type { Metadata } from "next";

import { PageHeader, PageShell } from "@/components/shared/page-header";
import { prisma } from "@/lib/prisma";
import { PERMISSIONS } from "@/lib/permissions";
import { requirePermission } from "@/server/auth/rbac";
import { getFloorPlan } from "@/server/services/tables";

import { FloorPlan } from "./floor-plan";

export const metadata: Metadata = { title: "Tables" };
export const dynamic = "force-dynamic";

export default async function TablesPage() {
  const user = await requirePermission(PERMISSIONS.TABLES_VIEW);

  const [tables, restaurant] = await Promise.all([
    getFloorPlan(user.restaurantId),
    prisma.restaurant.findUniqueOrThrow({
      where: { id: user.restaurantId },
      select: { currencySymbol: true },
    }),
  ]);

  const occupied = tables.filter((t) => t.status === "OCCUPIED").length;
  const available = tables.filter((t) => t.status === "AVAILABLE").length;

  return (
    <PageShell>
      <PageHeader
        title="Floor plan"
        description={`${occupied} occupied · ${available} available · ${tables.length} tables in total.`}
      />
      <FloorPlan
        tables={tables}
        currency={restaurant.currencySymbol}
        canManage={user.permissions.includes(PERMISSIONS.TABLES_MANAGE)}
        canOrder={user.permissions.includes(PERMISSIONS.ORDERS_CREATE)}
      />
    </PageShell>
  );
}

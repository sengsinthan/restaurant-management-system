import type { Metadata } from "next";

import { PageHeader, PageShell } from "@/components/shared/page-header";
import { prisma } from "@/lib/prisma";
import { PERMISSIONS } from "@/lib/permissions";
import { requirePermission } from "@/server/auth/rbac";
import { listCustomers } from "@/server/services/customers";

import { CustomersView } from "./customers-view";

export const metadata: Metadata = { title: "Customers" };
export const dynamic = "force-dynamic";

export default async function CustomersPage({ searchParams }: PageProps<"/customers">) {
  const user = await requirePermission(PERMISSIONS.CUSTOMERS_VIEW);
  const params = await searchParams;
  const search = typeof params.q === "string" ? params.q : undefined;

  const [customers, restaurant] = await Promise.all([
    listCustomers(user.restaurantId, search),
    prisma.restaurant.findUniqueOrThrow({
      where: { id: user.restaurantId },
      select: { currencySymbol: true },
    }),
  ]);

  return (
    <PageShell>
      <PageHeader
        title="Customers"
        description={`${customers.length} guest${customers.length === 1 ? "" : "s"} on file, with lifetime spend from settled orders.`}
      />
      <CustomersView
        customers={customers.map((c) => ({
          id: c.id,
          name: c.name,
          phone: c.phone,
          email: c.email,
          address: c.address,
          notes: c.notes,
          totalOrders: c.totalOrders,
          totalSpend: c.totalSpend,
          lastOrderAt: c.lastOrderAt,
        }))}
        currency={restaurant.currencySymbol}
        canManage={user.permissions.includes(PERMISSIONS.CUSTOMERS_MANAGE)}
        search={search ?? ""}
      />
    </PageShell>
  );
}

import type { Metadata } from "next";
import { format } from "date-fns";

import { DateRangeFilter } from "@/components/shared/date-range-filter";
import { PageHeader, PageShell } from "@/components/shared/page-header";
import { prisma } from "@/lib/prisma";
import { parsePreset, resolveRange } from "@/lib/date";
import { PERMISSIONS } from "@/lib/permissions";
import { requirePermission } from "@/server/auth/rbac";
import {
  getInventoryReport,
  getPaymentReport,
  getProductReport,
  getSalesReport,
  getStaffReport,
} from "@/server/services/analytics";

import { ReportsView } from "./reports-view";

export const metadata: Metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  const user = await requirePermission(PERMISSIONS.REPORTS_VIEW);
  const params = await searchParams;

  const preset = parsePreset(typeof params.range === "string" ? params.range : undefined);
  const range = resolveRange(
    preset,
    typeof params.from === "string" ? params.from : undefined,
    typeof params.to === "string" ? params.to : undefined,
  );

  const [sales, products, payments, inventory, staff, restaurant] = await Promise.all([
    getSalesReport(user.restaurantId, range),
    getProductReport(user.restaurantId, range),
    getPaymentReport(user.restaurantId, range),
    getInventoryReport(user.restaurantId, range),
    getStaffReport(user.restaurantId, range),
    prisma.restaurant.findUniqueOrThrow({
      where: { id: user.restaurantId },
      select: { currencySymbol: true },
    }),
  ]);

  return (
    <PageShell>
      <PageHeader
        title="Reports"
        description={`${format(range.from, "d MMM yyyy")} – ${format(range.to, "d MMM yyyy")}`}
        actions={
          <DateRangeFilter
            preset={preset}
            from={typeof params.from === "string" ? params.from : undefined}
            to={typeof params.to === "string" ? params.to : undefined}
          />
        }
      />
      <ReportsView
        sales={sales}
        products={products}
        payments={payments}
        inventory={inventory}
        staff={staff}
        currency={restaurant.currencySymbol}
        preset={preset}
        rangeLabel={`${format(range.from, "yyyy-MM-dd")}_${format(range.to, "yyyy-MM-dd")}`}
        canExport={user.permissions.includes(PERMISSIONS.REPORTS_EXPORT)}
      />
    </PageShell>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { format } from "date-fns";
import {
  ArrowUpRight,
  ChefHat,
  CircleDollarSign,
  ClipboardList,
  PackageX,
  Receipt,
  UtensilsCrossed,
} from "lucide-react";

import { DateRangeFilter } from "@/components/shared/date-range-filter";
import { PageHeader, PageShell } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { prisma } from "@/lib/prisma";
import { parsePreset, resolveRange } from "@/lib/date";
import { formatMoney } from "@/lib/money";
import { PERMISSIONS } from "@/lib/permissions";
import { ORDER_STATUS_LABEL, ORDER_STATUS_TONE, ORDER_TYPE_LABEL } from "@/lib/status";
import { requirePermission } from "@/server/auth/rbac";
import { getDashboard } from "@/server/services/analytics";

import { DashboardCharts } from "./dashboard-charts";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const user = await requirePermission(PERMISSIONS.DASHBOARD_VIEW);
  const params = await searchParams;

  const preset = parsePreset(typeof params.range === "string" ? params.range : undefined);
  const range = resolveRange(
    preset,
    typeof params.from === "string" ? params.from : undefined,
    typeof params.to === "string" ? params.to : undefined,
  );

  const [data, restaurant] = await Promise.all([
    getDashboard(user.restaurantId, range),
    prisma.restaurant.findUniqueOrThrow({
      where: { id: user.restaurantId },
      select: { currencySymbol: true },
    }),
  ]);
  const currency = restaurant.currencySymbol;

  const rangeLabel =
    preset === "today"
      ? "today"
      : preset === "yesterday"
        ? "yesterday"
        : `${format(range.from, "d MMM")} – ${format(range.to, "d MMM")}`;

  return (
    <PageShell>
      <PageHeader
        title={`Good service, ${user.name.split(" ")[0]}`}
        description={`Here's how the restaurant is trading ${rangeLabel}.`}
        actions={
          <DateRangeFilter
            preset={preset}
            from={typeof params.from === "string" ? params.from : undefined}
            to={typeof params.to === "string" ? params.to : undefined}
          />
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Revenue"
          value={formatMoney(data.summary.revenue, currency)}
          icon={CircleDollarSign}
          trend={data.trend.revenue}
          hint="vs previous period"
        />
        <StatCard
          label="Orders"
          value={String(data.summary.completedOrders)}
          icon={Receipt}
          trend={data.trend.orders}
          hint={`${data.summary.totalOrders} placed · ${data.summary.cancelledOrders} cancelled`}
          tone="info"
        />
        <StatCard
          label="Average order"
          value={formatMoney(data.summary.averageOrderValue, currency)}
          icon={ClipboardList}
          trend={data.trend.averageOrderValue}
          hint="per settled ticket"
          tone="success"
        />
        <StatCard
          label="Kitchen queue"
          value={String(data.kitchenQueue)}
          icon={ChefHat}
          hint="orders awaiting the pass"
          tone={data.kitchenQueue > 8 ? "warning" : "default"}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Active tables"
          value={`${data.tables.occupied}/${data.tables.total}`}
          icon={UtensilsCrossed}
          hint={`${data.tables.reserved} reserved · ${data.tables.cleaning} cleaning`}
          tone="info"
        />
        <StatCard
          label="Available tables"
          value={String(data.tables.available)}
          icon={UtensilsCrossed}
          hint={data.tables.outOfService > 0 ? `${data.tables.outOfService} out of service` : "ready to seat"}
          tone="success"
        />
        <StatCard
          label="Low stock items"
          value={String(data.lowStockCount)}
          icon={PackageX}
          hint="at or below minimum"
          tone={data.lowStockCount > 0 ? "destructive" : "success"}
        />
        <StatCard
          label="Discounts given"
          value={formatMoney(data.summary.discounts, currency)}
          icon={CircleDollarSign}
          hint={`tax collected ${formatMoney(data.summary.tax, currency)}`}
          tone="warning"
        />
      </div>

      <DashboardCharts series={data.series} currency={currency} preset={preset} />

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle>Recent orders</CardTitle>
                <CardDescription>The latest tickets in this period.</CardDescription>
              </div>
              <ButtonLink variant="ghost" size="sm" className="gap-1 text-xs" href="/orders">
                View all <ArrowUpRight className="size-3.5" />
              </ButtonLink>
            </div>
          </CardHeader>
          <CardContent className="px-0">
            {data.recentOrders.length === 0 ? (
              <p className="px-6 py-10 text-center text-sm text-muted-foreground">
                No orders in this period.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order</TableHead>
                      <TableHead className="hidden sm:table-cell">Table</TableHead>
                      <TableHead className="hidden md:table-cell">Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.recentOrders.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell>
                          <Link
                            href={`/orders/${order.id}`}
                            className="font-medium hover:text-primary hover:underline"
                          >
                            {order.orderNumber}
                          </Link>
                          <p className="text-xs text-muted-foreground">
                            {order.customer?.name ?? "Walk-in"} · {order._count.items} items
                          </p>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-muted-foreground">
                          {order.table?.number ?? "—"}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-muted-foreground">
                          {ORDER_TYPE_LABEL[order.type]}
                        </TableCell>
                        <TableCell>
                          <StatusBadge
                            label={ORDER_STATUS_LABEL[order.status]}
                            tone={ORDER_STATUS_TONE[order.status]}
                          />
                        </TableCell>
                        <TableCell className="text-right font-medium tabular">
                          {formatMoney(order.total, currency)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Best sellers</CardTitle>
              <CardDescription>By quantity sold in this period.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {data.bestSellers.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Nothing sold yet.</p>
              ) : (
                data.bestSellers.map((item, index) => {
                  const max = data.bestSellers[0].quantity || 1;
                  return (
                    <div key={item.menuItemId} className="space-y-1">
                      <div className="flex items-baseline justify-between gap-2 text-sm">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="w-4 shrink-0 text-xs text-muted-foreground tabular">
                            {index + 1}
                          </span>
                          <span className="truncate font-medium">{item.name}</span>
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground tabular">
                          {item.quantity} · {formatMoney(item.revenue, currency)}
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${(item.quantity / max) * 100}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <CardTitle>Low stock</CardTitle>
                  <CardDescription>Ingredients needing a reorder.</CardDescription>
                </div>
                <ButtonLink
                  variant="ghost"
                  size="sm"
                  className="gap-1 text-xs"
                  href="/inventory/stock"
                >
                  Stock <ArrowUpRight className="size-3.5" />
                </ButtonLink>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.lowStock.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Every ingredient is above its minimum.
                </p>
              ) : (
                data.lowStock.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2"
                  >
                    <span className="min-w-0 truncate text-sm font-medium">{item.name}</span>
                    <span className="shrink-0 text-xs tabular">
                      <span className={item.quantity <= 0 ? "text-destructive" : "text-warning-foreground dark:text-warning"}>
                        {item.quantity}
                        {item.unit}
                      </span>
                      <span className="text-muted-foreground">
                        {" "}
                        / {item.minQuantity}
                        {item.unit}
                      </span>
                    </span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </PageShell>
  );
}

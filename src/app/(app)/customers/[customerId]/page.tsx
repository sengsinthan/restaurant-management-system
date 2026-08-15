import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { ArrowLeft, CalendarClock, Mail, MapPin, Phone, Receipt, StickyNote } from "lucide-react";

import { PageHeader, PageShell } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/money";
import { PERMISSIONS } from "@/lib/permissions";
import {
  ORDER_STATUS_LABEL,
  ORDER_STATUS_TONE,
  ORDER_TYPE_LABEL,
  RESERVATION_STATUS_LABEL,
  RESERVATION_STATUS_TONE,
} from "@/lib/status";
import { requirePermission } from "@/server/auth/rbac";
import { getCustomer } from "@/server/services/customers";

export const metadata: Metadata = { title: "Customer" };
export const dynamic = "force-dynamic";

export default async function CustomerDetailPage({ params }: PageProps<"/customers/[customerId]">) {
  const user = await requirePermission(PERMISSIONS.CUSTOMERS_VIEW);
  const { customerId } = await params;

  const [customer, restaurant] = await Promise.all([
    getCustomer(customerId, user.restaurantId),
    prisma.restaurant.findUniqueOrThrow({
      where: { id: user.restaurantId },
      select: { currencySymbol: true },
    }),
  ]);
  if (!customer) notFound();
  const currency = restaurant.currencySymbol;

  return (
    <PageShell>
      <div>
        <ButtonLink variant="ghost" size="sm" className="-ml-2 gap-1.5" href="/customers">
          <ArrowLeft className="size-4" />
          All customers
        </ButtonLink>
      </div>

      <PageHeader title={customer.name} description={customer.phone} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total orders"
          value={String(customer.stats.totalOrders)}
          icon={Receipt}
          hint="settled tickets"
        />
        <StatCard
          label="Total spend"
          value={formatMoney(customer.stats.totalSpend, currency)}
          icon={Receipt}
          tone="success"
          hint="lifetime value"
        />
        <StatCard
          label="Average order"
          value={formatMoney(customer.stats.averageOrder, currency)}
          icon={Receipt}
          tone="info"
        />
        <StatCard
          label="Last order"
          value={
            customer.stats.lastOrderAt
              ? format(new Date(customer.stats.lastOrderAt), "d MMM yyyy")
              : "—"
          }
          icon={CalendarClock}
          hint={customer.stats.lastOrderAt ? format(new Date(customer.stats.lastOrderAt), "HH:mm") : "no orders yet"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Order history</CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            {customer.orders.length === 0 ? (
              <p className="px-6 py-10 text-center text-sm text-muted-foreground">
                No orders recorded for this customer.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order</TableHead>
                      <TableHead className="hidden sm:table-cell">Type</TableHead>
                      <TableHead className="hidden md:table-cell">Table</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customer.orders.map((order) => (
                      <TableRow key={order.id} className="group">
                        <TableCell>
                          <Link
                            href={`/orders/${order.id}`}
                            className="font-medium group-hover:text-primary group-hover:underline"
                          >
                            {order.orderNumber}
                          </Link>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(order.placedAt), "d MMM yyyy, HH:mm")} ·{" "}
                            {order._count.items} items
                          </p>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-muted-foreground">
                          {ORDER_TYPE_LABEL[order.type]}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-muted-foreground">
                          {order.table?.number ?? "—"}
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
              <CardTitle>Contact</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5 text-sm">
              <p className="flex items-center gap-2.5">
                <Phone className="size-4 shrink-0 text-muted-foreground" />
                {customer.phone}
              </p>
              {customer.email && (
                <p className="flex items-center gap-2.5 break-all">
                  <Mail className="size-4 shrink-0 text-muted-foreground" />
                  {customer.email}
                </p>
              )}
              {customer.address && (
                <p className="flex items-start gap-2.5">
                  <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  {customer.address}
                </p>
              )}
              {customer.notes && (
                <p className="flex items-start gap-2.5 rounded-lg bg-warning/10 px-2.5 py-2 text-warning-foreground dark:text-warning">
                  <StickyNote className="mt-0.5 size-4 shrink-0" />
                  {customer.notes}
                </p>
              )}
            </CardContent>
          </Card>

          {customer.reservations.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Reservations</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {customer.reservations.map((reservation) => (
                  <div
                    key={reservation.id}
                    className="flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {format(new Date(reservation.reservedAt), "d MMM, HH:mm")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {reservation.guests} guests
                        {reservation.table && ` · Table ${reservation.table.number}`}
                      </p>
                    </div>
                    <StatusBadge
                      label={RESERVATION_STATUS_LABEL[reservation.status]}
                      tone={RESERVATION_STATUS_TONE[reservation.status]}
                    />
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </PageShell>
  );
}

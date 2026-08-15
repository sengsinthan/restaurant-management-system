import type { ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { format } from "date-fns";
import { Receipt } from "lucide-react";

import { EmptyState, PageHeader, PageShell } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { ButtonLink, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/money";
import { PERMISSIONS } from "@/lib/permissions";
import {
  ORDER_STATUS_LABEL,
  ORDER_STATUS_TONE,
  ORDER_TYPE_LABEL,
  PAYMENT_STATUS_LABEL,
  PAYMENT_STATUS_TONE,
} from "@/lib/status";
import { requirePermission } from "@/server/auth/rbac";
import { listOrders } from "@/server/services/orders";
import { listTables } from "@/server/services/tables";
import type { OrderStatus, OrderType, PaymentStatus } from "@/generated/prisma/enums";

import { OrderFiltersBar } from "./order-filters";

export const metadata: Metadata = { title: "Orders" };
export const dynamic = "force-dynamic";

function param(value: string | string[] | undefined, fallback = "ALL"): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

export default async function OrdersPage({ searchParams }: PageProps<"/orders">) {
  const user = await requirePermission(PERMISSIONS.ORDERS_VIEW);
  const params = await searchParams;

  const status = param(params.status) as OrderStatus | "ALL";
  const type = param(params.type) as OrderType | "ALL";
  const paymentStatus = param(params.payment) as PaymentStatus | "ALL";
  const tableId = param(params.table);
  const search = typeof params.q === "string" ? params.q : undefined;
  const date = typeof params.date === "string" ? params.date : undefined;
  const page = Number(param(params.page, "1")) || 1;

  const dayRange = date
    ? {
        from: new Date(`${date}T00:00:00`),
        to: new Date(`${date}T23:59:59.999`),
      }
    : undefined;

  const [result, tables, restaurant] = await Promise.all([
    listOrders(user.restaurantId, {
      status,
      type,
      paymentStatus,
      tableId,
      search,
      from: dayRange?.from,
      to: dayRange?.to,
      page,
      pageSize: 25,
    }),
    listTables(user.restaurantId),
    prisma.restaurant.findUniqueOrThrow({
      where: { id: user.restaurantId },
      select: { currencySymbol: true },
    }),
  ]);
  const currency = restaurant.currencySymbol;

  return (
    <PageShell>
      <PageHeader
        title="Orders"
        description={`${result.total} order${result.total === 1 ? "" : "s"} matching the current filters.`}
        actions={
          user.permissions.includes(PERMISSIONS.POS_USE) && (
            <ButtonLink href="/pos">New order</ButtonLink>
          )
        }
      />

      <OrderFiltersBar
        tables={tables.map((t) => ({ id: t.id, number: t.number }))}
        status={status}
        type={type}
        payment={paymentStatus}
        table={tableId}
        search={search ?? ""}
        date={date ?? ""}
      />

      <Card className="py-0">
        <CardContent className="px-0">
          {result.orders.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="No orders found"
              description="Try clearing a filter or widening the date."
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order</TableHead>
                    <TableHead className="hidden md:table-cell">Table</TableHead>
                    <TableHead className="hidden lg:table-cell">Customer</TableHead>
                    <TableHead className="hidden xl:table-cell">Staff</TableHead>
                    <TableHead className="hidden sm:table-cell">Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden sm:table-cell">Payment</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.orders.map((order) => (
                    <TableRow key={order.id} className="group">
                      <TableCell>
                        <Link
                          href={`/orders/${order.id}`}
                          className="font-medium group-hover:text-primary group-hover:underline"
                        >
                          {order.orderNumber}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(order.placedAt), "d MMM, HH:mm")} · {order._count.items} items
                        </p>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground">
                        {order.table?.number ?? "—"}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-muted-foreground">
                        {order.customer?.name ?? "Walk-in"}
                      </TableCell>
                      <TableCell className="hidden xl:table-cell text-muted-foreground">
                        {order.staff.name}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-muted-foreground">
                        {ORDER_TYPE_LABEL[order.type]}
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          label={ORDER_STATUS_LABEL[order.status]}
                          tone={ORDER_STATUS_TONE[order.status]}
                        />
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <StatusBadge
                          label={PAYMENT_STATUS_LABEL[order.paymentStatus]}
                          tone={PAYMENT_STATUS_TONE[order.paymentStatus]}
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

      {result.pageCount > 1 && (
        <Pagination page={result.page} pageCount={result.pageCount} params={params} />
      )}
    </PageShell>
  );
}

function Pagination({
  page,
  pageCount,
  params,
}: {
  page: number;
  pageCount: number;
  params: Record<string, string | string[] | undefined>;
}) {
  const build = (next: number) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === "string" && key !== "page") search.set(key, value);
    }
    search.set("page", String(next));
    return `/orders?${search.toString()}`;
  };

  return (
    <div className="flex items-center justify-between gap-2">
      <p className="text-sm text-muted-foreground">
        Page {page} of {pageCount}
      </p>
      <div className="flex gap-2">
        <PageLink href={build(page - 1)} disabled={page <= 1}>
          Previous
        </PageLink>
        <PageLink href={build(page + 1)} disabled={page >= pageCount}>
          Next
        </PageLink>
      </div>
    </div>
  );
}

function PageLink({
  href,
  disabled,
  children,
}: {
  href: string;
  disabled: boolean;
  children: ReactNode;
}) {
  if (disabled) {
    return (
      <span
        aria-disabled
        className={cn(
          buttonVariants({ variant: "outline", size: "sm" }),
          "pointer-events-none opacity-50"
        )}
      >
        {children}
      </span>
    );
  }
  return (
    <ButtonLink variant="outline" size="sm" href={href}>
      {children}
    </ButtonLink>
  );
}

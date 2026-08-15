import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { ArrowLeft, Clock, MapPin, StickyNote, User } from "lucide-react";

import { PageHeader, PageShell } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/money";
import { PERMISSIONS } from "@/lib/permissions";
import {
  ORDER_STATUS_LABEL,
  ORDER_STATUS_TONE,
  ORDER_TYPE_LABEL,
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_LABEL,
  PAYMENT_STATUS_TONE,
} from "@/lib/status";
import { requirePermission } from "@/server/auth/rbac";
import { getOrder } from "@/server/services/orders";

import { OrderActions } from "./order-actions";

export const metadata: Metadata = { title: "Order" };
export const dynamic = "force-dynamic";

export default async function OrderDetailPage({ params }: PageProps<"/orders/[orderId]">) {
  const user = await requirePermission(PERMISSIONS.ORDERS_VIEW);
  const { orderId } = await params;

  const [order, restaurant] = await Promise.all([
    getOrder(orderId, user.restaurantId),
    prisma.restaurant.findUniqueOrThrow({
      where: { id: user.restaurantId },
      select: { currencySymbol: true },
    }),
  ]);
  if (!order) notFound();
  const currency = restaurant.currencySymbol;

  const timeline = [
    { label: "Placed", at: order.placedAt },
    { label: "Sent to kitchen", at: order.kitchenAt },
    { label: "Ready", at: order.readyAt },
    { label: "Served", at: order.servedAt },
    { label: "Completed", at: order.completedAt },
    { label: "Cancelled", at: order.cancelledAt },
  ].filter((step) => step.at);

  return (
    <PageShell>
      <div>
        <ButtonLink variant="ghost" size="sm" className="-ml-2 gap-1.5" href="/orders">
          <ArrowLeft className="size-4" />
          All orders
        </ButtonLink>
      </div>

      <PageHeader
        title={order.orderNumber}
        description={`${ORDER_TYPE_LABEL[order.type]} · placed ${format(new Date(order.placedAt), "d MMM yyyy 'at' HH:mm")} by ${order.staff.name}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge
              label={ORDER_STATUS_LABEL[order.status]}
              tone={ORDER_STATUS_TONE[order.status]}
              dot
            />
            <StatusBadge
              label={PAYMENT_STATUS_LABEL[order.paymentStatus]}
              tone={PAYMENT_STATUS_TONE[order.paymentStatus]}
            />
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Items</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {order.items.map((item) => (
                <div key={item.id} className="flex items-start gap-3 rounded-lg border p-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-semibold text-primary tabular">
                    {item.quantity}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{item.nameSnap}</p>
                    {(item.variantSnap || item.addons.length > 0) && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {[item.variantSnap, ...item.addons.map((a) => `+ ${a.nameSnap}`)]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    )}
                    {item.notes && (
                      <p className="mt-1.5 flex items-start gap-1.5 rounded bg-warning/12 px-2 py-1 text-xs text-warning-foreground dark:text-warning">
                        <StickyNote className="mt-0.5 size-3 shrink-0" />
                        {item.notes}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-medium tabular">{formatMoney(item.lineTotal, currency)}</p>
                    <p className="text-xs text-muted-foreground tabular">
                      {formatMoney(item.unitPrice, currency)} each
                    </p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {order.payments.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Payments</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {order.payments.map((payment) => (
                  <div
                    key={payment.id}
                    className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {PAYMENT_METHOD_LABEL[payment.method]}
                        {payment.state !== "COMPLETED" && (
                          <span className="ml-2 text-xs text-destructive">({payment.state})</span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(payment.createdAt), "d MMM, HH:mm")} · {payment.user.name}
                        {payment.reference && ` · ${payment.reference}`}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-medium tabular">{formatMoney(payment.amount, currency)}</p>
                      {payment.change > 0 && (
                        <p className="text-xs text-muted-foreground tabular">
                          change {formatMoney(payment.change, currency)}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {timeline.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Timeline</CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="space-y-3">
                  {timeline.map((step) => (
                    <li key={step.label} className="flex items-center gap-3 text-sm">
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted">
                        <Clock className="size-3.5 text-muted-foreground" />
                      </span>
                      <span className="font-medium">{step.label}</span>
                      <span className="ml-auto text-muted-foreground tabular">
                        {format(new Date(step.at!), "d MMM, HH:mm:ss")}
                      </span>
                    </li>
                  ))}
                </ol>
                {order.cancelReason && (
                  <p className="mt-3 rounded-lg border border-destructive/25 bg-destructive/8 px-3 py-2 text-sm text-destructive">
                    Cancelled — {order.cancelReason}
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <OrderActions
            orderId={order.id}
            orderNumber={order.orderNumber}
            status={order.status}
            paymentStatus={order.paymentStatus}
            total={order.total}
            paidTotal={order.paidTotal}
            currency={currency}
            canUpdate={user.permissions.includes(PERMISSIONS.ORDERS_UPDATE)}
            canCancel={user.permissions.includes(PERMISSIONS.ORDERS_CANCEL)}
            canPay={user.permissions.includes(PERMISSIONS.PAYMENTS_PROCESS)}
            canDiscount={user.permissions.includes(PERMISSIONS.DISCOUNTS_APPLY)}
            discounts={order.discounts.map((d) => ({
              id: d.id,
              label: d.label,
              amount: d.amount,
              appliedBy: d.appliedBy.name,
              approvedBy: d.approvedBy?.name ?? null,
            }))}
          />

          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-1.5 text-sm">
                <Row label="Subtotal" value={formatMoney(order.subtotal, currency)} />
                {order.discountTotal > 0 && (
                  <Row
                    label="Discount"
                    value={`−${formatMoney(order.discountTotal, currency)}`}
                    valueClass="text-success"
                  />
                )}
                <Row label={`Tax (${order.taxRate}%)`} value={formatMoney(order.taxTotal, currency)} muted />
                {order.serviceChargeTotal > 0 && (
                  <Row
                    label={`Service (${order.serviceChargeRate}%)`}
                    value={formatMoney(order.serviceChargeTotal, currency)}
                    muted
                  />
                )}
                <Separator className="my-2" />
                <div className="flex justify-between text-base font-semibold">
                  <dt>Total</dt>
                  <dd className="tabular">{formatMoney(order.total, currency)}</dd>
                </div>
                <Row label="Paid" value={formatMoney(order.paidTotal, currency)} muted />
                {order.total - order.paidTotal > 0.005 && (
                  <Row
                    label="Outstanding"
                    value={formatMoney(order.total - order.paidTotal, currency)}
                    valueClass="text-destructive font-medium"
                  />
                )}
                {order.changeGiven > 0 && (
                  <Row label="Change given" value={formatMoney(order.changeGiven, currency)} muted />
                )}
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5 text-sm">
              <Detail icon={User} label="Customer">
                {order.customer ? (
                  <Link
                    href={`/customers/${order.customer.id}`}
                    className="hover:text-primary hover:underline"
                  >
                    {order.customer.name}
                    <span className="block text-xs text-muted-foreground">{order.customer.phone}</span>
                  </Link>
                ) : (
                  <span className="text-muted-foreground">Walk-in</span>
                )}
              </Detail>
              <Detail icon={MapPin} label={order.type === "DELIVERY" ? "Delivery to" : "Table"}>
                {order.type === "DELIVERY"
                  ? (order.deliveryAddress ?? "—")
                  : order.table
                    ? `${order.table.number}${order.table.name ? ` · ${order.table.name}` : ""} (${order.table.zone})`
                    : "—"}
              </Detail>
              <Detail icon={User} label="Served by">
                {order.staff.name}
              </Detail>
              {order.type === "DINE_IN" && (
                <Detail icon={User} label="Guests">
                  {order.guestCount}
                </Detail>
              )}
              {order.notes && (
                <Detail icon={StickyNote} label="Order note">
                  {order.notes}
                </Detail>
              )}
              <Detail icon={Clock} label="Inventory">
                {order.inventoryDeducted ? (
                  <span className="text-success">Deducted from stock</span>
                ) : (
                  <span className="text-muted-foreground">Not yet deducted</span>
                )}
              </Detail>
            </CardContent>
          </Card>
        </div>
      </div>
    </PageShell>
  );
}

function Row({
  label,
  value,
  muted,
  valueClass,
}: {
  label: string;
  value: string;
  muted?: boolean;
  valueClass?: string;
}) {
  return (
    <div className="flex justify-between">
      <dt className={muted ? "text-muted-foreground" : ""}>{label}</dt>
      <dd className={`tabular ${valueClass ?? ""}`}>{value}</dd>
    </div>
  );
}

function Detail({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-2.5">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="mt-0.5">{children}</div>
      </div>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { CreditCard, Loader2, Receipt, RotateCcw, Search } from "lucide-react";
import { toast } from "sonner";

import { AppSelect } from "@/components/shared/app-select";
import { EmptyState } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { PaymentDialog } from "@/features/payments/payment-dialog";
import { formatMoney } from "@/lib/money";
import { ORDER_STATUS_LABEL, ORDER_STATUS_TONE, PAYMENT_METHOD_LABEL } from "@/lib/status";
import { cn } from "@/lib/utils";
import { refundPaymentAction } from "@/server/actions/payments";
import type { OrderStatus, OrderType, PaymentMethod } from "@/generated/prisma/enums";

type PaymentRow = {
  id: string;
  method: PaymentMethod;
  amount: number;
  received: number;
  change: number;
  reference: string | null;
  state: string;
  createdAt: Date | string;
  orderId: string;
  orderNumber: string;
  orderTotal: number;
  userName: string;
};

type UnpaidOrder = {
  id: string;
  orderNumber: string;
  type: OrderType;
  status: OrderStatus;
  total: number;
  paidTotal: number;
  itemCount: number;
  tableNumber: string | null;
  customerName: string | null;
  placedAt: Date | string;
};

const METHOD_OPTIONS = [
  { value: "ALL", label: "All methods" },
  ...Object.entries(PAYMENT_METHOD_LABEL).map(([value, label]) => ({ value, label })),
];

export function PaymentsView({
  payments,
  byMethod,
  unpaidOrders,
  currency,
  method,
  search,
  canProcess,
  canRefund,
}: {
  payments: PaymentRow[];
  byMethod: { method: PaymentMethod; total: number; count: number }[];
  unpaidOrders: UnpaidOrder[];
  currency: string;
  method: string;
  search: string;
  canProcess: boolean;
  canRefund: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [pending, startRefund] = useTransition();
  const [paying, setPaying] = useState<UnpaidOrder | null>(null);
  const [refunding, setRefunding] = useState<PaymentRow | null>(null);
  const [refundReason, setRefundReason] = useState("");

  const push = (patch: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (!value || value === "ALL") params.delete(key);
      else params.set(key, value);
    }
    startTransition(() => router.push(`/payments?${params.toString()}`, { scroll: false }));
  };

  const grandTotal = byMethod.reduce((acc, m) => acc + m.total, 0);

  return (
    <>
      <Tabs defaultValue={unpaidOrders.length > 0 ? "open" : "history"}>
        <TabsList>
          <TabsTrigger value="open">
            Open tickets
            {unpaidOrders.length > 0 && (
              <span className="ml-1.5 rounded-full bg-warning/20 px-1.5 text-xs text-warning-foreground dark:text-warning">
                {unpaidOrders.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="history">Transactions</TabsTrigger>
          <TabsTrigger value="breakdown">Breakdown</TabsTrigger>
        </TabsList>

        <TabsContent value="open" className="pt-4">
          {unpaidOrders.length === 0 ? (
            <Card>
              <CardContent>
                <EmptyState
                  icon={Receipt}
                  title="Nothing outstanding"
                  description="Every open order has been settled."
                />
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {unpaidOrders.map((order) => {
                const outstanding =
                  Math.round((order.total - order.paidTotal + Number.EPSILON) * 100) / 100;
                return (
                  <Card key={order.id}>
                    <CardContent className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <Link
                            href={`/orders/${order.id}`}
                            className="font-semibold hover:text-primary hover:underline"
                          >
                            {order.orderNumber}
                          </Link>
                          <p className="text-xs text-muted-foreground">
                            {order.tableNumber ? `Table ${order.tableNumber}` : order.type.replace("_", " ")}
                            {order.customerName && ` · ${order.customerName}`}
                          </p>
                        </div>
                        <StatusBadge
                          label={ORDER_STATUS_LABEL[order.status]}
                          tone={ORDER_STATUS_TONE[order.status]}
                        />
                      </div>

                      <dl className="space-y-1 text-sm">
                        <div className="flex justify-between">
                          <dt className="text-muted-foreground">Items</dt>
                          <dd className="tabular">{order.itemCount}</dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-muted-foreground">Placed</dt>
                          <dd className="tabular">{format(new Date(order.placedAt), "HH:mm")}</dd>
                        </div>
                        {order.paidTotal > 0 && (
                          <div className="flex justify-between">
                            <dt className="text-muted-foreground">Part paid</dt>
                            <dd className="tabular text-success">
                              {formatMoney(order.paidTotal, currency)}
                            </dd>
                          </div>
                        )}
                        <div className="flex justify-between border-t pt-1 font-semibold">
                          <dt>Outstanding</dt>
                          <dd className="tabular">{formatMoney(outstanding, currency)}</dd>
                        </div>
                      </dl>

                      {canProcess && (
                        <Button className="w-full gap-2" onClick={() => setPaying(order)}>
                          <CreditCard className="size-4" />
                          Take payment
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="history" className="space-y-3 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[13rem] flex-1 sm:max-w-xs">
              <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                defaultValue={search}
                onChange={(e) => {
                  const value = e.target.value;
                  setTimeout(() => push({ q: value }), 0);
                }}
                placeholder="Order number or reference…"
                className="h-8 pl-9"
              />
            </div>
            <div className="w-40">
              <AppSelect
                value={method}
                onValueChange={(v) => push({ method: v })}
                options={METHOD_OPTIONS}
                size="sm"
                aria-label="Filter by method"
              />
            </div>
          </div>

          <Card className="py-0">
            <CardContent className="px-0">
              {payments.length === 0 ? (
                <EmptyState icon={CreditCard} title="No payments in this period" />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>When</TableHead>
                        <TableHead>Order</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead className="hidden lg:table-cell">Reference</TableHead>
                        <TableHead className="hidden xl:table-cell">Taken by</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="hidden text-right sm:table-cell">Change</TableHead>
                        {canRefund && <TableHead className="w-24" />}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payments.map((payment) => (
                        <TableRow key={payment.id}>
                          <TableCell className="whitespace-nowrap text-muted-foreground">
                            {format(new Date(payment.createdAt), "d MMM, HH:mm")}
                          </TableCell>
                          <TableCell>
                            <Link
                              href={`/orders/${payment.orderId}`}
                              className="font-medium hover:text-primary hover:underline"
                            >
                              {payment.orderNumber}
                            </Link>
                          </TableCell>
                          <TableCell>
                            <StatusBadge
                              label={PAYMENT_METHOD_LABEL[payment.method]}
                              tone={
                                payment.state === "REFUNDED"
                                  ? "bg-destructive/10 text-destructive border-destructive/25"
                                  : "bg-muted text-muted-foreground border-border"
                              }
                            />
                          </TableCell>
                          <TableCell className="hidden font-mono text-xs lg:table-cell text-muted-foreground">
                            {payment.reference ?? "—"}
                          </TableCell>
                          <TableCell className="hidden xl:table-cell text-muted-foreground">
                            {payment.userName}
                          </TableCell>
                          <TableCell
                            className={cn(
                              "text-right font-medium tabular",
                              payment.state === "REFUNDED" && "text-muted-foreground line-through",
                            )}
                          >
                            {formatMoney(payment.amount, currency)}
                          </TableCell>
                          <TableCell className="hidden text-right sm:table-cell text-muted-foreground tabular">
                            {payment.change > 0 ? formatMoney(payment.change, currency) : "—"}
                          </TableCell>
                          {canRefund && (
                            <TableCell>
                              {payment.state === "COMPLETED" && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 gap-1 px-2 text-xs"
                                  onClick={() => {
                                    setRefunding(payment);
                                    setRefundReason("");
                                  }}
                                >
                                  <RotateCcw className="size-3.5" />
                                  Refund
                                </Button>
                              )}
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="breakdown" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle>By payment method</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {byMethod.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No payments in this period.
                </p>
              ) : (
                byMethod
                  .slice()
                  .sort((a, b) => b.total - a.total)
                  .map((row) => {
                    const share = grandTotal > 0 ? (row.total / grandTotal) * 100 : 0;
                    return (
                      <div key={row.method} className="space-y-1.5">
                        <div className="flex items-baseline justify-between text-sm">
                          <span className="font-medium">{PAYMENT_METHOD_LABEL[row.method]}</span>
                          <span className="text-muted-foreground tabular">
                            {row.count} · {formatMoney(row.total, currency)} ({share.toFixed(1)}%)
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${share}%` }}
                          />
                        </div>
                      </div>
                    );
                  })
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {paying && (
        <PaymentDialog
          open={!!paying}
          onOpenChange={(open) => !open && setPaying(null)}
          orderId={paying.id}
          orderNumber={paying.orderNumber}
          total={paying.total}
          alreadyPaid={paying.paidTotal}
          currency={currency}
          onPaid={() => {
            setPaying(null);
            router.refresh();
          }}
        />
      )}

      <Dialog open={!!refunding} onOpenChange={(open) => !open && setRefunding(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Refund payment</DialogTitle>
            <DialogDescription>
              Refunding reopens the order and returns any inventory that was deducted when it
              completed.
            </DialogDescription>
          </DialogHeader>
          {refunding && (
            <div className="space-y-3">
              <div className="rounded-lg border bg-muted/40 p-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Order</span>
                  <span className="font-medium">{refunding.orderNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Amount</span>
                  <span className="font-medium tabular">
                    {formatMoney(refunding.amount, currency)}
                  </span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="refund-reason">Reason</Label>
                <Textarea
                  id="refund-reason"
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  rows={3}
                  placeholder="Wrong charge, customer complaint…"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRefunding(null)} disabled={pending}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={pending || !refundReason.trim()}
              onClick={() =>
                startRefund(async () => {
                  if (!refunding) return;
                  const result = await refundPaymentAction(refunding.id, refundReason);
                  if (!result.ok) {
                    toast.error(result.error);
                    return;
                  }
                  toast.success("Payment refunded");
                  setRefunding(null);
                  router.refresh();
                })
              }
            >
              {pending && <Loader2 className="size-4 animate-spin" />}
              Refund
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, CheckCircle2, ChefHat, CreditCard, Loader2, Tag, Truck, X } from "lucide-react";
import { toast } from "sonner";

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
import { Textarea } from "@/components/ui/textarea";
import { PaymentDialog } from "@/features/payments/payment-dialog";
import { formatMoney } from "@/lib/money";
import { ORDER_STATUS_FLOW, ORDER_STATUS_LABEL } from "@/lib/status";
import {
  applyDiscountAction,
  cancelOrderAction,
  removeDiscountAction,
  updateOrderStatusAction,
} from "@/server/actions/orders";
import type { OrderStatus, PaymentStatus } from "@/generated/prisma/enums";

const STATUS_ICON: Partial<Record<OrderStatus, typeof ChefHat>> = {
  CONFIRMED: CheckCircle2,
  PREPARING: ChefHat,
  READY: CheckCircle2,
  SERVED: Truck,
  COMPLETED: CheckCircle2,
};

export function OrderActions({
  orderId,
  orderNumber,
  status,
  paymentStatus,
  total,
  paidTotal,
  currency,
  canUpdate,
  canCancel,
  canPay,
  canDiscount,
  discounts,
}: {
  orderId: string;
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  total: number;
  paidTotal: number;
  currency: string;
  canUpdate: boolean;
  canCancel: boolean;
  canPay: boolean;
  canDiscount: boolean;
  discounts: { id: string; label: string; amount: number; appliedBy: string; approvedBy: string | null }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showPayment, setShowPayment] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [showDiscount, setShowDiscount] = useState(false);
  const [discountValue, setDiscountValue] = useState("");
  const [discountCode, setDiscountCode] = useState("");

  const outstanding = Math.round((total - paidTotal + Number.EPSILON) * 100) / 100;
  const nextStatuses = ORDER_STATUS_FLOW[status].filter((s) => s !== "CANCELLED");
  const settled = status === "COMPLETED" || status === "CANCELLED";
  // A bill stays discountable until it is closed or fully paid — which is
  // when a discount is most often asked for, at the till.
  const discountable = !settled && paymentStatus !== "PAID";

  const advance = (next: OrderStatus) =>
    startTransition(async () => {
      const result = await updateOrderStatusAction(
        orderId,
        next as "PENDING" | "CONFIRMED" | "PREPARING" | "READY" | "SERVED" | "COMPLETED",
      );
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Order marked ${ORDER_STATUS_LABEL[next].toLowerCase()}`);
      router.refresh();
    });

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {canPay && outstanding > 0.005 && status !== "CANCELLED" && (
            <Button className="w-full gap-2" onClick={() => setShowPayment(true)} disabled={pending}>
              <CreditCard className="size-4" />
              Take payment · {formatMoney(outstanding, currency)}
            </Button>
          )}

          {canUpdate &&
            nextStatuses.map((next) => {
              const Icon = STATUS_ICON[next] ?? CheckCircle2;
              const blocked = next === "COMPLETED" && outstanding > 0.005;
              return (
                <Button
                  key={next}
                  variant="outline"
                  className="w-full gap-2"
                  disabled={pending || blocked}
                  onClick={() => advance(next)}
                  title={blocked ? "Take payment before completing this order" : undefined}
                >
                  {pending ? <Loader2 className="size-4 animate-spin" /> : <Icon className="size-4" />}
                  Mark {ORDER_STATUS_LABEL[next].toLowerCase()}
                </Button>
              );
            })}

          {canDiscount && discountable && (
            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={() => setShowDiscount(true)}
              disabled={pending}
            >
              <Tag className="size-4" />
              Apply discount
            </Button>
          )}

          {canCancel && !settled && (
            <Button
              variant="outline"
              className="w-full gap-2 text-destructive hover:bg-destructive/8 hover:text-destructive"
              onClick={() => setShowCancel(true)}
              disabled={pending}
            >
              <Ban className="size-4" />
              Cancel order
            </Button>
          )}

          {settled && (
            <p className="rounded-lg bg-muted px-3 py-2.5 text-center text-sm text-muted-foreground">
              This order is {ORDER_STATUS_LABEL[status].toLowerCase()} and can no longer be changed.
            </p>
          )}

          {discounts.length > 0 && (
            <div className="space-y-1.5 border-t pt-3">
              <p className="text-xs font-medium text-muted-foreground">Applied discounts</p>
              {discounts.map((discount) => (
                <div
                  key={discount.id}
                  className="flex items-center gap-2 rounded-lg border border-success/25 bg-success/6 px-2.5 py-1.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">{discount.label}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      by {discount.appliedBy}
                      {discount.approvedBy && ` · approved by ${discount.approvedBy}`}
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-success tabular">
                    −{formatMoney(discount.amount, currency)}
                  </span>
                  {canDiscount && discountable && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6"
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          const result = await removeDiscountAction(discount.id);
                          if (!result.ok) toast.error(result.error);
                          else {
                            toast.success("Discount removed");
                            router.refresh();
                          }
                        })
                      }
                      aria-label="Remove discount"
                    >
                      <X className="size-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <PaymentDialog
        open={showPayment}
        onOpenChange={setShowPayment}
        orderId={orderId}
        orderNumber={orderNumber}
        total={total}
        alreadyPaid={paidTotal}
        currency={currency}
        onPaid={() => router.refresh()}
      />

      <Dialog open={showCancel} onOpenChange={setShowCancel}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel order {orderNumber}?</DialogTitle>
            <DialogDescription>
              Any stock already deducted for this order is returned to inventory. This is recorded in
              the audit log.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="cancel-reason">Reason</Label>
            <Textarea
              id="cancel-reason"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Customer left, item unavailable, duplicate ticket…"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCancel(false)} disabled={pending}>
              Keep order
            </Button>
            <Button
              variant="destructive"
              disabled={pending || !cancelReason.trim()}
              onClick={() =>
                startTransition(async () => {
                  const result = await cancelOrderAction(orderId, cancelReason);
                  if (!result.ok) {
                    toast.error(result.error);
                    return;
                  }
                  toast.success("Order cancelled");
                  setShowCancel(false);
                  router.refresh();
                })
              }
            >
              {pending && <Loader2 className="size-4 animate-spin" />}
              Cancel order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDiscount} onOpenChange={setShowDiscount}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Apply a discount</DialogTitle>
            <DialogDescription>
              Discounts above the restaurant&apos;s approval threshold require manager permission.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="discount-code">Coupon code</Label>
              <div className="flex gap-2">
                <Input
                  id="discount-code"
                  value={discountCode}
                  onChange={(e) => setDiscountCode(e.target.value.toUpperCase())}
                  placeholder="WELCOME10"
                />
                <Button
                  variant="outline"
                  disabled={pending || !discountCode.trim()}
                  onClick={() =>
                    startTransition(async () => {
                      const result = await applyDiscountAction(orderId, {
                        kind: "code",
                        code: discountCode,
                      });
                      if (!result.ok) {
                        toast.error(result.error);
                        return;
                      }
                      toast.success(`${result.data.label} applied`);
                      setShowDiscount(false);
                      setDiscountCode("");
                      router.refresh();
                    })
                  }
                >
                  Apply
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="discount-percent">Manual percentage</Label>
              <div className="flex gap-2">
                <Input
                  id="discount-percent"
                  inputMode="decimal"
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                  placeholder="10"
                  className="tabular"
                />
                <Button
                  variant="outline"
                  disabled={pending || !discountValue}
                  onClick={() =>
                    startTransition(async () => {
                      const result = await applyDiscountAction(orderId, {
                        kind: "manual",
                        type: "PERCENTAGE",
                        value: Number(discountValue),
                      });
                      if (!result.ok) {
                        toast.error(result.error);
                        return;
                      }
                      toast.success(`${result.data.label} applied`);
                      setShowDiscount(false);
                      setDiscountValue("");
                      router.refresh();
                    })
                  }
                >
                  Apply %
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

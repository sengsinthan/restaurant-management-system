"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  Banknote,
  CreditCard,
  Landmark,
  Loader2,
  MoreHorizontal,
  Plus,
  QrCode,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
import { formatMoney, round2 } from "@/lib/money";
import { recordPaymentAction } from "@/server/actions/payments";
import type { PaymentMethod } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";

const METHODS: { value: PaymentMethod; label: string; icon: typeof Banknote; needsReference: boolean }[] = [
  { value: "CASH", label: "Cash", icon: Banknote, needsReference: false },
  { value: "CARD", label: "Card", icon: CreditCard, needsReference: true },
  { value: "QR", label: "QR", icon: QrCode, needsReference: true },
  { value: "BANK_TRANSFER", label: "Transfer", icon: Landmark, needsReference: true },
  { value: "OTHER", label: "Other", icon: MoreHorizontal, needsReference: false },
];

type Tender = { id: string; method: PaymentMethod; amount: string; reference: string };

const QUICK_CASH = [5, 10, 20, 50, 100];

export function PaymentDialog({
  open,
  onOpenChange,
  orderId,
  orderNumber,
  total,
  alreadyPaid,
  currency,
  onPaid,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  orderNumber: string;
  total: number;
  alreadyPaid: number;
  currency: string;
  onPaid?: () => void;
}) {
  const outstanding = round2(total - alreadyPaid);
  const [tenders, setTenders] = useState<Tender[]>([]);
  const [cashReceived, setCashReceived] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    setTenders([{ id: crypto.randomUUID(), method: "CASH", amount: outstanding.toFixed(2), reference: "" }]);
    setCashReceived("");
  }, [open, outstanding]);

  const applied = useMemo(
    () => round2(tenders.reduce((acc, t) => acc + (Number(t.amount) || 0), 0)),
    [tenders],
  );
  const remaining = round2(outstanding - applied);
  const isSplit = tenders.length > 1;
  const cashTender = tenders.find((t) => t.method === "CASH");
  const cashAmount = Number(cashTender?.amount ?? 0) || 0;
  const received = Number(cashReceived) || 0;
  const change = cashTender && received > cashAmount ? round2(received - cashAmount) : 0;

  const update = (id: string, patch: Partial<Tender>) =>
    setTenders((list) => list.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  const addTender = () =>
    setTenders((list) => [
      ...list,
      {
        id: crypto.randomUUID(),
        method: "QR",
        amount: Math.max(0, round2(outstanding - applied)).toFixed(2),
        reference: "",
      },
    ]);

  const submit = () =>
    startTransition(async () => {
      const payload = tenders
        .map((t) => ({
          method: t.method,
          amount: round2(Number(t.amount) || 0),
          received:
            t.method === "CASH" && received > 0 ? round2(received) : undefined,
          reference: t.reference.trim() || null,
        }))
        .filter((t) => t.amount > 0);

      if (payload.length === 0) {
        toast.error("Enter a payment amount.");
        return;
      }

      const result = await recordPaymentAction(orderId, payload);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      toast.success(
        result.data.completed ? `Order ${result.data.orderNumber} paid` : "Partial payment recorded",
        {
          description:
            result.data.change > 0
              ? `Change due: ${formatMoney(result.data.change, currency)}`
              : `${formatMoney(result.data.paid, currency)} of ${formatMoney(result.data.total, currency)} received.`,
        },
      );
      onOpenChange(false);
      onPaid?.();
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Take payment</DialogTitle>
          <DialogDescription>
            Order {orderNumber} · {formatMoney(outstanding, currency)} outstanding
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-xl border bg-muted/40 p-3">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-muted-foreground">Amount due</span>
              <span className="text-2xl font-semibold tracking-tight tabular">
                {formatMoney(outstanding, currency)}
              </span>
            </div>
            {alreadyPaid > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                {formatMoney(alreadyPaid, currency)} already received of{" "}
                {formatMoney(total, currency)}.
              </p>
            )}
          </div>

          <div className="space-y-3">
            {tenders.map((tender, index) => {
              const method = METHODS.find((m) => m.value === tender.method)!;
              return (
                <div key={tender.id} className="space-y-2.5 rounded-xl border p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">
                      {isSplit ? `Payment ${index + 1}` : "Payment method"}
                    </span>
                    {isSplit && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-6"
                        onClick={() => setTenders((l) => l.filter((t) => t.id !== tender.id))}
                        aria-label="Remove payment"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    )}
                  </div>

                  <div className="grid grid-cols-5 gap-1.5">
                    {METHODS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => update(tender.id, { method: option.value })}
                        className={cn(
                          "flex flex-col items-center gap-1 rounded-lg border px-1 py-2 text-[11px] font-medium transition-colors",
                          tender.method === option.value
                            ? "border-primary bg-primary/8 text-primary ring-1 ring-primary"
                            : "text-muted-foreground hover:border-primary/40 hover:bg-muted",
                        )}
                      >
                        <option.icon className="size-4" />
                        {option.label}
                      </button>
                    ))}
                  </div>

                  <div className="grid gap-2.5 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor={`amount-${tender.id}`} className="text-xs">
                        Amount
                      </Label>
                      <Input
                        id={`amount-${tender.id}`}
                        inputMode="decimal"
                        value={tender.amount}
                        onChange={(e) => update(tender.id, { amount: e.target.value })}
                        className="tabular"
                      />
                    </div>
                    {method.needsReference && (
                      <div className="space-y-1.5">
                        <Label htmlFor={`ref-${tender.id}`} className="text-xs">
                          Reference
                        </Label>
                        <Input
                          id={`ref-${tender.id}`}
                          value={tender.reference}
                          onChange={(e) => update(tender.id, { reference: e.target.value })}
                          placeholder="Transaction ID"
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {cashTender && (
            <div className="space-y-2">
              <Label htmlFor="cash-received" className="text-xs">
                Cash received
              </Label>
              <Input
                id="cash-received"
                inputMode="decimal"
                value={cashReceived}
                onChange={(e) => setCashReceived(e.target.value)}
                placeholder={cashAmount.toFixed(2)}
                className="tabular"
              />
              <div className="flex flex-wrap gap-1.5">
                {QUICK_CASH.map((note) => (
                  <Button
                    key={note}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2.5 text-xs tabular"
                    onClick={() => setCashReceived(String(note))}
                  >
                    {formatMoney(note, currency)}
                  </Button>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2.5 text-xs"
                  onClick={() => setCashReceived(cashAmount.toFixed(2))}
                >
                  Exact
                </Button>
              </div>
            </div>
          )}

          <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={addTender}>
            <Plus className="size-3.5" />
            Split payment
          </Button>

          <dl className="space-y-1 rounded-xl border bg-muted/40 p-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Applied</dt>
              <dd className="font-medium tabular">{formatMoney(applied, currency)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Remaining</dt>
              <dd
                className={cn(
                  "font-medium tabular",
                  Math.abs(remaining) < 0.005 ? "text-success" : "text-destructive",
                )}
              >
                {formatMoney(remaining, currency)}
              </dd>
            </div>
            {change > 0 && (
              <div className="flex justify-between border-t pt-1">
                <dt className="font-medium">Change due</dt>
                <dd className="font-semibold tabular">{formatMoney(change, currency)}</dd>
              </div>
            )}
          </dl>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || applied <= 0}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Take {formatMoney(applied, currency)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

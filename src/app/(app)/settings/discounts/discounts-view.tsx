"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Loader2, Pencil, Plus, Tag, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { AppSelect } from "@/components/shared/app-select";
import { EmptyState } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney } from "@/lib/money";
import { deleteDiscountAction, saveDiscountAction } from "@/server/actions/settings";
import type { DiscountScope, DiscountType } from "@/generated/prisma/enums";

type Discount = {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  type: DiscountType;
  scope: DiscountScope;
  value: number;
  minOrderAmount: number;
  maxDiscount: number | null;
  startsAt: Date | string | null;
  endsAt: Date | string | null;
  usageLimit: number | null;
  usageCount: number;
  isActive: boolean;
  timesApplied: number;
};

const TYPE_OPTIONS = [
  { value: "PERCENTAGE", label: "Percentage" },
  { value: "FIXED", label: "Fixed amount" },
];
const SCOPE_OPTIONS = [
  { value: "COUPON", label: "Coupon" },
  { value: "PROMOTION", label: "Promotion" },
  { value: "MANUAL", label: "Manual" },
];

const EMPTY = {
  code: "",
  name: "",
  description: "",
  type: "PERCENTAGE" as DiscountType,
  scope: "COUPON" as DiscountScope,
  value: "10",
  minOrderAmount: "0",
  maxDiscount: "",
  startsAt: "",
  endsAt: "",
  usageLimit: "",
  isActive: true,
};

export function DiscountsView({
  discounts,
  currency,
  approvalThreshold,
}: {
  discounts: Discount[];
  currency: string;
  approvalThreshold: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Discount | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [pending, startSave] = useTransition();
  const [, startTransition] = useTransition();

  const startCreate = () => {
    setForm(EMPTY);
    setEditing(null);
    setOpen(true);
  };

  const startEdit = (discount: Discount) => {
    setForm({
      code: discount.code ?? "",
      name: discount.name,
      description: discount.description ?? "",
      type: discount.type,
      scope: discount.scope,
      value: String(discount.value),
      minOrderAmount: String(discount.minOrderAmount),
      maxDiscount: discount.maxDiscount ? String(discount.maxDiscount) : "",
      startsAt: discount.startsAt ? format(new Date(discount.startsAt), "yyyy-MM-dd") : "",
      endsAt: discount.endsAt ? format(new Date(discount.endsAt), "yyyy-MM-dd") : "",
      usageLimit: discount.usageLimit ? String(discount.usageLimit) : "",
      isActive: discount.isActive,
    });
    setEditing(discount);
    setOpen(true);
  };

  const save = () =>
    startSave(async () => {
      const result = await saveDiscountAction(editing?.id ?? null, {
        ...form,
        maxDiscount: form.maxDiscount || undefined,
        usageLimit: form.usageLimit || undefined,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(editing ? "Discount updated" : "Discount created");
      setOpen(false);
      router.refresh();
    });

  const remove = (discount: Discount) =>
    startTransition(async () => {
      const result = await deleteDiscountAction(discount.id);
      if (!result.ok) toast.error(result.error);
      else {
        toast.success(`${discount.name} removed`);
        router.refresh();
      }
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Discounts above{" "}
          <span className="font-medium text-foreground">{approvalThreshold}%</span> of an order
          require the &ldquo;approve discounts&rdquo; permission.
        </p>
        <Button className="gap-2" onClick={startCreate}>
          <Plus className="size-4" />
          New discount
        </Button>
      </div>

      <Card className="py-0">
        <CardContent className="px-0">
          {discounts.length === 0 ? (
            <EmptyState
              icon={Tag}
              title="No discounts yet"
              description="Create coupons and promotions staff can apply at the POS."
              action={<Button onClick={startCreate}>Create a discount</Button>}
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Discount</TableHead>
                    <TableHead className="hidden sm:table-cell">Code</TableHead>
                    <TableHead>Value</TableHead>
                    <TableHead className="hidden md:table-cell">Conditions</TableHead>
                    <TableHead className="hidden lg:table-cell">Valid</TableHead>
                    <TableHead className="text-right">Used</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-20" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {discounts.map((discount) => (
                    <TableRow key={discount.id}>
                      <TableCell>
                        <p className="font-medium">{discount.name}</p>
                        <p className="text-xs text-muted-foreground">{discount.scope.toLowerCase()}</p>
                      </TableCell>
                      <TableCell className="hidden font-mono text-xs sm:table-cell">
                        {discount.code ?? "—"}
                      </TableCell>
                      <TableCell className="font-medium tabular">
                        {discount.type === "PERCENTAGE"
                          ? `${discount.value}%`
                          : formatMoney(discount.value, currency)}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                        {discount.minOrderAmount > 0 && (
                          <p>min {formatMoney(discount.minOrderAmount, currency)}</p>
                        )}
                        {discount.maxDiscount && (
                          <p>cap {formatMoney(discount.maxDiscount, currency)}</p>
                        )}
                        {discount.minOrderAmount === 0 && !discount.maxDiscount && "—"}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                        {discount.startsAt && format(new Date(discount.startsAt), "d MMM yy")}
                        {discount.endsAt && ` – ${format(new Date(discount.endsAt), "d MMM yy")}`}
                        {!discount.startsAt && !discount.endsAt && "always"}
                      </TableCell>
                      <TableCell className="text-right tabular">
                        {discount.usageCount}
                        {discount.usageLimit ? ` / ${discount.usageLimit}` : ""}
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          label={discount.isActive ? "Active" : "Inactive"}
                          tone={
                            discount.isActive
                              ? "bg-success/15 text-success border-success/30"
                              : "bg-muted text-muted-foreground border-border"
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-0.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            onClick={() => startEdit(discount)}
                            aria-label={`Edit ${discount.name}`}
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-muted-foreground hover:text-destructive"
                            onClick={() => remove(discount)}
                            aria-label={`Delete ${discount.name}`}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${editing.name}` : "New discount"}</DialogTitle>
            <DialogDescription>
              Coupons are entered by code at the POS; promotions can be picked from a list.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="d-name">Name</Label>
              <Input
                id="d-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Welcome 10% Off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="d-code">Code</Label>
              <Input
                id="d-code"
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                placeholder="WELCOME10"
                className="font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Scope</Label>
              <AppSelect
                value={form.scope}
                onValueChange={(v) => setForm((f) => ({ ...f, scope: v as DiscountScope }))}
                options={SCOPE_OPTIONS}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <AppSelect
                value={form.type}
                onValueChange={(v) => setForm((f) => ({ ...f, type: v as DiscountType }))}
                options={TYPE_OPTIONS}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="d-value">
                Value {form.type === "PERCENTAGE" ? "(%)" : `(${currency})`}
              </Label>
              <Input
                id="d-value"
                inputMode="decimal"
                value={form.value}
                onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
                className="tabular"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="d-min">Minimum order</Label>
              <Input
                id="d-min"
                inputMode="decimal"
                value={form.minOrderAmount}
                onChange={(e) => setForm((f) => ({ ...f, minOrderAmount: e.target.value }))}
                className="tabular"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="d-max">Maximum discount</Label>
              <Input
                id="d-max"
                inputMode="decimal"
                value={form.maxDiscount}
                onChange={(e) => setForm((f) => ({ ...f, maxDiscount: e.target.value }))}
                placeholder="No cap"
                className="tabular"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="d-start">Starts</Label>
              <Input
                id="d-start"
                type="date"
                value={form.startsAt}
                onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="d-end">Ends</Label>
              <Input
                id="d-end"
                type="date"
                value={form.endsAt}
                onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="d-limit">Usage limit</Label>
              <Input
                id="d-limit"
                inputMode="numeric"
                value={form.usageLimit}
                onChange={(e) => setForm((f) => ({ ...f, usageLimit: e.target.value }))}
                placeholder="Unlimited"
                className="tabular"
              />
            </div>
            <div className="flex items-end gap-2 pb-2">
              <Switch
                id="d-active"
                checked={form.isActive}
                onCheckedChange={(checked) => setForm((f) => ({ ...f, isActive: checked }))}
              />
              <Label htmlFor="d-active">Active</Label>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="d-desc">Description</Label>
              <Textarea
                id="d-desc"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={save} disabled={pending || !form.name.trim()}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              {editing ? "Save changes" : "Create discount"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

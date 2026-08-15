"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateRestaurantAction } from "@/server/actions/settings";

type Restaurant = {
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  currency: string;
  currencySymbol: string;
  taxRate: number;
  serviceChargeRate: number;
  discountApprovalThreshold: number;
  openingTime: string;
  closingTime: string;
};

export function RestaurantSettingsForm({
  restaurant,
  canManage,
}: {
  restaurant: Restaurant;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({
    name: restaurant.name,
    address: restaurant.address ?? "",
    phone: restaurant.phone ?? "",
    email: restaurant.email ?? "",
    currency: restaurant.currency,
    currencySymbol: restaurant.currencySymbol,
    taxRate: String(restaurant.taxRate),
    serviceChargeRate: String(restaurant.serviceChargeRate),
    discountApprovalThreshold: String(restaurant.discountApprovalThreshold),
    openingTime: restaurant.openingTime,
    closingTime: restaurant.closingTime,
  });

  const save = () =>
    startTransition(async () => {
      const result = await updateRestaurantAction(form);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Settings saved");
      router.refresh();
    });

  const field = (key: keyof typeof form) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value })),
    disabled: !canManage,
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Restaurant details</CardTitle>
          <CardDescription>Shown on the sidebar, receipts and reports.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="r-name">Name</Label>
            <Input id="r-name" {...field("name")} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="r-address">Address</Label>
            <Input id="r-address" {...field("address")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="r-phone">Phone</Label>
            <Input id="r-phone" {...field("phone")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="r-email">Email</Label>
            <Input id="r-email" type="email" {...field("email")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="r-open">Opening time</Label>
            <Input id="r-open" type="time" {...field("openingTime")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="r-close">Closing time</Label>
            <Input id="r-close" type="time" {...field("closingTime")} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Money and charges</CardTitle>
          <CardDescription>
            Tax and service charge apply to new orders. Existing orders keep the rates they were
            created with, so historical totals never shift.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="r-currency">Currency code</Label>
            <Input id="r-currency" {...field("currency")} placeholder="USD" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="r-symbol">Currency symbol</Label>
            <Input id="r-symbol" {...field("currencySymbol")} placeholder="$" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="r-tax">Tax rate (%)</Label>
            <Input id="r-tax" inputMode="decimal" className="tabular" {...field("taxRate")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="r-service">Service charge (%)</Label>
            <Input
              id="r-service"
              inputMode="decimal"
              className="tabular"
              {...field("serviceChargeRate")}
            />
            <p className="text-xs text-muted-foreground">Applied to dine-in orders only.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="r-threshold">Discount approval threshold (%)</Label>
            <Input
              id="r-threshold"
              inputMode="decimal"
              className="tabular"
              {...field("discountApprovalThreshold")}
            />
            <p className="text-xs text-muted-foreground">
              Discounts worth more than this share of an order need the &ldquo;approve
              discounts&rdquo; permission.
            </p>
          </div>
        </CardContent>
      </Card>

      {canManage && (
        <div className="flex justify-end">
          <Button onClick={save} disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Save settings
          </Button>
        </div>
      )}
    </div>
  );
}

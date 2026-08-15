"use client";

import { useEffect, useMemo, useState } from "react";
import { Minus, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

import type { PosItem } from "./types";

export function ItemOptionsDialog({
  item,
  currency,
  onClose,
  onConfirm,
}: {
  item: PosItem | null;
  currency: string;
  onClose: () => void;
  onConfirm: (selection: {
    variantId: string | null;
    addonIds: string[];
    quantity: number;
    notes: string | null;
  }) => void;
}) {
  const [variantId, setVariantId] = useState<string | null>(null);
  const [addonIds, setAddonIds] = useState<string[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!item) return;
    const preset = item.variants.find((v) => v.isDefault) ?? item.variants[0];
    setVariantId(preset?.id ?? null);
    setAddonIds([]);
    setQuantity(1);
    setNotes("");
  }, [item]);

  const unitPrice = useMemo(() => {
    if (!item) return 0;
    const base = variantId ? (item.variants.find((v) => v.id === variantId)?.price ?? item.price) : item.price;
    const addons = item.addons
      .filter((a) => addonIds.includes(a.id))
      .reduce((acc, a) => acc + a.price, 0);
    return base + addons;
  }, [item, variantId, addonIds]);

  if (!item) return null;

  return (
    <Dialog open={!!item} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{item.name}</DialogTitle>
          {item.description && <DialogDescription>{item.description}</DialogDescription>}
        </DialogHeader>

        <div className="space-y-4">
          {item.variants.length > 0 && (
            <div className="space-y-2">
              <Label>Size / option</Label>
              <div className="grid grid-cols-3 gap-2">
                {item.variants.map((variant) => (
                  <button
                    key={variant.id}
                    type="button"
                    onClick={() => setVariantId(variant.id)}
                    className={cn(
                      "rounded-lg border px-2 py-2.5 text-center transition-colors",
                      variantId === variant.id
                        ? "border-primary bg-primary/8 ring-1 ring-primary"
                        : "hover:border-primary/40 hover:bg-muted/60",
                    )}
                  >
                    <span className="block text-[13px] font-medium">{variant.name}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground tabular">
                      {formatMoney(variant.price, currency)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {item.addons.length > 0 && (
            <div className="space-y-2">
              <Label>Add-ons</Label>
              <div className="space-y-1.5">
                {item.addons.map((addon) => {
                  const checked = addonIds.includes(addon.id);
                  return (
                    <label
                      key={addon.id}
                      className={cn(
                        "flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition-colors",
                        checked ? "border-primary/50 bg-primary/6" : "hover:bg-muted/60",
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(next) =>
                          setAddonIds((ids) =>
                            next ? [...ids, addon.id] : ids.filter((id) => id !== addon.id),
                          )
                        }
                      />
                      <span className="flex-1">{addon.name}</span>
                      <span className="text-xs text-muted-foreground tabular">
                        {addon.price > 0 ? `+${formatMoney(addon.price, currency)}` : "Free"}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="item-notes">Kitchen note</Label>
            <Textarea
              id="item-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="No onion, extra spicy…"
              rows={2}
              maxLength={200}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2">
            <span className="text-sm font-medium">Quantity</span>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-8"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                aria-label="Decrease quantity"
              >
                <Minus className="size-4" />
              </Button>
              <span className="w-9 text-center text-sm font-semibold tabular">{quantity}</span>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-8"
                onClick={() => setQuantity((q) => Math.min(99, q + 1))}
                aria-label="Increase quantity"
              >
                <Plus className="size-4" />
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onConfirm({ variantId, addonIds, quantity, notes: notes.trim() || null });
              onClose();
            }}
          >
            Add · {formatMoney(unitPrice * quantity, currency)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

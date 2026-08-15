"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { AppSelect } from "@/components/shared/app-select";
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
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney, round2 } from "@/lib/money";
import { MENU_STATUS_LABEL } from "@/lib/status";
import { saveMenuItemAction } from "@/server/actions/menu";

import type { IngredientOption, MenuItemRow } from "./types";

type VariantDraft = { id?: string; name: string; price: string; isDefault: boolean };
type AddonDraft = { id?: string; name: string; price: string };
type RecipeDraft = { ingredientId: string; quantity: string };

const STATUS_OPTIONS = Object.entries(MENU_STATUS_LABEL).map(([value, label]) => ({ value, label }));

const EMPTY = {
  name: "",
  description: "",
  imageUrl: "",
  categoryId: "",
  sku: "",
  price: "",
  status: "AVAILABLE",
  prepTimeMin: "10",
  isFeatured: false,
};

export function MenuItemDialog({
  item,
  open,
  onOpenChange,
  categories,
  ingredients,
  currency,
}: {
  item: MenuItemRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: { id: string; name: string }[];
  ingredients: IngredientOption[];
  currency: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState(EMPTY);
  const [variants, setVariants] = useState<VariantDraft[]>([]);
  const [addons, setAddons] = useState<AddonDraft[]>([]);
  const [recipe, setRecipe] = useState<RecipeDraft[]>([]);

  useEffect(() => {
    if (!open) return;
    if (item) {
      setForm({
        name: item.name,
        description: item.description ?? "",
        imageUrl: item.imageUrl ?? "",
        categoryId: item.categoryId,
        sku: item.sku,
        price: String(item.price),
        status: item.status,
        prepTimeMin: String(item.prepTimeMin),
        isFeatured: item.isFeatured,
      });
      setVariants(
        item.variants.map((v) => ({
          id: v.id,
          name: v.name,
          price: String(v.price),
          isDefault: v.isDefault,
        })),
      );
      setAddons(item.addons.map((a) => ({ id: a.id, name: a.name, price: String(a.price) })));
      setRecipe(
        item.recipe.map((r) => ({ ingredientId: r.ingredientId, quantity: String(r.quantity) })),
      );
    } else {
      setForm({ ...EMPTY, categoryId: categories[0]?.id ?? "" });
      setVariants([]);
      setAddons([]);
      setRecipe([]);
    }
  }, [item, open, categories]);

  /** Ingredient cost is the source of truth for an item's cost price. */
  const computedCost = useMemo(
    () =>
      round2(
        recipe.reduce((acc, line) => {
          const ingredient = ingredients.find((i) => i.id === line.ingredientId);
          return acc + (ingredient?.cost ?? 0) * (Number(line.quantity) || 0);
        }, 0),
      ),
    [recipe, ingredients],
  );

  const price = Number(form.price) || 0;
  const margin = price > 0 ? round2(((price - computedCost) / price) * 100) : 0;

  const save = () =>
    startTransition(async () => {
      const result = await saveMenuItemAction(item?.id ?? null, {
        name: form.name,
        description: form.description,
        imageUrl: form.imageUrl,
        categoryId: form.categoryId,
        sku: form.sku,
        price: form.price,
        cost: computedCost,
        status: form.status as "AVAILABLE" | "UNAVAILABLE" | "HIDDEN",
        prepTimeMin: form.prepTimeMin,
        isFeatured: form.isFeatured,
        variants: variants
          .filter((v) => v.name.trim())
          .map((v) => ({ id: v.id, name: v.name, price: v.price, isDefault: v.isDefault })),
        addons: addons.filter((a) => a.name.trim()).map((a) => ({ id: a.id, name: a.name, price: a.price })),
        recipe: recipe
          .filter((r) => r.ingredientId && Number(r.quantity) > 0)
          .map((r) => ({ ingredientId: r.ingredientId, quantity: r.quantity })),
      });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(item ? `${form.name} updated` : `${form.name} added to the menu`);
      onOpenChange(false);
      router.refresh();
    });

  const ingredientOptions = ingredients.map((i) => ({
    value: i.id,
    label: `${i.name} (${i.unit})`,
  }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{item ? `Edit ${item.name}` : "New menu item"}</DialogTitle>
          <DialogDescription>
            Variants, add-ons and the recipe all feed the POS and inventory automatically.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="details">
          <TabsList className="w-full">
            <TabsTrigger value="details" className="flex-1">
              Details
            </TabsTrigger>
            <TabsTrigger value="variants" className="flex-1">
              Variants ({variants.length})
            </TabsTrigger>
            <TabsTrigger value="addons" className="flex-1">
              Add-ons ({addons.length})
            </TabsTrigger>
            <TabsTrigger value="recipe" className="flex-1">
              Recipe ({recipe.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-3 pt-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="mi-name">Name</Label>
                <Input
                  id="mi-name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Chicken Burger"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="mi-desc">Description</Label>
                <Textarea
                  id="mi-desc"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={2}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Category</Label>
                <AppSelect
                  value={form.categoryId}
                  onValueChange={(v) => setForm((f) => ({ ...f, categoryId: v }))}
                  options={categories.map((c) => ({ value: c.id, label: c.name }))}
                  placeholder="Choose…"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mi-sku">SKU</Label>
                <Input
                  id="mi-sku"
                  value={form.sku}
                  onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value.toUpperCase() }))}
                  placeholder="MAIN-001"
                  className="font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mi-price">Price</Label>
                <Input
                  id="mi-price"
                  inputMode="decimal"
                  value={form.price}
                  onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                  className="tabular"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mi-prep">Prep time (min)</Label>
                <Input
                  id="mi-prep"
                  inputMode="numeric"
                  value={form.prepTimeMin}
                  onChange={(e) => setForm((f) => ({ ...f, prepTimeMin: e.target.value }))}
                  className="tabular"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <AppSelect
                  value={form.status}
                  onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}
                  options={STATUS_OPTIONS}
                />
              </div>
              <div className="flex items-end gap-2 pb-2">
                <Switch
                  id="mi-featured"
                  checked={form.isFeatured}
                  onCheckedChange={(checked) => setForm((f) => ({ ...f, isFeatured: checked }))}
                />
                <Label htmlFor="mi-featured">Feature on POS</Label>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="mi-image">Image URL (optional)</Label>
                <Input
                  id="mi-image"
                  value={form.imageUrl}
                  onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))}
                  placeholder="https://…"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 rounded-xl border bg-muted/40 p-3 text-center">
              <div>
                <p className="text-xs text-muted-foreground">Recipe cost</p>
                <p className="font-semibold tabular">{formatMoney(computedCost, currency)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Price</p>
                <p className="font-semibold tabular">{formatMoney(price, currency)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Margin</p>
                <p
                  className={`font-semibold tabular ${
                    margin >= 60 ? "text-success" : margin >= 30 ? "" : "text-destructive"
                  }`}
                >
                  {margin.toFixed(1)}%
                </p>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="variants" className="space-y-2 pt-4">
            <p className="text-xs text-muted-foreground">
              Sizes or options with their own price, e.g. Small / Medium / Large. The default is
              pre-selected on the POS.
            </p>
            {variants.map((variant, index) => (
              <div key={index} className="flex items-end gap-2">
                <div className="flex-1 space-y-1.5">
                  <Label className="text-xs">Name</Label>
                  <Input
                    value={variant.name}
                    onChange={(e) =>
                      setVariants((list) =>
                        list.map((v, i) => (i === index ? { ...v, name: e.target.value } : v)),
                      )
                    }
                    placeholder="Large"
                  />
                </div>
                <div className="w-28 space-y-1.5">
                  <Label className="text-xs">Price</Label>
                  <Input
                    inputMode="decimal"
                    value={variant.price}
                    onChange={(e) =>
                      setVariants((list) =>
                        list.map((v, i) => (i === index ? { ...v, price: e.target.value } : v)),
                      )
                    }
                    className="tabular"
                  />
                </div>
                <div className="flex items-center gap-1.5 pb-2.5">
                  <Switch
                    checked={variant.isDefault}
                    onCheckedChange={() =>
                      setVariants((list) => list.map((v, i) => ({ ...v, isDefault: i === index })))
                    }
                    aria-label="Default variant"
                  />
                  <span className="text-xs text-muted-foreground">Default</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="mb-1 size-8 text-muted-foreground hover:text-destructive"
                  onClick={() => setVariants((list) => list.filter((_, i) => i !== index))}
                  aria-label="Remove variant"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() =>
                setVariants((list) => [
                  ...list,
                  { name: "", price: form.price, isDefault: list.length === 0 },
                ])
              }
            >
              <Plus className="size-3.5" />
              Add variant
            </Button>
          </TabsContent>

          <TabsContent value="addons" className="space-y-2 pt-4">
            <p className="text-xs text-muted-foreground">
              Optional extras staff can tick at the point of sale.
            </p>
            {addons.map((addon, index) => (
              <div key={index} className="flex items-end gap-2">
                <div className="flex-1 space-y-1.5">
                  <Label className="text-xs">Name</Label>
                  <Input
                    value={addon.name}
                    onChange={(e) =>
                      setAddons((list) =>
                        list.map((a, i) => (i === index ? { ...a, name: e.target.value } : a)),
                      )
                    }
                    placeholder="Extra Cheese"
                  />
                </div>
                <div className="w-28 space-y-1.5">
                  <Label className="text-xs">Price</Label>
                  <Input
                    inputMode="decimal"
                    value={addon.price}
                    onChange={(e) =>
                      setAddons((list) =>
                        list.map((a, i) => (i === index ? { ...a, price: e.target.value } : a)),
                      )
                    }
                    className="tabular"
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="mb-1 size-8 text-muted-foreground hover:text-destructive"
                  onClick={() => setAddons((list) => list.filter((_, i) => i !== index))}
                  aria-label="Remove add-on"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setAddons((list) => [...list, { name: "", price: "0" }])}
            >
              <Plus className="size-3.5" />
              Add add-on
            </Button>
          </TabsContent>

          <TabsContent value="recipe" className="space-y-2 pt-4">
            <p className="text-xs text-muted-foreground">
              Ingredients consumed per portion. These quantities are deducted from stock when an
              order completes, and set the item&apos;s cost price.
            </p>
            {recipe.map((line, index) => {
              const ingredient = ingredients.find((i) => i.id === line.ingredientId);
              return (
                <div key={index} className="flex items-end gap-2">
                  <div className="flex-1 space-y-1.5">
                    <Label className="text-xs">Ingredient</Label>
                    <AppSelect
                      value={line.ingredientId}
                      onValueChange={(v) =>
                        setRecipe((list) =>
                          list.map((r, i) => (i === index ? { ...r, ingredientId: v } : r)),
                        )
                      }
                      options={ingredientOptions}
                      placeholder="Choose…"
                    />
                  </div>
                  <div className="w-28 space-y-1.5">
                    <Label className="text-xs">Qty {ingredient ? `(${ingredient.unit})` : ""}</Label>
                    <Input
                      inputMode="decimal"
                      value={line.quantity}
                      onChange={(e) =>
                        setRecipe((list) =>
                          list.map((r, i) => (i === index ? { ...r, quantity: e.target.value } : r)),
                        )
                      }
                      className="tabular"
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="mb-1 size-8 text-muted-foreground hover:text-destructive"
                    onClick={() => setRecipe((list) => list.filter((_, i) => i !== index))}
                    aria-label="Remove ingredient"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              );
            })}
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() =>
                setRecipe((list) => [...list, { ingredientId: ingredients[0]?.id ?? "", quantity: "" }])
              }
            >
              <Plus className="size-3.5" />
              Add ingredient
            </Button>
            {recipe.length > 0 && (
              <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm">
                Recipe cost:{" "}
                <span className="font-semibold tabular">{formatMoney(computedCost, currency)}</span>{" "}
                per portion
              </p>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            onClick={save}
            disabled={pending || !form.name.trim() || !form.categoryId || !form.sku.trim()}
          >
            {pending && <Loader2 className="size-4 animate-spin" />}
            {item ? "Save changes" : "Create item"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

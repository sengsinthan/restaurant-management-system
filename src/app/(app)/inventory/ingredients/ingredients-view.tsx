"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { Loader2, Package, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { AppSelect } from "@/components/shared/app-select";
import { EmptyState } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
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
import { formatMoney, formatQty } from "@/lib/money";
import { STOCK_LEVEL_LABEL, STOCK_LEVEL_TONE, stockLevel } from "@/lib/status";
import { deleteIngredientAction, saveIngredientAction } from "@/server/actions/inventory";

export type IngredientRow = {
  id: string;
  name: string;
  sku: string;
  category: string;
  unit: string;
  quantity: number;
  minQuantity: number;
  cost: number;
  supplierId: string | null;
  supplierName: string | null;
  expiresAt: Date | string | null;
  isActive: boolean;
};

const UNITS = ["g", "kg", "ml", "l", "pc", "box", "pack", "bottle"];

const EMPTY = {
  name: "",
  sku: "",
  category: "General",
  unit: "g",
  minQuantity: "0",
  cost: "0",
  supplierId: "",
  expiresAt: "",
  isActive: true,
};

export function IngredientsView({
  ingredients,
  suppliers,
  currency,
  canManage,
  search,
}: {
  ingredients: IngredientRow[];
  suppliers: { id: string; name: string }[];
  currency: string;
  canManage: boolean;
  search: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [pending, startSave] = useTransition();
  const [term, setTerm] = useState(search);
  const [editing, setEditing] = useState<IngredientRow | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);

  useEffect(() => {
    if (term === search) return;
    const handle = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (term) params.set("q", term);
      else params.delete("q");
      startTransition(() =>
        router.push(`/inventory/ingredients?${params.toString()}`, { scroll: false }),
      );
    }, 350);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term]);

  const startCreate = () => {
    setForm(EMPTY);
    setEditing(null);
    setOpen(true);
  };

  const startEdit = (ingredient: IngredientRow) => {
    setForm({
      name: ingredient.name,
      sku: ingredient.sku,
      category: ingredient.category,
      unit: ingredient.unit,
      minQuantity: String(ingredient.minQuantity),
      cost: String(ingredient.cost),
      supplierId: ingredient.supplierId ?? "",
      expiresAt: ingredient.expiresAt
        ? format(new Date(ingredient.expiresAt), "yyyy-MM-dd")
        : "",
      isActive: ingredient.isActive,
    });
    setEditing(ingredient);
    setOpen(true);
  };

  const save = () =>
    startSave(async () => {
      const result = await saveIngredientAction(editing?.id ?? null, {
        ...form,
        supplierId: form.supplierId || null,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(editing ? "Ingredient updated" : "Ingredient added");
      setOpen(false);
      router.refresh();
    });

  const remove = (ingredient: IngredientRow) =>
    startTransition(async () => {
      const result = await deleteIngredientAction(ingredient.id);
      if (!result.ok) toast.error(result.error);
      else {
        toast.success(`${ingredient.name} removed`);
        router.refresh();
      }
    });

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[13rem] flex-1 sm:max-w-xs">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search ingredients, SKU or category…"
            className="h-8 pl-9"
          />
        </div>
        {canManage && (
          <Button className="ml-auto gap-2" onClick={startCreate}>
            <Plus className="size-4" />
            New ingredient
          </Button>
        )}
      </div>

      <Card className="py-0">
        <CardContent className="px-0">
          {ingredients.length === 0 ? (
            <EmptyState
              icon={Package}
              title="No ingredients found"
              description="Add the raw materials your recipes consume."
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ingredient</TableHead>
                    <TableHead className="hidden lg:table-cell">SKU</TableHead>
                    <TableHead className="hidden md:table-cell">Category</TableHead>
                    <TableHead className="text-right">In stock</TableHead>
                    <TableHead className="hidden text-right sm:table-cell">Minimum</TableHead>
                    <TableHead className="hidden text-right xl:table-cell">Unit cost</TableHead>
                    <TableHead className="hidden text-right xl:table-cell">Value</TableHead>
                    <TableHead className="hidden lg:table-cell">Supplier</TableHead>
                    <TableHead>Level</TableHead>
                    {canManage && <TableHead className="w-20" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ingredients.map((ingredient) => {
                    const level = stockLevel(
                      ingredient.quantity,
                      ingredient.minQuantity,
                      ingredient.expiresAt,
                    );
                    return (
                      <TableRow key={ingredient.id}>
                        <TableCell>
                          <p className="font-medium">{ingredient.name}</p>
                          {ingredient.expiresAt && (
                            <p className="text-xs text-muted-foreground">
                              expires {format(new Date(ingredient.expiresAt), "d MMM yyyy")}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="hidden font-mono text-xs lg:table-cell text-muted-foreground">
                          {ingredient.sku}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-muted-foreground">
                          {ingredient.category}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular">
                          {formatQty(ingredient.quantity)}
                          <span className="ml-0.5 text-xs text-muted-foreground">
                            {ingredient.unit}
                          </span>
                        </TableCell>
                        <TableCell className="hidden text-right sm:table-cell text-muted-foreground tabular">
                          {formatQty(ingredient.minQuantity)}
                        </TableCell>
                        <TableCell className="hidden text-right xl:table-cell text-muted-foreground tabular">
                          {formatMoney(ingredient.cost, currency)}
                        </TableCell>
                        <TableCell className="hidden text-right xl:table-cell tabular">
                          {formatMoney(ingredient.quantity * ingredient.cost, currency)}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-muted-foreground">
                          {ingredient.supplierName ?? "—"}
                        </TableCell>
                        <TableCell>
                          <StatusBadge
                            label={STOCK_LEVEL_LABEL[level]}
                            tone={STOCK_LEVEL_TONE[level]}
                          />
                        </TableCell>
                        {canManage && (
                          <TableCell>
                            <div className="flex justify-end gap-0.5">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8"
                                onClick={() => startEdit(ingredient)}
                                aria-label={`Edit ${ingredient.name}`}
                              >
                                <Pencil className="size-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8 text-muted-foreground hover:text-destructive"
                                onClick={() => remove(ingredient)}
                                aria-label={`Delete ${ingredient.name}`}
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${editing.name}` : "New ingredient"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="ing-name">Name</Label>
              <Input
                id="ing-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Chicken Breast"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ing-sku">SKU</Label>
              <Input
                id="ing-sku"
                value={form.sku}
                onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value.toUpperCase() }))}
                placeholder="ING-001"
                className="font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ing-cat">Category</Label>
              <Input
                id="ing-cat"
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                placeholder="Meat"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Unit</Label>
              <AppSelect
                value={form.unit}
                onValueChange={(v) => setForm((f) => ({ ...f, unit: v }))}
                options={UNITS.map((u) => ({ value: u, label: u }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ing-min">Minimum quantity</Label>
              <Input
                id="ing-min"
                inputMode="decimal"
                value={form.minQuantity}
                onChange={(e) => setForm((f) => ({ ...f, minQuantity: e.target.value }))}
                className="tabular"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ing-cost">Cost per {form.unit}</Label>
              <Input
                id="ing-cost"
                inputMode="decimal"
                value={form.cost}
                onChange={(e) => setForm((f) => ({ ...f, cost: e.target.value }))}
                className="tabular"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ing-exp">Expiry date</Label>
              <Input
                id="ing-exp"
                type="date"
                value={form.expiresAt}
                onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Supplier</Label>
              <AppSelect
                value={form.supplierId}
                onValueChange={(v) => setForm((f) => ({ ...f, supplierId: v }))}
                options={[
                  { value: "", label: "No supplier" },
                  ...suppliers.map((s) => ({ value: s.id, label: s.name })),
                ]}
                placeholder="Choose a supplier…"
              />
            </div>
            <div className="flex items-center gap-2 sm:col-span-2">
              <Switch
                id="ing-active"
                checked={form.isActive}
                onCheckedChange={(checked) => setForm((f) => ({ ...f, isActive: checked }))}
              />
              <Label htmlFor="ing-active">Active</Label>
            </div>
            {!editing && (
              <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground sm:col-span-2">
                New ingredients start at zero stock. Use{" "}
                <span className="font-medium">Stock → Stock in</span> to record the first delivery so
                it lands in the movement ledger.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={save} disabled={pending || !form.name.trim() || !form.sku.trim()}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              {editing ? "Save changes" : "Add ingredient"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

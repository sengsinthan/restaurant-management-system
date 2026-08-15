"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Pencil, Plus, Search, Trash2, UtensilsCrossed } from "lucide-react";
import { toast } from "sonner";

import { AppSelect } from "@/components/shared/app-select";
import { ItemThumb } from "@/components/shared/item-thumb";
import { EmptyState } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMoney } from "@/lib/money";
import { MENU_STATUS_LABEL, MENU_STATUS_TONE } from "@/lib/status";
import { deleteMenuItemAction, setMenuItemStatusAction } from "@/server/actions/menu";

import { MenuItemDialog } from "./menu-item-dialog";
import type { IngredientOption, MenuItemRow } from "./types";

const STATUS_OPTIONS = [
  { value: "ALL", label: "All statuses" },
  ...Object.entries(MENU_STATUS_LABEL).map(([value, label]) => ({ value, label })),
];

export function MenuItemsView({
  items,
  categories,
  ingredients,
  currency,
  canManage,
  filters,
}: {
  items: MenuItemRow[];
  categories: { id: string; name: string }[];
  ingredients: IngredientOption[];
  currency: string;
  canManage: boolean;
  filters: { search: string; categoryId: string; status: string };
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [term, setTerm] = useState(filters.search);
  const [editing, setEditing] = useState<MenuItemRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const push = (patch: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (!value || value === "ALL") params.delete(key);
      else params.set(key, value);
    }
    startTransition(() => router.push(`/menu/items?${params.toString()}`, { scroll: false }));
  };

  useEffect(() => {
    if (term === filters.search) return;
    const handle = setTimeout(() => push({ q: term }), 350);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term]);

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, message: string) =>
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) toast.error(result.error ?? "That didn't work.");
      else {
        toast.success(message);
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
            placeholder="Search items or SKU…"
            className="h-8 pl-9"
          />
        </div>
        <div className="w-44">
          <AppSelect
            value={filters.categoryId}
            onValueChange={(v) => push({ category: v })}
            options={[
              { value: "ALL", label: "All categories" },
              ...categories.map((c) => ({ value: c.id, label: c.name })),
            ]}
            size="sm"
            aria-label="Filter by category"
          />
        </div>
        <div className="w-36">
          <AppSelect
            value={filters.status}
            onValueChange={(v) => push({ status: v })}
            options={STATUS_OPTIONS}
            size="sm"
            aria-label="Filter by status"
          />
        </div>
        {canManage && (
          <Button
            className="ml-auto gap-2"
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="size-4" />
            New item
          </Button>
        )}
      </div>

      <Card className="py-0">
        <CardContent className="px-0">
          {items.length === 0 ? (
            <EmptyState
              icon={UtensilsCrossed}
              title="No menu items found"
              description="Adjust the filters, or add your first item."
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="hidden lg:table-cell">SKU</TableHead>
                    <TableHead className="hidden md:table-cell">Category</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="hidden text-right xl:table-cell">Cost</TableHead>
                    <TableHead className="hidden text-right xl:table-cell">Margin</TableHead>
                    <TableHead className="hidden text-right lg:table-cell">Sold</TableHead>
                    <TableHead>Status</TableHead>
                    {canManage && <TableHead className="w-28" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => {
                    const margin =
                      item.price > 0 ? ((item.price - item.cost) / item.price) * 100 : 0;
                    return (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            <span className="size-9 shrink-0 overflow-hidden rounded-lg bg-muted">
                              <ItemThumb
                                name={item.name}
                                imageUrl={item.imageUrl}
                                color={item.categoryColor}
                                textClassName="text-xs"
                              />
                            </span>
                            <div className="min-w-0">
                              <p className="truncate font-medium">{item.name}</p>
                              <p className="truncate text-xs text-muted-foreground">
                                {item.variants.length > 0 && `${item.variants.length} variants · `}
                                {item.recipe.length > 0
                                  ? `${item.recipe.length} ingredients`
                                  : "no recipe"}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="hidden font-mono text-xs lg:table-cell text-muted-foreground">
                          {item.sku}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-muted-foreground">
                          {item.categoryName}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular">
                          {formatMoney(item.price, currency)}
                        </TableCell>
                        <TableCell className="hidden text-right xl:table-cell text-muted-foreground tabular">
                          {formatMoney(item.cost, currency)}
                        </TableCell>
                        <TableCell
                          className={`hidden text-right xl:table-cell tabular ${
                            margin >= 60 ? "text-success" : margin < 30 ? "text-destructive" : ""
                          }`}
                        >
                          {margin.toFixed(0)}%
                        </TableCell>
                        <TableCell className="hidden text-right lg:table-cell text-muted-foreground tabular">
                          {item.timesOrdered}
                        </TableCell>
                        <TableCell>
                          <StatusBadge
                            label={MENU_STATUS_LABEL[item.status]}
                            tone={MENU_STATUS_TONE[item.status]}
                          />
                        </TableCell>
                        {canManage && (
                          <TableCell>
                            <div className="flex justify-end gap-0.5">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8"
                                onClick={() =>
                                  act(
                                    () =>
                                      setMenuItemStatusAction(
                                        item.id,
                                        item.status === "AVAILABLE" ? "UNAVAILABLE" : "AVAILABLE",
                                      ),
                                    item.status === "AVAILABLE"
                                      ? `${item.name} marked unavailable`
                                      : `${item.name} is available`,
                                  )
                                }
                                aria-label="Toggle availability"
                              >
                                {item.status === "AVAILABLE" ? (
                                  <Eye className="size-3.5" />
                                ) : (
                                  <EyeOff className="size-3.5" />
                                )}
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8"
                                onClick={() => {
                                  setEditing(item);
                                  setDialogOpen(true);
                                }}
                                aria-label={`Edit ${item.name}`}
                              >
                                <Pencil className="size-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8 text-muted-foreground hover:text-destructive"
                                onClick={() =>
                                  act(() => deleteMenuItemAction(item.id), `${item.name} removed`)
                                }
                                aria-label={`Delete ${item.name}`}
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

      <MenuItemDialog
        item={editing}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        categories={categories}
        ingredients={ingredients}
        currency={currency}
      />
    </>
  );
}

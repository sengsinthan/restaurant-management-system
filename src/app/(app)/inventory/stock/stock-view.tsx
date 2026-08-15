"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { format } from "date-fns";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ClipboardCheck,
  History,
  Loader2,
  Trash,
  TruckIcon,
} from "lucide-react";
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
import { formatMoney, formatQty } from "@/lib/money";
import {
  INVENTORY_TX_LABEL,
  INVENTORY_TX_TONE,
  STOCK_LEVEL_LABEL,
  STOCK_LEVEL_TONE,
  stockLevel,
} from "@/lib/status";
import { cn } from "@/lib/utils";
import { recordStockMovementAction } from "@/server/actions/inventory";
import type { InventoryTxType } from "@/generated/prisma/enums";

type Ingredient = {
  id: string;
  name: string;
  sku: string;
  category: string;
  unit: string;
  quantity: number;
  minQuantity: number;
  cost: number;
  expiresAt: Date | string | null;
};

type Transaction = {
  id: string;
  type: InventoryTxType;
  quantity: number;
  quantityAfter: number;
  unitCost: number;
  reference: string | null;
  note: string | null;
  createdAt: Date | string;
  ingredientId: string;
  ingredientName: string;
  unit: string;
  userName: string;
};

type MovementType = "STOCK_IN" | "STOCK_OUT" | "ADJUSTMENT" | "TRANSFER" | "WASTE";

const MOVEMENTS: { value: MovementType; label: string; icon: typeof ArrowDownToLine; help: string }[] = [
  { value: "STOCK_IN", label: "Stock in", icon: ArrowDownToLine, help: "Record a delivery from a supplier." },
  { value: "STOCK_OUT", label: "Stock out", icon: ArrowUpFromLine, help: "Remove stock used outside of sales." },
  { value: "ADJUSTMENT", label: "Adjustment", icon: ClipboardCheck, help: "Set the level to a counted figure." },
  { value: "TRANSFER", label: "Transfer", icon: TruckIcon, help: "Move stock to another location." },
  { value: "WASTE", label: "Waste", icon: Trash, help: "Write off spoiled or damaged stock." },
];

export function StockView({
  ingredients,
  alerts,
  transactions,
  selectedIngredientId,
  currency,
  canManage,
}: {
  ingredients: Ingredient[];
  alerts: {
    outOfStock: { id: string; name: string; unit: string }[];
    lowStock: { id: string; name: string; unit: string; quantity: number; minQuantity: number }[];
    expiring: { id: string; name: string; unit: string; expiresAt: Date | string | null }[];
  };
  transactions: Transaction[];
  selectedIngredientId: string;
  currency: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [pending, startSave] = useTransition();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    ingredientId: "",
    type: "STOCK_IN" as MovementType,
    amount: "",
    unitCost: "",
    reference: "",
    note: "",
  });

  const selected = ingredients.find((i) => i.id === form.ingredientId);
  const movement = MOVEMENTS.find((m) => m.value === form.type)!;

  const openMovement = (type: MovementType, ingredientId?: string) => {
    const ingredient = ingredients.find((i) => i.id === ingredientId);
    setForm({
      ingredientId: ingredientId ?? ingredients[0]?.id ?? "",
      type,
      amount: type === "ADJUSTMENT" && ingredient ? String(ingredient.quantity) : "",
      unitCost: ingredient ? String(ingredient.cost) : "",
      reference: "",
      note: "",
    });
    setOpen(true);
  };

  const submit = () =>
    startSave(async () => {
      const result = await recordStockMovementAction({
        ingredientId: form.ingredientId,
        type: form.type,
        amount: form.amount,
        unitCost: form.unitCost || undefined,
        reference: form.reference,
        note: form.note,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`${movement.label} recorded`, {
        description: `${selected?.name} is now at ${formatQty(result.data.quantityAfter)}${selected?.unit ?? ""}.`,
      });
      setOpen(false);
      router.refresh();
    });

  const filterHistory = (ingredientId: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (ingredientId === "ALL") params.delete("ingredient");
    else params.set("ingredient", ingredientId);
    startTransition(() => router.push(`/inventory/stock?${params.toString()}`, { scroll: false }));
  };

  const alertCount =
    alerts.outOfStock.length + alerts.lowStock.length + alerts.expiring.length;

  return (
    <>
      {canManage && (
        <div className="flex flex-wrap gap-2">
          {MOVEMENTS.map((m) => (
            <Button key={m.value} variant="outline" className="gap-2" onClick={() => openMovement(m.value)}>
              <m.icon className="size-4" />
              {m.label}
            </Button>
          ))}
        </div>
      )}

      <Tabs defaultValue={alertCount > 0 ? "alerts" : "levels"}>
        <TabsList>
          <TabsTrigger value="levels">Stock levels</TabsTrigger>
          <TabsTrigger value="alerts">
            Alerts {alertCount > 0 && <span className="ml-1 text-destructive">({alertCount})</span>}
          </TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="levels" className="pt-4">
          <Card className="py-0">
            <CardContent className="px-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ingredient</TableHead>
                      <TableHead className="hidden md:table-cell">Category</TableHead>
                      <TableHead className="text-right">In stock</TableHead>
                      <TableHead className="hidden text-right sm:table-cell">Minimum</TableHead>
                      <TableHead className="hidden text-right lg:table-cell">Value</TableHead>
                      <TableHead>Level</TableHead>
                      {canManage && <TableHead className="w-32" />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ingredients.map((ingredient) => {
                      const level = stockLevel(
                        ingredient.quantity,
                        ingredient.minQuantity,
                        ingredient.expiresAt,
                      );
                      const ratio =
                        ingredient.minQuantity > 0
                          ? Math.min(100, (ingredient.quantity / (ingredient.minQuantity * 3)) * 100)
                          : 100;
                      return (
                        <TableRow key={ingredient.id}>
                          <TableCell>
                            <p className="font-medium">{ingredient.name}</p>
                            <div className="mt-1 h-1 w-24 overflow-hidden rounded-full bg-muted">
                              <div
                                className={cn(
                                  "h-full rounded-full",
                                  level === "OUT_OF_STOCK"
                                    ? "bg-destructive"
                                    : level === "LOW_STOCK"
                                      ? "bg-warning"
                                      : "bg-success",
                                )}
                                style={{ width: `${Math.max(3, ratio)}%` }}
                              />
                            </div>
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
                          <TableCell className="hidden text-right lg:table-cell tabular">
                            {formatMoney(ingredient.quantity * ingredient.cost, currency)}
                          </TableCell>
                          <TableCell>
                            <StatusBadge
                              label={STOCK_LEVEL_LABEL[level]}
                              tone={STOCK_LEVEL_TONE[level]}
                            />
                          </TableCell>
                          {canManage && (
                            <TableCell>
                              <div className="flex justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs"
                                  onClick={() => openMovement("STOCK_IN", ingredient.id)}
                                >
                                  Stock in
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-7"
                                  onClick={() => filterHistory(ingredient.id)}
                                  aria-label="View history"
                                >
                                  <History className="size-3.5" />
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
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="alerts" className="space-y-4 pt-4">
          {alertCount === 0 ? (
            <Card>
              <CardContent>
                <EmptyState
                  icon={ClipboardCheck}
                  title="Everything is in good order"
                  description="No ingredients are out of stock, low, or close to expiry."
                />
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 lg:grid-cols-3">
              <AlertCard
                title="Out of stock"
                tone="destructive"
                empty="Nothing has run out."
                items={alerts.outOfStock.map((i) => ({ id: i.id, primary: i.name, secondary: "0 remaining" }))}
                onSelect={canManage ? (id) => openMovement("STOCK_IN", id) : undefined}
              />
              <AlertCard
                title="Low stock"
                tone="warning"
                empty="Everything is above its minimum."
                items={alerts.lowStock.map((i) => ({
                  id: i.id,
                  primary: i.name,
                  secondary: `${formatQty(i.quantity)}${i.unit} of ${formatQty(i.minQuantity)}${i.unit}`,
                }))}
                onSelect={canManage ? (id) => openMovement("STOCK_IN", id) : undefined}
              />
              <AlertCard
                title="Expiring soon"
                tone="info"
                empty="Nothing expires in the next three days."
                items={alerts.expiring.map((i) => ({
                  id: i.id,
                  primary: i.name,
                  secondary: i.expiresAt
                    ? `expires ${format(new Date(i.expiresAt), "d MMM")}`
                    : "—",
                }))}
                onSelect={canManage ? (id) => openMovement("WASTE", id) : undefined}
              />
            </div>
          )}
        </TabsContent>

        <TabsContent value="history" className="space-y-3 pt-4">
          <div className="flex items-center gap-2">
            <Label className="shrink-0 text-xs">Ingredient</Label>
            <div className="w-64">
              <AppSelect
                value={selectedIngredientId}
                onValueChange={filterHistory}
                options={[
                  { value: "ALL", label: "All ingredients" },
                  ...ingredients.map((i) => ({ value: i.id, label: i.name })),
                ]}
                size="sm"
              />
            </div>
          </div>

          <Card className="py-0">
            <CardContent className="px-0">
              {transactions.length === 0 ? (
                <EmptyState icon={History} title="No movements recorded" />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>When</TableHead>
                        <TableHead>Ingredient</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Change</TableHead>
                        <TableHead className="hidden text-right sm:table-cell">Balance</TableHead>
                        <TableHead className="hidden lg:table-cell">Reference</TableHead>
                        <TableHead className="hidden xl:table-cell">By</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {transactions.map((tx) => (
                        <TableRow key={tx.id}>
                          <TableCell className="text-muted-foreground whitespace-nowrap">
                            {format(new Date(tx.createdAt), "d MMM, HH:mm")}
                          </TableCell>
                          <TableCell className="font-medium">{tx.ingredientName}</TableCell>
                          <TableCell>
                            <StatusBadge
                              label={INVENTORY_TX_LABEL[tx.type]}
                              tone={INVENTORY_TX_TONE[tx.type]}
                            />
                          </TableCell>
                          <TableCell
                            className={cn(
                              "text-right font-medium tabular",
                              tx.quantity > 0 ? "text-success" : "text-destructive",
                            )}
                          >
                            {tx.quantity > 0 ? "+" : ""}
                            {formatQty(tx.quantity)}
                            <span className="ml-0.5 text-xs text-muted-foreground">{tx.unit}</span>
                          </TableCell>
                          <TableCell className="hidden text-right sm:table-cell text-muted-foreground tabular">
                            {formatQty(tx.quantityAfter)}
                          </TableCell>
                          <TableCell className="hidden max-w-48 truncate lg:table-cell text-muted-foreground">
                            {tx.reference ?? tx.note ?? "—"}
                          </TableCell>
                          <TableCell className="hidden xl:table-cell text-muted-foreground">
                            {tx.userName}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{movement.label}</DialogTitle>
            <DialogDescription>{movement.help}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Movement type</Label>
              <AppSelect
                value={form.type}
                onValueChange={(v) => setForm((f) => ({ ...f, type: v as MovementType }))}
                options={MOVEMENTS.map((m) => ({ value: m.value, label: m.label }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Ingredient</Label>
              <AppSelect
                value={form.ingredientId}
                onValueChange={(v) => {
                  const ingredient = ingredients.find((i) => i.id === v);
                  setForm((f) => ({
                    ...f,
                    ingredientId: v,
                    unitCost: ingredient ? String(ingredient.cost) : f.unitCost,
                    amount: f.type === "ADJUSTMENT" && ingredient ? String(ingredient.quantity) : f.amount,
                  }));
                }}
                options={ingredients.map((i) => ({
                  value: i.id,
                  label: `${i.name} — ${formatQty(i.quantity)}${i.unit} in stock`,
                }))}
                placeholder="Choose an ingredient…"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mv-amount">
                {form.type === "ADJUSTMENT" ? "Counted quantity" : "Quantity"}
                {selected && <span className="ml-1 text-muted-foreground">({selected.unit})</span>}
              </Label>
              <Input
                id="mv-amount"
                inputMode="decimal"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                className="tabular"
              />
              {selected && form.type === "ADJUSTMENT" && (
                <p className="text-xs text-muted-foreground">
                  System shows {formatQty(selected.quantity)}
                  {selected.unit}. The difference is written to the ledger.
                </p>
              )}
            </div>
            {form.type === "STOCK_IN" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="mv-cost">Unit cost</Label>
                  <Input
                    id="mv-cost"
                    inputMode="decimal"
                    value={form.unitCost}
                    onChange={(e) => setForm((f) => ({ ...f, unitCost: e.target.value }))}
                    className="tabular"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="mv-ref">Reference</Label>
                  <Input
                    id="mv-ref"
                    value={form.reference}
                    onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))}
                    placeholder="PO-1042"
                  />
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="mv-note">Note</Label>
              <Textarea
                id="mv-note"
                value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                rows={2}
                placeholder={form.type === "WASTE" ? "Expired, spoiled, dropped…" : "Optional"}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={pending || !form.ingredientId || form.amount === ""}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              Record {movement.label.toLowerCase()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function AlertCard({
  title,
  tone,
  items,
  empty,
  onSelect,
}: {
  title: string;
  tone: "destructive" | "warning" | "info";
  items: { id: string; primary: string; secondary: string }[];
  empty: string;
  onSelect?: (id: string) => void;
}) {
  const toneClass = {
    destructive: "border-destructive/30",
    warning: "border-warning/40",
    info: "border-info/30",
  }[tone];

  return (
    <Card className={cn("border-t-3", toneClass)}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          {title}
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular">{items.length}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {items.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">{empty}</p>
        ) : (
          items.map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={!onSelect}
              onClick={() => onSelect?.(item.id)}
              className={cn(
                "flex w-full items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-left text-sm",
                onSelect && "transition-colors hover:border-primary/40 hover:bg-muted/60",
              )}
            >
              <span className="min-w-0 truncate font-medium">{item.primary}</span>
              <span className="shrink-0 text-xs text-muted-foreground tabular">{item.secondary}</span>
            </button>
          ))
        )}
      </CardContent>
    </Card>
  );
}

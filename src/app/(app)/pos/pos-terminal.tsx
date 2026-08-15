"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Bike,
  ChefHat,
  CreditCard,
  Loader2,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  Tag,
  Trash2,
  Utensils,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { AppSelect } from "@/components/shared/app-select";
import { ItemThumb } from "@/components/shared/item-thumb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PaymentDialog } from "@/features/payments/payment-dialog";
import { formatMoney, round2 } from "@/lib/money";
import { cn } from "@/lib/utils";
import {
  applyDiscountAction,
  checkStockAction,
  createOrderAction,
} from "@/server/actions/orders";
import type { CustomerRecord } from "@/server/actions/customers";

import { CustomerPicker } from "./customer-picker";
import { ItemOptionsDialog } from "./item-options-dialog";
import {
  lineKey,
  lineTotal,
  type CartLine,
  type PosCategory,
  type PosDiscount,
  type PosItem,
  type PosTable,
} from "./types";

const ORDER_TYPES = [
  { value: "DINE_IN", label: "Dine-in", icon: Utensils },
  { value: "TAKEAWAY", label: "Takeaway", icon: ShoppingBag },
  { value: "DELIVERY", label: "Delivery", icon: Bike },
] as const;

type OrderType = (typeof ORDER_TYPES)[number]["value"];
type PendingDiscount = { label: string; type: "PERCENTAGE" | "FIXED"; value: number; code?: string };

export function PosTerminal({
  categories,
  tables,
  discounts,
  currency,
  taxRate,
  serviceChargeRate,
  canDiscount,
  canPay,
}: {
  categories: PosCategory[];
  tables: PosTable[];
  discounts: PosDiscount[];
  currency: string;
  taxRate: number;
  serviceChargeRate: number;
  canDiscount: boolean;
  canPay: boolean;
}) {
  const router = useRouter();

  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("ALL");
  const [optionsItem, setOptionsItem] = useState<PosItem | null>(null);

  const [orderType, setOrderType] = useState<OrderType>("DINE_IN");
  const [tableId, setTableId] = useState<string>("");
  const [guestCount, setGuestCount] = useState("2");
  const [customer, setCustomer] = useState<CustomerRecord | null>(null);
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [orderNotes, setOrderNotes] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [discount, setDiscount] = useState<PendingDiscount | null>(null);
  const [discountCode, setDiscountCode] = useState("");
  const [manualDiscount, setManualDiscount] = useState("");
  const [showDiscountPanel, setShowDiscountPanel] = useState(false);
  const [pending, startTransition] = useTransition();
  const [payment, setPayment] = useState<{ orderId: string; orderNumber: string; total: number } | null>(null);

  const allItems = useMemo(
    () => categories.flatMap((category) => category.items.map((item) => ({ item, category }))),
    [categories],
  );

  const visibleItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    return allItems.filter(({ item, category }) => {
      if (activeCategory !== "ALL" && category.id !== activeCategory) return false;
      if (!term) return true;
      return (
        item.name.toLowerCase().includes(term) ||
        item.sku.toLowerCase().includes(term) ||
        (item.description?.toLowerCase().includes(term) ?? false)
      );
    });
  }, [allItems, activeCategory, search]);

  // --- Totals: mirrors the server-side calculation in recalculateOrder ----
  const subtotal = round2(cart.reduce((acc, line) => acc + lineTotal(line), 0));
  const discountAmount = useMemo(() => {
    if (!discount) return 0;
    const raw =
      discount.type === "PERCENTAGE" ? round2((subtotal * discount.value) / 100) : discount.value;
    return Math.min(round2(raw), subtotal);
  }, [discount, subtotal]);
  const taxable = round2(subtotal - discountAmount);
  const tax = round2((taxable * taxRate) / 100);
  const serviceCharge = orderType === "DINE_IN" ? round2((taxable * serviceChargeRate) / 100) : 0;
  const total = round2(taxable + tax + serviceCharge);

  const addToCart = (
    item: PosItem,
    selection: { variantId: string | null; addonIds: string[]; quantity: number; notes: string | null },
  ) => {
    const variant = selection.variantId
      ? (item.variants.find((v) => v.id === selection.variantId) ?? null)
      : null;
    const addons = item.addons.filter((a) => selection.addonIds.includes(a.id));
    const key = lineKey(item.id, selection.variantId, selection.addonIds, selection.notes);

    setCart((lines) => {
      const existing = lines.find((l) => l.key === key);
      if (existing) {
        return lines.map((l) =>
          l.key === key ? { ...l, quantity: Math.min(99, l.quantity + selection.quantity) } : l,
        );
      }
      return [
        ...lines,
        {
          key,
          menuItemId: item.id,
          name: item.name,
          variantId: selection.variantId,
          variantName: variant?.name ?? null,
          unitPrice: variant?.price ?? item.price,
          quantity: selection.quantity,
          notes: selection.notes,
          addons,
        },
      ];
    });
  };

  const quickAdd = (item: PosItem) => {
    if (item.status !== "AVAILABLE") return;
    // Anything configurable opens the options sheet; simple items go straight in.
    if (item.variants.length > 0 || item.addons.length > 0) {
      setOptionsItem(item);
      return;
    }
    addToCart(item, { variantId: null, addonIds: [], quantity: 1, notes: null });
  };

  const changeQuantity = (key: string, delta: number) =>
    setCart((lines) =>
      lines
        .map((l) => (l.key === key ? { ...l, quantity: l.quantity + delta } : l))
        .filter((l) => l.quantity > 0),
    );

  const resetOrder = () => {
    setCart([]);
    setDiscount(null);
    setDiscountCode("");
    setManualDiscount("");
    setCustomer(null);
    setOrderNotes("");
    setDeliveryAddress("");
    setTableId("");
    setGuestCount("2");
    setShowDiscountPanel(false);
  };

  const submitOrder = (thenPay: boolean) =>
    startTransition(async () => {
      if (cart.length === 0) {
        toast.error("Add at least one item.");
        return;
      }
      if (orderType === "DINE_IN" && !tableId) {
        toast.error("Select a table for this dine-in order.");
        return;
      }
      if (orderType === "DELIVERY" && !deliveryAddress.trim()) {
        toast.error("Enter a delivery address.");
        return;
      }

      // Warn — don't block — when a recipe outruns current stock.
      const stock = await checkStockAction(
        cart.map((l) => ({ menuItemId: l.menuItemId, quantity: l.quantity })),
      );
      if (stock.ok && stock.data.length > 0) {
        toast.warning("Low ingredient stock", {
          description: stock.data
            .slice(0, 3)
            .map((s) => `${s.name}: need ${s.required}${s.unit}, have ${s.available}${s.unit}`)
            .join(" · "),
        });
      }

      const result = await createOrderAction({
        type: orderType,
        tableId: orderType === "DINE_IN" ? tableId : null,
        customerId: customer?.id ?? null,
        guestCount: Number(guestCount) || 1,
        notes: orderNotes.trim() || null,
        deliveryAddress: orderType === "DELIVERY" ? deliveryAddress.trim() : null,
        items: cart.map((line) => ({
          menuItemId: line.menuItemId,
          variantId: line.variantId,
          quantity: line.quantity,
          notes: line.notes,
          addonIds: line.addons.map((a) => a.id),
        })),
      });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      let orderTotal = result.data.total;

      if (discount) {
        const applied = await applyDiscountAction(
          result.data.orderId,
          discount.code
            ? { kind: "code", code: discount.code }
            : { kind: "manual", type: discount.type, value: discount.value, label: discount.label },
        );
        if (!applied.ok) {
          toast.warning("Order created without the discount", { description: applied.error });
        } else {
          orderTotal = applied.data.total;
        }
      }

      toast.success(`Order ${result.data.orderNumber} sent to the kitchen`, {
        description: `${cart.length} line${cart.length === 1 ? "" : "s"} · ${formatMoney(orderTotal, currency)}`,
      });

      if (thenPay && canPay) {
        setPayment({
          orderId: result.data.orderId,
          orderNumber: result.data.orderNumber,
          total: orderTotal,
        });
      }
      resetOrder();
      router.refresh();
    });

  const tableOptions = [
    { value: "", label: "Select a table…", disabled: true },
    ...tables.map((table) => ({
      value: table.id,
      label: `${table.number}${table.name ? ` · ${table.name}` : ""} — ${table.capacity} seats${
        table.status === "OCCUPIED" ? " (occupied)" : table.status === "RESERVED" ? " (reserved)" : ""
      }`,
    })),
  ];

  return (
    <div className="flex h-[calc(100svh-3.5rem)] flex-col xl:flex-row">
      {/* ----------------------------- Menu ----------------------------- */}
      <section className="flex min-h-0 flex-1 flex-col border-b xl:border-r xl:border-b-0">
        <div className="shrink-0 space-y-3 border-b p-3 sm:p-4">
          <div className="relative">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search the menu by name or SKU…"
              className="h-10 pl-9"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="size-4" />
              </button>
            )}
          </div>

          <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
            <CategoryChip
              active={activeCategory === "ALL"}
              onClick={() => setActiveCategory("ALL")}
              label="All"
              count={allItems.length}
            />
            {categories.map((category) => (
              <CategoryChip
                key={category.id}
                active={activeCategory === category.id}
                onClick={() => setActiveCategory(category.id)}
                label={category.name}
                count={category.items.length}
                color={category.color}
              />
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
          {visibleItems.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              No menu items match “{search}”.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
              {visibleItems.map(({ item, category }) => {
                const unavailable = item.status !== "AVAILABLE";
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={unavailable}
                    onClick={() => quickAdd(item)}
                    className={cn(
                      "group flex flex-col overflow-hidden rounded-xl border bg-card text-left shadow-xs transition-all",
                      unavailable
                        ? "cursor-not-allowed opacity-55"
                        : "hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md active:translate-y-0",
                    )}
                  >
                    <div className="relative aspect-4/3 overflow-hidden bg-muted">
                      <ItemThumb name={item.name} imageUrl={item.imageUrl} color={category.color} />
                      {unavailable && (
                        <span className="absolute inset-0 flex items-center justify-center bg-background/70 text-xs font-semibold tracking-wide uppercase">
                          Unavailable
                        </span>
                      )}
                      {item.isFeatured && !unavailable && (
                        <span className="absolute top-1.5 left-1.5 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                          Popular
                        </span>
                      )}
                      {item.variants.length > 0 && (
                        <span className="absolute right-1.5 bottom-1.5 rounded-full bg-background/90 px-1.5 py-0.5 text-[10px] font-medium">
                          {item.variants.length} sizes
                        </span>
                      )}
                    </div>
                    <div className="flex flex-1 flex-col gap-0.5 p-2.5">
                      <p className="line-clamp-2 text-[13px] leading-snug font-medium">{item.name}</p>
                      <p className="mt-auto pt-1 text-sm font-semibold text-primary tabular">
                        {formatMoney(item.price, currency)}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ---------------------------- Order ----------------------------- */}
      <aside className="flex min-h-0 shrink-0 flex-col bg-card xl:w-[25rem] 2xl:w-[27rem]">
        <div className="shrink-0 space-y-3 border-b p-3 sm:p-4">
          <div className="grid grid-cols-3 gap-1.5">
            {ORDER_TYPES.map((type) => (
              <button
                key={type.value}
                type="button"
                onClick={() => setOrderType(type.value)}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-lg border px-2 py-2 text-xs font-medium transition-colors",
                  orderType === type.value
                    ? "border-primary bg-primary/8 text-primary ring-1 ring-primary"
                    : "text-muted-foreground hover:border-primary/40 hover:bg-muted",
                )}
              >
                <type.icon className="size-4" />
                {type.label}
              </button>
            ))}
          </div>

          {orderType === "DINE_IN" && (
            <div className="grid grid-cols-[1fr_5.5rem] gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Table</Label>
                <AppSelect
                  value={tableId}
                  onValueChange={setTableId}
                  options={tableOptions}
                  placeholder="Select a table…"
                  size="sm"
                  aria-label="Select table"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="guests" className="text-xs">
                  Guests
                </Label>
                <Input
                  id="guests"
                  inputMode="numeric"
                  value={guestCount}
                  onChange={(e) => setGuestCount(e.target.value)}
                  className="h-8 tabular"
                />
              </div>
            </div>
          )}

          {orderType === "DELIVERY" && (
            <div className="space-y-1.5">
              <Label htmlFor="address" className="text-xs">
                Delivery address
              </Label>
              <Input
                id="address"
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
                placeholder="Street, unit, landmark"
                className="h-8"
              />
            </div>
          )}

          <CustomerPicker value={customer} onChange={setCustomer} canCreate />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {cart.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-12 text-center">
              <span className="flex size-11 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                <ChefHat className="size-5" />
              </span>
              <p className="text-sm font-medium">No items yet</p>
              <p className="max-w-[16rem] text-xs text-muted-foreground">
                Tap a menu item to start the order. Items with sizes or add-ons open their options.
              </p>
            </div>
          ) : (
            <ul className="divide-y">
              {cart.map((line) => (
                <li key={line.key} className="p-3">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm leading-snug font-medium">{line.name}</p>
                      {(line.variantName || line.addons.length > 0) && (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {[line.variantName, ...line.addons.map((a) => `+ ${a.name}`)]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      )}
                      {line.notes && (
                        <p className="mt-1 rounded bg-warning/12 px-1.5 py-0.5 text-[11px] text-warning-foreground dark:text-warning">
                          {line.notes}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 text-sm font-semibold tabular">
                      {formatMoney(lineTotal(line), currency)}
                    </span>
                  </div>

                  <div className="mt-2 flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-7"
                      onClick={() => changeQuantity(line.key, -1)}
                      aria-label={`Decrease ${line.name}`}
                    >
                      <Minus className="size-3.5" />
                    </Button>
                    <span className="w-8 text-center text-sm font-semibold tabular">
                      {line.quantity}
                    </span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-7"
                      onClick={() => changeQuantity(line.key, 1)}
                      aria-label={`Increase ${line.name}`}
                    >
                      <Plus className="size-3.5" />
                    </Button>
                    <span className="ml-1 text-xs text-muted-foreground tabular">
                      × {formatMoney(line.unitPrice, currency)}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="ml-auto size-7 text-muted-foreground hover:text-destructive"
                      onClick={() => setCart((l) => l.filter((x) => x.key !== line.key))}
                      aria-label={`Remove ${line.name}`}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="shrink-0 space-y-3 border-t p-3 sm:p-4">
          {canDiscount && cart.length > 0 && (
            <div className="space-y-2">
              {discount ? (
                <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/8 px-2.5 py-1.5">
                  <Tag className="size-3.5 shrink-0 text-success" />
                  <span className="min-w-0 flex-1 truncate text-xs font-medium">{discount.label}</span>
                  <span className="text-xs font-semibold text-success tabular">
                    −{formatMoney(discountAmount, currency)}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    onClick={() => setDiscount(null)}
                    aria-label="Remove discount"
                  >
                    <X className="size-3.5" />
                  </Button>
                </div>
              ) : showDiscountPanel ? (
                <div className="space-y-2 rounded-lg border p-2.5">
                  <div className="flex gap-1.5">
                    <Input
                      value={discountCode}
                      onChange={(e) => setDiscountCode(e.target.value.toUpperCase())}
                      placeholder="Coupon code"
                      className="h-8 text-xs"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 shrink-0"
                      onClick={() => {
                        const match = discounts.find(
                          (d) => d.code?.toUpperCase() === discountCode.trim().toUpperCase(),
                        );
                        if (!match) {
                          toast.error("No active discount with that code.");
                          return;
                        }
                        if (subtotal < match.minOrderAmount) {
                          toast.error(
                            `${match.name} needs a minimum of ${formatMoney(match.minOrderAmount, currency)}.`,
                          );
                          return;
                        }
                        setDiscount({
                          label: match.name,
                          type: match.type,
                          value: match.value,
                          code: match.code ?? undefined,
                        });
                        setShowDiscountPanel(false);
                      }}
                    >
                      Apply
                    </Button>
                  </div>
                  <div className="flex gap-1.5">
                    <Input
                      inputMode="decimal"
                      value={manualDiscount}
                      onChange={(e) => setManualDiscount(e.target.value)}
                      placeholder="Manual %"
                      className="h-8 text-xs tabular"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 shrink-0"
                      onClick={() => {
                        const value = Number(manualDiscount);
                        if (!(value > 0) || value > 100) {
                          toast.error("Enter a percentage between 1 and 100.");
                          return;
                        }
                        setDiscount({ label: `${value}% off`, type: "PERCENTAGE", value });
                        setShowDiscountPanel(false);
                      }}
                    >
                      Apply %
                    </Button>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-full text-xs"
                    onClick={() => setShowDiscountPanel(false)}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-full gap-1.5 text-xs"
                  onClick={() => setShowDiscountPanel(true)}
                >
                  <Tag className="size-3.5" />
                  Add discount
                </Button>
              )}
            </div>
          )}

          {cart.length > 0 && (
            <Textarea
              value={orderNotes}
              onChange={(e) => setOrderNotes(e.target.value)}
              placeholder="Order note for the kitchen (optional)"
              rows={2}
              className="text-xs"
            />
          )}

          <dl className="space-y-1 text-sm">
            <Row label="Subtotal" value={formatMoney(subtotal, currency)} />
            {discountAmount > 0 && (
              <Row
                label="Discount"
                value={`−${formatMoney(discountAmount, currency)}`}
                valueClass="text-success"
              />
            )}
            <Row label={`Tax (${taxRate}%)`} value={formatMoney(tax, currency)} muted />
            {orderType === "DINE_IN" && serviceChargeRate > 0 && (
              <Row
                label={`Service (${serviceChargeRate}%)`}
                value={formatMoney(serviceCharge, currency)}
                muted
              />
            )}
            <div className="flex items-baseline justify-between border-t pt-2">
              <dt className="font-semibold">Total</dt>
              <dd className="text-xl font-semibold tracking-tight tabular">
                {formatMoney(total, currency)}
              </dd>
            </div>
          </dl>

          {cart.length > 0 && orderType === "DINE_IN" && !tableId && (
            <p className="flex items-center gap-1.5 text-xs text-warning-foreground dark:text-warning">
              <AlertTriangle className="size-3.5" />
              Select a table to continue.
            </p>
          )}

          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              className="h-11"
              disabled={pending || cart.length === 0}
              onClick={() => submitOrder(false)}
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : <ChefHat className="size-4" />}
              Send to kitchen
            </Button>
            <Button
              className="h-11"
              disabled={pending || cart.length === 0 || !canPay}
              onClick={() => submitOrder(true)}
            >
              <CreditCard className="size-4" />
              Charge
            </Button>
          </div>

          {cart.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-full text-xs text-muted-foreground"
              onClick={resetOrder}
              disabled={pending}
            >
              Clear order
            </Button>
          )}
        </div>
      </aside>

      <ItemOptionsDialog
        item={optionsItem}
        currency={currency}
        onClose={() => setOptionsItem(null)}
        onConfirm={(selection) => optionsItem && addToCart(optionsItem, selection)}
      />

      {payment && (
        <PaymentDialog
          open={!!payment}
          onOpenChange={(open) => !open && setPayment(null)}
          orderId={payment.orderId}
          orderNumber={payment.orderNumber}
          total={payment.total}
          alreadyPaid={0}
          currency={currency}
          onPaid={() => {
            setPayment(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function CategoryChip({
  active,
  onClick,
  label,
  count,
  color,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  color?: string | null;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium whitespace-nowrap transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "text-muted-foreground hover:border-primary/40 hover:bg-muted hover:text-foreground",
      )}
    >
      {color && !active && (
        <span className="size-2 rounded-full" style={{ backgroundColor: color }} />
      )}
      {label}
      <span className={cn("text-[11px]", active ? "opacity-75" : "text-muted-foreground/70")}>
        {count}
      </span>
    </button>
  );
}

function Row({
  label,
  value,
  muted,
  valueClass,
}: {
  label: string;
  value: string;
  muted?: boolean;
  valueClass?: string;
}) {
  return (
    <div className="flex justify-between">
      <dt className={cn(muted ? "text-muted-foreground" : "")}>{label}</dt>
      <dd className={cn("tabular", valueClass)}>{value}</dd>
    </div>
  );
}

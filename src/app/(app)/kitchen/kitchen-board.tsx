"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlarmClock,
  ArrowRight,
  Bike,
  ChefHat,
  CheckCircle2,
  Flame,
  Loader2,
  ShoppingBag,
  StickyNote,
  Utensils,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { formatDuration } from "@/lib/date";
import { cn } from "@/lib/utils";
import { setOrderPriorityAction, updateOrderStatusAction } from "@/server/actions/orders";
import type { OrderPriority, OrderStatus, OrderType } from "@/generated/prisma/enums";

type KitchenOrder = {
  id: string;
  orderNumber: string;
  type: OrderType;
  status: OrderStatus;
  priority: OrderPriority;
  tableNumber: string | null;
  placedAt: Date | string;
  kitchenAt: Date | string | null;
  readyAt: Date | string | null;
  notes: string | null;
  items: {
    id: string;
    name: string;
    variant: string | null;
    quantity: number;
    notes: string | null;
    addons: string[];
  }[];
};

/** Board columns and the transition each "advance" button performs. */
const COLUMNS = [
  {
    key: "NEW",
    title: "New",
    statuses: ["PENDING", "CONFIRMED"] as OrderStatus[],
    next: "PREPARING" as const,
    nextLabel: "Start preparing",
    accent: "border-t-muted-foreground/40",
  },
  {
    key: "PREPARING",
    title: "Preparing",
    statuses: ["PREPARING"] as OrderStatus[],
    next: "READY" as const,
    nextLabel: "Mark ready",
    accent: "border-t-warning",
  },
  {
    key: "READY",
    title: "Ready",
    statuses: ["READY"] as OrderStatus[],
    next: "SERVED" as const,
    nextLabel: "Mark served",
    accent: "border-t-success",
  },
  {
    key: "COMPLETED",
    title: "Served",
    statuses: ["SERVED"] as OrderStatus[],
    next: null,
    nextLabel: "",
    accent: "border-t-primary",
  },
] as const;

const TYPE_ICON: Record<OrderType, typeof Utensils> = {
  DINE_IN: Utensils,
  TAKEAWAY: ShoppingBag,
  DELIVERY: Bike,
};

/** Minutes after which a ticket is visibly flagged as running late. */
const WARN_MINUTES = 12;
const LATE_MINUTES = 20;

export function KitchenBoard({
  orders,
  canUpdate,
}: {
  orders: KitchenOrder[];
  canUpdate: boolean;
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Re-render each half minute so the elapsed clocks stay honest without a
  // server round trip.
  const [, setTick] = useState(0);
  useEffect(() => {
    const handle = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(handle);
  }, []);

  const advance = (order: KitchenOrder, next: OrderStatus) => {
    setPendingId(order.id);
    startTransition(async () => {
      const result = await updateOrderStatusAction(
        order.id,
        next as "PREPARING" | "READY" | "SERVED",
      );
      setPendingId(null);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`${order.orderNumber} → ${next.toLowerCase()}`);
      router.refresh();
    });
  };

  const bump = (order: KitchenOrder) => {
    const next: OrderPriority = order.priority === "NORMAL" ? "HIGH" : order.priority === "HIGH" ? "RUSH" : "NORMAL";
    startTransition(async () => {
      const result = await setOrderPriorityAction(order.id, next);
      if (!result.ok) toast.error(result.error);
      else router.refresh();
    });
  };

  return (
    <div className="flex h-[calc(100svh-3.5rem)] flex-col">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Kitchen display</h1>
          <p className="text-xs text-muted-foreground">
            {orders.length} live ticket{orders.length === 1 ? "" : "s"} · updates in real time
          </p>
        </div>
        <div className="hidden items-center gap-3 text-xs text-muted-foreground sm:flex">
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-warning" /> over {WARN_MINUTES}m
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-destructive" /> over {LATE_MINUTES}m
          </span>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-px overflow-x-auto bg-border md:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((column) => {
          const columnOrders = orders.filter((o) => column.statuses.includes(o.status));
          return (
            <section key={column.key} className="flex min-h-0 flex-col bg-background">
              <header
                className={cn(
                  "flex shrink-0 items-center justify-between border-t-3 px-3 py-2.5",
                  column.accent,
                )}
              >
                <h2 className="text-sm font-semibold tracking-wide uppercase">{column.title}</h2>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular">
                  {columnOrders.length}
                </span>
              </header>

              <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-2.5">
                {columnOrders.length === 0 ? (
                  <p className="py-10 text-center text-xs text-muted-foreground">Nothing here.</p>
                ) : (
                  columnOrders.map((order) => {
                    const since = new Date(order.kitchenAt ?? order.placedAt).getTime();
                    const minutes = Math.floor((Date.now() - since) / 60000);
                    const late = minutes >= LATE_MINUTES;
                    const warn = !late && minutes >= WARN_MINUTES;
                    const TypeIcon = TYPE_ICON[order.type];
                    const isPending = pendingId === order.id;

                    return (
                      <article
                        key={order.id}
                        className={cn(
                          "rounded-xl border bg-card p-3 shadow-xs transition-colors",
                          column.key !== "COMPLETED" && warn && "border-warning/60 bg-warning/5",
                          column.key !== "COMPLETED" && late && "border-destructive/60 bg-destructive/5",
                          order.priority === "RUSH" && "ring-2 ring-destructive/40",
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="flex items-center gap-1.5 font-semibold">
                              {order.orderNumber}
                              {order.priority !== "NORMAL" && (
                                <span
                                  className={cn(
                                    "rounded px-1 py-0.5 text-[10px] font-bold tracking-wide uppercase",
                                    order.priority === "RUSH"
                                      ? "bg-destructive text-white"
                                      : "bg-warning text-warning-foreground",
                                  )}
                                >
                                  {order.priority}
                                </span>
                              )}
                            </p>
                            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                              <TypeIcon className="size-3" />
                              {order.tableNumber ? `Table ${order.tableNumber}` : order.type.replace("_", " ")}
                            </p>
                          </div>
                          <span
                            className={cn(
                              "flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold tabular",
                              late
                                ? "bg-destructive/12 text-destructive"
                                : warn
                                  ? "bg-warning/15 text-warning-foreground dark:text-warning"
                                  : "bg-muted text-muted-foreground",
                            )}
                          >
                            {late ? <AlarmClock className="size-3" /> : <ChefHat className="size-3" />}
                            {formatDuration(Date.now() - since)}
                          </span>
                        </div>

                        <ul className="mt-2.5 space-y-1.5 border-t pt-2.5">
                          {order.items.map((item) => (
                            <li key={item.id} className="flex gap-2 text-sm">
                              <span className="flex size-5 shrink-0 items-center justify-center rounded bg-primary/12 text-xs font-bold text-primary tabular">
                                {item.quantity}
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="leading-snug font-medium">{item.name}</p>
                                {(item.variant || item.addons.length > 0) && (
                                  <p className="text-xs text-muted-foreground">
                                    {[item.variant, ...item.addons.map((a) => `+${a}`)]
                                      .filter(Boolean)
                                      .join(" · ")}
                                  </p>
                                )}
                                {item.notes && (
                                  <p className="mt-0.5 flex items-start gap-1 rounded bg-warning/15 px-1.5 py-0.5 text-[11px] font-medium text-warning-foreground dark:text-warning">
                                    <StickyNote className="mt-0.5 size-2.5 shrink-0" />
                                    {item.notes}
                                  </p>
                                )}
                              </div>
                            </li>
                          ))}
                        </ul>

                        {order.notes && (
                          <p className="mt-2 rounded-md bg-muted px-2 py-1 text-[11px] text-muted-foreground">
                            {order.notes}
                          </p>
                        )}

                        {canUpdate && (
                          <div className="mt-2.5 flex gap-1.5">
                            {column.next && (
                              <Button
                                size="sm"
                                className="h-8 flex-1 gap-1.5 text-xs"
                                disabled={isPending}
                                onClick={() => advance(order, column.next!)}
                              >
                                {isPending ? (
                                  <Loader2 className="size-3.5 animate-spin" />
                                ) : column.key === "READY" ? (
                                  <CheckCircle2 className="size-3.5" />
                                ) : (
                                  <ArrowRight className="size-3.5" />
                                )}
                                {column.nextLabel}
                              </Button>
                            )}
                            {column.key !== "COMPLETED" && (
                              <Button
                                size="icon"
                                variant="outline"
                                className="size-8 shrink-0"
                                onClick={() => bump(order)}
                                title={`Priority: ${order.priority} — click to change`}
                                aria-label="Change priority"
                              >
                                <Flame
                                  className={cn(
                                    "size-3.5",
                                    order.priority === "RUSH"
                                      ? "text-destructive"
                                      : order.priority === "HIGH"
                                        ? "text-warning"
                                        : "text-muted-foreground",
                                  )}
                                />
                              </Button>
                            )}
                          </div>
                        )}
                      </article>
                    );
                  })
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

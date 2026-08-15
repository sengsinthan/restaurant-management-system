"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRightLeft,
  CalendarClock,
  CheckCircle2,
  Clock,
  Combine,
  Loader2,
  Receipt,
  Users,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

import { AppSelect } from "@/components/shared/app-select";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button, ButtonLink } from "@/components/ui/button";
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
import { formatDuration } from "@/lib/date";
import { formatMoney } from "@/lib/money";
import {
  ORDER_STATUS_LABEL,
  ORDER_STATUS_TONE,
  TABLE_CARD_TONE,
  TABLE_STATUS_LABEL,
  TABLE_STATUS_TONE,
} from "@/lib/status";
import { cn } from "@/lib/utils";
import {
  mergeTablesAction,
  setTableStatusAction,
  splitTablesAction,
  transferTableAction,
} from "@/server/actions/tables";
import type { TableStatus } from "@/generated/prisma/enums";

type FloorTable = {
  id: string;
  number: string;
  name: string | null;
  capacity: number;
  zone: string;
  status: TableStatus;
  occupiedAt: Date | string | null;
  mergedIntoId: string | null;
  orderCount: number;
  runningTotal: number;
  activeOrder: {
    id: string;
    orderNumber: string;
    status: keyof typeof ORDER_STATUS_LABEL;
    paymentStatus: string;
    total: number;
    itemCount: number;
    guestCount: number;
    customerName: string | null;
    placedAt: Date | string;
  } | null;
  nextReservation: {
    id: string;
    guestName: string;
    reservedAt: Date | string;
    guests: number;
  } | null;
};

const STATUS_OPTIONS: { value: TableStatus; label: string }[] = (
  ["AVAILABLE", "OCCUPIED", "RESERVED", "CLEANING", "OUT_OF_SERVICE"] as TableStatus[]
).map((value) => ({ value, label: TABLE_STATUS_LABEL[value] }));

export function FloorPlan({
  tables,
  currency,
  canManage,
  canOrder,
}: {
  tables: FloorTable[];
  currency: string;
  canManage: boolean;
  canOrder: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<FloorTable | null>(null);
  const [zone, setZone] = useState("ALL");
  const [pending, startTransition] = useTransition();
  const [transferTo, setTransferTo] = useState("");
  const [mergeWith, setMergeWith] = useState<string[]>([]);
  const [mode, setMode] = useState<"detail" | "transfer" | "merge">("detail");

  const zones = useMemo(() => [...new Set(tables.map((t) => t.zone))], [tables]);
  const visible = zone === "ALL" ? tables : tables.filter((t) => t.zone === zone);
  const grouped = useMemo(() => {
    const map = new Map<string, FloorTable[]>();
    for (const table of visible) {
      const list = map.get(table.zone) ?? [];
      list.push(table);
      map.set(table.zone, list);
    }
    return [...map.entries()];
  }, [visible]);

  const closeDialog = () => {
    setSelected(null);
    setMode("detail");
    setTransferTo("");
    setMergeWith([]);
  };

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, success: string) =>
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        toast.error(result.error ?? "That didn't work.");
        return;
      }
      toast.success(success);
      closeDialog();
      router.refresh();
    });

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center rounded-lg border p-0.5">
          <ZoneChip active={zone === "ALL"} onClick={() => setZone("ALL")} label="All zones" />
          {zones.map((z) => (
            <ZoneChip key={z} active={zone === z} onClick={() => setZone(z)} label={z} />
          ))}
        </div>
        <div className="ml-auto flex flex-wrap gap-3 text-xs text-muted-foreground">
          {(["AVAILABLE", "OCCUPIED", "RESERVED", "CLEANING", "OUT_OF_SERVICE"] as TableStatus[]).map(
            (status) => (
              <span key={status} className="flex items-center gap-1.5">
                <span
                  className={cn(
                    "size-2.5 rounded-full border",
                    TABLE_CARD_TONE[status].split(" ").slice(0, 2).join(" "),
                  )}
                />
                {TABLE_STATUS_LABEL[status]}
              </span>
            ),
          )}
        </div>
      </div>

      <div className="space-y-6">
        {grouped.map(([zoneName, zoneTables]) => (
          <section key={zoneName}>
            <h2 className="mb-2.5 text-sm font-semibold text-muted-foreground">
              {zoneName}
              <span className="ml-2 font-normal">({zoneTables.length})</span>
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
              {zoneTables.map((table) => (
                <button
                  key={table.id}
                  type="button"
                  onClick={() => setSelected(table)}
                  className={cn(
                    "flex flex-col gap-2 rounded-xl border-2 p-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-md",
                    TABLE_CARD_TONE[table.status],
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-lg font-semibold tracking-tight">{table.number}</p>
                      {table.name && (
                        <p className="truncate text-[11px] text-muted-foreground">{table.name}</p>
                      )}
                    </div>
                    <span className="flex shrink-0 items-center gap-1 rounded-md bg-background/70 px-1.5 py-0.5 text-[11px] font-medium">
                      <Users className="size-3" />
                      {table.capacity}
                    </span>
                  </div>

                  <StatusBadge
                    label={TABLE_STATUS_LABEL[table.status]}
                    tone={TABLE_STATUS_TONE[table.status]}
                    className="self-start"
                    dot
                  />

                  {table.activeOrder ? (
                    <div className="space-y-1 text-xs">
                      <p className="flex items-center gap-1 font-medium">
                        <Receipt className="size-3" />
                        {table.activeOrder.orderNumber}
                      </p>
                      <p className="flex items-center gap-1 text-muted-foreground">
                        <Clock className="size-3" />
                        {formatDuration(
                          Date.now() - new Date(table.occupiedAt ?? table.activeOrder.placedAt).getTime(),
                        )}
                        {table.orderCount > 1 && ` · ${table.orderCount} tickets`}
                      </p>
                      <p className="font-semibold tabular">
                        {formatMoney(table.runningTotal, currency)}
                      </p>
                    </div>
                  ) : table.nextReservation ? (
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <CalendarClock className="size-3" />
                      {format(new Date(table.nextReservation.reservedAt), "HH:mm")} ·{" "}
                      {table.nextReservation.guests}p
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {table.status === "AVAILABLE" ? "Ready to seat" : "—"}
                    </p>
                  )}
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>

      <Dialog open={!!selected} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="sm:max-w-md">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  Table {selected.number}
                  {selected.name && (
                    <span className="text-sm font-normal text-muted-foreground">{selected.name}</span>
                  )}
                </DialogTitle>
                <DialogDescription>
                  {selected.zone} · seats {selected.capacity} ·{" "}
                  {TABLE_STATUS_LABEL[selected.status]}
                </DialogDescription>
              </DialogHeader>

              {mode === "detail" && (
                <div className="space-y-3">
                  {selected.activeOrder ? (
                    <div className="space-y-2 rounded-xl border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <Link
                          href={`/orders/${selected.activeOrder.id}`}
                          className="font-medium hover:text-primary hover:underline"
                        >
                          {selected.activeOrder.orderNumber}
                        </Link>
                        <StatusBadge
                          label={ORDER_STATUS_LABEL[selected.activeOrder.status]}
                          tone={ORDER_STATUS_TONE[selected.activeOrder.status]}
                        />
                      </div>
                      <dl className="space-y-1 text-sm">
                        <Row label="Guests" value={String(selected.activeOrder.guestCount)} />
                        <Row label="Items" value={String(selected.activeOrder.itemCount)} />
                        <Row
                          label="Customer"
                          value={selected.activeOrder.customerName ?? "Walk-in"}
                        />
                        <Row
                          label="Occupied for"
                          value={formatDuration(
                            Date.now() -
                              new Date(selected.occupiedAt ?? selected.activeOrder.placedAt).getTime(),
                          )}
                        />
                        <div className="flex justify-between border-t pt-1.5 font-semibold">
                          <dt>Running total</dt>
                          <dd className="tabular">{formatMoney(selected.runningTotal, currency)}</dd>
                        </div>
                      </dl>
                    </div>
                  ) : selected.nextReservation ? (
                    <div className="rounded-xl border border-info/30 bg-info/6 p-3 text-sm">
                      <p className="font-medium">Held for {selected.nextReservation.guestName}</p>
                      <p className="text-muted-foreground">
                        {format(new Date(selected.nextReservation.reservedAt), "d MMM 'at' HH:mm")} ·{" "}
                        {selected.nextReservation.guests} guests
                      </p>
                    </div>
                  ) : (
                    <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">
                      No open order on this table.
                    </p>
                  )}

                  <div className="grid gap-2">
                    {selected.activeOrder ? (
                      <ButtonLink
                        className="w-full gap-2"
                        href={`/orders/${selected.activeOrder.id}`}
                      >
                        <Receipt className="size-4" />
                        View order
                      </ButtonLink>
                    ) : (
                      canOrder && (
                        <ButtonLink className="w-full gap-2" href="/pos">
                          <Receipt className="size-4" />
                          Create order
                        </ButtonLink>
                      )
                    )}

                    {canManage && (
                      <>
                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            variant="outline"
                            className="gap-2"
                            onClick={() => setMode("transfer")}
                            disabled={!selected.activeOrder}
                          >
                            <ArrowRightLeft className="size-4" />
                            Transfer
                          </Button>
                          <Button variant="outline" className="gap-2" onClick={() => setMode("merge")}>
                            <Combine className="size-4" />
                            Merge
                          </Button>
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-xs">Set status</Label>
                          <AppSelect
                            value={selected.status}
                            onValueChange={(value) =>
                              act(
                                () => setTableStatusAction(selected.id, value as TableStatus),
                                `Table ${selected.number} set to ${TABLE_STATUS_LABEL[value as TableStatus]}`,
                              )
                            }
                            options={STATUS_OPTIONS}
                            size="sm"
                          />
                        </div>

                        {selected.status !== "AVAILABLE" && !selected.activeOrder && (
                          <Button
                            variant="outline"
                            className="w-full gap-2"
                            disabled={pending}
                            onClick={() =>
                              act(
                                () => setTableStatusAction(selected.id, "AVAILABLE"),
                                `Table ${selected.number} is available`,
                              )
                            }
                          >
                            {pending ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <CheckCircle2 className="size-4" />
                            )}
                            Mark available
                          </Button>
                        )}

                        {tables.some((t) => t.mergedIntoId === selected.id) && (
                          <Button
                            variant="outline"
                            className="w-full"
                            disabled={pending}
                            onClick={() =>
                              act(() => splitTablesAction(selected.id), "Tables split")
                            }
                          >
                            Split merged tables
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}

              {mode === "transfer" && (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label>Move this table&apos;s open order to</Label>
                    <AppSelect
                      value={transferTo}
                      onValueChange={setTransferTo}
                      placeholder="Choose a table…"
                      options={tables
                        .filter((t) => t.id !== selected.id && t.status !== "OUT_OF_SERVICE")
                        .map((t) => ({
                          value: t.id,
                          label: `${t.number} — ${t.zone} (${TABLE_STATUS_LABEL[t.status]})`,
                        }))}
                    />
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setMode("detail")} disabled={pending}>
                      Back
                    </Button>
                    <Button
                      disabled={pending || !transferTo}
                      onClick={() =>
                        act(
                          () => transferTableAction(selected.id, transferTo),
                          "Order transferred",
                        )
                      }
                    >
                      {pending && <Loader2 className="size-4 animate-spin" />}
                      Transfer
                    </Button>
                  </DialogFooter>
                </div>
              )}

              {mode === "merge" && (
                <div className="space-y-3">
                  <Label>Merge these tables into {selected.number}</Label>
                  <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border p-1.5">
                    {tables
                      .filter((t) => t.id !== selected.id && t.status !== "OUT_OF_SERVICE")
                      .map((t) => (
                        <label
                          key={t.id}
                          className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                        >
                          <Checkbox
                            checked={mergeWith.includes(t.id)}
                            onCheckedChange={(checked) =>
                              setMergeWith((ids) =>
                                checked ? [...ids, t.id] : ids.filter((id) => id !== t.id),
                              )
                            }
                          />
                          <span className="flex-1">
                            {t.number} · {t.zone}
                          </span>
                          <span className="text-xs text-muted-foreground">{t.capacity} seats</span>
                        </label>
                      ))}
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setMode("detail")} disabled={pending}>
                      Back
                    </Button>
                    <Button
                      disabled={pending || mergeWith.length === 0}
                      onClick={() =>
                        act(
                          () => mergeTablesAction(selected.id, mergeWith),
                          `Merged into table ${selected.number}`,
                        )
                      }
                    >
                      {pending && <Loader2 className="size-4 animate-spin" />}
                      Merge {mergeWith.length > 0 && `(${mergeWith.length})`}
                    </Button>
                  </DialogFooter>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function ZoneChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  endOfWeek,
} from "date-fns";
import {
  CalendarClock,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  List,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
} from "lucide-react";
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
import { RESERVATION_STATUS_LABEL, RESERVATION_STATUS_TONE } from "@/lib/status";
import { cn } from "@/lib/utils";
import {
  deleteReservationAction,
  saveReservationAction,
  setReservationStatusAction,
} from "@/server/actions/reservations";
import type { ReservationStatus } from "@/generated/prisma/enums";

type Reservation = {
  id: string;
  guestName: string;
  guestPhone: string;
  guestEmail: string | null;
  reservedAt: Date | string;
  durationMin: number;
  guests: number;
  status: ReservationStatus;
  notes: string | null;
  customerId: string | null;
  tableId: string | null;
  tableNumber: string | null;
  tableZone: string | null;
};

const STATUS_OPTIONS = Object.entries(RESERVATION_STATUS_LABEL).map(([value, label]) => ({
  value,
  label,
}));
const FILTER_OPTIONS = [{ value: "ALL", label: "All statuses" }, ...STATUS_OPTIONS];
const DURATIONS = [45, 60, 90, 120, 180, 240].map((m) => ({
  value: String(m),
  label: m >= 60 ? `${m / 60}h${m % 60 ? ` ${m % 60}m` : ""}` : `${m}m`,
}));

const EMPTY = {
  guestName: "",
  guestPhone: "",
  guestEmail: "",
  date: format(new Date(), "yyyy-MM-dd"),
  time: "19:00",
  durationMin: "90",
  guests: "2",
  tableId: "",
  customerId: "",
  status: "CONFIRMED" as ReservationStatus,
  notes: "",
};

export function ReservationsView({
  reservations,
  tables,
  customers,
  canManage,
  filters,
}: {
  reservations: Reservation[];
  tables: { id: string; number: string; capacity: number; zone: string }[];
  customers: { id: string; name: string; phone: string; email: string | null }[];
  canManage: boolean;
  filters: { status: string; date: string; search: string };
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [pending, startSave] = useTransition();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Reservation | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [month, setMonth] = useState(startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const push = (patch: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (!value || value === "ALL") params.delete(key);
      else params.set(key, value);
    }
    startTransition(() => router.push(`/reservations?${params.toString()}`, { scroll: false }));
  };

  const startCreate = (date?: Date) => {
    setForm({ ...EMPTY, date: format(date ?? new Date(), "yyyy-MM-dd") });
    setEditing(null);
    setOpen(true);
  };

  const startEdit = (reservation: Reservation) => {
    const at = new Date(reservation.reservedAt);
    setForm({
      guestName: reservation.guestName,
      guestPhone: reservation.guestPhone,
      guestEmail: reservation.guestEmail ?? "",
      date: format(at, "yyyy-MM-dd"),
      time: format(at, "HH:mm"),
      durationMin: String(reservation.durationMin),
      guests: String(reservation.guests),
      tableId: reservation.tableId ?? "",
      customerId: reservation.customerId ?? "",
      status: reservation.status,
      notes: reservation.notes ?? "",
    });
    setEditing(reservation);
    setOpen(true);
  };

  const save = () =>
    startSave(async () => {
      const result = await saveReservationAction(editing?.id ?? null, {
        ...form,
        tableId: form.tableId || null,
        customerId: form.customerId || null,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(editing ? "Reservation updated" : "Reservation created");
      setOpen(false);
      router.refresh();
    });

  const changeStatus = (reservation: Reservation, status: ReservationStatus) =>
    startTransition(async () => {
      const result = await setReservationStatusAction(reservation.id, status);
      if (!result.ok) toast.error(result.error);
      else {
        toast.success(`${reservation.guestName} — ${RESERVATION_STATUS_LABEL[status].toLowerCase()}`);
        router.refresh();
      }
    });

  const remove = (reservation: Reservation) =>
    startTransition(async () => {
      const result = await deleteReservationAction(reservation.id);
      if (!result.ok) toast.error(result.error);
      else {
        toast.success("Reservation deleted");
        router.refresh();
      }
    });

  // --- Calendar grid -------------------------------------------------------
  const calendarDays = useMemo(
    () =>
      eachDayOfInterval({
        start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }),
        end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }),
      }),
    [month],
  );

  const byDay = useMemo(() => {
    const map = new Map<string, Reservation[]>();
    for (const reservation of reservations) {
      const key = format(new Date(reservation.reservedAt), "yyyy-MM-dd");
      map.set(key, [...(map.get(key) ?? []), reservation]);
    }
    return map;
  }, [reservations]);

  const dayReservations = selectedDay
    ? (byDay.get(format(selectedDay, "yyyy-MM-dd")) ?? [])
    : [];

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            defaultValue={filters.search}
            onChange={(e) => {
              const value = e.target.value;
              setTimeout(() => push({ q: value }), 0);
            }}
            placeholder="Guest name or phone…"
            className="h-8 pl-9"
          />
        </div>
        <div className="w-40">
          <AppSelect
            value={filters.status}
            onValueChange={(v) => push({ status: v })}
            options={FILTER_OPTIONS}
            size="sm"
            aria-label="Filter by status"
          />
        </div>
        <Input
          type="date"
          value={filters.date}
          onChange={(e) => push({ date: e.target.value })}
          className="h-8 w-[9.5rem]"
          aria-label="Filter by date"
        />
        {canManage && (
          <Button className="ml-auto gap-2" onClick={() => startCreate()}>
            <Plus className="size-4" />
            New reservation
          </Button>
        )}
      </div>

      <Tabs defaultValue="list">
        <TabsList>
          <TabsTrigger value="list" className="gap-1.5">
            <List className="size-4" />
            List
          </TabsTrigger>
          <TabsTrigger value="calendar" className="gap-1.5">
            <CalendarDays className="size-4" />
            Calendar
          </TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="pt-4">
          <Card className="py-0">
            <CardContent className="px-0">
              {reservations.length === 0 ? (
                <EmptyState
                  icon={CalendarClock}
                  title="No reservations found"
                  description="Adjust the filters or take a new booking."
                />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Guest</TableHead>
                        <TableHead>When</TableHead>
                        <TableHead className="hidden sm:table-cell">Table</TableHead>
                        <TableHead className="text-right">Guests</TableHead>
                        <TableHead className="hidden xl:table-cell">Notes</TableHead>
                        <TableHead>Status</TableHead>
                        {canManage && <TableHead className="w-44" />}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reservations.map((reservation) => (
                        <TableRow key={reservation.id}>
                          <TableCell>
                            <p className="font-medium">{reservation.guestName}</p>
                            <p className="text-xs text-muted-foreground">{reservation.guestPhone}</p>
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            <p>{format(new Date(reservation.reservedAt), "d MMM yyyy")}</p>
                            <p className="text-xs text-muted-foreground tabular">
                              {format(new Date(reservation.reservedAt), "HH:mm")} ·{" "}
                              {reservation.durationMin}m
                            </p>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell text-muted-foreground">
                            {reservation.tableNumber
                              ? `${reservation.tableNumber} · ${reservation.tableZone}`
                              : "Unassigned"}
                          </TableCell>
                          <TableCell className="text-right tabular">{reservation.guests}</TableCell>
                          <TableCell className="hidden max-w-48 truncate xl:table-cell text-muted-foreground">
                            {reservation.notes ?? "—"}
                          </TableCell>
                          <TableCell>
                            <StatusBadge
                              label={RESERVATION_STATUS_LABEL[reservation.status]}
                              tone={RESERVATION_STATUS_TONE[reservation.status]}
                            />
                          </TableCell>
                          {canManage && (
                            <TableCell>
                              <div className="flex justify-end gap-1">
                                {reservation.status === "PENDING" && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 px-2 text-xs"
                                    onClick={() => changeStatus(reservation, "CONFIRMED")}
                                  >
                                    Confirm
                                  </Button>
                                )}
                                {reservation.status === "CONFIRMED" && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 px-2 text-xs"
                                    onClick={() => changeStatus(reservation, "SEATED")}
                                  >
                                    Seat
                                  </Button>
                                )}
                                {reservation.status === "SEATED" && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 px-2 text-xs"
                                    onClick={() => changeStatus(reservation, "COMPLETED")}
                                  >
                                    Complete
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-7"
                                  onClick={() => startEdit(reservation)}
                                  aria-label="Edit reservation"
                                >
                                  <Pencil className="size-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-7 text-muted-foreground hover:text-destructive"
                                  onClick={() => remove(reservation)}
                                  aria-label="Delete reservation"
                                >
                                  <Trash2 className="size-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="calendar" className="pt-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">{format(month, "MMMM yyyy")}</h3>
                  <div className="flex gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-8"
                      onClick={() => setMonth((m) => addMonths(m, -1))}
                      aria-label="Previous month"
                    >
                      <ChevronLeft className="size-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8"
                      onClick={() => setMonth(startOfMonth(new Date()))}
                    >
                      Today
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-8"
                      onClick={() => setMonth((m) => addMonths(m, 1))}
                      aria-label="Next month"
                    >
                      <ChevronRight className="size-4" />
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-muted-foreground">
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                    <div key={day} className="py-1">
                      {day}
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-1">
                  {calendarDays.map((day) => {
                    const key = format(day, "yyyy-MM-dd");
                    const dayItems = byDay.get(key) ?? [];
                    const outside = !isSameMonth(day, month);
                    const today = isSameDay(day, new Date());
                    const selected = selectedDay && isSameDay(day, selectedDay);

                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setSelectedDay(day)}
                        className={cn(
                          "flex aspect-square flex-col items-center justify-start gap-1 rounded-lg border p-1.5 text-xs transition-colors",
                          outside && "opacity-40",
                          selected
                            ? "border-primary bg-primary/8 ring-1 ring-primary"
                            : "hover:border-primary/40 hover:bg-muted/60",
                          today && !selected && "border-primary/50",
                        )}
                      >
                        <span className={cn("tabular", today && "font-bold text-primary")}>
                          {format(day, "d")}
                        </span>
                        {dayItems.length > 0 && (
                          <span className="rounded-full bg-primary/12 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                            {dayItems.length}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  Counts reflect the reservations matching the current filters.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-semibold">
                    {selectedDay ? format(selectedDay, "d MMM yyyy") : "Pick a day"}
                  </h3>
                  {canManage && selectedDay && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1 text-xs"
                      onClick={() => startCreate(selectedDay)}
                    >
                      <Plus className="size-3.5" />
                      Add
                    </Button>
                  )}
                </div>

                {!selectedDay ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Select a date to see its bookings.
                  </p>
                ) : dayReservations.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    No reservations on this day.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {dayReservations
                      .sort(
                        (a, b) =>
                          new Date(a.reservedAt).getTime() - new Date(b.reservedAt).getTime(),
                      )
                      .map((reservation) => (
                        <li key={reservation.id} className="rounded-lg border p-2.5">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">{reservation.guestName}</p>
                              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <span className="tabular">
                                  {format(new Date(reservation.reservedAt), "HH:mm")}
                                </span>
                                <Users className="size-3" />
                                {reservation.guests}
                                {reservation.tableNumber && ` · ${reservation.tableNumber}`}
                              </p>
                            </div>
                            <StatusBadge
                              label={RESERVATION_STATUS_LABEL[reservation.status]}
                              tone={RESERVATION_STATUS_TONE[reservation.status]}
                            />
                          </div>
                        </li>
                      ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit reservation" : "New reservation"}</DialogTitle>
            <DialogDescription>
              Assigning a table checks for overlapping bookings before saving.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Existing customer (optional)</Label>
              <AppSelect
                value={form.customerId}
                onValueChange={(v) => {
                  const customer = customers.find((c) => c.id === v);
                  setForm((f) => ({
                    ...f,
                    customerId: v,
                    guestName: customer?.name ?? f.guestName,
                    guestPhone: customer?.phone ?? f.guestPhone,
                    guestEmail: customer?.email ?? f.guestEmail,
                  }));
                }}
                options={[
                  { value: "", label: "Walk-in / new guest" },
                  ...customers.map((c) => ({ value: c.id, label: `${c.name} — ${c.phone}` })),
                ]}
                placeholder="Link a customer…"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="r-name">Guest name</Label>
              <Input
                id="r-name"
                value={form.guestName}
                onChange={(e) => setForm((f) => ({ ...f, guestName: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="r-phone">Phone</Label>
              <Input
                id="r-phone"
                value={form.guestPhone}
                onChange={(e) => setForm((f) => ({ ...f, guestPhone: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="r-date">Date</Label>
              <Input
                id="r-date"
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="r-time">Time</Label>
              <Input
                id="r-time"
                type="time"
                value={form.time}
                onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Duration</Label>
              <AppSelect
                value={form.durationMin}
                onValueChange={(v) => setForm((f) => ({ ...f, durationMin: v }))}
                options={DURATIONS}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="r-guests">Number of guests</Label>
              <Input
                id="r-guests"
                inputMode="numeric"
                value={form.guests}
                onChange={(e) => setForm((f) => ({ ...f, guests: e.target.value }))}
                className="tabular"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Table</Label>
              <AppSelect
                value={form.tableId}
                onValueChange={(v) => setForm((f) => ({ ...f, tableId: v }))}
                options={[
                  { value: "", label: "Unassigned" },
                  ...tables
                    .filter((t) => t.capacity >= (Number(form.guests) || 1))
                    .map((t) => ({
                      value: t.id,
                      label: `${t.number} — ${t.zone} (${t.capacity} seats)`,
                    })),
                ]}
                placeholder="Assign a table…"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <AppSelect
                value={form.status}
                onValueChange={(v) => setForm((f) => ({ ...f, status: v as ReservationStatus }))}
                options={STATUS_OPTIONS}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="r-email">Email (optional)</Label>
              <Input
                id="r-email"
                type="email"
                value={form.guestEmail}
                onChange={(e) => setForm((f) => ({ ...f, guestEmail: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="r-notes">Notes</Label>
              <Textarea
                id="r-notes"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={2}
                placeholder="Window seat, birthday cake, high chair…"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button
              onClick={save}
              disabled={pending || !form.guestName.trim() || !form.guestPhone.trim()}
            >
              {pending && <Loader2 className="size-4 animate-spin" />}
              {editing ? "Save changes" : "Create reservation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

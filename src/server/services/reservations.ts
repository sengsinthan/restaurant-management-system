import "server-only";

import { endOfDay, startOfDay } from "date-fns";

import { prisma } from "@/lib/prisma";
import { plain } from "@/lib/serialize";
import type { Prisma } from "@/generated/prisma/client";
import type { ReservationStatus } from "@/generated/prisma/enums";
import { BusinessRuleError } from "./orders";

/** Reservation statuses that still hold a table. */
const LIVE_STATUSES: ReservationStatus[] = ["PENDING", "CONFIRMED", "SEATED"];

export type ReservationInput = {
  restaurantId: string;
  customerId?: string | null;
  tableId?: string | null;
  guestName: string;
  guestPhone: string;
  guestEmail?: string | null;
  reservedAt: Date;
  durationMin: number;
  guests: number;
  status: ReservationStatus;
  notes?: string | null;
};

/**
 * Rejects a booking that would overlap another live reservation on the same
 * table, or that targets a table which is currently occupied or out of
 * service. Overlap is computed from each booking's own duration rather than a
 * fixed window, so a 3-hour party blocks the full three hours.
 */
async function assertTableFree(
  tx: Prisma.TransactionClient,
  input: {
    tableId: string;
    reservedAt: Date;
    durationMin: number;
    guests: number;
    excludeId?: string;
    status: ReservationStatus;
  },
) {
  const table = await tx.restaurantTable.findUniqueOrThrow({
    where: { id: input.tableId },
    select: { id: true, number: true, capacity: true, status: true, deletedAt: true },
  });
  if (table.deletedAt) throw new BusinessRuleError("That table no longer exists.");
  if (table.status === "OUT_OF_SERVICE") {
    throw new BusinessRuleError(`Table ${table.number} is out of service.`);
  }
  if (input.guests > table.capacity) {
    throw new BusinessRuleError(
      `Table ${table.number} seats ${table.capacity}, but the booking is for ${input.guests}.`,
    );
  }

  // Seating now requires the table to actually be free.
  if (input.status === "SEATED" && table.status === "OCCUPIED") {
    const openOrder = await tx.order.count({
      where: { tableId: table.id, status: { notIn: ["COMPLETED", "CANCELLED"] } },
    });
    if (openOrder > 0) {
      throw new BusinessRuleError(`Table ${table.number} is currently occupied.`);
    }
  }

  const start = input.reservedAt;
  const end = new Date(start.getTime() + input.durationMin * 60000);

  const clashes = await tx.reservation.findMany({
    where: {
      tableId: input.tableId,
      status: { in: LIVE_STATUSES },
      deletedAt: null,
      ...(input.excludeId ? { id: { not: input.excludeId } } : {}),
      // Cheap pre-filter; exact overlap is checked below using each row's own
      // duration, which SQL can't express against a stored interval column.
      reservedAt: {
        gte: new Date(start.getTime() - 8 * 3600000),
        lte: new Date(end.getTime() + 8 * 3600000),
      },
    },
    select: { id: true, reservedAt: true, durationMin: true, guestName: true },
  });

  for (const clash of clashes) {
    const clashStart = clash.reservedAt;
    const clashEnd = new Date(clashStart.getTime() + clash.durationMin * 60000);
    if (start < clashEnd && clashStart < end) {
      throw new BusinessRuleError(
        `Table ${table.number} is already booked for ${clash.guestName} at ${clashStart.toLocaleTimeString(
          [],
          { hour: "2-digit", minute: "2-digit" },
        )}.`,
      );
    }
  }
}

export async function createReservation(input: ReservationInput) {
  return prisma.$transaction(async (tx) => {
    if (input.tableId) {
      await assertTableFree(tx, {
        tableId: input.tableId,
        reservedAt: input.reservedAt,
        durationMin: input.durationMin,
        guests: input.guests,
        status: input.status,
      });
    }

    const reservation = await tx.reservation.create({
      data: {
        restaurantId: input.restaurantId,
        customerId: input.customerId ?? null,
        tableId: input.tableId ?? null,
        guestName: input.guestName,
        guestPhone: input.guestPhone,
        guestEmail: input.guestEmail ?? null,
        reservedAt: input.reservedAt,
        durationMin: input.durationMin,
        guests: input.guests,
        status: input.status,
        notes: input.notes ?? null,
      },
    });

    await syncTableForReservation(tx, reservation.tableId, reservation.status, reservation.reservedAt);
    return reservation;
  });
}

export async function updateReservation(id: string, restaurantId: string, input: ReservationInput) {
  return prisma.$transaction(async (tx) => {
    await tx.reservation.findFirstOrThrow({ where: { id, restaurantId, deletedAt: null } });

    if (input.tableId) {
      await assertTableFree(tx, {
        tableId: input.tableId,
        reservedAt: input.reservedAt,
        durationMin: input.durationMin,
        guests: input.guests,
        excludeId: id,
        status: input.status,
      });
    }

    const reservation = await tx.reservation.update({
      where: { id },
      data: {
        customerId: input.customerId ?? null,
        tableId: input.tableId ?? null,
        guestName: input.guestName,
        guestPhone: input.guestPhone,
        guestEmail: input.guestEmail ?? null,
        reservedAt: input.reservedAt,
        durationMin: input.durationMin,
        guests: input.guests,
        status: input.status,
        notes: input.notes ?? null,
      },
    });

    await syncTableForReservation(tx, reservation.tableId, reservation.status, reservation.reservedAt);
    return reservation;
  });
}

export async function setReservationStatus(
  id: string,
  restaurantId: string,
  status: ReservationStatus,
) {
  return prisma.$transaction(async (tx) => {
    const reservation = await tx.reservation.findFirstOrThrow({
      where: { id, restaurantId, deletedAt: null },
    });

    if (status === "SEATED" && reservation.tableId) {
      await assertTableFree(tx, {
        tableId: reservation.tableId,
        reservedAt: reservation.reservedAt,
        durationMin: reservation.durationMin,
        guests: reservation.guests,
        excludeId: id,
        status,
      });
    }

    const updated = await tx.reservation.update({ where: { id }, data: { status } });
    await syncTableForReservation(tx, updated.tableId, status, updated.reservedAt);
    return updated;
  });
}

/** Keeps the floor plan honest as reservations move through their lifecycle. */
async function syncTableForReservation(
  tx: Prisma.TransactionClient,
  tableId: string | null,
  status: ReservationStatus,
  reservedAt: Date,
) {
  if (!tableId) return;

  if (status === "SEATED") {
    await tx.restaurantTable.update({
      where: { id: tableId },
      data: { status: "OCCUPIED", occupiedAt: new Date() },
    });
    return;
  }

  if (status === "CANCELLED" || status === "NO_SHOW" || status === "COMPLETED") {
    const stillHeld = await tx.reservation.count({
      where: {
        tableId,
        status: { in: ["PENDING", "CONFIRMED"] },
        deletedAt: null,
        reservedAt: { gte: new Date(), lte: new Date(Date.now() + 6 * 3600000) },
      },
    });
    const openOrders = await tx.order.count({
      where: { tableId, status: { notIn: ["COMPLETED", "CANCELLED"] } },
    });
    if (stillHeld === 0 && openOrders === 0) {
      await tx.restaurantTable.updateMany({
        where: { id: tableId, status: "RESERVED" },
        data: { status: "AVAILABLE" },
      });
    }
    return;
  }

  // Pending/confirmed within the next six hours visibly holds the table.
  const soon = reservedAt.getTime() - Date.now() < 6 * 3600000 && reservedAt.getTime() > Date.now();
  if (soon) {
    await tx.restaurantTable.updateMany({
      where: { id: tableId, status: "AVAILABLE" },
      data: { status: "RESERVED" },
    });
  }
}

export async function cancelReservation(id: string, restaurantId: string) {
  return setReservationStatus(id, restaurantId, "CANCELLED");
}

export async function deleteReservation(id: string, restaurantId: string) {
  const reservation = await prisma.reservation.findFirstOrThrow({
    where: { id, restaurantId, deletedAt: null },
  });
  await prisma.reservation.update({ where: { id }, data: { deletedAt: new Date() } });
  return reservation;
}

export type ReservationFilters = {
  status?: ReservationStatus | "ALL";
  date?: Date;
  search?: string;
};

export async function listReservations(restaurantId: string, filters: ReservationFilters = {}) {
  const where: Prisma.ReservationWhereInput = {
    restaurantId,
    deletedAt: null,
    ...(filters.status && filters.status !== "ALL" ? { status: filters.status } : {}),
    ...(filters.date
      ? { reservedAt: { gte: startOfDay(filters.date), lte: endOfDay(filters.date) } }
      : {}),
    ...(filters.search
      ? {
          OR: [
            { guestName: { contains: filters.search, mode: "insensitive" as const } },
            { guestPhone: { contains: filters.search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const reservations = await prisma.reservation.findMany({
    where,
    include: {
      table: { select: { id: true, number: true, capacity: true, zone: true } },
      customer: { select: { id: true, name: true } },
    },
    orderBy: { reservedAt: "asc" },
    take: 300,
  });
  return plain(reservations);
}

/** Day-by-day counts for the month calendar. */
export async function getReservationCalendar(restaurantId: string, month: Date) {
  const from = new Date(month.getFullYear(), month.getMonth(), 1);
  const to = new Date(month.getFullYear(), month.getMonth() + 1, 0, 23, 59, 59, 999);

  const reservations = await prisma.reservation.findMany({
    where: {
      restaurantId,
      deletedAt: null,
      status: { notIn: ["CANCELLED"] },
      reservedAt: { gte: from, lte: to },
    },
    select: { id: true, reservedAt: true, guests: true, status: true, guestName: true },
    orderBy: { reservedAt: "asc" },
  });

  const byDay = new Map<string, { count: number; guests: number }>();
  for (const reservation of reservations) {
    const key = reservation.reservedAt.toISOString().slice(0, 10);
    const entry = byDay.get(key) ?? { count: 0, guests: 0 };
    entry.count += 1;
    entry.guests += reservation.guests;
    byDay.set(key, entry);
  }

  return {
    from,
    to,
    days: [...byDay.entries()].map(([date, value]) => ({ date, ...value })),
  };
}

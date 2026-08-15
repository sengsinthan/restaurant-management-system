import "server-only";

import { prisma } from "@/lib/prisma";
import { plain } from "@/lib/serialize";
import { BusinessRuleError } from "./orders";

/**
 * Floor plan view: every table with its live order, running total and how
 * long it has been occupied.
 */
export async function getFloorPlan(restaurantId: string) {
  const tables = await prisma.restaurantTable.findMany({
    where: { restaurantId, deletedAt: null },
    orderBy: [{ zone: "asc" }, { number: "asc" }],
    include: {
      orders: {
        where: { status: { notIn: ["COMPLETED", "CANCELLED"] } },
        orderBy: { placedAt: "asc" },
        include: {
          _count: { select: { items: true } },
          customer: { select: { name: true } },
        },
      },
      reservations: {
        where: {
          status: { in: ["PENDING", "CONFIRMED"] },
          reservedAt: { gte: new Date(), lte: new Date(Date.now() + 12 * 3600000) },
        },
        orderBy: { reservedAt: "asc" },
        take: 1,
      },
    },
  });

  return plain(
    tables.map((table) => {
      const activeOrder = table.orders[0] ?? null;
      const runningTotal = table.orders.reduce((acc, o) => acc + Number(o.total), 0);
      return {
        id: table.id,
        number: table.number,
        name: table.name,
        capacity: table.capacity,
        zone: table.zone,
        status: table.status,
        occupiedAt: table.occupiedAt,
        mergedIntoId: table.mergedIntoId,
        orderCount: table.orders.length,
        activeOrder: activeOrder
          ? {
              id: activeOrder.id,
              orderNumber: activeOrder.orderNumber,
              status: activeOrder.status,
              paymentStatus: activeOrder.paymentStatus,
              total: Number(activeOrder.total),
              itemCount: activeOrder._count.items,
              guestCount: activeOrder.guestCount,
              customerName: activeOrder.customer?.name ?? null,
              placedAt: activeOrder.placedAt,
            }
          : null,
        runningTotal,
        nextReservation: table.reservations[0]
          ? {
              id: table.reservations[0].id,
              guestName: table.reservations[0].guestName,
              reservedAt: table.reservations[0].reservedAt,
              guests: table.reservations[0].guests,
            }
          : null,
      };
    }),
  );
}

export async function listTables(restaurantId: string) {
  const tables = await prisma.restaurantTable.findMany({
    where: { restaurantId, deletedAt: null },
    orderBy: [{ zone: "asc" }, { number: "asc" }],
  });
  return plain(tables);
}

/** Tables that can take a new dine-in order right now. */
export async function listSelectableTables(restaurantId: string) {
  const tables = await prisma.restaurantTable.findMany({
    where: { restaurantId, deletedAt: null, status: { not: "OUT_OF_SERVICE" } },
    orderBy: [{ zone: "asc" }, { number: "asc" }],
    select: { id: true, number: true, name: true, capacity: true, status: true, zone: true },
  });
  return plain(tables);
}

/**
 * Moves a table's live orders to another table. Used when guests change
 * seats mid-service; the receiving table must be free or already serving.
 */
export async function transferTable(fromTableId: string, toTableId: string) {
  if (fromTableId === toTableId) throw new BusinessRuleError("Pick a different destination table.");

  return prisma.$transaction(async (tx) => {
    const [from, to] = await Promise.all([
      tx.restaurantTable.findUniqueOrThrow({ where: { id: fromTableId } }),
      tx.restaurantTable.findUniqueOrThrow({ where: { id: toTableId } }),
    ]);

    if (to.status === "OUT_OF_SERVICE") {
      throw new BusinessRuleError(`Table ${to.number} is out of service.`);
    }
    if (to.status === "RESERVED") {
      throw new BusinessRuleError(`Table ${to.number} is being held for a reservation.`);
    }

    const moved = await tx.order.updateMany({
      where: { tableId: fromTableId, status: { notIn: ["COMPLETED", "CANCELLED"] } },
      data: { tableId: toTableId },
    });
    if (moved.count === 0) throw new BusinessRuleError(`Table ${from.number} has no open order to move.`);

    await tx.restaurantTable.update({
      where: { id: toTableId },
      data: { status: "OCCUPIED", occupiedAt: from.occupiedAt ?? new Date() },
    });
    await tx.restaurantTable.update({
      where: { id: fromTableId },
      data: { status: "CLEANING", occupiedAt: null },
    });

    return { moved: moved.count, from: from.number, to: to.number };
  });
}

/**
 * Merges tables for a large party: the secondary tables' live orders move to
 * the primary table and the secondaries are flagged as merged so the floor
 * plan can show them grouped.
 */
export async function mergeTables(primaryId: string, secondaryIds: string[]) {
  if (secondaryIds.length === 0) throw new BusinessRuleError("Select at least one table to merge.");
  if (secondaryIds.includes(primaryId)) {
    throw new BusinessRuleError("A table cannot be merged into itself.");
  }

  return prisma.$transaction(async (tx) => {
    const primary = await tx.restaurantTable.findUniqueOrThrow({ where: { id: primaryId } });
    const secondaries = await tx.restaurantTable.findMany({ where: { id: { in: secondaryIds } } });

    for (const table of secondaries) {
      if (table.status === "OUT_OF_SERVICE") {
        throw new BusinessRuleError(`Table ${table.number} is out of service.`);
      }
    }

    await tx.order.updateMany({
      where: { tableId: { in: secondaryIds }, status: { notIn: ["COMPLETED", "CANCELLED"] } },
      data: { tableId: primaryId },
    });
    await tx.restaurantTable.updateMany({
      where: { id: { in: secondaryIds } },
      data: { mergedIntoId: primaryId, status: "OCCUPIED", occupiedAt: new Date() },
    });
    await tx.restaurantTable.update({
      where: { id: primaryId },
      data: { status: "OCCUPIED", occupiedAt: primary.occupiedAt ?? new Date() },
    });

    return {
      primary: primary.number,
      merged: secondaries.map((t) => t.number),
      capacity: primary.capacity + secondaries.reduce((acc, t) => acc + t.capacity, 0),
    };
  });
}

export async function splitMergedTable(primaryId: string) {
  const result = await prisma.restaurantTable.updateMany({
    where: { mergedIntoId: primaryId },
    data: { mergedIntoId: null, status: "CLEANING", occupiedAt: null },
  });
  if (result.count === 0) throw new BusinessRuleError("This table has no merged tables.");
  return { count: result.count };
}

/** Returns a table to service — refused while it still has an open order. */
export async function markTableAvailable(tableId: string) {
  return prisma.$transaction(async (tx) => {
    const open = await tx.order.count({
      where: { tableId, status: { notIn: ["COMPLETED", "CANCELLED"] } },
    });
    if (open > 0) {
      throw new BusinessRuleError(
        "This table still has an open order. Complete or cancel it first.",
      );
    }
    await tx.restaurantTable.updateMany({
      where: { mergedIntoId: tableId },
      data: { mergedIntoId: null, status: "AVAILABLE" },
    });
    return tx.restaurantTable.update({
      where: { id: tableId },
      data: { status: "AVAILABLE", occupiedAt: null },
    });
  });
}

export async function setTableStatus(
  tableId: string,
  status: "AVAILABLE" | "OCCUPIED" | "RESERVED" | "CLEANING" | "OUT_OF_SERVICE",
) {
  if (status === "AVAILABLE") return markTableAvailable(tableId);
  return prisma.restaurantTable.update({
    where: { id: tableId },
    data: { status, ...(status === "OCCUPIED" ? { occupiedAt: new Date() } : { occupiedAt: null }) },
  });
}

import "server-only";

import { prisma } from "@/lib/prisma";
import { round2 } from "@/lib/money";
import { plain } from "@/lib/serialize";
import type { DateRange } from "@/lib/date";

type Granularity = "hour" | "day" | "week" | "month";

/** Whitelisted so the bucket unit can never come from user input verbatim. */
const GRANULARITIES: Record<Granularity, string> = {
  hour: "hour",
  day: "day",
  week: "week",
  month: "month",
};

export function pickGranularity(range: DateRange): Granularity {
  const hours = (range.to.getTime() - range.from.getTime()) / 3600000;
  if (hours <= 36) return "hour";
  if (hours <= 24 * 70) return "day";
  if (hours <= 24 * 400) return "week";
  return "month";
}

export type SeriesPoint = { bucket: string; revenue: number; orders: number };

export async function getRevenueSeries(
  restaurantId: string,
  range: DateRange,
  granularity: Granularity = pickGranularity(range),
): Promise<SeriesPoint[]> {
  const unit = GRANULARITIES[granularity] ?? "day";
  const rows = await prisma.$queryRawUnsafe<
    { bucket: Date; revenue: string | null; orders: bigint }[]
  >(
    `SELECT date_trunc('${unit}', placed_at) AS bucket,
            SUM(total)  AS revenue,
            COUNT(*)    AS orders
       FROM orders
      WHERE restaurant_id = $1::uuid
        AND placed_at BETWEEN $2 AND $3
        AND status = 'COMPLETED'
      GROUP BY 1
      ORDER BY 1`,
    restaurantId,
    range.from,
    range.to,
  );

  return rows.map((row) => ({
    bucket: row.bucket.toISOString(),
    revenue: round2(Number(row.revenue ?? 0)),
    orders: Number(row.orders),
  }));
}

async function summariseRange(restaurantId: string, range: DateRange) {
  const [completed, all, cancelled] = await Promise.all([
    prisma.order.aggregate({
      where: { restaurantId, status: "COMPLETED", placedAt: { gte: range.from, lte: range.to } },
      _sum: { total: true, subtotal: true, discountTotal: true, taxTotal: true, serviceChargeTotal: true },
      _count: { _all: true },
      _avg: { total: true },
    }),
    prisma.order.count({ where: { restaurantId, placedAt: { gte: range.from, lte: range.to } } }),
    prisma.order.count({
      where: { restaurantId, status: "CANCELLED", placedAt: { gte: range.from, lte: range.to } },
    }),
  ]);

  return {
    revenue: round2(Number(completed._sum.total ?? 0)),
    netSales: round2(Number(completed._sum.subtotal ?? 0) - Number(completed._sum.discountTotal ?? 0)),
    discounts: round2(Number(completed._sum.discountTotal ?? 0)),
    tax: round2(Number(completed._sum.taxTotal ?? 0)),
    serviceCharge: round2(Number(completed._sum.serviceChargeTotal ?? 0)),
    completedOrders: completed._count._all,
    totalOrders: all,
    cancelledOrders: cancelled,
    averageOrderValue: round2(Number(completed._avg.total ?? 0)),
  };
}

export async function getBestSellers(restaurantId: string, range: DateRange, limit = 8) {
  const rows = await prisma.orderItem.groupBy({
    by: ["menuItemId", "nameSnap"],
    where: {
      order: { restaurantId, status: "COMPLETED", placedAt: { gte: range.from, lte: range.to } },
      status: { not: "CANCELLED" },
    },
    _sum: { quantity: true, lineTotal: true },
    orderBy: { _sum: { quantity: "desc" } },
    take: limit,
  });

  return rows.map((row) => ({
    menuItemId: row.menuItemId,
    name: row.nameSnap,
    quantity: Number(row._sum.quantity ?? 0),
    revenue: round2(Number(row._sum.lineTotal ?? 0)),
  }));
}

/**
 * Everything on the dashboard, resolved in parallel. Live counters (tables,
 * kitchen queue, stock alerts) always reflect *now*; the money figures follow
 * the selected date range.
 */
export async function getDashboard(restaurantId: string, range: DateRange) {
  const spanMs = range.to.getTime() - range.from.getTime();
  const previous: DateRange = {
    from: new Date(range.from.getTime() - spanMs - 1),
    to: new Date(range.from.getTime() - 1),
  };

  const [
    summary,
    previousSummary,
    series,
    bestSellers,
    recentOrders,
    tableCounts,
    kitchenQueue,
    stockAlerts,
    paymentMix,
  ] = await Promise.all([
    summariseRange(restaurantId, range),
    summariseRange(restaurantId, previous),
    getRevenueSeries(restaurantId, range),
    getBestSellers(restaurantId, range, 6),
    prisma.order.findMany({
      where: { restaurantId, placedAt: { gte: range.from, lte: range.to } },
      orderBy: { placedAt: "desc" },
      take: 8,
      include: {
        table: { select: { number: true } },
        customer: { select: { name: true } },
        staff: { select: { name: true } },
        _count: { select: { items: true } },
      },
    }),
    prisma.restaurantTable.groupBy({
      by: ["status"],
      where: { restaurantId, deletedAt: null },
      _count: { _all: true },
    }),
    prisma.order.count({
      where: { restaurantId, status: { in: ["PENDING", "CONFIRMED", "PREPARING"] } },
    }),
    prisma.ingredient.findMany({
      where: { restaurantId, deletedAt: null, isActive: true },
      select: { id: true, name: true, unit: true, quantity: true, minQuantity: true, expiresAt: true },
    }),
    prisma.payment.groupBy({
      by: ["method"],
      where: {
        state: "COMPLETED",
        order: { restaurantId },
        createdAt: { gte: range.from, lte: range.to },
      },
      _sum: { amount: true },
      _count: { _all: true },
    }),
  ]);

  const tableStatus = Object.fromEntries(tableCounts.map((t) => [t.status, t._count._all]));
  const lowStock = stockAlerts.filter(
    (i) => Number(i.quantity) <= Number(i.minQuantity),
  );

  const delta = (current: number, prior: number) =>
    prior === 0 ? (current > 0 ? 100 : 0) : round2(((current - prior) / prior) * 100);

  return {
    summary,
    trend: {
      revenue: delta(summary.revenue, previousSummary.revenue),
      orders: delta(summary.completedOrders, previousSummary.completedOrders),
      averageOrderValue: delta(summary.averageOrderValue, previousSummary.averageOrderValue),
    },
    series,
    bestSellers,
    recentOrders: plain(recentOrders),
    tables: {
      total: tableCounts.reduce((acc, t) => acc + t._count._all, 0),
      available: tableStatus.AVAILABLE ?? 0,
      occupied: tableStatus.OCCUPIED ?? 0,
      reserved: tableStatus.RESERVED ?? 0,
      cleaning: tableStatus.CLEANING ?? 0,
      outOfService: tableStatus.OUT_OF_SERVICE ?? 0,
    },
    kitchenQueue,
    lowStock: plain(
      lowStock
        .sort((a, b) => Number(a.quantity) - Number(b.quantity))
        .slice(0, 6),
    ),
    lowStockCount: lowStock.length,
    paymentMix: paymentMix.map((p) => ({
      method: p.method,
      total: round2(Number(p._sum.amount ?? 0)),
      count: p._count._all,
    })),
  };
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export async function getSalesReport(restaurantId: string, range: DateRange, granularity?: Granularity) {
  const [summary, series, byType, byHour] = await Promise.all([
    summariseRange(restaurantId, range),
    getRevenueSeries(restaurantId, range, granularity),
    prisma.order.groupBy({
      by: ["type"],
      where: { restaurantId, status: "COMPLETED", placedAt: { gte: range.from, lte: range.to } },
      _sum: { total: true },
      _count: { _all: true },
    }),
    prisma.$queryRawUnsafe<{ hour: number; revenue: string | null; orders: bigint }[]>(
      `SELECT EXTRACT(HOUR FROM placed_at)::int AS hour,
              SUM(total) AS revenue,
              COUNT(*)   AS orders
         FROM orders
        WHERE restaurant_id = $1::uuid
          AND placed_at BETWEEN $2 AND $3
          AND status = 'COMPLETED'
        GROUP BY 1
        ORDER BY 1`,
      restaurantId,
      range.from,
      range.to,
    ),
  ]);

  return {
    summary,
    series,
    byType: byType.map((t) => ({
      type: t.type,
      total: round2(Number(t._sum.total ?? 0)),
      count: t._count._all,
    })),
    byHour: byHour.map((h) => ({
      hour: h.hour,
      revenue: round2(Number(h.revenue ?? 0)),
      orders: Number(h.orders),
    })),
  };
}

export async function getProductReport(restaurantId: string, range: DateRange) {
  const rows = await prisma.orderItem.groupBy({
    by: ["menuItemId", "nameSnap"],
    where: {
      order: { restaurantId, status: "COMPLETED", placedAt: { gte: range.from, lte: range.to } },
      status: { not: "CANCELLED" },
    },
    _sum: { quantity: true, lineTotal: true, unitCost: true },
    _count: { _all: true },
  });

  const menuItems = await prisma.menuItem.findMany({
    where: { restaurantId, deletedAt: null },
    select: { id: true, name: true, sku: true, price: true, cost: true, category: { select: { name: true } } },
  });

  const sold = rows.map((row) => {
    const menuItem = menuItems.find((m) => m.id === row.menuItemId);
    const quantity = Number(row._sum.quantity ?? 0);
    const revenue = round2(Number(row._sum.lineTotal ?? 0));
    const cost = round2(Number(menuItem?.cost ?? 0) * quantity);
    return {
      menuItemId: row.menuItemId,
      name: row.nameSnap,
      sku: menuItem?.sku ?? "—",
      category: menuItem?.category.name ?? "—",
      quantity,
      revenue,
      cost,
      margin: round2(revenue - cost),
      marginPercent: revenue > 0 ? round2(((revenue - cost) / revenue) * 100) : 0,
      orders: row._count._all,
    };
  });

  // Menu items with no sales in the window still belong in a "worst sellers"
  // report — that's exactly the signal a manager is looking for.
  const unsold = menuItems
    .filter((m) => !sold.some((s) => s.menuItemId === m.id))
    .map((m) => ({
      menuItemId: m.id,
      name: m.name,
      sku: m.sku,
      category: m.category.name,
      quantity: 0,
      revenue: 0,
      cost: 0,
      margin: 0,
      marginPercent: 0,
      orders: 0,
    }));

  const all = [...sold, ...unsold];
  return {
    best: [...all].sort((a, b) => b.quantity - a.quantity).slice(0, 15),
    worst: [...all].sort((a, b) => a.quantity - b.quantity || a.revenue - b.revenue).slice(0, 15),
    all: [...all].sort((a, b) => b.revenue - a.revenue),
  };
}

export async function getPaymentReport(restaurantId: string, range: DateRange) {
  const [byMethod, refunds] = await Promise.all([
    prisma.payment.groupBy({
      by: ["method"],
      where: {
        state: "COMPLETED",
        order: { restaurantId },
        createdAt: { gte: range.from, lte: range.to },
      },
      _sum: { amount: true, change: true },
      _count: { _all: true },
    }),
    prisma.payment.aggregate({
      where: {
        state: "REFUNDED",
        order: { restaurantId },
        createdAt: { gte: range.from, lte: range.to },
      },
      _sum: { amount: true },
      _count: { _all: true },
    }),
  ]);

  const rows = byMethod.map((m) => ({
    method: m.method,
    total: round2(Number(m._sum.amount ?? 0)),
    change: round2(Number(m._sum.change ?? 0)),
    count: m._count._all,
  }));
  const grandTotal = round2(rows.reduce((acc, r) => acc + r.total, 0));

  return {
    rows: rows
      .map((r) => ({ ...r, share: grandTotal > 0 ? round2((r.total / grandTotal) * 100) : 0 }))
      .sort((a, b) => b.total - a.total),
    grandTotal,
    refunded: round2(Number(refunds._sum.amount ?? 0)),
    refundCount: refunds._count._all,
  };
}

export async function getInventoryReport(restaurantId: string, range: DateRange) {
  const [movements, ingredients, waste] = await Promise.all([
    prisma.inventoryTransaction.groupBy({
      by: ["type"],
      where: {
        ingredient: { restaurantId },
        createdAt: { gte: range.from, lte: range.to },
      },
      _sum: { quantity: true },
      _count: { _all: true },
    }),
    prisma.ingredient.findMany({
      where: { restaurantId, deletedAt: null },
      select: {
        id: true,
        name: true,
        sku: true,
        category: true,
        unit: true,
        quantity: true,
        minQuantity: true,
        cost: true,
      },
      orderBy: { name: "asc" },
    }),
    prisma.inventoryTransaction.findMany({
      where: {
        type: "WASTE",
        ingredient: { restaurantId },
        createdAt: { gte: range.from, lte: range.to },
      },
      include: { ingredient: { select: { name: true, unit: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  const stock = ingredients.map((i) => ({
    ...plain(i),
    value: round2(Number(i.quantity) * Number(i.cost)),
  }));

  const wasteRows = waste.map((w) => ({
    id: w.id,
    name: w.ingredient.name,
    unit: w.ingredient.unit,
    quantity: Math.abs(Number(w.quantity)),
    value: round2(Math.abs(Number(w.quantity)) * Number(w.unitCost)),
    note: w.note,
    createdAt: w.createdAt,
  }));

  return {
    movements: movements.map((m) => ({
      type: m.type,
      quantity: round2(Number(m._sum.quantity ?? 0)),
      count: m._count._all,
    })),
    stock,
    totalValue: round2(stock.reduce((acc, s) => acc + s.value, 0)),
    waste: plain(wasteRows),
    wasteValue: round2(wasteRows.reduce((acc, w) => acc + w.value, 0)),
  };
}

export async function getStaffReport(restaurantId: string, range: DateRange) {
  const rows = await prisma.order.groupBy({
    by: ["staffId"],
    where: { restaurantId, status: "COMPLETED", placedAt: { gte: range.from, lte: range.to } },
    _sum: { total: true },
    _count: { _all: true },
    _avg: { total: true },
  });

  const staff = await prisma.user.findMany({
    where: { restaurantId, deletedAt: null },
    select: { id: true, name: true, email: true, role: { select: { label: true } } },
  });

  return staff
    .map((member) => {
      const row = rows.find((r) => r.staffId === member.id);
      return {
        id: member.id,
        name: member.name,
        email: member.email,
        role: member.role.label,
        orders: row?._count._all ?? 0,
        sales: round2(Number(row?._sum.total ?? 0)),
        averageOrder: round2(Number(row?._avg.total ?? 0)),
      };
    })
    .sort((a, b) => b.sales - a.sales);
}

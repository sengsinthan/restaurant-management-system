import "server-only";

import { prisma } from "@/lib/prisma";
import { plain } from "@/lib/serialize";

export async function listCustomers(restaurantId: string, search?: string) {
  const customers = await prisma.customer.findMany({
    where: {
      restaurantId,
      deletedAt: null,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" as const } },
              { phone: { contains: search, mode: "insensitive" as const } },
              { email: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    orderBy: { name: "asc" },
    take: 200,
  });

  // Lifetime value comes from settled orders only — pending tickets aren't
  // money in the till yet.
  const stats = await prisma.order.groupBy({
    by: ["customerId"],
    where: {
      restaurantId,
      status: "COMPLETED",
      customerId: { in: customers.map((c) => c.id) },
    },
    _sum: { total: true },
    _count: { _all: true },
    _max: { placedAt: true },
  });

  const byCustomer = new Map(stats.map((s) => [s.customerId, s]));

  return plain(
    customers.map((customer) => {
      const stat = byCustomer.get(customer.id);
      return {
        ...customer,
        totalOrders: stat?._count._all ?? 0,
        totalSpend: Number(stat?._sum.total ?? 0),
        lastOrderAt: stat?._max.placedAt ?? null,
      };
    }),
  );
}

export async function getCustomer(id: string, restaurantId: string) {
  const customer = await prisma.customer.findFirst({
    where: { id, restaurantId, deletedAt: null },
    include: {
      orders: {
        orderBy: { placedAt: "desc" },
        take: 30,
        include: {
          table: { select: { number: true } },
          _count: { select: { items: true } },
        },
      },
      reservations: { orderBy: { reservedAt: "desc" }, take: 10, include: { table: true } },
    },
  });
  if (!customer) return null;

  const completed = customer.orders.filter((o) => o.status === "COMPLETED");
  const aggregate = await prisma.order.aggregate({
    where: { customerId: id, status: "COMPLETED" },
    _sum: { total: true },
    _count: { _all: true },
    _avg: { total: true },
  });

  return plain({
    ...customer,
    stats: {
      totalOrders: aggregate._count._all,
      totalSpend: Number(aggregate._sum.total ?? 0),
      averageOrder: Number(aggregate._avg.total ?? 0),
      lastOrderAt: completed[0]?.placedAt ?? null,
    },
  });
}

/** Type-ahead used by the POS customer picker. */
export async function searchCustomers(restaurantId: string, query: string, limit = 8) {
  if (!query.trim()) return [];
  const customers = await prisma.customer.findMany({
    where: {
      restaurantId,
      deletedAt: null,
      OR: [
        { name: { contains: query, mode: "insensitive" } },
        { phone: { contains: query, mode: "insensitive" } },
      ],
    },
    select: { id: true, name: true, phone: true, email: true, address: true },
    orderBy: { name: "asc" },
    take: limit,
  });
  return plain(customers);
}

import "server-only";

import { prisma } from "@/lib/prisma";
import { plain } from "@/lib/serialize";

export async function getNotifications(restaurantId: string, limit = 12) {
  const [items, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { restaurantId },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    prisma.notification.count({ where: { restaurantId, isRead: false } }),
  ]);
  return { items: plain(items), unread };
}

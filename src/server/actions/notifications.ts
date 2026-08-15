"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/server/auth/session";

export async function markNotificationRead(id: string): Promise<void> {
  const user = await requireUser();
  await prisma.notification.updateMany({
    where: { id, restaurantId: user.restaurantId },
    data: { isRead: true },
  });
  revalidatePath("/", "layout");
}

export async function markAllNotificationsRead(): Promise<void> {
  const user = await requireUser();
  await prisma.notification.updateMany({
    where: { restaurantId: user.restaurantId, isRead: false },
    data: { isRead: true },
  });
  revalidatePath("/", "layout");
}

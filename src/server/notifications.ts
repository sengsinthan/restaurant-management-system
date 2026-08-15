import "server-only";

import { prisma } from "@/lib/prisma";
import type { NotificationType } from "@/generated/prisma/enums";
import { publish } from "./events";

export type NotifyInput = {
  restaurantId: string;
  type: NotificationType;
  title: string;
  message: string;
  entity?: string;
  entityId?: string;
  link?: string;
  userId?: string;
};

export async function notify(input: NotifyInput): Promise<void> {
  await prisma.notification.create({
    data: {
      restaurantId: input.restaurantId,
      type: input.type,
      title: input.title,
      message: input.message,
      entity: input.entity ?? null,
      entityId: input.entityId ?? null,
      link: input.link ?? null,
      userId: input.userId ?? null,
    },
  });
  publish("notification.created", input.restaurantId, input.entityId);
}

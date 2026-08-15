"use client";

import Link from "next/link";
import { useTransition } from "react";
import { formatDistanceToNow } from "date-fns";
import { Bell, CheckCheck, ChefHat, CreditCard, Info, Package, ShoppingCart, CalendarClock } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { markAllNotificationsRead, markNotificationRead } from "@/server/actions/notifications";
import type { NotificationType } from "@/generated/prisma/enums";
import type { Notification } from "@/generated/prisma/client";
import type { Plain } from "@/lib/serialize";
import { cn } from "@/lib/utils";

const ICONS: Record<NotificationType, typeof Bell> = {
  ORDER: ShoppingCart,
  KITCHEN: ChefHat,
  INVENTORY: Package,
  RESERVATION: CalendarClock,
  PAYMENT: CreditCard,
  SYSTEM: Info,
};

const TONES: Record<NotificationType, string> = {
  ORDER: "bg-primary/10 text-primary",
  KITCHEN: "bg-warning/15 text-warning-foreground dark:text-warning",
  INVENTORY: "bg-destructive/10 text-destructive",
  RESERVATION: "bg-info/10 text-info",
  PAYMENT: "bg-success/12 text-success",
  SYSTEM: "bg-muted text-muted-foreground",
};

export function NotificationsMenu({
  notifications,
  unreadCount,
}: {
  notifications: Plain<Notification>[];
  unreadCount: number;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
            <Bell className="size-4.5" />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] leading-4 font-semibold text-white">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </Button>
        }
      />
      <PopoverContent align="end" className="w-[22rem] p-0">
        <div className="flex items-center justify-between border-b px-3 py-2.5">
          <p className="text-sm font-semibold">Notifications</p>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              disabled={pending}
              onClick={() => startTransition(() => void markAllNotificationsRead())}
            >
              <CheckCheck className="size-3.5" />
              Mark all read
            </Button>
          )}
        </div>

        <ScrollArea className="max-h-[22rem]">
          {notifications.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              Nothing needs your attention.
            </p>
          ) : (
            <ul className="divide-y">
              {notifications.map((item) => {
                const Icon = ICONS[item.type];
                const body = (
                  <div className="flex gap-2.5 px-3 py-2.5">
                    <span
                      className={cn(
                        "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg",
                        TONES[item.type],
                      )}
                    >
                      <Icon className="size-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 text-sm font-medium">
                        <span className="truncate">{item.title}</span>
                        {!item.isRead && <span className="size-1.5 shrink-0 rounded-full bg-primary" />}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{item.message}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground/75">
                        {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                );

                return (
                  <li
                    key={item.id}
                    className={cn("transition-colors hover:bg-muted/60", !item.isRead && "bg-primary/4")}
                    onClick={() => {
                      if (!item.isRead) startTransition(() => void markNotificationRead(item.id));
                    }}
                  >
                    {item.link ? <Link href={item.link}>{body}</Link> : body}
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

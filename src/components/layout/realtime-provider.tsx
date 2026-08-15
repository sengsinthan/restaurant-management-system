"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * Subscribes to `/api/events` and refreshes the current route when something
 * relevant changes elsewhere in the restaurant. Refreshes are debounced so a
 * burst of kitchen updates costs one re-render, not ten.
 */
export function RealtimeProvider() {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const source = new EventSource("/api/events");

    const scheduleRefresh = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 350);
    };

    const events = [
      "order.created",
      "order.updated",
      "order.status",
      "order.cancelled",
      "order.completed",
      "kitchen.updated",
      "table.updated",
      "payment.recorded",
      "inventory.updated",
      "reservation.updated",
      "notification.created",
    ];
    for (const name of events) source.addEventListener(name, scheduleRefresh);

    return () => {
      if (timer.current) clearTimeout(timer.current);
      for (const name of events) source.removeEventListener(name, scheduleRefresh);
      source.close();
    };
  }, [router]);

  return null;
}

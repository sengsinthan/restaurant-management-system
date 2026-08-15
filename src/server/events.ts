import "server-only";

/**
 * Restaurant event bus.
 *
 * Services publish domain events here; the SSE endpoint at `/api/events`
 * subscribes and streams them to connected clients, which revalidate the
 * affected route. The bus is deliberately a narrow interface (publish /
 * subscribe over a serialisable payload) so the in-memory implementation can
 * be swapped for Redis pub/sub or a hosted broker without touching callers.
 */

export type RestaurantEventType =
  | "order.created"
  | "order.updated"
  | "order.status"
  | "order.cancelled"
  | "order.completed"
  | "kitchen.updated"
  | "table.updated"
  | "payment.recorded"
  | "inventory.updated"
  | "reservation.updated"
  | "notification.created";

export type RestaurantEvent = {
  type: RestaurantEventType;
  restaurantId: string;
  entityId?: string;
  at: string;
  meta?: Record<string, string | number | boolean | null>;
};

type Listener = (event: RestaurantEvent) => void;

const globalForBus = globalThis as unknown as { rmsListeners?: Set<Listener> };
const listeners: Set<Listener> = (globalForBus.rmsListeners ??= new Set());

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function publish(
  type: RestaurantEventType,
  restaurantId: string,
  entityId?: string,
  meta?: RestaurantEvent["meta"],
): void {
  const event: RestaurantEvent = {
    type,
    restaurantId,
    entityId,
    at: new Date().toISOString(),
    meta,
  };
  for (const listener of listeners) {
    try {
      listener(event);
    } catch {
      // A broken subscriber must never fail the business operation.
    }
  }
}

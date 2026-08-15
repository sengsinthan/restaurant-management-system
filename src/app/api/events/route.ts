import { getSession } from "@/server/auth/session";
import { subscribe, type RestaurantEvent } from "@/server/events";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Server-sent events stream. Clients subscribe once from the app shell and
 * refresh the current route when an event affects their restaurant, which is
 * what makes the order → kitchen → waiter → payment loop feel live without
 * any polling.
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const restaurantId = session.restaurantId;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const send = (data: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(data));
        } catch {
          closed = true;
        }
      };

      send(`retry: 3000\n\n`);
      send(`event: ready\ndata: {"ok":true}\n\n`);

      const unsubscribe = subscribe((event: RestaurantEvent) => {
        if (event.restaurantId !== restaurantId) return;
        send(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      });

      // Comment frames keep proxies from dropping an idle connection.
      const heartbeat = setInterval(() => send(`: ping\n\n`), 25_000);

      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // Already closed by the platform.
        }
      };

      request.signal.addEventListener("abort", close);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

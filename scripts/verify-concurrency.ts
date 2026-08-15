/**
 * Fires N simultaneous order completions that all consume the same ingredient
 * and checks the stock ledger stayed consistent (no lost updates).
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const { createOrder } = await import("../src/server/services/orders");
  const { recordPayment } = await import("../src/server/services/payments");

  const restaurant = await prisma.restaurant.findFirstOrThrow();
  const staff = await prisma.user.findFirstOrThrow({ where: { email: "cashier@example.com" } });
  const menuItem = await prisma.menuItem.findFirstOrThrow({
    where: { restaurantId: restaurant.id, status: "AVAILABLE", recipe: { isNot: null } },
    include: { recipe: { include: { items: true } } },
  });
  const line = menuItem.recipe!.items[0];
  const before = await prisma.ingredient.findUniqueOrThrow({ where: { id: line.ingredientId } });

  const N = 8;
  const orders = [];
  for (let i = 0; i < N; i++) {
    orders.push(
      await createOrder({
        restaurantId: restaurant.id,
        staffId: staff.id,
        type: "TAKEAWAY",
        items: [{ menuItemId: menuItem.id, quantity: 1 }],
      }),
    );
  }

  // All settle at once — each completion deducts the same ingredient.
  const results = await Promise.allSettled(
    orders.map((o) =>
      recordPayment(o.id, [{ method: "CASH", amount: Number(o.total), received: Number(o.total) }], staff.id),
    ),
  );
  const settled = results.filter((r) => r.status === "fulfilled").length;
  const rejected = results.filter((r) => r.status === "rejected");

  const after = await prisma.ingredient.findUniqueOrThrow({ where: { id: line.ingredientId } });
  const expected = Number(before.quantity) - Number(line.quantity) * settled;
  const drift = Math.abs(Number(after.quantity) - expected);

  const txs = await prisma.inventoryTransaction.findMany({
    where: { orderId: { in: orders.map((o) => o.id) }, ingredientId: line.ingredientId },
    orderBy: { createdAt: "asc" },
  });

  console.log(`Ingredient: ${before.name} (${before.unit}), recipe uses ${Number(line.quantity)} per order`);
  console.log(`Concurrent completions: ${settled}/${N} settled, ${rejected.length} rejected`);
  if (rejected.length) console.log("  rejections:", rejected.slice(0, 3).map((r) => (r as PromiseRejectedResult).reason?.message));
  console.log(`Stock: ${Number(before.quantity)} → ${Number(after.quantity)} (expected ${expected})`);
  console.log(`Ledger entries written: ${txs.length}`);
  console.log(drift < 0.01 ? "PASS  no lost updates" : `FAIL  drift of ${drift}`);

  // Distinct running balances prove the writes were serialised, not interleaved.
  const balances = txs.map((t) => Number(t.quantityAfter));
  const unique = new Set(balances).size;
  console.log(
    unique === balances.length
      ? "PASS  every ledger balance is distinct (writes serialised)"
      : `FAIL  duplicate balances: ${balances.join(", ")}`,
  );

  // Clean up.
  const ids = orders.map((o) => o.id);
  await prisma.inventoryTransaction.deleteMany({ where: { orderId: { in: ids } } });
  await prisma.payment.deleteMany({ where: { orderId: { in: ids } } });
  await prisma.orderItemAddon.deleteMany({ where: { orderItem: { orderId: { in: ids } } } });
  await prisma.orderItem.deleteMany({ where: { orderId: { in: ids } } });
  await prisma.order.deleteMany({ where: { id: { in: ids } } });
  await prisma.ingredient.update({
    where: { id: line.ingredientId },
    data: { quantity: before.quantity },
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());

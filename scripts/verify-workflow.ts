/**
 * End-to-end check of the core restaurant workflow against the real database:
 *
 *   create order → kitchen statuses → payment → completion → inventory deducted
 *   → cancellation reverses stock
 *
 * Also asserts the business rules that protect the till and the stock ledger.
 * Run with: npx tsx scripts/verify-workflow.ts
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import {
  BusinessRuleError,
  cancelOrder,
  createOrder,
  updateOrderStatus,
} from "../src/server/services/orders";
import { recordPayment } from "../src/server/services/payments";
import { applyDiscount } from "../src/server/services/discounts";
import { createReservation } from "../src/server/services/reservations";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail = "") {
  if (condition) {
    passed++;
    console.log(`  PASS  ${label}${detail ? ` — ${detail}` : ""}`);
  } else {
    failed++;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

async function expectRejection(label: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    check(label, false, "expected a rejection but the call succeeded");
  } catch (error) {
    const isBusinessRule = error instanceof BusinessRuleError;
    check(label, isBusinessRule, isBusinessRule ? (error as Error).message : String(error));
  }
}

async function main() {
  const restaurant = await prisma.restaurant.findFirstOrThrow();
  const staff = await prisma.user.findFirstOrThrow({ where: { email: "cashier@example.com" } });
  const admin = await prisma.user.findFirstOrThrow({
    where: { email: "admin@example.com" },
    include: { role: { include: { permissions: { include: { permission: true } } } } },
  });
  const adminSession = {
    id: admin.id,
    name: admin.name,
    email: admin.email,
    avatarUrl: null,
    role: admin.role.name,
    roleLabel: admin.role.label,
    restaurantId: restaurant.id,
    permissions: admin.role.permissions.map((rp) => rp.permission.key),
  };

  const table = await prisma.restaurantTable.findFirstOrThrow({
    where: { restaurantId: restaurant.id, status: "AVAILABLE", deletedAt: null },
  });

  // A menu item that actually consumes ingredients, so we can watch stock move.
  const menuItem = await prisma.menuItem.findFirstOrThrow({
    where: { restaurantId: restaurant.id, status: "AVAILABLE", recipe: { isNot: null } },
    include: { recipe: { include: { items: true } }, variants: true },
  });
  const recipeLine = menuItem.recipe!.items[0];
  const before = await prisma.ingredient.findUniqueOrThrow({ where: { id: recipeLine.ingredientId } });

  console.log("\n1. Order creation");
  const order = await createOrder({
    restaurantId: restaurant.id,
    staffId: staff.id,
    type: "DINE_IN",
    tableId: table.id,
    guestCount: 2,
    items: [{ menuItemId: menuItem.id, quantity: 2, notes: "workflow test" }],
  });
  check("order created with a number", !!order.orderNumber, order.orderNumber);
  check("status starts PENDING", order.status === "PENDING");
  check("payment starts UNPAID", order.paymentStatus === "UNPAID");

  const expectedSubtotal = Number(menuItem.price) * 2;
  check(
    "subtotal priced from the live menu",
    Math.abs(Number(order.subtotal) - expectedSubtotal) < 0.005,
    `${Number(order.subtotal)} vs ${expectedSubtotal}`,
  );

  const taxable = Number(order.subtotal) - Number(order.discountTotal);
  const expectedTotal =
    Math.round(
      (taxable +
        (taxable * Number(order.taxRate)) / 100 +
        (taxable * Number(order.serviceChargeRate)) / 100 +
        Number.EPSILON) *
        100,
    ) / 100;
  check(
    "total = subtotal + tax + service charge",
    Math.abs(Number(order.total) - expectedTotal) < 0.02,
    `${Number(order.total)} vs ${expectedTotal}`,
  );

  const tableAfter = await prisma.restaurantTable.findUniqueOrThrow({ where: { id: table.id } });
  check("table became OCCUPIED", tableAfter.status === "OCCUPIED");

  console.log("\n2. Business rules on an unpaid order");
  await expectRejection("cannot complete an unpaid order", () =>
    updateOrderStatus(order.id, "COMPLETED", staff.id),
  );
  await expectRejection("cannot skip PENDING → READY", () =>
    updateOrderStatus(order.id, "READY", staff.id),
  );

  console.log("\n3. Kitchen flow");
  await updateOrderStatus(order.id, "PREPARING", staff.id);
  await updateOrderStatus(order.id, "READY", staff.id);
  await updateOrderStatus(order.id, "SERVED", staff.id);
  const served = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
  check("advanced to SERVED", served.status === "SERVED");
  check("kitchen timestamp recorded", served.kitchenAt !== null);
  check("ready timestamp recorded", served.readyAt !== null);
  check("inventory not yet deducted", served.inventoryDeducted === false);

  console.log("\n4. Discounts");
  const discountResult = await applyDiscount(
    order.id,
    { kind: "manual", type: "PERCENTAGE", value: 10, label: "Workflow 10%" },
    adminSession as never,
  );
  const discounted = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
  check(
    "discount reduced the total",
    Number(discounted.total) < Number(served.total),
    `${Number(served.total)} → ${Number(discounted.total)}`,
  );
  check(
    "discount amount is 10% of subtotal",
    Math.abs(Number(discounted.discountTotal) - Number(discounted.subtotal) * 0.1) < 0.02,
    String(discountResult.amount),
  );

  console.log("\n5. Payment validation");
  await expectRejection("cannot overpay beyond the outstanding balance", () =>
    recordPayment(order.id, [{ method: "CARD", amount: Number(discounted.total) + 50, reference: "X" }], staff.id),
  );
  await expectRejection("card payment requires a reference", () =>
    recordPayment(order.id, [{ method: "CARD", amount: 1 }], staff.id),
  );

  console.log("\n6. Split payment and completion");
  const total = Number(discounted.total);
  const firstHalf = Math.round((total / 2 + Number.EPSILON) * 100) / 100;
  const secondHalf = Math.round((total - firstHalf + Number.EPSILON) * 100) / 100;

  const partial = await recordPayment(
    order.id,
    [{ method: "CASH", amount: firstHalf, received: firstHalf }],
    staff.id,
  );
  check("partial payment does not complete the order", partial.completed === false);
  const partiallyPaid = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
  check("payment status is PARTIALLY_PAID", partiallyPaid.paymentStatus === "PARTIALLY_PAID");

  const settled = await recordPayment(
    order.id,
    [{ method: "QR", amount: secondHalf, reference: "QR-TEST-1" }],
    staff.id,
  );
  check("second tender settles the order", settled.completed === true);

  const completed = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
  check("order is COMPLETED", completed.status === "COMPLETED");
  check("order is PAID", completed.paymentStatus === "PAID");
  check(
    "paid total matches order total",
    Math.abs(Number(completed.paidTotal) - Number(completed.total)) < 0.005,
  );
  check("split payment recorded two tenders", (await prisma.payment.count({ where: { orderId: order.id } })) === 2);

  console.log("\n7. Inventory deduction");
  check("order marked as inventory deducted", completed.inventoryDeducted === true);
  const afterDeduct = await prisma.ingredient.findUniqueOrThrow({ where: { id: recipeLine.ingredientId } });
  const expectedUsage = Number(recipeLine.quantity) * 2;
  check(
    "ingredient stock fell by the recipe amount",
    Math.abs(Number(before.quantity) - Number(afterDeduct.quantity) - expectedUsage) < 0.01,
    `${Number(before.quantity)} → ${Number(afterDeduct.quantity)} (expected -${expectedUsage})`,
  );
  const deductionTx = await prisma.inventoryTransaction.findFirst({
    where: { orderId: order.id, type: "SALE_DEDUCTION", ingredientId: recipeLine.ingredientId },
  });
  check("SALE_DEDUCTION ledger entry written", !!deductionTx);
  check(
    "ledger balance matches the ingredient row",
    !!deductionTx && Math.abs(Number(deductionTx.quantityAfter) - Number(afterDeduct.quantity)) < 0.01,
  );

  console.log("\n8. Completed orders are locked");
  await expectRejection("cannot cancel a paid, completed order", () =>
    cancelOrder(order.id, "should be refused", staff.id),
  );

  console.log("\n9. Cancellation reverses stock");
  const order2 = await createOrder({
    restaurantId: restaurant.id,
    staffId: staff.id,
    type: "TAKEAWAY",
    items: [{ menuItemId: menuItem.id, quantity: 1 }],
  });
  await recordPayment(
    order2.id,
    [{ method: "CASH", amount: Number(order2.total), received: Number(order2.total) }],
    staff.id,
  );
  const stockAfterOrder2 = await prisma.ingredient.findUniqueOrThrow({
    where: { id: recipeLine.ingredientId },
  });

  // Unpick the payment so the order can legitimately be cancelled.
  await prisma.payment.updateMany({ where: { orderId: order2.id }, data: { state: "VOIDED" } });
  await prisma.order.update({ where: { id: order2.id }, data: { paidTotal: 0 } });
  await cancelOrder(order2.id, "workflow reversal test", staff.id);

  const reversed = await prisma.order.findUniqueOrThrow({ where: { id: order2.id } });
  check("order is CANCELLED", reversed.status === "CANCELLED");
  check("inventoryDeducted reset to false", reversed.inventoryDeducted === false);

  const stockAfterCancel = await prisma.ingredient.findUniqueOrThrow({
    where: { id: recipeLine.ingredientId },
  });
  check(
    "stock returned on cancellation",
    Math.abs(
      Number(stockAfterCancel.quantity) -
        Number(stockAfterOrder2.quantity) -
        Number(recipeLine.quantity),
    ) < 0.01,
    `${Number(stockAfterOrder2.quantity)} → ${Number(stockAfterCancel.quantity)}`,
  );
  const reversalTx = await prisma.inventoryTransaction.findFirst({
    where: { orderId: order2.id, type: "SALE_REVERSAL" },
  });
  check("SALE_REVERSAL ledger entry written", !!reversalTx);

  console.log("\n10. Unavailable items cannot be ordered");
  const unavailable = await prisma.menuItem.findFirst({
    where: { restaurantId: restaurant.id, status: "UNAVAILABLE", deletedAt: null },
  });
  if (unavailable) {
    await expectRejection("cannot order an unavailable item", () =>
      createOrder({
        restaurantId: restaurant.id,
        staffId: staff.id,
        type: "TAKEAWAY",
        items: [{ menuItemId: unavailable.id, quantity: 1 }],
      }),
    );
  }

  console.log("\n11. Reservations cannot be double-booked");
  const resTable = await prisma.restaurantTable.findFirstOrThrow({
    where: { restaurantId: restaurant.id, deletedAt: null, capacity: { gte: 4 } },
  });
  const slot = new Date(Date.now() + 30 * 86400000);
  slot.setHours(19, 0, 0, 0);

  const res1 = await createReservation({
    restaurantId: restaurant.id,
    tableId: resTable.id,
    guestName: "Workflow Test",
    guestPhone: "+1 555 9999",
    reservedAt: slot,
    durationMin: 90,
    guests: 4,
    status: "CONFIRMED",
  });
  check("first reservation created", !!res1.id);

  await expectRejection("overlapping reservation on the same table is refused", () =>
    createReservation({
      restaurantId: restaurant.id,
      tableId: resTable.id,
      guestName: "Clashing Guest",
      guestPhone: "+1 555 8888",
      reservedAt: new Date(slot.getTime() + 30 * 60000),
      durationMin: 90,
      guests: 4,
      status: "CONFIRMED",
    }),
  );

  await expectRejection("booking more guests than the table seats is refused", () =>
    createReservation({
      restaurantId: restaurant.id,
      tableId: resTable.id,
      guestName: "Too Many",
      guestPhone: "+1 555 7777",
      reservedAt: new Date(slot.getTime() + 5 * 3600000),
      durationMin: 60,
      guests: resTable.capacity + 10,
      status: "CONFIRMED",
    }),
  );

  console.log("\n12. Audit trail");
  const auditCount = await prisma.auditLog.count();
  check("audit log has entries", auditCount > 0, `${auditCount} rows`);

  // --- Clean up the rows this run created -------------------------------
  await prisma.reservation.deleteMany({ where: { guestPhone: "+1 555 9999" } });
  await prisma.inventoryTransaction.deleteMany({ where: { orderId: { in: [order.id, order2.id] } } });
  await prisma.payment.deleteMany({ where: { orderId: { in: [order.id, order2.id] } } });
  await prisma.orderDiscount.deleteMany({ where: { orderId: { in: [order.id, order2.id] } } });
  await prisma.orderItemAddon.deleteMany({
    where: { orderItem: { orderId: { in: [order.id, order2.id] } } },
  });
  await prisma.orderItem.deleteMany({ where: { orderId: { in: [order.id, order2.id] } } });
  await prisma.order.deleteMany({ where: { id: { in: [order.id, order2.id] } } });
  await prisma.restaurantTable.update({
    where: { id: table.id },
    data: { status: "AVAILABLE", occupiedAt: null },
  });
  // Restore the stock this run consumed so the seeded data stays coherent.
  await prisma.ingredient.update({
    where: { id: recipeLine.ingredientId },
    data: { quantity: before.quantity },
  });

  console.log(`\n${"=".repeat(60)}`);
  console.log(`${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

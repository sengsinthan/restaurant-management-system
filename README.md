# Restaurant Management System

A working point-of-sale and back-office platform for a restaurant — POS, kitchen
display, table floor plan, menu and recipe management, inventory with a real
stock ledger, customers, reservations, payments, staff RBAC and reporting.

Built with **Next.js (App Router)**, **TypeScript**, **shadcn/ui**, **Tailwind
CSS**, **PostgreSQL** and **Prisma**. No other frameworks.

---

## Screenshots

### Dashboard

Trading figures for the selected period — revenue, ticket count, average order
and kitchen queue, with sales and order charts, the latest tickets, best
sellers and ingredients that need a reorder.

![Dashboard](docs/Dashboard.png)

### POS

Menu grid with category filters and SKU search on the left, the running ticket
on the right. Pick dine-in, takeaway or delivery, attach a table, guest count
and customer, then send to the kitchen or charge. Tax and service are computed
as the ticket builds.

![POS](docs/POS.png)

### Kitchen display

Live tickets in four columns — New, Preparing, Ready, Served — advanced one
click at a time. Each card shows the table, item quantities, modifiers and
kitchen notes, with an age timer that turns amber past 12 minutes and red past
20. Updates arrive over SSE.

![Kitchen display](docs/Kitchen.png)

### Floor plan

Every table by zone with its status — available, occupied, reserved, cleaning
or out of service — plus seat count, the open order number, how long the party
has been seated and the running bill.

![Floor plan](docs/Tables.png)

---

## Running it

```bash
npm install
npm run db:up        # starts PostgreSQL 16 via docker compose
npm run db:migrate   # applies migrations, creates the `restaurant` database
npm run db:seed      # 45 days of realistic trading data
npm run dev          # http://localhost:3000
```

`.env` holds two variables:

```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/restaurant?schema=public"
AUTH_SECRET="…at least 32 characters…"
```

### Demo accounts

All use the password `password123`.

| Email                  | Role    | Can reach                                        |
| ---------------------- | ------- | ------------------------------------------------ |
| `admin@example.com`    | Admin   | Everything                                       |
| `manager@example.com`  | Manager | Dashboard, POS, orders, menu, inventory, reports |
| `cashier@example.com`  | Cashier | POS, orders, payments                            |
| `waiter@example.com`   | Waiter  | Tables, POS, orders, reservations                |
| `kitchen@example.com`  | Kitchen | Kitchen display                                  |

Signing in as each role changes the sidebar *and* the server-side guards — a
cashier who types `/settings` gets a 403 page, not a hidden button.

---

## Architecture

```
src/
├── app/
│   ├── (auth)/login/          Sign-in screen
│   ├── (app)/                 Authenticated shell: sidebar, header, SSE listener
│   │   ├── dashboard/  pos/  orders/  tables/  kitchen/
│   │   ├── menu/{categories,items}/
│   │   ├── inventory/{ingredients,stock,suppliers}/
│   │   ├── customers/  reservations/  payments/  staff/  reports/  settings/
│   └── api/events/            Server-sent events stream
├── components/
│   ├── ui/                    shadcn/ui primitives
│   ├── layout/                Sidebar, header, notifications, theme, realtime
│   └── shared/                Status badges, stat cards, date filter, selects
├── features/payments/         Cross-screen payment dialog (split tenders)
├── lib/                       Money, dates, CSV, permissions, status vocabulary
├── server/
│   ├── auth/                  Session (JWT cookie), RBAC guards
│   ├── services/              Business logic — the only place rules live
│   ├── actions/               Server actions: authorize → validate → service → audit
│   ├── audit.ts  events.ts  notifications.ts
└── prisma/                    Schema, migrations, seed
```

**The layering rule:** UI components never talk to Prisma. Pages read through
`server/services/*`; mutations go through `server/actions/*`, which always
follow the same four steps — check the permission, validate with Zod, call the
service, write the audit entry. Business rules live in services so the POS, the
order screen and the payments queue all enforce them identically.

**Serialisation.** Prisma returns `Decimal` objects, which cannot cross into
client components. Every service result passes through `lib/serialize.ts`,
which converts them to numbers with the types following along.

**Real-time.** Services publish domain events to an in-process bus
(`server/events.ts`); `/api/events` streams them as SSE and the client shell
refreshes the affected route. The bus is a two-function interface
(`publish`/`subscribe`), so swapping the in-memory implementation for Redis
pub/sub is a single-file change — no callers move.

---

## Database

PostgreSQL, 25 tables, UUID v7 primary keys, foreign keys, indexes on every
lookup path, unique constraints (`restaurant_id + sku`, `restaurant_id + phone`,
order numbers), `created_at`/`updated_at` everywhere, and `deleted_at` soft
deletes on catalogue and people records so historical orders stay attributable.

```
users · roles · permissions · role_permissions
restaurants · restaurant_tables
menu_categories · menu_items · menu_item_variants · menu_item_addons
ingredients · recipes · recipe_items · inventory_transactions · suppliers
customers · reservations
orders · order_items · order_item_addons
payments · discounts · order_discounts
notifications · audit_logs
```

Money is `Decimal(12,2)`; quantities are `Decimal(14,3)`. Financial and
inventory operations run inside `prisma.$transaction`.

---

## Business rules

Enforced in the service layer and verified by `npm run verify:workflow`:

- Unavailable or hidden items cannot be ordered; prices always come from the
  database, never from the client.
- Order status follows a declared transition map — no skipping from pending
  straight to ready.
- An order cannot be completed while any balance is outstanding.
- Payments cannot exceed the outstanding balance; card, QR and transfer tenders
  require a reference; only cash produces change.
- Split payments are several tenders in one transaction; the order settles when
  they cover the total.
- **Completing an order deducts its recipe ingredients in the same
  transaction** that marks it paid, with a `SELECT … FOR UPDATE` row lock on
  each ingredient so concurrent completions cannot lose an update.
- Cancelling an order that already deducted stock writes a `SALE_REVERSAL` and
  returns the quantity.
- A paid, completed order must be refunded before it can be cancelled.
- Discounts apply until a bill is settled, are capped at the order subtotal,
  cannot drop the total below what has already been paid, and need the
  `discounts.approve` permission above the restaurant's threshold (default 20%).
- Reservations cannot double-book a table for overlapping times, or seat more
  guests than the table holds.
- Price changes, cancellations, stock movements, payments, refunds, discounts
  and staff changes are all written to `audit_logs`.

### Verification

```bash
npm run typecheck           # tsc --noEmit
npm run build               # production build
npm run verify:workflow     # 37 assertions across the full order lifecycle
npm run verify:concurrency  # 8 simultaneous completions, checks for lost updates
npm run verify:routes       # fetches every route as a signed-in user
```

`verify:routes` accepts `SMOKE_USER=cashier@example.com` to check that RBAC
returns 403 for screens a role shouldn't reach.

---

## The core workflow

```
Waiter/Cashier → POS → order created (PENDING)
                          ↓ SSE
                   Kitchen display (NEW)
                          ↓ one click
                     PREPARING → READY
                          ↓
                       SERVED
                          ↓
              Payment (cash / card / QR / transfer / split)
                          ↓ same transaction
             COMPLETED + inventory deducted + ledger written
                          ↓
                 Dashboard and reports update
```

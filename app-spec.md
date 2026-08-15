# Restaurant Management System

Build a modern, production-ready **Restaurant Management System** using:

* **Next.js** — App Router
* **TypeScript**
* **shadcn/ui**
* **Tailwind CSS**
* **PostgreSQL**
* Use a clean ORM/database layer such as **Prisma** if needed

Do not introduce unnecessary frameworks or technologies.

The application should be responsive and work well on desktop, tablet, and mobile.

---

## 1. Goal

Build a complete restaurant management system that supports:

* Restaurant dashboard
* POS
* Table management
* Menu management
* Order management
* Kitchen management
* Inventory
* Customers
* Reservations
* Payments
* Staff management
* Reports
* Settings

The UI should feel like a real commercial restaurant application, not a basic CRUD demo.

---

# 2. Dashboard

Create a modern dashboard with:

* Today's revenue
* Today's orders
* Average order value
* Active tables
* Available tables
* Pending kitchen orders
* Low-stock items
* Best-selling items
* Recent orders
* Sales chart
* Orders chart

Date filters:

* Today
* Yesterday
* This week
* This month
* Custom range

Use shadcn/ui cards, charts, tables, badges, and tooltips.

---

# 3. POS

Create a fast and easy-to-use POS screen.

### Layout

**Left side**

* Search menu
* Categories
* Menu item cards
* Item image
* Item name
* Price
* Availability

**Right side**

* Current order
* Selected items
* Quantity controls
* Remove item
* Item notes
* Discount
* Tax
* Service charge
* Subtotal
* Total
* Payment button

Order types:

* Dine-in
* Takeaway
* Delivery

For dine-in:

```text
Select Table
```

Allow staff to quickly create an order with minimal clicks.

---

# 4. Orders

Create an order management page.

Order information:

* Order number
* Table
* Customer
* Staff
* Order type
* Items
* Quantity
* Notes
* Subtotal
* Discount
* Tax
* Service charge
* Total
* Payment status
* Order status
* Created date

Order statuses:

```text
Pending
Confirmed
Preparing
Ready
Served
Completed
Cancelled
```

Add filters:

* Status
* Order type
* Payment status
* Date
* Table

---

# 5. Table Management

Create a visual restaurant table layout.

Each table should show:

* Table number
* Capacity
* Status
* Current order
* Total amount
* Occupied duration

Statuses:

```text
Available
Occupied
Reserved
Cleaning
Out of Service
```

Use visual cards rather than only a table/grid.

Clicking a table should open its details.

Actions:

* Create order
* View order
* Transfer table
* Merge tables
* Mark available
* Reserve table

---

# 6. Kitchen Display System

Create a dedicated Kitchen Display System.

Use a Kanban-style interface:

```text
NEW
↓
PREPARING
↓
READY
↓
COMPLETED
```

Each order card should show:

* Order number
* Table
* Order type
* Order time
* Items
* Quantity
* Notes
* Priority
* Preparation duration

Highlight orders that have been waiting too long.

Kitchen staff should be able to update status with one click.

---

# 7. Menu Management

Create:

### Categories

Examples:

```text
Appetizers
Main Course
Rice
Noodles
Drinks
Desserts
Specials
```

### Menu Items

Fields:

* Name
* Description
* Image
* Category
* Price
* Cost
* SKU
* Status
* Preparation time

Statuses:

```text
Available
Unavailable
Hidden
```

Support item variants.

Example:

```text
Pizza

Small   $5
Medium  $7
Large   $9
```

Support add-ons:

```text
Extra Cheese
Extra Meat
Egg
Sauce
```

---

# 8. Inventory

Create inventory management.

Inventory item:

* Name
* SKU
* Category
* Unit
* Current quantity
* Minimum quantity
* Cost
* Supplier
* Expiration date

Actions:

* Stock in
* Stock out
* Adjustment
* Transfer
* View history

Show alerts:

```text
Low Stock
Out of Stock
Expiring Soon
```

---

# 9. Recipe Management

Allow each menu item to have ingredients.

Example:

```text
Chicken Burger

Chicken       150g
Burger Bun    1
Lettuce       30g
Tomato        20g
Sauce         15ml
```

When an order is completed, deduct the required ingredients from inventory.

Make inventory deduction transactional so stock cannot become inconsistent.

---

# 10. Customers

Customer management page.

Fields:

* Name
* Phone
* Email
* Address
* Notes

Display:

* Total orders
* Total spending
* Last order
* Order history

Allow searching customers from the POS.

---

# 11. Reservations

Create a reservation system.

Fields:

* Customer
* Phone
* Date
* Time
* Number of guests
* Table
* Status
* Notes

Statuses:

```text
Pending
Confirmed
Seated
Completed
Cancelled
No Show
```

Provide:

* Calendar view
* List view

Prevent double-booking tables.

---

# 12. Payments

Support:

```text
Cash
Card
QR Payment
Bank Transfer
Other
```

Payment screen should show:

* Order total
* Amount received
* Change
* Payment method
* Transaction reference

Support split payments.

Example:

```text
Total: $50

Cash: $20
QR:   $30
```

Payment must be validated against the order total.

---

# 13. Discounts

Support:

* Percentage discount
* Fixed discount
* Coupon
* Promotion

Example:

```text
10% OFF
$5 OFF
```

Large discounts should require appropriate permission.

---

# 14. Staff

Create staff management.

Fields:

* Name
* Email
* Phone
* Role
* Status
* Branch
* Hire date

Roles:

```text
Admin
Manager
Cashier
Waiter
Kitchen
```

Implement role-based access control.

---

# 15. Reports

Create reports for:

### Sales

* Daily sales
* Weekly sales
* Monthly sales
* Custom date range

### Products

* Best sellers
* Worst sellers
* Quantity sold
* Revenue

### Payments

* Cash
* Card
* QR
* Bank transfer

### Inventory

* Stock movement
* Current stock
* Inventory value
* Waste

### Staff

* Orders handled
* Sales generated

Allow CSV/Excel export where practical.

---

# 16. Authentication & Authorization

Implement secure authentication.

Users should only see features they have permission to access.

Example:

```text
Admin
→ Everything

Manager
→ Dashboard
→ POS
→ Orders
→ Menu
→ Inventory
→ Reports

Cashier
→ POS
→ Orders
→ Payments

Waiter
→ Tables
→ POS
→ Orders

Kitchen
→ Kitchen Display
```

Never rely only on frontend authorization. Validate permissions on the server as well.

---

# 17. PostgreSQL Database

Design a proper relational PostgreSQL database.

At minimum, create tables/models for:

```text
users
roles
permissions

restaurant
tables

menu_categories
menu_items
menu_item_variants
menu_item_addons

ingredients
recipes
recipe_items
inventory_transactions
suppliers

customers
reservations

orders
order_items

payments
discounts

notifications
audit_logs
```

Use:

* UUID primary keys
* Foreign keys
* Indexes
* Unique constraints
* created_at
* updated_at
* Soft delete where appropriate

Make financial and inventory operations transactional.

---

# 18. UI/UX

Use **shadcn/ui** throughout the application.

Components should include:

* Button
* Card
* Dialog
* Sheet
* Dropdown
* Select
* Tabs
* Table
* Badge
* Input
* Form
* Toast
* Alert
* Tooltip
* Command
* Calendar
* Date picker

Use Lucide icons.

Design principles:

* Clean
* Fast
* Professional
* Minimal
* Easy to scan
* Touch-friendly

Avoid excessive animations and unnecessary visual effects.

---

# 19. Application Layout

Use a sidebar layout:

```text
Dashboard

POS
Orders
Tables
Kitchen

Menu
  Categories
  Items

Inventory
  Ingredients
  Stock
  Suppliers

Customers
Reservations

Staff

Reports

Settings
```

Add:

* User profile menu
* Notifications
* Restaurant selector if multi-branch support is implemented
* Dark/light mode

---

# 20. Real-Time Behavior

Design the application so important restaurant events can update in real time.

Examples:

```text
New Order
      ↓
Kitchen receives order

Kitchen marks Ready
      ↓
Waiter sees Ready

Waiter completes order
      ↓
Order becomes Completed

Completed order
      ↓
Inventory is updated
```

Keep the architecture flexible so WebSocket/SSE functionality can be added without rewriting the application.

---

# 21. Audit Log

Record important actions:

```text
User
Action
Entity
Previous Value
New Value
Timestamp
```

Examples:

```text
Admin changed menu price
Cashier created order
Manager cancelled order
Manager adjusted inventory
Cashier processed payment
```

---

# 22. Important Business Rules

Implement proper validation.

Examples:

* Cannot order unavailable items.
* Cannot reserve an occupied table.
* Cannot double-book a table.
* Cannot complete an order without valid payment.
* Payment cannot exceed/underpay the order unless explicitly handling change.
* Completed orders cannot be freely modified.
* Cancelled orders should correctly reverse inventory changes if inventory was already deducted.
* Inventory deduction must be atomic.
* Discount permissions must be enforced.
* Important changes must be recorded in audit logs.

---

# 23. Folder Structure

Use a scalable Next.js structure similar to:

```text
src/
├── app/
│   ├── (auth)/
│   ├── dashboard/
│   ├── pos/
│   ├── orders/
│   ├── tables/
│   ├── kitchen/
│   ├── menu/
│   ├── inventory/
│   ├── customers/
│   ├── reservations/
│   ├── staff/
│   ├── reports/
│   └── settings/
│
├── components/
│   ├── ui/
│   ├── layout/
│   └── shared/
│
├── features/
│   ├── orders/
│   ├── menu/
│   ├── inventory/
│   ├── customers/
│   └── reservations/
│
├── lib/
├── server/
├── types/
└── prisma/
```

Keep business logic separate from UI components.

---

# 24. Seed Data

Create realistic seed data.

Include:

* Restaurant
* 15–20 tables
* Menu categories
* 30+ menu items
* Ingredients
* Recipes
* Customers
* Staff
* Reservations
* Orders
* Payments

Create demo users:

```text
admin@example.com
manager@example.com
cashier@example.com
waiter@example.com
kitchen@example.com
```

---

# 25. Development Instructions

Do not build a static mockup.

The application must have:

* Real PostgreSQL persistence
* Real CRUD operations
* Real validation
* Real authentication
* Real authorization
* Real order workflow
* Real payment records
* Real inventory records

Avoid hardcoded application data except for seed/demo data.

Before implementing, first:

1. Analyze the requirements.
2. Propose the database schema.
3. Propose the application architecture.
4. Propose the folder structure.
5. Identify important business rules.
6. Then begin implementation.

Build the system incrementally and make sure the application remains runnable after each major feature.

The most important workflow is:

```text
Customer
   ↓
Waiter / Cashier
   ↓
Create Order
   ↓
Kitchen
   ↓
Preparing
   ↓
Ready
   ↓
Served
   ↓
Payment
   ↓
Completed
   ↓
Inventory Updated
   ↓
Reports Updated
```

The final result should look and behave like a **real-world restaurant POS and management platform**, with a polished shadcn/ui interface and a reliable PostgreSQL backend.

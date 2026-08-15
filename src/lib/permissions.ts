/**
 * Permission catalog. Shared by the seed script (which materialises rows in
 * `permissions` / `role_permissions`) and by the runtime RBAC guards.
 * Permissions are checked on the server for every mutation — the sidebar
 * filtering in the UI is a convenience, never the enforcement point.
 */

export const PERMISSIONS = {
  // Dashboard & reports
  DASHBOARD_VIEW: "dashboard.view",
  REPORTS_VIEW: "reports.view",
  REPORTS_EXPORT: "reports.export",

  // Point of sale & orders
  POS_USE: "pos.use",
  ORDERS_VIEW: "orders.view",
  ORDERS_CREATE: "orders.create",
  ORDERS_UPDATE: "orders.update",
  ORDERS_CANCEL: "orders.cancel",

  // Tables
  TABLES_VIEW: "tables.view",
  TABLES_MANAGE: "tables.manage",

  // Kitchen
  KITCHEN_VIEW: "kitchen.view",
  KITCHEN_UPDATE: "kitchen.update",

  // Menu
  MENU_VIEW: "menu.view",
  MENU_MANAGE: "menu.manage",

  // Inventory
  INVENTORY_VIEW: "inventory.view",
  INVENTORY_MANAGE: "inventory.manage",

  // Customers & reservations
  CUSTOMERS_VIEW: "customers.view",
  CUSTOMERS_MANAGE: "customers.manage",
  RESERVATIONS_VIEW: "reservations.view",
  RESERVATIONS_MANAGE: "reservations.manage",

  // Payments & discounts
  PAYMENTS_VIEW: "payments.view",
  PAYMENTS_PROCESS: "payments.process",
  PAYMENTS_REFUND: "payments.refund",
  DISCOUNTS_APPLY: "discounts.apply",
  DISCOUNTS_APPROVE: "discounts.approve",
  DISCOUNTS_MANAGE: "discounts.manage",

  // Staff & settings
  STAFF_VIEW: "staff.view",
  STAFF_MANAGE: "staff.manage",
  SETTINGS_VIEW: "settings.view",
  SETTINGS_MANAGE: "settings.manage",
  AUDIT_VIEW: "audit.view",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const PERMISSION_META: Record<PermissionKey, { label: string; group: string }> = {
  [PERMISSIONS.DASHBOARD_VIEW]: { label: "View dashboard", group: "Dashboard" },
  [PERMISSIONS.REPORTS_VIEW]: { label: "View reports", group: "Reports" },
  [PERMISSIONS.REPORTS_EXPORT]: { label: "Export reports", group: "Reports" },
  [PERMISSIONS.POS_USE]: { label: "Use POS", group: "Point of sale" },
  [PERMISSIONS.ORDERS_VIEW]: { label: "View orders", group: "Orders" },
  [PERMISSIONS.ORDERS_CREATE]: { label: "Create orders", group: "Orders" },
  [PERMISSIONS.ORDERS_UPDATE]: { label: "Update orders", group: "Orders" },
  [PERMISSIONS.ORDERS_CANCEL]: { label: "Cancel orders", group: "Orders" },
  [PERMISSIONS.TABLES_VIEW]: { label: "View tables", group: "Tables" },
  [PERMISSIONS.TABLES_MANAGE]: { label: "Manage tables", group: "Tables" },
  [PERMISSIONS.KITCHEN_VIEW]: { label: "View kitchen display", group: "Kitchen" },
  [PERMISSIONS.KITCHEN_UPDATE]: { label: "Update kitchen tickets", group: "Kitchen" },
  [PERMISSIONS.MENU_VIEW]: { label: "View menu", group: "Menu" },
  [PERMISSIONS.MENU_MANAGE]: { label: "Manage menu", group: "Menu" },
  [PERMISSIONS.INVENTORY_VIEW]: { label: "View inventory", group: "Inventory" },
  [PERMISSIONS.INVENTORY_MANAGE]: { label: "Manage inventory", group: "Inventory" },
  [PERMISSIONS.CUSTOMERS_VIEW]: { label: "View customers", group: "Customers" },
  [PERMISSIONS.CUSTOMERS_MANAGE]: { label: "Manage customers", group: "Customers" },
  [PERMISSIONS.RESERVATIONS_VIEW]: { label: "View reservations", group: "Reservations" },
  [PERMISSIONS.RESERVATIONS_MANAGE]: { label: "Manage reservations", group: "Reservations" },
  [PERMISSIONS.PAYMENTS_VIEW]: { label: "View payments", group: "Payments" },
  [PERMISSIONS.PAYMENTS_PROCESS]: { label: "Process payments", group: "Payments" },
  [PERMISSIONS.PAYMENTS_REFUND]: { label: "Refund payments", group: "Payments" },
  [PERMISSIONS.DISCOUNTS_APPLY]: { label: "Apply discounts", group: "Discounts" },
  [PERMISSIONS.DISCOUNTS_APPROVE]: { label: "Approve large discounts", group: "Discounts" },
  [PERMISSIONS.DISCOUNTS_MANAGE]: { label: "Manage discounts", group: "Discounts" },
  [PERMISSIONS.STAFF_VIEW]: { label: "View staff", group: "Staff" },
  [PERMISSIONS.STAFF_MANAGE]: { label: "Manage staff", group: "Staff" },
  [PERMISSIONS.SETTINGS_VIEW]: { label: "View settings", group: "Settings" },
  [PERMISSIONS.SETTINGS_MANAGE]: { label: "Manage settings", group: "Settings" },
  [PERMISSIONS.AUDIT_VIEW]: { label: "View audit log", group: "Settings" },
};

export const ALL_PERMISSIONS = Object.values(PERMISSIONS) as PermissionKey[];

export const ROLES = {
  ADMIN: "ADMIN",
  MANAGER: "MANAGER",
  CASHIER: "CASHIER",
  WAITER: "WAITER",
  KITCHEN: "KITCHEN",
} as const;

export type RoleName = (typeof ROLES)[keyof typeof ROLES];

export const ROLE_META: Record<RoleName, { label: string; description: string }> = {
  ADMIN: { label: "Admin", description: "Full access to every part of the system" },
  MANAGER: { label: "Manager", description: "Runs the floor: dashboard, menu, inventory, reports" },
  CASHIER: { label: "Cashier", description: "POS, orders and payment processing" },
  WAITER: { label: "Waiter", description: "Tables, POS and order service" },
  KITCHEN: { label: "Kitchen", description: "Kitchen display system only" },
};

const P = PERMISSIONS;

export const ROLE_PERMISSIONS: Record<RoleName, PermissionKey[]> = {
  ADMIN: ALL_PERMISSIONS,
  MANAGER: [
    P.DASHBOARD_VIEW,
    P.REPORTS_VIEW,
    P.REPORTS_EXPORT,
    P.POS_USE,
    P.ORDERS_VIEW,
    P.ORDERS_CREATE,
    P.ORDERS_UPDATE,
    P.ORDERS_CANCEL,
    P.TABLES_VIEW,
    P.TABLES_MANAGE,
    P.KITCHEN_VIEW,
    P.KITCHEN_UPDATE,
    P.MENU_VIEW,
    P.MENU_MANAGE,
    P.INVENTORY_VIEW,
    P.INVENTORY_MANAGE,
    P.CUSTOMERS_VIEW,
    P.CUSTOMERS_MANAGE,
    P.RESERVATIONS_VIEW,
    P.RESERVATIONS_MANAGE,
    P.PAYMENTS_VIEW,
    P.PAYMENTS_PROCESS,
    P.PAYMENTS_REFUND,
    P.DISCOUNTS_APPLY,
    P.DISCOUNTS_APPROVE,
    P.DISCOUNTS_MANAGE,
    P.STAFF_VIEW,
    P.SETTINGS_VIEW,
    P.AUDIT_VIEW,
  ],
  CASHIER: [
    P.POS_USE,
    P.ORDERS_VIEW,
    P.ORDERS_CREATE,
    P.ORDERS_UPDATE,
    P.TABLES_VIEW,
    P.MENU_VIEW,
    P.CUSTOMERS_VIEW,
    P.CUSTOMERS_MANAGE,
    P.RESERVATIONS_VIEW,
    P.PAYMENTS_VIEW,
    P.PAYMENTS_PROCESS,
    P.DISCOUNTS_APPLY,
  ],
  WAITER: [
    P.POS_USE,
    P.ORDERS_VIEW,
    P.ORDERS_CREATE,
    P.ORDERS_UPDATE,
    P.TABLES_VIEW,
    P.TABLES_MANAGE,
    P.MENU_VIEW,
    P.CUSTOMERS_VIEW,
    P.RESERVATIONS_VIEW,
    P.RESERVATIONS_MANAGE,
  ],
  KITCHEN: [P.KITCHEN_VIEW, P.KITCHEN_UPDATE, P.ORDERS_VIEW, P.MENU_VIEW],
};

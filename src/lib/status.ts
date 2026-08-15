import type {
  InventoryTxType,
  MenuItemStatus,
  OrderStatus,
  OrderType,
  PaymentMethod,
  PaymentStatus,
  ReservationStatus,
  TableStatus,
  UserStatus,
} from "@/generated/prisma/enums";

/** Tailwind class sets for status pills, kept in one place so a status reads
 *  identically on the dashboard, the order list and the kitchen board. */
type Tone = string;

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: "Pending",
  CONFIRMED: "Confirmed",
  PREPARING: "Preparing",
  READY: "Ready",
  SERVED: "Served",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export const ORDER_STATUS_TONE: Record<OrderStatus, Tone> = {
  PENDING: "bg-muted text-muted-foreground border-border",
  CONFIRMED: "bg-info/10 text-info border-info/25",
  PREPARING: "bg-warning/15 text-warning-foreground dark:text-warning border-warning/30",
  READY: "bg-success/12 text-success border-success/30",
  SERVED: "bg-primary/10 text-primary border-primary/25",
  COMPLETED: "bg-success/15 text-success border-success/30",
  CANCELLED: "bg-destructive/10 text-destructive border-destructive/25",
};

/** Legal forward transitions — enforced server-side in the order service. */
export const ORDER_STATUS_FLOW: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ["CONFIRMED", "PREPARING", "CANCELLED"],
  CONFIRMED: ["PREPARING", "CANCELLED"],
  PREPARING: ["READY", "CANCELLED"],
  READY: ["SERVED", "CANCELLED"],
  SERVED: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export const ORDER_TYPE_LABEL: Record<OrderType, string> = {
  DINE_IN: "Dine-in",
  TAKEAWAY: "Takeaway",
  DELIVERY: "Delivery",
};

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  UNPAID: "Unpaid",
  PARTIALLY_PAID: "Partially paid",
  PAID: "Paid",
  REFUNDED: "Refunded",
};

export const PAYMENT_STATUS_TONE: Record<PaymentStatus, Tone> = {
  UNPAID: "bg-destructive/10 text-destructive border-destructive/25",
  PARTIALLY_PAID: "bg-warning/15 text-warning-foreground dark:text-warning border-warning/30",
  PAID: "bg-success/15 text-success border-success/30",
  REFUNDED: "bg-muted text-muted-foreground border-border",
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: "Cash",
  CARD: "Card",
  QR: "QR Payment",
  BANK_TRANSFER: "Bank Transfer",
  OTHER: "Other",
};

export const TABLE_STATUS_LABEL: Record<TableStatus, string> = {
  AVAILABLE: "Available",
  OCCUPIED: "Occupied",
  RESERVED: "Reserved",
  CLEANING: "Cleaning",
  OUT_OF_SERVICE: "Out of Service",
};

export const TABLE_STATUS_TONE: Record<TableStatus, Tone> = {
  AVAILABLE: "bg-success/12 text-success border-success/30",
  OCCUPIED: "bg-primary/12 text-primary border-primary/30",
  RESERVED: "bg-info/12 text-info border-info/30",
  CLEANING: "bg-warning/15 text-warning-foreground dark:text-warning border-warning/30",
  OUT_OF_SERVICE: "bg-muted text-muted-foreground border-border",
};

/** Card treatment for the floor plan — stronger than the pill tones. */
export const TABLE_CARD_TONE: Record<TableStatus, string> = {
  AVAILABLE: "border-success/35 bg-success/5 hover:border-success/60",
  OCCUPIED: "border-primary/45 bg-primary/8 hover:border-primary/70",
  RESERVED: "border-info/40 bg-info/6 hover:border-info/65",
  CLEANING: "border-warning/45 bg-warning/8 hover:border-warning/70",
  OUT_OF_SERVICE: "border-border bg-muted/50 opacity-70 hover:opacity-100",
};

export const RESERVATION_STATUS_LABEL: Record<ReservationStatus, string> = {
  PENDING: "Pending",
  CONFIRMED: "Confirmed",
  SEATED: "Seated",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  NO_SHOW: "No Show",
};

export const RESERVATION_STATUS_TONE: Record<ReservationStatus, Tone> = {
  PENDING: "bg-muted text-muted-foreground border-border",
  CONFIRMED: "bg-info/12 text-info border-info/30",
  SEATED: "bg-primary/12 text-primary border-primary/30",
  COMPLETED: "bg-success/15 text-success border-success/30",
  CANCELLED: "bg-destructive/10 text-destructive border-destructive/25",
  NO_SHOW: "bg-warning/15 text-warning-foreground dark:text-warning border-warning/30",
};

export const MENU_STATUS_LABEL: Record<MenuItemStatus, string> = {
  AVAILABLE: "Available",
  UNAVAILABLE: "Unavailable",
  HIDDEN: "Hidden",
};

export const MENU_STATUS_TONE: Record<MenuItemStatus, Tone> = {
  AVAILABLE: "bg-success/15 text-success border-success/30",
  UNAVAILABLE: "bg-destructive/10 text-destructive border-destructive/25",
  HIDDEN: "bg-muted text-muted-foreground border-border",
};

export const USER_STATUS_LABEL: Record<UserStatus, string> = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
  SUSPENDED: "Suspended",
};

export const USER_STATUS_TONE: Record<UserStatus, Tone> = {
  ACTIVE: "bg-success/15 text-success border-success/30",
  INACTIVE: "bg-muted text-muted-foreground border-border",
  SUSPENDED: "bg-destructive/10 text-destructive border-destructive/25",
};

export const INVENTORY_TX_LABEL: Record<InventoryTxType, string> = {
  STOCK_IN: "Stock In",
  STOCK_OUT: "Stock Out",
  ADJUSTMENT: "Adjustment",
  TRANSFER: "Transfer",
  WASTE: "Waste",
  SALE_DEDUCTION: "Sale",
  SALE_REVERSAL: "Reversal",
};

export const INVENTORY_TX_TONE: Record<InventoryTxType, Tone> = {
  STOCK_IN: "bg-success/15 text-success border-success/30",
  STOCK_OUT: "bg-destructive/10 text-destructive border-destructive/25",
  ADJUSTMENT: "bg-info/12 text-info border-info/30",
  TRANSFER: "bg-primary/10 text-primary border-primary/25",
  WASTE: "bg-warning/15 text-warning-foreground dark:text-warning border-warning/30",
  SALE_DEDUCTION: "bg-muted text-muted-foreground border-border",
  SALE_REVERSAL: "bg-info/12 text-info border-info/30",
};

export type StockLevel = "OUT_OF_STOCK" | "LOW_STOCK" | "EXPIRING" | "OK";

export const STOCK_LEVEL_LABEL: Record<StockLevel, string> = {
  OUT_OF_STOCK: "Out of Stock",
  LOW_STOCK: "Low Stock",
  EXPIRING: "Expiring Soon",
  OK: "In Stock",
};

export const STOCK_LEVEL_TONE: Record<StockLevel, Tone> = {
  OUT_OF_STOCK: "bg-destructive/10 text-destructive border-destructive/25",
  LOW_STOCK: "bg-warning/15 text-warning-foreground dark:text-warning border-warning/30",
  EXPIRING: "bg-info/12 text-info border-info/30",
  OK: "bg-success/15 text-success border-success/30",
};

export function stockLevel(
  quantity: number,
  minQuantity: number,
  expiresAt: Date | string | null,
): StockLevel {
  if (quantity <= 0) return "OUT_OF_STOCK";
  if (quantity <= minQuantity) return "LOW_STOCK";
  if (expiresAt) {
    const days = (new Date(expiresAt).getTime() - Date.now()) / 86400000;
    if (days <= 3) return "EXPIRING";
  }
  return "OK";
}

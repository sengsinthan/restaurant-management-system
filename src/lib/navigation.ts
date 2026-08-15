import {
  BarChart3,
  BookOpen,
  Boxes,
  CalendarClock,
  ChefHat,
  ClipboardList,
  Cog,
  LayoutDashboard,
  ListTree,
  Package,
  ScanBarcode,
  ShoppingCart,
  Truck,
  UsersRound,
  UtensilsCrossed,
  Warehouse,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { PERMISSIONS, type PermissionKey } from "./permissions";

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  permission: PermissionKey;
  children?: { title: string; href: string; icon: LucideIcon; permission: PermissionKey }[];
};

export type NavSection = { label: string | null; items: NavItem[] };

export const NAVIGATION: NavSection[] = [
  {
    label: null,
    items: [
      {
        title: "Dashboard",
        href: "/dashboard",
        icon: LayoutDashboard,
        permission: PERMISSIONS.DASHBOARD_VIEW,
      },
    ],
  },
  {
    label: "Service",
    items: [
      { title: "POS", href: "/pos", icon: ScanBarcode, permission: PERMISSIONS.POS_USE },
      { title: "Orders", href: "/orders", icon: ShoppingCart, permission: PERMISSIONS.ORDERS_VIEW },
      { title: "Tables", href: "/tables", icon: UtensilsCrossed, permission: PERMISSIONS.TABLES_VIEW },
      { title: "Kitchen", href: "/kitchen", icon: ChefHat, permission: PERMISSIONS.KITCHEN_VIEW },
    ],
  },
  {
    label: "Catalogue",
    items: [
      {
        title: "Menu",
        href: "/menu",
        icon: BookOpen,
        permission: PERMISSIONS.MENU_VIEW,
        children: [
          { title: "Categories", href: "/menu/categories", icon: ListTree, permission: PERMISSIONS.MENU_VIEW },
          { title: "Items", href: "/menu/items", icon: UtensilsCrossed, permission: PERMISSIONS.MENU_VIEW },
        ],
      },
      {
        title: "Inventory",
        href: "/inventory",
        icon: Boxes,
        permission: PERMISSIONS.INVENTORY_VIEW,
        children: [
          { title: "Ingredients", href: "/inventory/ingredients", icon: Package, permission: PERMISSIONS.INVENTORY_VIEW },
          { title: "Stock", href: "/inventory/stock", icon: Warehouse, permission: PERMISSIONS.INVENTORY_VIEW },
          { title: "Suppliers", href: "/inventory/suppliers", icon: Truck, permission: PERMISSIONS.INVENTORY_VIEW },
        ],
      },
    ],
  },
  {
    label: "Guests",
    items: [
      { title: "Customers", href: "/customers", icon: UsersRound, permission: PERMISSIONS.CUSTOMERS_VIEW },
      {
        title: "Reservations",
        href: "/reservations",
        icon: CalendarClock,
        permission: PERMISSIONS.RESERVATIONS_VIEW,
      },
    ],
  },
  {
    label: "Management",
    items: [
      { title: "Staff", href: "/staff", icon: ClipboardList, permission: PERMISSIONS.STAFF_VIEW },
      { title: "Reports", href: "/reports", icon: BarChart3, permission: PERMISSIONS.REPORTS_VIEW },
      { title: "Settings", href: "/settings", icon: Cog, permission: PERMISSIONS.SETTINGS_VIEW },
    ],
  },
];

export function visibleNavigation(permissions: PermissionKey[]): NavSection[] {
  return NAVIGATION.map((section) => ({
    label: section.label,
    items: section.items
      .filter((item) => permissions.includes(item.permission))
      .map((item) => ({
        ...item,
        children: item.children?.filter((child) => permissions.includes(child.permission)),
      })),
  })).filter((section) => section.items.length > 0);
}

/** First screen a role can actually open — used after login and from "/". */
export function landingRoute(permissions: PermissionKey[]): string {
  for (const section of visibleNavigation(permissions)) {
    const first = section.items[0];
    if (first) return first.children?.[0]?.href ?? first.href;
  }
  return "/login";
}

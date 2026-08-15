export type PosVariant = { id: string; name: string; price: number; isDefault: boolean };
export type PosAddon = { id: string; name: string; price: number };

export type PosItem = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  sku: string;
  price: number;
  status: "AVAILABLE" | "UNAVAILABLE" | "HIDDEN";
  prepTimeMin: number;
  isFeatured: boolean;
  variants: PosVariant[];
  addons: PosAddon[];
};

export type PosCategory = {
  id: string;
  name: string;
  color: string | null;
  items: PosItem[];
};

export type PosTable = {
  id: string;
  number: string;
  name: string | null;
  capacity: number;
  zone: string;
  status: "AVAILABLE" | "OCCUPIED" | "RESERVED" | "CLEANING" | "OUT_OF_SERVICE";
};

export type PosDiscount = {
  id: string;
  code: string | null;
  name: string;
  type: "PERCENTAGE" | "FIXED";
  value: number;
  minOrderAmount: number;
};

/** A configured line in the working order, before it is sent to the kitchen. */
export type CartLine = {
  /** Stable key: item + variant + add-on set + note, so identical picks stack. */
  key: string;
  menuItemId: string;
  name: string;
  variantId: string | null;
  variantName: string | null;
  unitPrice: number;
  quantity: number;
  notes: string | null;
  addons: PosAddon[];
};

export function lineKey(
  menuItemId: string,
  variantId: string | null,
  addonIds: string[],
  notes: string | null,
): string {
  return [menuItemId, variantId ?? "-", [...addonIds].sort().join("+") || "-", notes?.trim() || "-"].join("|");
}

export function lineTotal(line: CartLine): number {
  const addons = line.addons.reduce((acc, a) => acc + a.price, 0);
  return Math.round(((line.unitPrice + addons) * line.quantity + Number.EPSILON) * 100) / 100;
}

import type { MenuItemStatus } from "@/generated/prisma/enums";

export type MenuItemRow = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  sku: string;
  price: number;
  cost: number;
  status: MenuItemStatus;
  prepTimeMin: number;
  isFeatured: boolean;
  categoryId: string;
  categoryName: string;
  categoryColor: string | null;
  timesOrdered: number;
  variants: { id: string; name: string; price: number; isDefault: boolean }[];
  addons: { id: string; name: string; price: number }[];
  recipe: { ingredientId: string; quantity: number; name: string; unit: string; cost: number }[];
};

export type IngredientOption = { id: string; name: string; unit: string; cost: number };

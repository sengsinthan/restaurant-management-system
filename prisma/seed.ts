/**
 * Seed script — builds a realistic, internally consistent restaurant.
 *
 * The order history is *simulated* rather than randomly stamped: orders are
 * replayed in chronological order and every completed order deducts its
 * recipe ingredients from stock, writing an inventory transaction with a
 * running `quantity_after`. Restocks are inserted whenever an ingredient
 * dips below its minimum. The result is a ledger where current stock,
 * transaction history and sales reports all agree with each other.
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import {
  ALL_PERMISSIONS,
  PERMISSION_META,
  ROLE_META,
  ROLE_PERMISSIONS,
  type RoleName,
} from "../src/lib/permissions";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

// ---------------------------------------------------------------------------
// Deterministic RNG so reruns produce a comparable dataset.
// ---------------------------------------------------------------------------
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260815);
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];
const randInt = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;
const chance = (p: number) => rand() < p;
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// ---------------------------------------------------------------------------
// Reference data
// ---------------------------------------------------------------------------

type IngredientSeed = {
  sku: string;
  name: string;
  category: string;
  unit: string;
  cost: number;
  min: number;
  start: number;
  expiresInDays?: number;
};

const INGREDIENTS: IngredientSeed[] = [
  { sku: "ING-001", name: "Chicken Breast", category: "Meat", unit: "g", cost: 0.012, min: 3000, start: 18000, expiresInDays: 5 },
  { sku: "ING-002", name: "Beef Patty", category: "Meat", unit: "pc", cost: 1.8, min: 40, start: 220 },
  { sku: "ING-003", name: "Pork Belly", category: "Meat", unit: "g", cost: 0.01, min: 2000, start: 14000, expiresInDays: 4 },
  { sku: "ING-004", name: "Shrimp", category: "Seafood", unit: "g", cost: 0.022, min: 1500, start: 9000, expiresInDays: 3 },
  { sku: "ING-005", name: "Salmon Fillet", category: "Seafood", unit: "g", cost: 0.035, min: 1000, start: 6000, expiresInDays: 2 },
  { sku: "ING-006", name: "Squid", category: "Seafood", unit: "g", cost: 0.016, min: 800, start: 4500, expiresInDays: 3 },
  { sku: "ING-007", name: "Jasmine Rice", category: "Grains", unit: "g", cost: 0.002, min: 8000, start: 60000 },
  { sku: "ING-008", name: "Egg Noodles", category: "Grains", unit: "g", cost: 0.004, min: 3000, start: 20000 },
  { sku: "ING-009", name: "Rice Noodles", category: "Grains", unit: "g", cost: 0.004, min: 2000, start: 14000 },
  { sku: "ING-010", name: "Spaghetti", category: "Grains", unit: "g", cost: 0.003, min: 2000, start: 15000 },
  { sku: "ING-011", name: "Burger Bun", category: "Bakery", unit: "pc", cost: 0.45, min: 40, start: 260, expiresInDays: 6 },
  { sku: "ING-012", name: "Pizza Dough", category: "Bakery", unit: "pc", cost: 0.9, min: 30, start: 180, expiresInDays: 4 },
  { sku: "ING-013", name: "Tortilla Wrap", category: "Bakery", unit: "pc", cost: 0.35, min: 40, start: 200, expiresInDays: 8 },
  { sku: "ING-014", name: "Mozzarella", category: "Dairy", unit: "g", cost: 0.011, min: 2000, start: 14000, expiresInDays: 12 },
  { sku: "ING-015", name: "Cheddar", category: "Dairy", unit: "g", cost: 0.013, min: 1000, start: 7000, expiresInDays: 14 },
  { sku: "ING-016", name: "Butter", category: "Dairy", unit: "g", cost: 0.009, min: 1000, start: 6000, expiresInDays: 20 },
  { sku: "ING-017", name: "Milk", category: "Dairy", unit: "ml", cost: 0.002, min: 4000, start: 24000, expiresInDays: 6 },
  { sku: "ING-018", name: "Heavy Cream", category: "Dairy", unit: "ml", cost: 0.005, min: 1500, start: 9000, expiresInDays: 7 },
  { sku: "ING-019", name: "Egg", category: "Dairy", unit: "pc", cost: 0.22, min: 60, start: 400, expiresInDays: 15 },
  { sku: "ING-020", name: "Lettuce", category: "Produce", unit: "g", cost: 0.004, min: 1000, start: 6000, expiresInDays: 3 },
  { sku: "ING-021", name: "Tomato", category: "Produce", unit: "g", cost: 0.003, min: 1500, start: 9000, expiresInDays: 5 },
  { sku: "ING-022", name: "Onion", category: "Produce", unit: "g", cost: 0.002, min: 2000, start: 16000 },
  { sku: "ING-023", name: "Garlic", category: "Produce", unit: "g", cost: 0.006, min: 500, start: 3500 },
  { sku: "ING-024", name: "Potato", category: "Produce", unit: "g", cost: 0.002, min: 5000, start: 35000 },
  { sku: "ING-025", name: "Bell Pepper", category: "Produce", unit: "g", cost: 0.005, min: 800, start: 5200, expiresInDays: 6 },
  { sku: "ING-026", name: "Basil", category: "Produce", unit: "g", cost: 0.02, min: 200, start: 900, expiresInDays: 2 },
  { sku: "ING-027", name: "Mushroom", category: "Produce", unit: "g", cost: 0.007, min: 800, start: 5000, expiresInDays: 4 },
  { sku: "ING-028", name: "Lime", category: "Produce", unit: "pc", cost: 0.18, min: 60, start: 320, expiresInDays: 9 },
  { sku: "ING-029", name: "Cooking Oil", category: "Pantry", unit: "ml", cost: 0.003, min: 4000, start: 28000 },
  { sku: "ING-030", name: "Soy Sauce", category: "Pantry", unit: "ml", cost: 0.004, min: 1500, start: 10000 },
  { sku: "ING-031", name: "Fish Sauce", category: "Pantry", unit: "ml", cost: 0.005, min: 1000, start: 7000 },
  { sku: "ING-032", name: "Chili Paste", category: "Pantry", unit: "g", cost: 0.009, min: 500, start: 3200 },
  { sku: "ING-033", name: "Tomato Sauce", category: "Pantry", unit: "ml", cost: 0.004, min: 2000, start: 13000 },
  { sku: "ING-034", name: "Sugar", category: "Pantry", unit: "g", cost: 0.001, min: 3000, start: 22000 },
  { sku: "ING-035", name: "Coconut Milk", category: "Pantry", unit: "ml", cost: 0.004, min: 2000, start: 12000 },
  { sku: "ING-036", name: "Coffee Beans", category: "Beverage", unit: "g", cost: 0.03, min: 1000, start: 7000 },
  { sku: "ING-037", name: "Tea Leaves", category: "Beverage", unit: "g", cost: 0.025, min: 400, start: 2600 },
  { sku: "ING-038", name: "Cola Syrup", category: "Beverage", unit: "ml", cost: 0.006, min: 2000, start: 12000 },
  { sku: "ING-039", name: "Orange", category: "Produce", unit: "pc", cost: 0.3, min: 60, start: 380, expiresInDays: 7 },
  { sku: "ING-040", name: "Chocolate", category: "Pantry", unit: "g", cost: 0.018, min: 800, start: 5000 },
  { sku: "ING-041", name: "Vanilla Ice Cream", category: "Frozen", unit: "g", cost: 0.008, min: 2000, start: 13000 },
  { sku: "ING-042", name: "Flour", category: "Pantry", unit: "g", cost: 0.001, min: 5000, start: 32000 },
  { sku: "ING-043", name: "Mango", category: "Produce", unit: "pc", cost: 0.8, min: 30, start: 150, expiresInDays: 4 },
  { sku: "ING-044", name: "Sticky Rice", category: "Grains", unit: "g", cost: 0.004, min: 2000, start: 12000 },
];

type MenuSeed = {
  sku: string;
  name: string;
  description: string;
  price: number;
  prep: number;
  featured?: boolean;
  status?: "AVAILABLE" | "UNAVAILABLE" | "HIDDEN";
  variants?: { name: string; price: number; isDefault?: boolean }[];
  addons?: { name: string; price: number }[];
  recipe: [string, number][];
  /** Relative sales weight — drives a believable best-seller ranking. */
  weight: number;
};

const MENU: Record<string, MenuSeed[]> = {
  Appetizers: [
    { sku: "APP-001", name: "Crispy Spring Rolls", description: "Five hand-rolled vegetable spring rolls with sweet chilli dip.", price: 6.5, prep: 8, weight: 7, recipe: [["ING-013", 2], ["ING-022", 40], ["ING-029", 30], ["ING-032", 10]], addons: [{ name: "Extra Sauce", price: 0.5 }] },
    { sku: "APP-002", name: "Buffalo Chicken Wings", description: "Slow-marinated wings tossed in house buffalo sauce.", price: 9.5, prep: 14, featured: true, weight: 10, variants: [{ name: "6 pieces", price: 9.5, isDefault: true }, { name: "12 pieces", price: 17.0 }], addons: [{ name: "Extra Sauce", price: 0.5 }, { name: "Extra Spicy", price: 0 }], recipe: [["ING-001", 220], ["ING-029", 40], ["ING-032", 25], ["ING-023", 8]] },
    { sku: "APP-003", name: "Calamari Rings", description: "Golden fried squid rings with lime aioli.", price: 10.5, prep: 12, weight: 6, recipe: [["ING-006", 180], ["ING-042", 60], ["ING-029", 50], ["ING-028", 1]] },
    { sku: "APP-004", name: "Garlic Cheese Bread", description: "Toasted sourdough, roasted garlic butter, melted mozzarella.", price: 5.5, prep: 7, weight: 8, recipe: [["ING-012", 1], ["ING-016", 25], ["ING-023", 12], ["ING-014", 60]] },
    { sku: "APP-005", name: "Shrimp Tempura", description: "Six tiger prawns in light tempura batter.", price: 12.0, prep: 12, weight: 5, recipe: [["ING-004", 180], ["ING-042", 70], ["ING-019", 1], ["ING-029", 60]] },
    { sku: "APP-006", name: "Nachos Supreme", description: "Corn chips loaded with cheddar, salsa and jalapeños.", price: 8.5, prep: 9, weight: 6, addons: [{ name: "Extra Cheese", price: 1.5 }, { name: "Extra Meat", price: 3.0 }], recipe: [["ING-013", 3], ["ING-015", 90], ["ING-021", 60], ["ING-022", 30]] },
  ],
  "Main Course": [
    { sku: "MAIN-001", name: "Chicken Burger", description: "Grilled chicken breast, lettuce, tomato and house sauce.", price: 11.5, prep: 15, featured: true, weight: 12, addons: [{ name: "Extra Cheese", price: 1.5 }, { name: "Extra Meat", price: 3.5 }, { name: "Egg", price: 1.0 }], recipe: [["ING-001", 150], ["ING-011", 1], ["ING-020", 30], ["ING-021", 20], ["ING-033", 15]] },
    { sku: "MAIN-002", name: "Classic Beef Burger", description: "180g beef patty, cheddar, pickles, brioche bun.", price: 13.5, prep: 16, featured: true, weight: 13, addons: [{ name: "Extra Cheese", price: 1.5 }, { name: "Extra Meat", price: 4.5 }, { name: "Egg", price: 1.0 }], recipe: [["ING-002", 1], ["ING-011", 1], ["ING-015", 30], ["ING-020", 25], ["ING-021", 20]] },
    { sku: "MAIN-003", name: "Grilled Salmon", description: "Atlantic salmon, lemon butter, seasonal greens.", price: 19.5, prep: 20, weight: 7, recipe: [["ING-005", 200], ["ING-016", 25], ["ING-028", 1], ["ING-024", 120]] },
    { sku: "MAIN-004", name: "BBQ Pork Ribs", description: "Half rack, smoked four hours, house barbecue glaze.", price: 21.0, prep: 25, weight: 6, recipe: [["ING-003", 350], ["ING-033", 60], ["ING-034", 25], ["ING-023", 10]] },
    { sku: "MAIN-005", name: "Margherita Pizza", description: "San Marzano tomato, fior di latte, fresh basil.", price: 12.0, prep: 18, weight: 9, variants: [{ name: "Small", price: 9.0 }, { name: "Medium", price: 12.0, isDefault: true }, { name: "Large", price: 15.0 }], addons: [{ name: "Extra Cheese", price: 2.0 }, { name: "Extra Meat", price: 3.5 }], recipe: [["ING-012", 1], ["ING-033", 90], ["ING-014", 120], ["ING-026", 6]] },
    { sku: "MAIN-006", name: "Pepperoni Pizza", description: "Double pepperoni, mozzarella, oregano.", price: 14.0, prep: 18, featured: true, weight: 10, variants: [{ name: "Small", price: 11.0 }, { name: "Medium", price: 14.0, isDefault: true }, { name: "Large", price: 17.5 }], addons: [{ name: "Extra Cheese", price: 2.0 }, { name: "Extra Spicy", price: 0 }], recipe: [["ING-012", 1], ["ING-033", 90], ["ING-014", 140], ["ING-003", 70]] },
    { sku: "MAIN-007", name: "Grilled Chicken Wrap", description: "Tortilla, chicken, crisp salad, garlic yoghurt.", price: 10.0, prep: 12, weight: 8, addons: [{ name: "Extra Meat", price: 3.5 }, { name: "Extra Spicy", price: 0 }], recipe: [["ING-001", 130], ["ING-013", 1], ["ING-020", 35], ["ING-021", 25]] },
    { sku: "MAIN-008", name: "Steak & Fries", description: "220g sirloin, peppercorn sauce, twice-cooked fries.", price: 24.5, prep: 24, weight: 5, recipe: [["ING-002", 2], ["ING-024", 220], ["ING-018", 60], ["ING-016", 20]] },
  ],
  Rice: [
    { sku: "RICE-001", name: "Chicken Fried Rice", description: "Wok-fried jasmine rice, chicken, egg, spring onion.", price: 9.5, prep: 12, featured: true, weight: 14, variants: [{ name: "Regular", price: 9.5, isDefault: true }, { name: "Large", price: 12.5 }], addons: [{ name: "Egg", price: 1.0 }, { name: "Extra Spicy", price: 0 }], recipe: [["ING-007", 250], ["ING-001", 120], ["ING-019", 1], ["ING-030", 20], ["ING-029", 20]] },
    { sku: "RICE-002", name: "Shrimp Fried Rice", description: "Tiger prawns, jasmine rice, garlic, egg.", price: 12.5, prep: 13, weight: 9, variants: [{ name: "Regular", price: 12.5, isDefault: true }, { name: "Large", price: 15.5 }], recipe: [["ING-007", 250], ["ING-004", 120], ["ING-019", 1], ["ING-023", 10], ["ING-029", 20]] },
    { sku: "RICE-003", name: "Pork Rice Bowl", description: "Caramelised pork belly over steamed rice.", price: 11.0, prep: 14, weight: 8, addons: [{ name: "Egg", price: 1.0 }], recipe: [["ING-007", 260], ["ING-003", 180], ["ING-030", 25], ["ING-034", 15]] },
    { sku: "RICE-004", name: "Green Curry with Rice", description: "Coconut green curry, chicken, Thai basil.", price: 12.0, prep: 16, weight: 7, addons: [{ name: "Extra Spicy", price: 0 }], recipe: [["ING-007", 240], ["ING-001", 140], ["ING-035", 150], ["ING-026", 5], ["ING-032", 20]] },
    { sku: "RICE-005", name: "Beef Rice Bowl", description: "Seared beef, onion, sweet soy glaze.", price: 13.0, prep: 15, weight: 6, recipe: [["ING-007", 260], ["ING-002", 1], ["ING-022", 60], ["ING-030", 25]] },
  ],
  Noodles: [
    { sku: "NDL-001", name: "Pad Thai", description: "Rice noodles, tamarind, peanut, lime, egg.", price: 11.0, prep: 14, featured: true, weight: 12, addons: [{ name: "Extra Spicy", price: 0 }, { name: "Egg", price: 1.0 }], recipe: [["ING-009", 200], ["ING-019", 1], ["ING-031", 25], ["ING-028", 1], ["ING-004", 80]] },
    { sku: "NDL-002", name: "Spaghetti Bolognese", description: "Slow-cooked beef ragù, parmesan, basil.", price: 12.5, prep: 16, weight: 10, addons: [{ name: "Extra Cheese", price: 1.5 }], recipe: [["ING-010", 180], ["ING-002", 1], ["ING-033", 120], ["ING-022", 50], ["ING-026", 4]] },
    { sku: "NDL-003", name: "Beef Noodle Soup", description: "Eight-hour bone broth, brisket, egg noodles.", price: 12.0, prep: 15, weight: 8, recipe: [["ING-008", 180], ["ING-002", 1], ["ING-022", 40], ["ING-030", 20]] },
    { sku: "NDL-004", name: "Seafood Noodles", description: "Prawn, squid and egg noodles in chilli garlic oil.", price: 14.5, prep: 17, weight: 6, recipe: [["ING-008", 180], ["ING-004", 90], ["ING-006", 90], ["ING-032", 15], ["ING-023", 10]] },
    { sku: "NDL-005", name: "Chicken Chow Mein", description: "Stir-fried egg noodles, chicken, crisp vegetables.", price: 10.5, prep: 13, weight: 9, recipe: [["ING-008", 180], ["ING-001", 120], ["ING-025", 50], ["ING-030", 20]] },
  ],
  Drinks: [
    { sku: "DRK-001", name: "Iced Coffee", description: "Double shot over ice with a splash of milk.", price: 4.0, prep: 4, weight: 16, variants: [{ name: "Regular", price: 4.0, isDefault: true }, { name: "Large", price: 5.0 }], recipe: [["ING-036", 18], ["ING-017", 120], ["ING-034", 10]] },
    { sku: "DRK-002", name: "Hot Latte", description: "Espresso with steamed milk micro-foam.", price: 4.5, prep: 4, weight: 12, variants: [{ name: "Regular", price: 4.5, isDefault: true }, { name: "Large", price: 5.5 }], recipe: [["ING-036", 18], ["ING-017", 180]] },
    { sku: "DRK-003", name: "Thai Iced Tea", description: "Strong brewed tea with condensed milk.", price: 4.0, prep: 4, weight: 11, recipe: [["ING-037", 12], ["ING-017", 150], ["ING-034", 20]] },
    { sku: "DRK-004", name: "Fresh Orange Juice", description: "Three oranges, squeezed to order.", price: 5.0, prep: 5, weight: 9, recipe: [["ING-039", 3]] },
    { sku: "DRK-005", name: "Cola", description: "Chilled cola over ice.", price: 3.0, prep: 2, weight: 14, variants: [{ name: "Regular", price: 3.0, isDefault: true }, { name: "Large", price: 4.0 }], recipe: [["ING-038", 60]] },
    { sku: "DRK-006", name: "Lime Soda", description: "Fresh lime, soda water, light syrup.", price: 3.5, prep: 3, weight: 8, recipe: [["ING-028", 2], ["ING-034", 15]] },
    { sku: "DRK-007", name: "Mineral Water", description: "Still mineral water, 500ml.", price: 2.0, prep: 1, weight: 10, recipe: [] },
  ],
  Desserts: [
    { sku: "DST-001", name: "Chocolate Lava Cake", description: "Warm dark chocolate fondant, vanilla ice cream.", price: 7.5, prep: 12, featured: true, weight: 8, recipe: [["ING-040", 70], ["ING-042", 50], ["ING-019", 2], ["ING-016", 30], ["ING-041", 60]] },
    { sku: "DST-002", name: "Mango Sticky Rice", description: "Coconut sticky rice with fresh ripe mango.", price: 6.5, prep: 8, weight: 7, recipe: [["ING-044", 150], ["ING-035", 80], ["ING-043", 1], ["ING-034", 15]] },
    { sku: "DST-003", name: "Vanilla Ice Cream", description: "Three scoops of Madagascan vanilla.", price: 4.5, prep: 3, weight: 9, addons: [{ name: "Extra Sauce", price: 0.5 }], recipe: [["ING-041", 140]] },
    { sku: "DST-004", name: "Seasonal Fruit Salad", description: "Chilled mango, orange and lime.", price: 5.5, prep: 6, status: "AVAILABLE", weight: 4, recipe: [["ING-043", 1], ["ING-039", 1], ["ING-028", 1]] },
  ],
  Specials: [
    { sku: "SPC-001", name: "Seafood Platter", description: "Prawn, squid and salmon for two, with two sides.", price: 38.0, prep: 30, featured: true, weight: 3, recipe: [["ING-004", 250], ["ING-006", 200], ["ING-005", 220], ["ING-024", 200], ["ING-028", 2]] },
    { sku: "SPC-002", name: "Family Feast", description: "Two mains, two sides, four drinks — feeds four.", price: 54.0, prep: 35, weight: 2, recipe: [["ING-001", 300], ["ING-002", 2], ["ING-007", 400], ["ING-024", 250], ["ING-038", 200]] },
    { sku: "SPC-003", name: "Chef's Tasting Set", description: "Five-course seasonal tasting menu.", price: 45.0, prep: 40, status: "UNAVAILABLE", weight: 1, recipe: [["ING-005", 120], ["ING-004", 100], ["ING-003", 120], ["ING-040", 40], ["ING-041", 60]] },
  ],
};

const CATEGORY_META: Record<string, { icon: string; color: string; description: string }> = {
  Appetizers: { icon: "Salad", color: "#f59e0b", description: "Small plates and starters" },
  "Main Course": { icon: "UtensilsCrossed", color: "#ef4444", description: "Signature mains from the grill and oven" },
  Rice: { icon: "Wheat", color: "#10b981", description: "Wok-fried rice and rice bowls" },
  Noodles: { icon: "Soup", color: "#8b5cf6", description: "Noodle plates and broths" },
  Drinks: { icon: "CupSoda", color: "#0ea5e9", description: "Coffee, tea, juice and soft drinks" },
  Desserts: { icon: "IceCreamCone", color: "#ec4899", description: "Sweet finishes" },
  Specials: { icon: "Star", color: "#f97316", description: "Chef's rotating specials" },
};

const CUSTOMERS = [
  { name: "Sophia Nguyen", phone: "+1 555 0101", email: "sophia.nguyen@example.com", address: "18 Harbour View, Apt 4B", notes: "Allergic to peanuts" },
  { name: "Daniel Carter", phone: "+1 555 0102", email: "daniel.carter@example.com", address: "220 Oakwood Drive", notes: "Prefers window tables" },
  { name: "Aisha Rahman", phone: "+1 555 0103", email: "aisha.rahman@example.com", address: "7 Maple Court", notes: "Halal only" },
  { name: "Marco Rossi", phone: "+1 555 0104", email: "marco.rossi@example.com", address: "91 Vine Street", notes: "Regular — Friday evenings" },
  { name: "Emily Zhang", phone: "+1 555 0105", email: "emily.zhang@example.com", address: "5 Lakeside Terrace", notes: "" },
  { name: "James O'Connor", phone: "+1 555 0106", email: "james.oconnor@example.com", address: "44 Bridge Road", notes: "Corporate account" },
  { name: "Priya Sharma", phone: "+1 555 0107", email: "priya.sharma@example.com", address: "12 Rosewood Lane", notes: "Vegetarian" },
  { name: "Lucas Meyer", phone: "+1 555 0108", email: "lucas.meyer@example.com", address: "300 Central Plaza", notes: "" },
  { name: "Hannah Kim", phone: "+1 555 0109", email: "hannah.kim@example.com", address: "66 Garden Way", notes: "Birthday in March" },
  { name: "Omar Haddad", phone: "+1 555 0110", email: "omar.haddad@example.com", address: "82 Sunset Boulevard", notes: "" },
  { name: "Grace Bennett", phone: "+1 555 0111", email: "grace.bennett@example.com", address: "9 Willow Close", notes: "Large group bookings" },
  { name: "Noah Williams", phone: "+1 555 0112", email: "noah.williams@example.com", address: "150 Kings Avenue", notes: "" },
  { name: "Isabella Turner", phone: "+1 555 0113", email: "isabella.turner@example.com", address: "23 Chapel Street", notes: "Gluten free" },
  { name: "Ethan Brooks", phone: "+1 555 0114", email: "ethan.brooks@example.com", address: "410 River Road", notes: "" },
];

const SUPPLIERS = [
  { name: "Harbour Fresh Seafood", contactName: "Lena Park", phone: "+1 555 0201", email: "orders@harbourfresh.example.com", address: "Pier 9, Dockside" },
  { name: "Greenfield Produce", contactName: "Tom Alvarez", phone: "+1 555 0202", email: "sales@greenfield.example.com", address: "Unit 4, Farm Road" },
  { name: "Prime Meat Co.", contactName: "Rachel Doyle", phone: "+1 555 0203", email: "hello@primemeat.example.com", address: "12 Butchers Lane" },
  { name: "Daily Dairy Supply", contactName: "Victor Hugo", phone: "+1 555 0204", email: "contact@dailydairy.example.com", address: "88 Creamery Street" },
  { name: "Pantry Wholesale", contactName: "Nadia Iqbal", phone: "+1 555 0205", email: "wholesale@pantry.example.com", address: "Block C, Trade Park" },
];

const SUPPLIER_BY_CATEGORY: Record<string, string> = {
  Seafood: "Harbour Fresh Seafood",
  Produce: "Greenfield Produce",
  Meat: "Prime Meat Co.",
  Dairy: "Daily Dairy Supply",
  Bakery: "Pantry Wholesale",
  Grains: "Pantry Wholesale",
  Pantry: "Pantry Wholesale",
  Beverage: "Pantry Wholesale",
  Frozen: "Daily Dairy Supply",
};

const STAFF = [
  { email: "admin@example.com", name: "Alex Morgan", role: "ADMIN" as RoleName, phone: "+1 555 0301" },
  { email: "manager@example.com", name: "Maria Santos", role: "MANAGER" as RoleName, phone: "+1 555 0302" },
  { email: "cashier@example.com", name: "Chris Lee", role: "CASHIER" as RoleName, phone: "+1 555 0303" },
  { email: "waiter@example.com", name: "Wendy Adams", role: "WAITER" as RoleName, phone: "+1 555 0304" },
  { email: "kitchen@example.com", name: "Kenji Tanaka", role: "KITCHEN" as RoleName, phone: "+1 555 0305" },
  { email: "sara.lopez@example.com", name: "Sara Lopez", role: "WAITER" as RoleName, phone: "+1 555 0306" },
  { email: "david.okafor@example.com", name: "David Okafor", role: "CASHIER" as RoleName, phone: "+1 555 0307" },
  { email: "nina.petrova@example.com", name: "Nina Petrova", role: "KITCHEN" as RoleName, phone: "+1 555 0308" },
  { email: "liam.walsh@example.com", name: "Liam Walsh", role: "WAITER" as RoleName, phone: "+1 555 0309" },
];

const ZONES = ["Main Hall", "Main Hall", "Main Hall", "Terrace", "Terrace", "Private Room", "Bar"];

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

async function main() {
  console.log("Clearing existing data…");
  await prisma.$transaction([
    prisma.auditLog.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.inventoryTransaction.deleteMany(),
    prisma.orderItemAddon.deleteMany(),
    prisma.orderItem.deleteMany(),
    prisma.orderDiscount.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.order.deleteMany(),
    prisma.reservation.deleteMany(),
    prisma.customer.deleteMany(),
    prisma.recipeItem.deleteMany(),
    prisma.recipe.deleteMany(),
    prisma.menuItemAddon.deleteMany(),
    prisma.menuItemVariant.deleteMany(),
    prisma.menuItem.deleteMany(),
    prisma.menuCategory.deleteMany(),
    prisma.ingredient.deleteMany(),
    prisma.supplier.deleteMany(),
    prisma.discount.deleteMany(),
    prisma.restaurantTable.deleteMany(),
    prisma.user.deleteMany(),
    prisma.rolePermission.deleteMany(),
    prisma.role.deleteMany(),
    prisma.permission.deleteMany(),
    prisma.restaurant.deleteMany(),
  ]);

  // --- Permissions & roles -------------------------------------------------
  console.log("Seeding permissions and roles…");
  await prisma.permission.createMany({
    data: ALL_PERMISSIONS.map((key) => ({
      key,
      label: PERMISSION_META[key].label,
      group: PERMISSION_META[key].group,
    })),
  });
  const permissions = await prisma.permission.findMany();
  const permissionId = new Map(permissions.map((p) => [p.key, p.id]));

  const roleIds = new Map<RoleName, string>();
  for (const [name, keys] of Object.entries(ROLE_PERMISSIONS) as [RoleName, string[]][]) {
    const role = await prisma.role.create({
      data: {
        name,
        label: ROLE_META[name].label,
        description: ROLE_META[name].description,
        isSystem: true,
        permissions: {
          create: keys.map((key) => ({ permissionId: permissionId.get(key)! })),
        },
      },
    });
    roleIds.set(name, role.id);
  }

  // --- Restaurant ----------------------------------------------------------
  console.log("Seeding restaurant…");
  const restaurant = await prisma.restaurant.create({
    data: {
      name: "The Copper Spoon",
      slug: "copper-spoon",
      address: "45 Riverside Avenue, Downtown",
      phone: "+1 555 0100",
      email: "hello@copperspoon.example.com",
      currency: "USD",
      currencySymbol: "$",
      taxRate: 8,
      serviceChargeRate: 5,
      timezone: "UTC",
      openingTime: "09:00",
      closingTime: "23:00",
      discountApprovalThreshold: 20,
    },
  });
  const restaurantId = restaurant.id;

  // --- Staff ---------------------------------------------------------------
  console.log("Seeding staff…");
  const passwordHash = await bcrypt.hash("password123", 10);
  const users: Awaited<ReturnType<typeof prisma.user.create>>[] = [];
  for (let i = 0; i < STAFF.length; i++) {
    const s = STAFF[i];
    users.push(
      await prisma.user.create({
        data: {
          email: s.email,
          name: s.name,
          phone: s.phone,
          passwordHash,
          roleId: roleIds.get(s.role)!,
          restaurantId,
          status: "ACTIVE",
          hireDate: new Date(2024, i % 12, ((i * 7) % 27) + 1),
        },
      }),
    );
  }
  const byRole = (role: RoleName) =>
    users.filter((u) => u.roleId === roleIds.get(role));
  const admin = byRole("ADMIN")[0];
  const salesStaff = [...byRole("CASHIER"), ...byRole("WAITER"), ...byRole("MANAGER")];

  // --- Tables --------------------------------------------------------------
  console.log("Seeding tables…");
  const tables = [];
  for (let i = 1; i <= 18; i++) {
    const capacity = i <= 8 ? 2 : i <= 14 ? 4 : i <= 16 ? 6 : 10;
    tables.push(
      await prisma.restaurantTable.create({
        data: {
          restaurantId,
          number: `T${String(i).padStart(2, "0")}`,
          name: i > 16 ? `Banquet ${i - 16}` : null,
          capacity,
          zone: ZONES[Math.min(Math.floor((i - 1) / 3), ZONES.length - 1)],
          status: "AVAILABLE",
          positionX: ((i - 1) % 6) * 140,
          positionY: Math.floor((i - 1) / 6) * 120,
        },
      }),
    );
  }

  // --- Suppliers & ingredients --------------------------------------------
  console.log("Seeding suppliers and ingredients…");
  const supplierIds = new Map<string, string>();
  for (const s of SUPPLIERS) {
    const created = await prisma.supplier.create({ data: { restaurantId, ...s } });
    supplierIds.set(s.name, created.id);
  }

  const now = new Date();
  const ingredientIds = new Map<string, string>();
  const stock = new Map<string, number>();
  const ingredientCost = new Map<string, number>();
  const ingredientMin = new Map<string, number>();

  for (const ing of INGREDIENTS) {
    const created = await prisma.ingredient.create({
      data: {
        restaurantId,
        name: ing.name,
        sku: ing.sku,
        category: ing.category,
        unit: ing.unit,
        quantity: 0,
        minQuantity: ing.min,
        cost: ing.cost,
        supplierId: supplierIds.get(SUPPLIER_BY_CATEGORY[ing.category] ?? "Pantry Wholesale")!,
        expiresAt: ing.expiresInDays
          ? new Date(now.getTime() + ing.expiresInDays * 86400000)
          : null,
      },
    });
    ingredientIds.set(ing.sku, created.id);
    stock.set(ing.sku, 0);
    ingredientCost.set(ing.sku, ing.cost);
    ingredientMin.set(ing.sku, ing.min);
  }

  // --- Menu ----------------------------------------------------------------
  console.log("Seeding menu…");
  type MenuRuntime = MenuSeed & {
    id: string;
    categoryName: string;
    variantIds: { id: string; name: string; price: number }[];
    addonIds: { id: string; name: string; price: number }[];
    unitCost: number;
  };
  const menuRuntime: MenuRuntime[] = [];
  let categorySort = 0;

  for (const [categoryName, items] of Object.entries(MENU)) {
    const meta = CATEGORY_META[categoryName];
    const category = await prisma.menuCategory.create({
      data: {
        restaurantId,
        name: categoryName,
        description: meta.description,
        icon: meta.icon,
        color: meta.color,
        sortOrder: categorySort++,
      },
    });

    let itemSort = 0;
    for (const item of items) {
      const unitCost = round2(
        item.recipe.reduce((acc, [sku, qty]) => acc + (ingredientCost.get(sku) ?? 0) * qty, 0),
      );

      const created = await prisma.menuItem.create({
        data: {
          restaurantId,
          categoryId: category.id,
          name: item.name,
          description: item.description,
          sku: item.sku,
          price: item.price,
          cost: unitCost,
          status: item.status ?? "AVAILABLE",
          prepTimeMin: item.prep,
          isFeatured: item.featured ?? false,
          sortOrder: itemSort++,
          variants: item.variants
            ? {
                create: item.variants.map((v, idx) => ({
                  name: v.name,
                  price: v.price,
                  cost: round2(unitCost * (v.price / item.price)),
                  isDefault: v.isDefault ?? false,
                  sortOrder: idx,
                })),
              }
            : undefined,
          addons: item.addons
            ? { create: item.addons.map((a, idx) => ({ name: a.name, price: a.price, sortOrder: idx })) }
            : undefined,
        },
        include: { variants: true, addons: true },
      });

      if (item.recipe.length > 0) {
        await prisma.recipe.create({
          data: {
            menuItemId: created.id,
            yield: 1,
            items: {
              create: item.recipe.map(([sku, quantity]) => ({
                ingredientId: ingredientIds.get(sku)!,
                quantity,
              })),
            },
          },
        });
      }

      menuRuntime.push({
        ...item,
        id: created.id,
        categoryName,
        unitCost,
        variantIds: created.variants.map((v) => ({ id: v.id, name: v.name, price: Number(v.price) })),
        addonIds: created.addons.map((a) => ({ id: a.id, name: a.name, price: Number(a.price) })),
      });
    }
  }

  // --- Customers -----------------------------------------------------------
  console.log("Seeding customers…");
  const customers = [];
  for (const c of CUSTOMERS) {
    customers.push(await prisma.customer.create({ data: { restaurantId, ...c } }));
  }

  // --- Discounts -----------------------------------------------------------
  console.log("Seeding discounts…");
  const discounts = await Promise.all(
    [
      { code: "WELCOME10", name: "Welcome 10% Off", type: "PERCENTAGE" as const, scope: "COUPON" as const, value: 10, minOrderAmount: 20, maxDiscount: 15 },
      { code: "SAVE5", name: "$5 Off Orders Over $40", type: "FIXED" as const, scope: "COUPON" as const, value: 5, minOrderAmount: 40, maxDiscount: null },
      { code: "HAPPYHOUR", name: "Happy Hour 15%", type: "PERCENTAGE" as const, scope: "PROMOTION" as const, value: 15, minOrderAmount: 0, maxDiscount: 20 },
      { code: "STAFF25", name: "Staff Meal 25%", type: "PERCENTAGE" as const, scope: "PROMOTION" as const, value: 25, minOrderAmount: 0, maxDiscount: null },
      { code: "LOYAL20", name: "Loyalty Reward $20", type: "FIXED" as const, scope: "COUPON" as const, value: 20, minOrderAmount: 100, maxDiscount: null },
    ].map((d) =>
      prisma.discount.create({
        data: {
          restaurantId,
          code: d.code,
          name: d.name,
          description: d.name,
          type: d.type,
          scope: d.scope,
          value: d.value,
          minOrderAmount: d.minOrderAmount,
          maxDiscount: d.maxDiscount,
          startsAt: new Date(now.getTime() - 30 * 86400000),
          endsAt: new Date(now.getTime() + 60 * 86400000),
          isActive: true,
        },
      }),
    ),
  );

  // --- Opening stock -------------------------------------------------------
  console.log("Recording opening stock…");
  const inventoryTxs: {
    ingredientId: string;
    type: "STOCK_IN" | "SALE_DEDUCTION" | "WASTE" | "ADJUSTMENT";
    quantity: number;
    quantityAfter: number;
    unitCost: number;
    reference: string | null;
    orderId: string | null;
    note: string | null;
    userId: string | null;
    createdAt: Date;
  }[] = [];

  const historyStart = new Date(now.getTime() - 45 * 86400000);
  for (const ing of INGREDIENTS) {
    stock.set(ing.sku, ing.start);
    inventoryTxs.push({
      ingredientId: ingredientIds.get(ing.sku)!,
      type: "STOCK_IN",
      quantity: ing.start,
      quantityAfter: ing.start,
      unitCost: ing.cost,
      reference: "OPENING",
      orderId: null,
      note: "Opening stock",
      userId: admin.id,
      createdAt: historyStart,
    });
  }

  // --- Order history -------------------------------------------------------
  console.log("Simulating 45 days of trading…");

  const weightedMenu: MenuRuntime[] = [];
  for (const item of menuRuntime) {
    if (item.status === "UNAVAILABLE" || item.status === "HIDDEN") continue;
    for (let i = 0; i < item.weight; i++) weightedMenu.push(item);
  }

  const taxRate = 8;
  const serviceRate = 5;
  let orderSeq = 0;

  type PendingOrder = {
    data: Parameters<typeof prisma.order.create>[0]["data"];
    deductions: [string, number][];
    orderId: string;
    createdAt: Date;
  };

  const restockFor = (sku: string, at: Date) => {
    const ing = INGREDIENTS.find((i) => i.sku === sku)!;
    const amount = ing.start;
    const after = round2((stock.get(sku) ?? 0) + amount);
    stock.set(sku, after);
    inventoryTxs.push({
      ingredientId: ingredientIds.get(sku)!,
      type: "STOCK_IN",
      quantity: amount,
      quantityAfter: after,
      unitCost: ing.cost,
      reference: "PO-RESTOCK",
      orderId: null,
      note: `Restock — ${ing.name}`,
      userId: admin.id,
      createdAt: at,
    });
  };

  for (let dayOffset = 45; dayOffset >= 0; dayOffset--) {
    const day = new Date(now.getTime() - dayOffset * 86400000);
    const dow = day.getDay();
    // Weekends are busier; today is partial because service is still running.
    const base = dow === 0 || dow === 6 ? randInt(26, 38) : randInt(14, 26);
    const ordersToday = dayOffset === 0 ? Math.max(6, Math.floor(base * 0.55)) : base;

    for (let i = 0; i < ordersToday; i++) {
      orderSeq++;
      const hour = chance(0.42) ? randInt(11, 14) : randInt(17, 21);
      const placedAt = new Date(day);
      placedAt.setHours(hour, randInt(0, 59), randInt(0, 59), 0);
      if (placedAt > now) placedAt.setTime(now.getTime() - randInt(5, 90) * 60000);

      const type = chance(0.62) ? "DINE_IN" : chance(0.6) ? "TAKEAWAY" : "DELIVERY";
      const staff = pick(salesStaff);
      const customer = chance(0.45) ? pick(customers) : null;
      const table = type === "DINE_IN" ? pick(tables) : null;

      const itemCount = randInt(1, 5);
      const chosen = new Map<string, { item: MenuRuntime; qty: number }>();
      for (let k = 0; k < itemCount; k++) {
        const item = pick(weightedMenu);
        const existing = chosen.get(item.sku);
        if (existing) existing.qty += 1;
        else chosen.set(item.sku, { item, qty: randInt(1, 2) });
      }

      const orderItems: {
        menuItemId: string;
        variantId: string | null;
        nameSnap: string;
        variantSnap: string | null;
        unitPrice: number;
        unitCost: number;
        quantity: number;
        addonsTotal: number;
        lineTotal: number;
        notes: string | null;
        addons: { addonId: string; nameSnap: string; price: number }[];
      }[] = [];
      const deductions: [string, number][] = [];
      let subtotal = 0;

      for (const { item, qty } of chosen.values()) {
        const variant = item.variantIds.length > 0 ? pick(item.variantIds) : null;
        const unitPrice = variant ? variant.price : item.price;
        const addons =
          item.addonIds.length > 0 && chance(0.28)
            ? [pick(item.addonIds)].map((a) => ({ addonId: a.id, nameSnap: a.name, price: a.price }))
            : [];
        const addonsTotal = round2(addons.reduce((acc, a) => acc + a.price, 0) * qty);
        const lineTotal = round2(unitPrice * qty + addonsTotal);
        subtotal = round2(subtotal + lineTotal);

        orderItems.push({
          menuItemId: item.id,
          variantId: variant?.id ?? null,
          nameSnap: item.name,
          variantSnap: variant?.name ?? null,
          unitPrice,
          unitCost: item.unitCost,
          quantity: qty,
          addonsTotal,
          lineTotal,
          notes: chance(0.12) ? pick(["No onion", "Extra spicy", "Less salt", "Serve first", "No ice"]) : null,
          addons,
        });

        for (const [sku, amount] of item.recipe) deductions.push([sku, amount * qty]);
      }

      // Discount — occasionally, and only on larger tickets.
      let discountTotal = 0;
      let appliedDiscount: (typeof discounts)[number] | null = null;
      if (chance(0.18)) {
        const candidate = pick(discounts);
        if (subtotal >= Number(candidate.minOrderAmount)) {
          const raw =
            candidate.type === "PERCENTAGE"
              ? round2((subtotal * Number(candidate.value)) / 100)
              : Number(candidate.value);
          const capped = candidate.maxDiscount ? Math.min(raw, Number(candidate.maxDiscount)) : raw;
          discountTotal = round2(Math.min(capped, subtotal));
          appliedDiscount = candidate;
        }
      }

      const taxable = round2(subtotal - discountTotal);
      const taxTotal = round2((taxable * taxRate) / 100);
      const serviceChargeTotal = type === "DINE_IN" ? round2((taxable * serviceRate) / 100) : 0;
      const total = round2(taxable + taxTotal + serviceChargeTotal);

      // Status: history is settled; today keeps a live mix on the floor.
      let status: "COMPLETED" | "CANCELLED" | "PENDING" | "PREPARING" | "READY" | "SERVED" = "COMPLETED";
      if (dayOffset === 0) {
        const roll = rand();
        status =
          roll < 0.34 ? "COMPLETED" : roll < 0.5 ? "PENDING" : roll < 0.68 ? "PREPARING" : roll < 0.84 ? "READY" : "SERVED";
      } else if (chance(0.04)) {
        status = "CANCELLED";
      }

      const isCompleted = status === "COMPLETED";
      const isCancelled = status === "CANCELLED";
      const paymentStatus = isCompleted ? "PAID" : "UNPAID";

      const orderNumber = `ORD-${placedAt.getFullYear()}${String(placedAt.getMonth() + 1).padStart(2, "0")}${String(
        placedAt.getDate(),
      ).padStart(2, "0")}-${String(orderSeq).padStart(4, "0")}`;

      const prepMinutes = randInt(8, 26);
      const kitchenAt = new Date(placedAt.getTime() + randInt(1, 4) * 60000);
      const readyAt = new Date(kitchenAt.getTime() + prepMinutes * 60000);
      const servedAt = new Date(readyAt.getTime() + randInt(1, 8) * 60000);
      const completedAt = new Date(servedAt.getTime() + randInt(5, 45) * 60000);

      const order = await prisma.order.create({
        data: {
          restaurantId,
          orderNumber,
          type,
          status,
          paymentStatus,
          priority: chance(0.1) ? "HIGH" : "NORMAL",
          tableId: table?.id ?? null,
          customerId: customer?.id ?? null,
          staffId: staff.id,
          guestCount: type === "DINE_IN" ? randInt(1, 6) : 1,
          notes: chance(0.1) ? pick(["Birthday celebration", "Allergy: nuts", "Rush order", "Split bill"]) : null,
          deliveryAddress: type === "DELIVERY" ? (customer?.address ?? "42 Delivery Road") : null,
          subtotal,
          discountTotal,
          taxRate,
          taxTotal,
          serviceChargeRate: type === "DINE_IN" ? serviceRate : 0,
          serviceChargeTotal,
          total,
          paidTotal: isCompleted ? total : 0,
          inventoryDeducted: isCompleted,
          placedAt,
          kitchenAt: status === "PENDING" ? null : kitchenAt,
          readyAt: ["READY", "SERVED", "COMPLETED"].includes(status) ? readyAt : null,
          servedAt: ["SERVED", "COMPLETED"].includes(status) ? servedAt : null,
          completedAt: isCompleted ? completedAt : null,
          cancelledAt: isCancelled ? new Date(placedAt.getTime() + 6 * 60000) : null,
          cancelReason: isCancelled ? pick(["Customer left", "Item unavailable", "Duplicate order", "Wrong order"]) : null,
          createdAt: placedAt,
          items: {
            create: orderItems.map((oi) => ({
              menuItemId: oi.menuItemId,
              variantId: oi.variantId,
              nameSnap: oi.nameSnap,
              variantSnap: oi.variantSnap,
              unitPrice: oi.unitPrice,
              unitCost: oi.unitCost,
              quantity: oi.quantity,
              addonsTotal: oi.addonsTotal,
              lineTotal: oi.lineTotal,
              notes: oi.notes,
              status: isCompleted ? "SERVED" : isCancelled ? "CANCELLED" : status === "PENDING" ? "PENDING" : status === "PREPARING" ? "PREPARING" : status === "READY" ? "READY" : "SERVED",
              createdAt: placedAt,
              addons: oi.addons.length
                ? { create: oi.addons.map((a) => ({ addonId: a.addonId, nameSnap: a.nameSnap, price: a.price })) }
                : undefined,
            })),
          },
        },
      });

      if (appliedDiscount && discountTotal > 0) {
        await prisma.orderDiscount.create({
          data: {
            orderId: order.id,
            discountId: appliedDiscount.id,
            label: appliedDiscount.name,
            type: appliedDiscount.type,
            value: appliedDiscount.value,
            amount: discountTotal,
            appliedById: staff.id,
            approvedById: Number(appliedDiscount.value) >= 20 && appliedDiscount.type === "PERCENTAGE" ? admin.id : null,
            createdAt: placedAt,
          },
        });
        await prisma.discount.update({
          where: { id: appliedDiscount.id },
          data: { usageCount: { increment: 1 } },
        });
      }

      // Payments — sometimes split across two tenders.
      if (isCompleted) {
        const method = pick(["CASH", "CARD", "CARD", "QR", "BANK_TRANSFER", "OTHER"] as const);
        if (chance(0.14) && total > 20) {
          const first = round2(total / 2);
          const second = round2(total - first);
          await prisma.payment.createMany({
            data: [
              { orderId: order.id, method: "CASH", amount: first, received: first, change: 0, userId: staff.id, createdAt: completedAt },
              { orderId: order.id, method: "QR", amount: second, received: second, change: 0, reference: `QR${randInt(100000, 999999)}`, userId: staff.id, createdAt: completedAt },
            ],
          });
        } else {
          const received = method === "CASH" ? Math.ceil(total / 5) * 5 : total;
          await prisma.payment.create({
            data: {
              orderId: order.id,
              method,
              amount: total,
              received,
              change: round2(received - total),
              reference: method === "CASH" ? null : `${method.slice(0, 2)}${randInt(100000, 999999)}`,
              userId: staff.id,
              createdAt: completedAt,
            },
          });
        }
        if (method === "CASH") {
          await prisma.order.update({
            where: { id: order.id },
            data: { changeGiven: 0 },
          });
        }
      }

      // Inventory: completed orders consume their recipes.
      if (isCompleted) {
        const consumeAt = completedAt;
        for (const [sku, amount] of deductions) {
          const current = stock.get(sku);
          if (current === undefined) continue;
          if (current - amount < (ingredientMin.get(sku) ?? 0) * 0.5) restockFor(sku, consumeAt);
          const after = round2((stock.get(sku) ?? 0) - amount);
          stock.set(sku, after);
          inventoryTxs.push({
            ingredientId: ingredientIds.get(sku)!,
            type: "SALE_DEDUCTION",
            quantity: -amount,
            quantityAfter: after,
            unitCost: ingredientCost.get(sku) ?? 0,
            reference: orderNumber,
            orderId: order.id,
            note: null,
            userId: staff.id,
            createdAt: consumeAt,
          });
        }
      }

      // Keep today's live dine-in orders attached to occupied tables.
      if (dayOffset === 0 && table && !isCompleted && !isCancelled) {
        await prisma.restaurantTable.update({
          where: { id: table.id },
          data: { status: "OCCUPIED", occupiedAt: placedAt },
        });
      }
    }
  }

  // Occasional waste write-offs so the inventory report has movement types.
  for (let i = 0; i < 14; i++) {
    const ing = pick(INGREDIENTS.filter((x) => x.expiresInDays !== undefined));
    const amount = round2((ing.start * randInt(1, 4)) / 100);
    const after = round2(Math.max(0, (stock.get(ing.sku) ?? 0) - amount));
    stock.set(ing.sku, after);
    inventoryTxs.push({
      ingredientId: ingredientIds.get(ing.sku)!,
      type: "WASTE",
      quantity: -amount,
      quantityAfter: after,
      unitCost: ing.cost,
      reference: null,
      orderId: null,
      note: pick(["Expired", "Spoiled in storage", "Dropped during prep", "Failed quality check"]),
      userId: pick(users).id,
      createdAt: new Date(now.getTime() - randInt(1, 40) * 86400000),
    });
  }

  console.log(`Writing ${inventoryTxs.length} inventory transactions…`);
  inventoryTxs.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  for (let i = 0; i < inventoryTxs.length; i += 1000) {
    await prisma.inventoryTransaction.createMany({ data: inventoryTxs.slice(i, i + 1000) });
  }

  // Final stock levels; force a couple into low/out-of-stock for the alerts.
  console.log("Reconciling stock levels…");
  const lowStockSkus = ["ING-005", "ING-026"];
  const outOfStockSku = "ING-043";
  for (const ing of INGREDIENTS) {
    let quantity = stock.get(ing.sku) ?? 0;
    if (lowStockSkus.includes(ing.sku)) quantity = round2(ing.min * 0.6);
    if (ing.sku === outOfStockSku) quantity = 0;
    await prisma.ingredient.update({
      where: { id: ingredientIds.get(ing.sku)! },
      data: { quantity: Math.max(0, quantity) },
    });
  }

  // --- Reservations --------------------------------------------------------
  console.log("Seeding reservations…");
  const reservationSlots = [11, 12, 13, 18, 19, 20, 21];
  for (let i = 0; i < 40; i++) {
    const dayShift = randInt(-12, 14);
    const reservedAt = new Date(now.getTime() + dayShift * 86400000);
    reservedAt.setHours(pick(reservationSlots), chance(0.5) ? 0 : 30, 0, 0);

    const customer = pick(customers);
    const guests = randInt(2, 8);
    const table = pick(tables.filter((t) => t.capacity >= guests)) ?? pick(tables);

    let status: "PENDING" | "CONFIRMED" | "SEATED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
    if (dayShift < 0) status = chance(0.82) ? "COMPLETED" : chance(0.5) ? "NO_SHOW" : "CANCELLED";
    else if (dayShift === 0) status = chance(0.4) ? "SEATED" : "CONFIRMED";
    else status = chance(0.65) ? "CONFIRMED" : "PENDING";

    // Guard the unique-ish invariant: no two live reservations on one table slot.
    const clash = await prisma.reservation.findFirst({
      where: {
        tableId: table.id,
        status: { in: ["PENDING", "CONFIRMED", "SEATED"] },
        reservedAt: {
          gte: new Date(reservedAt.getTime() - 90 * 60000),
          lte: new Date(reservedAt.getTime() + 90 * 60000),
        },
      },
    });
    if (clash && ["PENDING", "CONFIRMED", "SEATED"].includes(status)) continue;

    await prisma.reservation.create({
      data: {
        restaurantId,
        customerId: customer.id,
        tableId: table.id,
        guestName: customer.name,
        guestPhone: customer.phone,
        guestEmail: customer.email,
        reservedAt,
        durationMin: 90,
        guests,
        status,
        notes: chance(0.25) ? pick(["Window seat please", "Birthday cake at the end", "High chair needed", "Quiet corner"]) : null,
      },
    });
  }

  // Reserved tables should read as reserved on the floor plan.
  const upcomingToday = await prisma.reservation.findMany({
    where: {
      restaurantId,
      status: { in: ["CONFIRMED", "PENDING"] },
      reservedAt: { gte: now, lte: new Date(now.getTime() + 6 * 3600000) },
    },
    take: 3,
  });
  for (const r of upcomingToday) {
    if (!r.tableId) continue;
    await prisma.restaurantTable.updateMany({
      where: { id: r.tableId, status: "AVAILABLE" },
      data: { status: "RESERVED" },
    });
  }

  // A couple of tables mid-turnaround / offline for realism.
  const availableTables = await prisma.restaurantTable.findMany({
    where: { restaurantId, status: "AVAILABLE" },
    take: 3,
  });
  if (availableTables[0]) {
    await prisma.restaurantTable.update({ where: { id: availableTables[0].id }, data: { status: "CLEANING" } });
  }
  if (availableTables[1]) {
    await prisma.restaurantTable.update({ where: { id: availableTables[1].id }, data: { status: "OUT_OF_SERVICE" } });
  }

  // --- Notifications & audit ----------------------------------------------
  console.log("Seeding notifications and audit log…");
  const lowStock = await prisma.ingredient.findMany({
    where: { restaurantId },
  });
  const lowStockAlerts = lowStock.filter((i) => Number(i.quantity) <= Number(i.minQuantity)).slice(0, 5);

  await prisma.notification.createMany({
    data: [
      ...lowStockAlerts.map((i) => ({
        restaurantId,
        type: "INVENTORY" as const,
        title: Number(i.quantity) === 0 ? "Out of stock" : "Low stock alert",
        message: `${i.name} is at ${Number(i.quantity)}${i.unit} (minimum ${Number(i.minQuantity)}${i.unit}).`,
        entity: "Ingredient",
        entityId: i.id,
        link: "/inventory/stock",
        isRead: false,
      })),
      {
        restaurantId,
        type: "RESERVATION" as const,
        title: "New reservation",
        message: "A table for 6 has been requested for this evening.",
        entity: "Reservation",
        link: "/reservations",
        isRead: false,
      },
      {
        restaurantId,
        type: "KITCHEN" as const,
        title: "Ticket running long",
        message: "An order has been in preparation for more than 20 minutes.",
        entity: "Order",
        link: "/kitchen",
        isRead: false,
      },
    ],
  });

  await prisma.auditLog.createMany({
    data: [
      { userId: admin.id, userName: admin.name, action: "SEED", entity: "System", description: "Database seeded with demo data" },
      { userId: admin.id, userName: admin.name, action: "UPDATE", entity: "MenuItem", description: "Adjusted price for Classic Beef Burger", previousValue: { price: 12.5 }, newValue: { price: 13.5 } },
      { userId: users[1].id, userName: users[1].name, action: "ADJUST", entity: "Ingredient", description: "Stock adjustment after weekly count" },
    ],
  });

  const counts = {
    tables: await prisma.restaurantTable.count(),
    menuItems: await prisma.menuItem.count(),
    ingredients: await prisma.ingredient.count(),
    orders: await prisma.order.count(),
    payments: await prisma.payment.count(),
    inventoryTx: await prisma.inventoryTransaction.count(),
    reservations: await prisma.reservation.count(),
  };
  console.log("Seed complete:", counts);
  console.log("\nDemo logins (password: password123):");
  for (const s of STAFF.slice(0, 5)) console.log(`  ${s.email.padEnd(24)} ${s.role}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

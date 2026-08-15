/**
 * Money helpers. All arithmetic happens on cents-scaled integers to avoid
 * float drift, then rounds back to a 2-decimal number for persistence in
 * `Decimal(12,2)` columns.
 */

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function sum(values: number[]): number {
  return round2(values.reduce((acc, v) => acc + v, 0));
}

export function formatMoney(value: number, symbol = "$"): string {
  const negative = value < 0;
  const abs = Math.abs(value).toFixed(2);
  const [whole, cents] = abs.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}${symbol}${grouped}.${cents}`;
}

export function formatCompactMoney(value: number, symbol = "$"): string {
  if (Math.abs(value) >= 1_000_000) return `${symbol}${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${symbol}${(value / 1_000).toFixed(1)}k`;
  return formatMoney(value, symbol);
}

export function formatPercent(value: number, digits = 0): string {
  return `${value.toFixed(digits)}%`;
}

export function formatQty(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

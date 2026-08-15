import {
  endOfDay,
  endOfMonth,
  endOfWeek,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subDays,
} from "date-fns";

export type DateRangePreset = "today" | "yesterday" | "week" | "month" | "custom";

export type DateRange = { from: Date; to: Date };

export const DATE_PRESET_LABELS: Record<DateRangePreset, string> = {
  today: "Today",
  yesterday: "Yesterday",
  week: "This week",
  month: "This month",
  custom: "Custom range",
};

export function resolveRange(
  preset: DateRangePreset,
  from?: string | null,
  to?: string | null,
  now: Date = new Date(),
): DateRange {
  switch (preset) {
    case "yesterday": {
      const d = subDays(now, 1);
      return { from: startOfDay(d), to: endOfDay(d) };
    }
    case "week":
      return { from: startOfWeek(now, { weekStartsOn: 1 }), to: endOfWeek(now, { weekStartsOn: 1 }) };
    case "month":
      return { from: startOfMonth(now), to: endOfMonth(now) };
    case "custom": {
      const f = from ? new Date(from) : startOfDay(now);
      const t = to ? new Date(to) : endOfDay(now);
      return {
        from: startOfDay(Number.isNaN(f.getTime()) ? now : f),
        to: endOfDay(Number.isNaN(t.getTime()) ? now : t),
      };
    }
    case "today":
    default:
      return { from: startOfDay(now), to: endOfDay(now) };
  }
}

export function parsePreset(value: string | undefined | null): DateRangePreset {
  if (value === "yesterday" || value === "week" || value === "month" || value === "custom") return value;
  return "today";
}

/** "12m", "1h 04m" — used for occupied duration and kitchen wait times. */
export function formatDuration(ms: number): string {
  if (ms < 0) ms = 0;
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${totalMinutes}m`;
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

export function minutesSince(date: Date | string): number {
  const t = typeof date === "string" ? new Date(date) : date;
  return Math.max(0, Math.floor((Date.now() - t.getTime()) / 60000));
}

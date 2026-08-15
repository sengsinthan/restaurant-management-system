"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { format } from "date-fns";
import { CalendarDays, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DATE_PRESET_LABELS, type DateRangePreset } from "@/lib/date";
import { cn } from "@/lib/utils";

const PRESETS: DateRangePreset[] = ["today", "yesterday", "week", "month"];

/**
 * Drives report/dashboard windows through the URL so a filtered view is
 * shareable and survives a refresh.
 */
export function DateRangeFilter({ preset, from, to }: { preset: DateRangePreset; from?: string; to?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<{ from?: Date; to?: Date }>({
    from: from ? new Date(from) : undefined,
    to: to ? new Date(to) : undefined,
  });

  const push = (next: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === undefined) params.delete(key);
      else params.set(key, value);
    }
    startTransition(() => router.push(`?${params.toString()}`, { scroll: false }));
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <div className="flex items-center rounded-lg border p-0.5">
        {PRESETS.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => push({ range: option, from: undefined, to: undefined })}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors",
              preset === option
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {DATE_PRESET_LABELS[option]}
          </button>
        ))}
      </div>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              variant={preset === "custom" ? "default" : "outline"}
              size="sm"
              className="h-8 gap-1.5 text-xs"
            >
              {pending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <CalendarDays className="size-3.5" />
              )}
              {preset === "custom" && from && to
                ? `${format(new Date(from), "d MMM")} – ${format(new Date(to), "d MMM")}`
                : "Custom range"}
            </Button>
          }
        />
        <PopoverContent align="end" className="w-auto p-2">
          <Calendar
            mode="range"
            numberOfMonths={1}
            selected={range as never}
            onSelect={(value: unknown) => {
              const next = value as { from?: Date; to?: Date } | undefined;
              setRange(next ?? {});
              if (next?.from && next?.to) {
                push({
                  range: "custom",
                  from: format(next.from, "yyyy-MM-dd"),
                  to: format(next.to, "yyyy-MM-dd"),
                });
                setOpen(false);
              }
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

import { TrendingDown, TrendingUp } from "lucide-react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  trend,
  tone = "default",
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  trend?: number;
  tone?: "default" | "success" | "warning" | "destructive" | "info";
  className?: string;
}) {
  const toneClass = {
    default: "bg-primary/10 text-primary",
    success: "bg-success/12 text-success",
    warning: "bg-warning/15 text-warning-foreground dark:text-warning",
    destructive: "bg-destructive/10 text-destructive",
    info: "bg-info/12 text-info",
  }[tone];

  const showTrend = trend !== undefined && Number.isFinite(trend);
  const up = (trend ?? 0) >= 0;

  return (
    <Card className={cn("gap-0 p-4", className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
        <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", toneClass)}>
          <Icon className="size-4" />
        </span>
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight tabular">{value}</p>
      <div className="mt-1 flex items-center gap-1.5 text-xs">
        {showTrend && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 font-medium",
              up ? "text-success" : "text-destructive",
            )}
          >
            {up ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
            {Math.abs(trend!).toFixed(1)}%
          </span>
        )}
        {hint && <span className="truncate text-muted-foreground">{hint}</span>}
      </div>
    </Card>
  );
}

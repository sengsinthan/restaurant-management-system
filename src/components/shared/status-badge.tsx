import { cn } from "@/lib/utils";

export function StatusBadge({
  label,
  tone,
  className,
  dot = false,
}: {
  label: string;
  tone: string;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5.5 shrink-0 items-center gap-1.5 rounded-full border px-2 text-xs font-medium whitespace-nowrap",
        tone,
        className,
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {label}
    </span>
  );
}

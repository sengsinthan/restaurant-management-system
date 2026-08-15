import { cn } from "@/lib/utils";

/**
 * Menu-item imagery. Uses the item's own picture when one is set, and
 * otherwise falls back to a tinted monogram derived from the item name so
 * the POS grid stays scannable without shipping placeholder photography.
 */
export function ItemThumb({
  name,
  imageUrl,
  color,
  className,
  textClassName,
}: {
  name: string;
  imageUrl?: string | null;
  color?: string | null;
  className?: string;
  textClassName?: string;
}) {
  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl}
        alt={name}
        loading="lazy"
        className={cn("size-full object-cover", className)}
      />
    );
  }

  const monogram = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return (
    <div
      className={cn("flex size-full items-center justify-center", className)}
      style={
        color
          ? { backgroundColor: `color-mix(in oklab, ${color} 16%, transparent)`, color }
          : undefined
      }
      aria-hidden
    >
      <span className={cn("text-base font-semibold tracking-tight opacity-80", textClassName)}>
        {monogram}
      </span>
    </div>
  );
}

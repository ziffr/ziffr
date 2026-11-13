import type { Profile } from "@/lib/types";
import { cn } from "@/lib/utils";

/** People are named, not colour-coded: an initial on cotton stock, then the name. */
export function Avatar({ p, size = "md" }: { p?: Profile; size?: "sm" | "md" }) {
  if (!p) return null;
  return (
    <span
      title={`${p.name}, ${p.role}`}
      aria-hidden
      className={cn("stock inline-flex shrink-0 items-center justify-center rounded-full font-semibold", size === "sm" ? "size-6 text-xs" : "size-8 text-sm")}
    >
      {p.name[0]}
    </span>
  );
}

export function Person({ p }: { p?: Profile }) {
  if (!p) return null;
  return (
    <span className="inline-flex items-center gap-1.5">
      <Avatar p={p} size="sm" />
      {p.name.split(" ")[0]}
    </span>
  );
}

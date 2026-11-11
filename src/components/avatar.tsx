import type { Profile } from "@/lib/types";
import { cn } from "@/lib/utils";

export function Avatar({ p, size = "md" }: { p?: Profile; size?: "sm" | "md" }) {
  if (!p) return null;
  return (
    <span
      title={`${p.name}, ${p.role}`}
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-medium text-white", size === "sm" ? "size-5 text-[10px]" : "size-7 text-xs")}
      style={{ background: p.color }}
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

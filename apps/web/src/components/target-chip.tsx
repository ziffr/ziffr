// How Ziffr colours numbers (GLOSSARY: Target Range, Comparison): colour only ever means on or off target; the
// direction of a change is an arrow and a sign, never a colour, so red cannot mean two things on one screen.
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { formatChange, formatValue, targetLabel, targetStatus, targetText, type ValueUnit } from "@ziffr/core/format";
import type { NumberStyle } from "@ziffr/core/number-style";
import type { Metric } from "@ziffr/core/types";
import { cn } from "@/lib/utils";

/** The one-line legend shown where coloured numbers and changes meet. */
export const COLOUR_LEGEND = "Green and red say whether a value is on target. Arrows and signs show which way it changed.";

/** A small chip next to a value: on target (green) or off it (red), in words that say which way is bad where the
 * polarity tells ("Too high", #15); nothing when there is no target. */
export function TargetChip({ metric, value, className, note, numberStyle }: { metric: Pick<Metric, "target_min" | "target_max" | "polarity"> & ValueUnit; value: number | null | undefined; className?: string; note?: string | null; numberStyle: NumberStyle }) {
  const s = targetStatus(metric, value);
  if (!s) return null;
  return (
    <span
      title={`${formatValue(metric, value, numberStyle)} against a target of ${targetText(metric, numberStyle)}${note ? `. ${note}` : ""}`}
      className={cn(
        "inline-flex items-center rounded-full border px-1.5 py-px text-xs leading-4 font-medium tracking-normal whitespace-nowrap",
        s === "on" ? "border-[color-mix(in_oklab,var(--color-success)_40%,transparent)] text-[var(--color-success)]" : "border-[color-mix(in_oklab,var(--destructive)_40%,transparent)] text-destructive",
        className,
      )}
    >
      {targetLabel(metric.polarity, s)}
    </span>
  );
}

/** A relative change as an arrow and a signed percentage, in the text colour: direction is not good or bad here. */
export function Change({ pct, className, size = "size-3.5", numberStyle }: { pct: number | null; className?: string; size?: string; numberStyle: NumberStyle }) {
  if (pct === null || !Number.isFinite(pct)) return <span className={className}>–</span>;
  const Icon = pct > 0 ? ArrowUpRight : pct < 0 ? ArrowDownRight : ArrowRight;
  return (
    <span className={cn("inline-flex items-center gap-0.5 whitespace-nowrap", className)}>
      <Icon aria-hidden className={size} />
      <span className="fig">{formatChange(pct * 100, numberStyle)}</span>
    </span>
  );
}

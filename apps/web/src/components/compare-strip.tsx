"use client";
// The comparison strip under a widget (GLOSSARY: Comparison, Attainment): one engine, one look everywhere.
import { compactValue, formatValue } from "@ziffr/core/format";
import { COMPARE_LABEL, resolverFrom, summary, type CompareKey } from "@ziffr/core/compare";
import type { CanvasData, Metric } from "@ziffr/core/types";
import { cn } from "@/lib/utils";

export const DEFAULT_COMPARE: CompareKey[] = ["prev", "yoy"];

const SHORT: Record<CompareKey, string> = { ...COMPARE_LABEL, prev: "vs prev." };

export function CompareStrip({ metric, data, keys = DEFAULT_COMPARE, full }: { metric: Metric; data: CanvasData; keys?: CompareKey[]; full?: boolean }) {
  if (!keys.length) return null;
  const s = summary(metric, resolverFrom(data.metrics, data.series), data.targets[metric.id], { keys, full });
  if (s.value === undefined) return null;
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-t border-border pt-1.5 text-[11px] leading-snug text-muted-foreground">
      {s.attainment !== null && (
        <span title={`Target ${formatValue(metric, s.target?.value ?? null)}${s.target?.fromSeries ? " from the target series" : ""}`}>
          <span className={cn("fig font-medium", s.attainment >= 100 ? "text-[var(--color-success)]" : "text-destructive")}>{s.attainment.toFixed(0)}%</span> of target
        </span>
      )}
      {s.comparisons.map((c) =>
        c.available ? (
          <span key={c.key} title={`${c.currentSpan}: ${formatValue(metric, c.current)} vs ${c.previousSpan}: ${formatValue(metric, c.previous)}`}>
            {SHORT[c.key]}{" "}
            <span className={cn("fig font-medium", c.good === true && "text-[var(--color-success)]", c.good === false && "text-destructive")}>
              {c.pct === null || c.pct === undefined ? `${c.abs! >= 0 ? "+" : ""}${compactValue(metric, c.abs!)}` : `${c.pct >= 0 ? "+" : ""}${c.pct.toFixed(1)}%`}
            </span>
          </span>
        ) : (
          <span key={c.key} title={c.reason}>{SHORT[c.key]} <span className="fig">n/a</span></span>
        ),
      )}
    </div>
  );
}

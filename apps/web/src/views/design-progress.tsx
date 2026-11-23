"use client";
// The progress mark of a View Design (GLOSSARY: View Design, Target Range): one compact bar per Metric, its latest value
// against its target. Where each fill ends, the target band or tick and every word are worked out by the core in
// progress-bars.ts; this file only turns them into boxes, from Theme tokens, so a widget, a Snapshot, a View Link and a
// deck's picture show the same numbers. Colour only ever means on or off target (see target-chip). It reaches no
// Metric outside the widget's own.
import { progressModel, type ProgressRow } from "@ziffr/core/progress-bars";
import type { DesignValues } from "./design-view";

const pct = (x: number) => `${Math.min(100, Math.max(0, x * 100))}%`;
/** The fill's colour: green on target, red off it, plain without a target. */
const tone = (s: ProgressRow["status"]) => (s === null ? "var(--color-data)" : s === "on" ? "var(--color-success)" : "var(--color-error)");

/** Each Metric's latest value against its target, one compact bar each, in the order of the Slots. */
export function ProgressMark({ v }: { v: DesignValues }) {
  const model = progressModel(v.metrics, v.data);
  if (!model.ok) return <p className="widget-text-xs mt-0.5 text-muted-foreground">{model.reason}</p>;
  return (
    // The chart is one picture with its text alternative: every name, value and word is in it, in order.
    <div role="img" aria-label={model.alt} className="flex min-h-0 w-full flex-1 flex-col justify-around gap-[0.6em]">
      {model.rows.map((r) => (
        <div key={r.id} title={r.target ? `${r.name}: ${r.value} against a target of ${r.target}` : undefined}>
          {/* The value and its words wrap under the name when they do not fit beside it, so a narrow card keeps every name whole. */}
          <div className="widget-text-xs flex flex-wrap items-baseline justify-between gap-x-[0.75em]">
            <span className="min-w-0 truncate">{r.name}</span>
            <span className="ml-auto flex shrink-0 items-baseline gap-[0.5em] whitespace-nowrap">
              <span className="fig font-medium">{r.value ?? "–"}</span>
              <span className={r.status && r.status !== "on" ? "text-destructive" : "text-muted-foreground"}>{r.words}</span>
            </span>
          </div>
          <div className="relative mt-[0.25em] h-[0.7em] min-h-2 w-full rounded-sm bg-[var(--color-paper-3)]">
            {r.band && <span className="absolute inset-y-0 rounded-sm bg-[color-mix(in_oklab,var(--color-ink)_16%,transparent)]" style={{ left: pct(r.band.from), width: pct(r.band.to - r.band.from) }} />}
            {r.fill !== null && <span className="absolute inset-y-[28%] left-0 rounded-sm" style={{ width: pct(r.fill), background: tone(r.status) }} />}
            {r.tick !== null && <span className="absolute inset-y-[-12%] w-[2px] -translate-x-1/2 bg-[var(--color-ink)]" style={{ left: pct(r.tick) }} />}
          </div>
        </div>
      ))}
    </div>
  );
}

"use client";
// The `range` mark of a View Design (GLOSSARY: View Design, Analysis Recipe; spec 0041, "Marks"): for each row an interval from its low to its
// high end ("likely between") with its middle value where it has one, such as a driver's effect with its range. It draws only the figures the
// core hands it (mark-figures.ts): every number is written there, in the Number Style; this file places bars on one shared axis that always
// holds 0, so a range that crosses 0 is seen to. Each row also says its numbers in words beside the bar, so no number is read off the
// drawing alone, and a screen reader gets them all in one sentence. The output's label is a small muted caption, apart from the figures.
import type { RangeFigures } from "@ziffr/core/mark-figures";
import { TONE } from "./design-plot";
import type { Tone } from "@ziffr/core/view-design";

/** The intervals of a recipe's effects, or the words that say why they cannot be drawn. */
export function DesignRange({ figures, tone, caption }: { figures: RangeFigures | undefined; tone?: Tone; caption?: string }) {
  if (!figures) return <p className="widget-text-xs text-muted-foreground">Nothing to draw yet.</p>;
  if (!figures.ok) return <p className="widget-text-xs text-muted-foreground">{figures.refusal}</p>;
  const lo = Math.min(0, ...figures.rows.map((r) => r.low));
  const hi = Math.max(0, ...figures.rows.map((r) => r.high));
  const at = (x: number) => ((x - lo) / (hi - lo || 1)) * 100;
  const colour = TONE[tone && tone !== "status" ? tone : "data"];
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1">
      {caption && <p className="widget-text-xs text-muted-foreground">{caption}</p>}
      <ul role="img" aria-label={figures.alt} className="flex flex-1 flex-col justify-center gap-[0.6em]">
        {figures.rows.map((r) => (
          <li key={r.label} aria-hidden className="widget-text-xs grid grid-cols-[minmax(0,8em)_minmax(4em,1fr)_minmax(0,auto)] items-center gap-[0.67em]" data-range={r.label}>
            <span className="truncate" title={r.label}>{r.label}</span>
            <span className="relative block h-[1.2em]">
              <span className="absolute inset-y-0 border-l border-[var(--color-rule-2)]" style={{ left: `${at(0)}%` }} />
              <span className="absolute top-1/2 h-[0.5em] -translate-y-1/2 rounded-full" style={{ left: `${at(r.low)}%`, width: `max(${at(r.high) - at(r.low)}%, 3px)`, background: colour, opacity: 0.35, border: `1px solid ${colour}` }} />
              {r.centre !== null && <span className="absolute top-1/2 size-[0.8em] -translate-x-1/2 -translate-y-1/2 rotate-45" style={{ left: `${at(r.centre)}%`, background: "var(--color-ink)" }} />}
            </span>
            <span className="fig text-right text-muted-foreground">{r.centreText !== null ? `${r.centreText}, ` : ""}{r.lowText} – {r.highText}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

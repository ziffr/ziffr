"use client";
// The slope mark of a View Design (GLOSSARY: View Design, Breakdown): two vertical axes, before on the left and now on
// the right, one line per row. Which rows, their values, the change in words, the two highlighted rows and where each
// label sits (moved apart so none collides) are worked out by the core in slope-chart.ts; this file only turns them
// into SVG, from Theme tokens, so a widget, a Snapshot, a View Link and a deck's picture show the same numbers. The
// direction is in the lines' slope and in the words at both ends, never in colour: every line is in the data tone and
// only the largest rise and the largest fall take the accent, with their words. It reaches no Metric outside the
// widget's own.
import { slopeModel, SLOPE_PLOT, type SlopeRow } from "@ziffr/core/slope-chart";
import type { DesignValues } from "./design-view";

const FONT = 11.5;
const TOP = 30;
const W = 560;
const LEFT = 175;
const RIGHT = 325;
// The plot is the core's SLOPE_PLOT tall, below the headings of the two axes.
const H = TOP + SLOPE_PLOT.height + 10;
const MAX_LEFT = LEFT - 8;
const MAX_RIGHT = W - RIGHT - 8;

const WIDE = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹯＀-｠]/u;
const widthOf = (text: string) => [...text].reduce((w, c) => w + (WIDE.test(c) ? 1 : 0.6) * FONT, 0);
/** A text shortened to fit `max` wide, ending in an ellipsis when something was cut: wide scripts take about twice the room. */
function fit(text: string, max: number): string {
  if (widthOf(text) <= max) return text;
  let out = "";
  for (const c of text) {
    if (widthOf(`${out}${c}…`) > max) break;
    out += c;
  }
  return `${out}…`;
}

/** Two moments side by side: one line per row, from its value before to its value now. */
export function SlopeMark({ v }: { v: DesignValues }) {
  const model = slopeModel(v.metrics, v.data, v.settings.slope ?? "auto", { asOf: v.settings.asOf ?? undefined });
  if (!model.ok) return <p className="widget-text-xs mt-0.5 text-muted-foreground">{model.reason}</p>;
  const y = (n: number) => TOP + n;
  const tone = (r: SlopeRow) => (r.mark ? "var(--color-accent)" : "var(--color-data)");
  return (
    <>
      <div className="relative min-h-40 w-full flex-1">
        <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 size-full" role="img" aria-label={model.alt}>
          <g fontSize={FONT} fill="var(--color-muted)" fontWeight={600}>
            <text x={LEFT} y={TOP - 12} textAnchor="middle">{model.beforeLabel}</text>
            <text x={RIGHT} y={TOP - 12} textAnchor="middle">{model.afterLabel}</text>
          </g>
          <line x1={LEFT} x2={LEFT} y1={TOP - 4} y2={y(SLOPE_PLOT.height) + 4} stroke="var(--color-rule)" strokeWidth={1} />
          <line x1={RIGHT} x2={RIGHT} y1={TOP - 4} y2={y(SLOPE_PLOT.height) + 4} stroke="var(--color-rule)" strokeWidth={1} />
          {model.rows.map((r) => (
            <g key={r.key}>
              {r.yBefore !== null && r.yAfter !== null && (
                <line x1={LEFT} y1={y(r.yBefore)} x2={RIGHT} y2={y(r.yAfter)} stroke={tone(r)} strokeWidth={r.mark ? 2.6 : 1.5} />
              )}
              {r.yBefore !== null && <circle cx={LEFT} cy={y(r.yBefore)} r={r.mark ? 3.6 : 2.8} fill={tone(r)} />}
              {r.yAfter !== null && <circle cx={RIGHT} cy={y(r.yAfter)} r={r.mark ? 3.6 : 2.8} fill={tone(r)} />}
              {r.labelBefore !== null && r.beforeText !== null && (
                // Each label is its own text, isolated, so a name written right to left and its value never run together.
                <text x={LEFT - 8} y={y(r.labelBefore) + FONT / 3} textAnchor="end" fontSize={FONT} fill="var(--color-ink)" style={{ unicodeBidi: "plaintext" }}>
                  <title>{r.name}</title>
                  {fit(r.name, MAX_LEFT - widthOf(r.beforeText) - (r.kind === "gone" ? widthOf(`  ${r.change}`) : 0) - 6)}{" "}
                  <tspan fontWeight={600}>{r.beforeText}</tspan>
                  {r.kind === "gone" && <tspan fill="var(--color-muted)">{`  ${r.change}`}</tspan>}
                </text>
              )}
              {r.labelAfter !== null && (
                <>
                  <text x={RIGHT + 8} y={y(r.labelAfter) + FONT / 3 - (r.mark ? SLOPE_PLOT.line / 2 : 0)} fontSize={FONT} fill="var(--color-ink)" textLength={widthOf(`${r.afterText ?? ""}  ${r.change}`) > MAX_RIGHT ? MAX_RIGHT : undefined} lengthAdjust="spacingAndGlyphs">
                    {r.afterText !== null && <tspan fontWeight={600}>{r.afterText}</tspan>}
                    {r.afterText !== null && "  "}
                    <tspan fill="var(--color-muted)">{r.change}</tspan>
                  </text>
                  {r.mark && (
                    <text x={RIGHT + 8} y={y(r.labelAfter) + FONT / 3 + SLOPE_PLOT.line / 2} fontSize={FONT} fontWeight={600} fill="var(--color-ink)">{r.mark === "largest rise" ? "Largest rise" : "Largest fall"}</text>
                  )}
                </>
              )}
            </g>
          ))}
        </svg>
      </div>
      <p className="widget-text-xs mt-0.5 text-muted-foreground">{model.rule}</p>
    </>
  );
}

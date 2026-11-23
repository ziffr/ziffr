"use client";
// The slope mark of a View Design (GLOSSARY: View Design, Breakdown): two vertical axes, before on the left and now on
// the right, one line per row. Which rows, their values, the change in words and the two highlighted rows are worked out
// by the core in slope-chart.ts; this file turns them into SVG, from Theme tokens, to the pixels of the card it is in, so
// the type is the widget's own size at any card size. The direction is in the lines' slope and in the words at both ends,
// never in colour: every line is in the data tone and only the largest rise and the largest fall take the accent, with
// their words. Labels are spaced apart here, in pixels, by the core's nudgeLabels, and give way to the room: a wide card
// writes name and value on the left and value, change and the highlight on the right, a middle one drops the amount of
// the change, a narrow one keeps the name and the percent. It reaches no Metric outside the widget's own.
import { nudgeLabels, slopeModel, SLOPE_PLOT, type SlopeRow } from "@ziffr/core/slope-chart";
import type { DesignValues } from "./design-view";
import { useBoxSize } from "./use-box-size";
import { useWidgetScale } from "./widget-scale";

const WIDE = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹯＀-｠]/u;
/** A text's width in pixels at a font size: wide scripts take about twice the room. */
const widthOf = (text: string, fs: number) => [...text].reduce((w, c) => w + (WIDE.test(c) ? 1 : 0.6) * fs, 0);
/** A text shortened to fit `max` wide, ending in an ellipsis when something was cut. */
function fit(text: string, max: number, fs: number): string {
  if (widthOf(text, fs) <= max) return text;
  let out = "";
  for (const c of text) {
    if (widthOf(`${out}${c}…`, fs) > max) break;
    out += c;
  }
  return `${out}…`;
}
/** The percent of a change written "+4,235 € (+12.3 %)": the part in brackets, else the whole. */
const percentOf = (change: string) => change.match(/\(([^)]*)\)/)?.[1] ?? change;

/** The words of a row's change that fit beside its value: the whole in a wide card, the percent in a middle one, the percent alone in a narrow one; nothing if even that does not fit. */
function changeWords(r: SlopeRow, detail: "full" | "mid" | "narrow", maxRight: number, fs: number): string {
  const taken = detail !== "narrow" && r.afterText ? widthOf(`${r.afterText}  `, fs) : 0;
  const text = detail === "full" ? r.change : percentOf(r.change);
  return taken + widthOf(text, fs) <= maxRight ? text : detail === "full" ? fit(text, Math.max(0, maxRight - taken), fs) : "";
}

/** Two moments side by side: one line per row, from its value before to its value now. */
export function SlopeMark({ v }: { v: DesignValues }) {
  const model = slopeModel(v.metrics, v.data, v.settings.slope ?? "auto", { asOf: v.settings.asOf ?? undefined });
  if (!model.ok) return <p className="widget-text-xs mt-0.5 text-muted-foreground">{model.reason}</p>;
  return <SlopeChart model={model} />;
}

function SlopeChart({ model }: { model: Extract<ReturnType<typeof slopeModel>, { ok: true }> }) {
  const scale = useWidgetScale();
  const [whole, all] = useBoxSize<HTMLDivElement>();
  const [box, size] = useBoxSize<HTMLDivElement>();
  // Until the box is measured (the first render on the server, a drawing made without a screen) a nominal size is drawn.
  const measured = size.w > 0 && size.h > 0;
  const W = measured ? size.w : 560;
  const H = measured ? size.h : 30 + SLOPE_PLOT.height + 10;
  const fs = 11 * scale;
  const detail = W / scale >= 460 ? "full" : W / scale >= 290 ? "mid" : "narrow";
  const headings = H >= 90 * scale;
  const top = headings ? fs * 2.2 : fs;
  const bottom = fs * 0.8;
  const plotH = Math.max(20, H - top - bottom);
  const unit = plotH / SLOPE_PLOT.height;
  const y = (n: number) => top + n * unit;
  const left = W * (detail === "full" ? 0.31 : detail === "mid" ? 0.38 : 0.34);
  const right = W * (detail === "full" ? 0.6 : detail === "mid" ? 0.68 : 0.72);
  const maxLeft = left - 8;
  const maxRight = W - right - 8;
  const tone = (r: SlopeRow) => (r.mark ? "var(--color-accent)" : "var(--color-data)");
  const rows = model.rows;
  // Labels spaced apart in pixels: a line of type each, two for a highlighted row's right label (its value and its words).
  const line = fs * 1.3;
  const before = rows.map((r, i) => ({ i, r })).filter(({ r }) => r.yBefore !== null && r.beforeText !== null);
  const after = rows.map((r, i) => ({ i, r })).filter(({ r }) => r.yAfter !== null);
  const beforeAt = nudgeLabels(before.map(({ r }) => ({ at: y(r.yBefore!), size: line })), top, top + plotH);
  const afterAt = nudgeLabels(after.map(({ r }) => ({ at: y(r.yAfter!), size: r.mark && detail === "full" ? line * 2 : line })), top, top + plotH);
  const beforeOf = new Map(before.map(({ i }, k) => [i, beforeAt[k]]));
  const afterOf = new Map(after.map(({ i }, k) => [i, afterAt[k]]));
  const showRule = all.h === 0 || all.h / scale >= 150;
  return (
    <div ref={whole} className="flex min-h-0 w-full flex-1 flex-col">
      <div ref={box} className="relative min-h-[5rem] w-full flex-1">
        <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 size-full" role="img" aria-label={model.alt}>
          {headings && (
            <g fontSize={fs} fill="var(--color-muted)" fontWeight={600}>
              <text x={left} y={fs * 1.1} textAnchor="middle">{model.beforeLabel}</text>
              <text x={right} y={fs * 1.1} textAnchor="middle">{model.afterLabel}</text>
            </g>
          )}
          <line x1={left} x2={left} y1={top - 4} y2={top + plotH + 4} stroke="var(--color-rule)" strokeWidth={1} />
          <line x1={right} x2={right} y1={top - 4} y2={top + plotH + 4} stroke="var(--color-rule)" strokeWidth={1} />
          {rows.map((r, i) => (
            <g key={r.key}>
              {r.yBefore !== null && r.yAfter !== null && (
                <line x1={left} y1={y(r.yBefore)} x2={right} y2={y(r.yAfter)} stroke={tone(r)} strokeWidth={r.mark ? 2.6 : 1.5} />
              )}
              {r.yBefore !== null && <circle cx={left} cy={y(r.yBefore)} r={r.mark ? 3.6 : 2.8} fill={tone(r)} />}
              {r.yAfter !== null && <circle cx={right} cy={y(r.yAfter)} r={r.mark ? 3.6 : 2.8} fill={tone(r)} />}
              {beforeOf.has(i) && r.beforeText !== null && (
                // Each label is its own text, isolated, so a name written right to left and its value never run together.
                <text x={left - 8} y={beforeOf.get(i)! + fs / 3} textAnchor="end" fontSize={fs} fill="var(--color-ink)" style={{ unicodeBidi: "plaintext" }}>
                  <title>{r.name}</title>
                  {fit(r.name, maxLeft - (detail === "narrow" ? 0 : widthOf(r.beforeText, fs)) - (r.kind === "gone" && detail === "full" ? widthOf(`  ${r.change}`, fs) : 0) - 6, fs)}
                  {detail !== "narrow" && <>{" "}<tspan fontWeight={600}>{r.beforeText}</tspan></>}
                  {r.kind === "gone" && detail === "full" && <tspan fill="var(--color-muted)">{`  ${r.change}`}</tspan>}
                </text>
              )}
              {afterOf.has(i) && (
                <>
                  <text x={right + 8} y={afterOf.get(i)! + fs / 3 - (r.mark && detail === "full" ? line / 2 : 0)} fontSize={fs} fill="var(--color-ink)" style={{ unicodeBidi: "plaintext" }}>
                    <title>{`${r.name}: ${r.afterText ?? ""} ${r.change}`}</title>
                    {detail !== "narrow" && r.afterText !== null && <tspan fontWeight={600}>{fit(r.afterText, maxRight, fs)}</tspan>}
                    {/* The change follows the value when it fits beside it; a middle card keeps the percent and drops the amount. */}
                    {changeWords(r, detail, maxRight, fs) && <tspan fill="var(--color-muted)" fontWeight={detail === "narrow" ? 600 : undefined}>{`${detail !== "narrow" && r.afterText ? "  " : ""}${changeWords(r, detail, maxRight, fs)}`}</tspan>}
                  </text>
                  {r.mark && detail === "full" && (
                    <text x={right + 8} y={afterOf.get(i)! + fs / 3 + line / 2} fontSize={fs} fontWeight={600} fill="var(--color-ink)">{r.mark === "largest rise" ? "Largest rise" : "Largest fall"}</text>
                  )}
                </>
              )}
            </g>
          ))}
        </svg>
      </div>
      {showRule && <p className="widget-text-xs mt-0.5 text-muted-foreground">{model.rule}</p>}
    </div>
  );
}

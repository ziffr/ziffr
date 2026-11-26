// Draws a Slide Element (GLOSSARY: Slide Element, Theme; spec 0057) at its size on a slide, in the Theme's colours and
// fonts. Inline styles and Theme custom properties only, so a slide looks the same in the editor, when presented and in
// the image tldraw makes of it for PDF. Every run of words stands in an element marked `data-words`, and every figure is
// plain HTML or SVG, which is what the PowerPoint export reads back (element-pptx.ts).
// Visibility: the figures come from slide-figures.ts, which draws nothing of a Metric the viewer may not see.
import type { CSSProperties, ReactNode } from "react";
import { columnsModel, figureModel, fillSlideWords, gapModel, metricTableModel, NO_ACCESS, type SlideContext } from "@ziffr/core/slide-figures";
import type { SlideElement, SlideTone, WordsElement } from "@ziffr/core/slide-element";

/** A Theme colour by its role. */
export const tone = (t: SlideTone | "bad-soft") => `var(--tone-${t})`;

/** What an element is drawn from: its figures' context, its size on the slide and the Theme's logo. */
export type ElementProps = { element: SlideElement; context: SlideContext; w: number; h: number; logo?: string | null };

const HEADING = "var(--slide-heading)";
const BODY = "var(--slide-body)";
const base: CSSProperties = { width: "100%", height: "100%", boxSizing: "border-box", fontFamily: BODY, color: tone("ink"), fontVariantNumeric: "tabular-nums", lineHeight: "normal", letterSpacing: "normal", textAlign: "left", textRendering: "geometricPrecision" };
const oneLine: CSSProperties = { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
const caption: CSSProperties = { fontSize: 12, letterSpacing: "0.06em", textTransform: "uppercase", color: tone("muted") };

/** A run of words, marked for the PowerPoint export. */
function Words({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div data-words style={style}>{children}</div>;
}

/** Said in place of figures the viewer may not see, or that do not exist yet. */
function Instead({ words }: { words: string }) {
  return (
    <div style={{ ...base, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 8 }}>
      <Words style={{ fontSize: 13, color: tone("muted"), textAlign: "center" }}>{words}</Words>
    </div>
  );
}

const ALIGN = { start: "left", middle: "center", end: "right" } as const;
const VALIGN = { top: "flex-start", middle: "center", bottom: "flex-end" } as const;

function Paragraphs({ e, context }: { e: WordsElement; context: SlideContext }) {
  const say = (t: string) => fillSlideWords(t, context).text;
  const heading = e.font === "heading";
  const footer = e.foot && context.footer ? context.footer : "";
  return (
    <div style={{ ...base, display: "flex", flexDirection: "column", justifyContent: VALIGN[e.valign ?? "top"], fontFamily: heading ? HEADING : BODY, fontSize: e.size ?? 17, fontWeight: e.weight ?? (heading ? 600 : 400), lineHeight: e.line ?? "normal", letterSpacing: e.tracking ? `${e.tracking}em` : "normal", textTransform: e.caps ? "uppercase" : "none", textAlign: ALIGN[e.align ?? "start"], color: tone(e.tone ?? "ink"), opacity: e.opacity ?? 1 }}>
      {e.text.map((p, i) => {
        const after = footer && i === e.text.length - 1 ? `${p ? " · " : ""}${footer}` : "";
        const lead = i === 0 && e.lead ? say(e.lead) : "";
        const words = `${say(p)}${after}`;
        return (
          <Words key={i} style={{ whiteSpace: "pre-wrap", overflowWrap: "break-word" }}>
            {lead && <span style={{ color: tone(e.leadTone ?? e.tone ?? "ink"), fontWeight: e.leadWeight ?? 700 }}>{lead}</span>}
            {words || (lead ? "" : " ")}
          </Words>
        );
      })}
    </div>
  );
}

// A value too long for its figure is drawn smaller rather than broken in two; a digit is about 0.62 of its size wide.
const fitted = (text: string, room: number, size: number) => Math.max(14, Math.min(size, Math.floor(room / (Math.max(text.length, 1) * 0.6))));

function Figure({ element, context, w }: ElementProps & { element: Extract<SlideElement, { kind: "figure" }> }) {
  const f = figureModel(element, context);
  if (f.denied) return <Instead words={NO_ACCESS} />;
  const plain = f.strong ? tone("cover-text") : tone("muted");
  const signalled = f.noteTone !== "muted" && !f.strong;
  return (
    <div style={{ ...base, padding: "16px 20px", background: tone(f.strong ? "cover" : "canvas"), color: tone(f.strong ? "cover-text" : "ink"), overflow: "hidden" }}>
      <Words style={{ ...oneLine, fontSize: 13, color: plain }}>{f.label}</Words>
      <Words style={{ ...oneLine, fontSize: fitted(f.value, w - 40, 40), fontWeight: 700, minHeight: "1.2em" }}>{f.value}</Words>
      {f.note && <Words style={{ fontSize: 13, color: signalled ? tone(f.noteTone as "good" | "bad") : plain, fontWeight: signalled ? 600 : 400 }}>{f.note}</Words>}
    </div>
  );
}

const COLUMNS_HEAD = 26;

function Columns({ element, context, w, h }: ElementProps & { element: Extract<SlideElement, { kind: "columns" }> }) {
  const c = columnsModel(element, context);
  if (c.denied) return <Instead words={NO_ACCESS} />;
  const height = Math.max(60, h - COLUMNS_HEAD);
  // The labels under the columns take 32 pixels; the tallest column leaves 34 above it for its value.
  const floor = height - 32;
  const top = Math.max(...c.columns.flatMap((x) => [x.total ?? 0, x.part ?? 0]), c.reference?.value ?? 0, 0);
  const tall = (v: number) => (top > 0 ? Math.round((Math.max(0, v) / top) * Math.max(0, floor - 34)) : 0);
  const step = (w - 64) / Math.max(1, c.columns.length);
  const bar = Math.max(2, Math.min(84, step * (84 / 136)));
  const every = Math.max(1, Math.ceil(52 / Math.max(step, 1)));
  const refEnd = c.reference ? w - Math.max(60, c.reference.label.length * 8 + 14) : w;
  const text = (size: number, fill: SlideTone, weight = 400): CSSProperties => ({ fontSize: size, fill: tone(fill), fontWeight: weight });
  return (
    <div style={base}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, height: COLUMNS_HEAD, borderBottom: `1px solid ${tone("ink")}`, fontSize: 14, fontWeight: 600 }}>
        <Words style={{ ...oneLine, minWidth: 0 }}>{c.title}</Words>
        {c.legend.length > 0 && (
          <div style={{ display: "flex", gap: 20, fontWeight: 400, color: tone("muted"), flexShrink: 0 }}>
            {c.legend.map((l) => (
              <div key={l.tone} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 12, height: 12, background: tone(l.tone) }} />
                <Words style={{ whiteSpace: "nowrap" }}>{l.label}</Words>
              </div>
            ))}
          </div>
        )}
      </div>
      {c.columns.length === 0 ? (
        <div style={{ height }}><Instead words="No values yet." /></div>
      ) : (
        <svg role="img" aria-label={c.description} width={w} height={height} viewBox={`0 0 ${w} ${height}`} style={{ display: "block", overflow: "visible" }}>
          <line x1={0} y1={floor} x2={w} y2={floor} style={{ stroke: tone("ink"), strokeWidth: 1 }} />
          {c.columns.map((col, i) => {
            const x = i * step + (step - bar) * (24 / 52);
            const total = col.total === null ? 0 : tall(col.total);
            // The part never stands above its column.
            const part = col.part === null ? 0 : Math.min(total, tall(col.part));
            const split = element.part;
            return (
              <g key={col.period}>
                {split && total > part && <rect x={x} y={floor - total} width={bar} height={total - part} style={{ fill: tone("soft") }} />}
                {(split ? part : total) > 0 && <rect x={x} y={floor - (split ? part : total)} width={bar} height={split ? part : total} style={{ fill: tone("accent") }} />}
                {col.total !== null && step >= 34 && <text x={x + bar / 2} y={floor - total - 6} textAnchor="middle" style={text(step < 60 ? 12 : 15, "ink", 600)}>{col.text}</text>}
                {(c.columns.length - 1 - i) % every === 0 && <text x={x + bar / 2} y={height - 10} textAnchor="middle" style={text(13, "muted")}>{col.label}</text>}
              </g>
            );
          })}
          {c.reference && (
            <g>
              <line x1={0} y1={floor - tall(c.reference.value)} x2={refEnd} y2={floor - tall(c.reference.value)} style={{ stroke: tone("ink"), strokeWidth: 2, strokeDasharray: "8 6" }} />
              <text x={w} y={floor - tall(c.reference.value) + 4} textAnchor="end" style={text(13, "ink", 700)}>{c.reference.label}</text>
            </g>
          )}
        </svg>
      )}
    </div>
  );
}

// The heights of a table: its heading line with the rule under it, and the least a row may shrink to.
const TABLE_HEAD = 25;
const ROW_MIN = 28;

/** How many rows fit under a table's heading and how tall each is; when not all fit, the last line says how many do not. */
function rowsThatFit(count: number, h: number, most: number) {
  const room = Math.max(ROW_MIN, h - TABLE_HEAD);
  const height = Math.min(most, Math.max(ROW_MIN, Math.floor(room / Math.max(1, count))));
  const fit = Math.max(1, Math.floor(room / height));
  return count <= fit ? { height, shown: count, more: 0 } : { height, shown: Math.max(1, fit - 1), more: count - Math.max(1, fit - 1) };
}

const More = ({ n }: { n: number }) => (n > 0 ? <Words style={{ fontSize: 13, color: tone("muted"), paddingTop: 6 }}>{`and ${n} more`}</Words> : null);

const grid = (widths: number[]): CSSProperties => ({ display: "grid", gridTemplateColumns: `${widths.map((x) => `${x}px`).join(" ")} minmax(0, 1fr)` });
const headLine: CSSProperties = { ...caption, height: TABLE_HEAD, boxSizing: "border-box", borderBottom: `2px solid ${tone("ink")}` };
const right: CSSProperties = { ...oneLine, textAlign: "right" };

function GapTable({ element, context, w, h }: ElementProps & { element: Extract<SlideElement, { kind: "gap-table" }> }) {
  const g = gapModel(element, context);
  if (g.denied) return <Instead words={NO_ACCESS} />;
  // At the design's width the columns are fixed; a narrower table gives each its share.
  const k = Math.min(1, w / 1000);
  const widths = [Math.round(240 * k), Math.round(130 * k), Math.round(130 * k)];
  const cell = w - widths[0] - widths[1] - widths[2];
  const pad = Math.round(40 * k);
  const chart = Math.max(80, Math.min(600, cell - pad));
  const zero = chart * 0.6;
  const gaps = g.rows.map((r) => r.gap ?? 0);
  const below = Math.max(0, -Math.min(0, ...gaps));
  const above = Math.max(0, ...gaps);
  // One scale either side of zero, with room left for the numbers past the longest bar.
  const per = Math.min(below ? (chart * 0.45) / below : Infinity, above ? (chart * 0.3) / above : Infinity);
  const rows = rowsThatFit(g.rows.length, h, 68);
  const bar = Math.min(40, rows.height - 4);
  return (
    <div style={base}>
      <div style={{ ...grid(widths), ...headLine }}>
        <Words style={oneLine}>{g.head.row}</Words>
        <Words style={right}>{g.head.goal}</Words>
        <Words style={right}>{g.head.actual}</Words>
        <Words style={{ ...oneLine, textAlign: "center" }}>{g.head.gap}</Words>
      </div>
      {g.empty && <Words style={{ fontSize: 15, color: tone("muted"), paddingTop: 20 }}>{g.empty}</Words>}
      {g.rows.slice(0, rows.shown).map((r) => {
        const long = r.gap === null || r.gap === 0 ? 0 : Math.max(3, Math.round(Math.abs(r.gap) * per));
        const up = (r.gap ?? 0) >= 0;
        return (
          <div key={r.label} style={{ ...grid(widths), alignItems: "center", height: rows.height, boxSizing: "border-box", borderBottom: `1px solid ${tone("rule")}`, fontSize: 17 }}>
            <Words style={{ ...oneLine, fontWeight: 600 }}>{r.label}</Words>
            <Words style={{ ...right, color: tone("muted") }}>{r.goal}</Words>
            <Words style={{ ...right, fontSize: 20, fontWeight: 600 }}>{r.actual}</Words>
            <div style={{ paddingLeft: pad, display: "flex" }}>
              <svg aria-hidden="true" width={chart} height={bar} viewBox={`0 0 ${chart} ${bar}`} style={{ display: "block", overflow: "visible" }}>
                <line x1={zero} y1={0} x2={zero} y2={bar} style={{ stroke: tone("ink"), strokeWidth: 1 }} />
                {long > 0 && <rect x={up ? zero : zero - long} y={bar * 0.225} width={long} height={bar * 0.55} style={{ fill: tone(up ? "good" : "bad") }} />}
                <text x={up ? zero + 10 + long : zero - 10 - long} y={bar / 2 + 6} textAnchor={up ? "start" : "end"} style={{ fontSize: 15, fontWeight: 700, fill: tone("ink") }}>{r.gapText}</text>
              </svg>
            </div>
          </div>
        );
      })}
      <More n={rows.more} />
    </div>
  );
}

function MetricTable({ element, context, w, h }: ElementProps & { element: Extract<SlideElement, { kind: "metric-table" }> }) {
  const t = metricTableModel(element, context);
  if (!t.rows.length) return <Instead words={NO_ACCESS} />;
  const k = w / 1152;
  const widths = [300, 160, 150, 150, 212].map((x) => Math.round(x * k));
  const rows = rowsThatFit(t.rows.length, h, 60);
  const spark = Math.max(40, Math.min(130, widths[4] - 60));
  return (
    <div style={base}>
      <div style={{ ...grid(widths), ...headLine }}>
        <Words style={oneLine}>{t.head.metric}</Words>
        <Words style={right}>{t.head.latest}</Words>
        <Words style={right}>{t.head.previous}</Words>
        <Words style={right}>{t.head.change}</Words>
        <Words style={{ ...oneLine, paddingLeft: 36 * k }}>{t.head.trend}</Words>
        <Words style={oneLine}>{t.head.status}</Words>
      </div>
      {t.rows.slice(0, rows.shown).map((r) => {
        const values = r.trend.filter((v): v is number => v !== null);
        const low = Math.min(...values), high = Math.max(...values);
        const at = (v: number, i: number) => ({ x: 5 + (i * (spark - 10)) / Math.max(1, r.trend.length - 1), y: high === low ? 15 : 26 - ((v - low) / (high - low)) * 22 });
        const dots = r.trend.flatMap((v, i) => (v === null ? [] : [at(v, i)]));
        const colour = tone(r.changeSignal ?? "muted");
        return (
          <div key={r.name} style={{ ...grid(widths), alignItems: "center", height: rows.height, boxSizing: "border-box", borderBottom: `1px solid ${tone("rule")}`, fontSize: 16, ...(r.status === "off" ? { background: tone("bad-soft") } : {}) }}>
            <Words style={{ ...oneLine, fontWeight: 600, paddingLeft: 8 }}>{r.name}</Words>
            <Words style={{ ...right, fontSize: 21, fontWeight: 600 }}>{r.latest}</Words>
            <Words style={{ ...right, color: tone("muted") }}>{r.previous}</Words>
            <Words style={{ ...right, fontWeight: 600, color: colour }}>{r.change}</Words>
            <div style={{ paddingLeft: 36 * k, display: "flex" }}>
              {dots.length > 0 && (
                <svg aria-hidden="true" width={spark} height={30} viewBox={`0 0 ${spark} 30`} style={{ display: "block", overflow: "visible" }}>
                  <polyline points={dots.map((d) => `${d.x},${d.y}`).join(" ")} style={{ fill: "none", stroke: tone("accent"), strokeWidth: 2 }} />
                  <circle cx={dots.at(-1)!.x} cy={dots.at(-1)!.y} r={3.5} style={{ fill: tone("accent") }} />
                </svg>
              )}
            </div>
            {r.status ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, color: tone(r.status === "on" ? "good" : "bad") }}>
                {/* A dot on target, a square off it, so colour never stands alone. */}
                <span style={{ width: 10, height: 10, flexShrink: 0, borderRadius: r.status === "on" ? 5 : 0, background: tone(r.status === "on" ? "good" : "bad") }} />
                <Words style={oneLine}>{r.status === "on" ? "On target" : "Off target"}</Words>
              </div>
            ) : <span />}
          </div>
        );
      })}
      <More n={rows.more} />
    </div>
  );
}

function List({ element, context }: ElementProps & { element: Extract<SlideElement, { kind: "list" }> }) {
  const say = (t: string) => fillSlideWords(t, context).text;
  return (
    <div style={{ ...base, display: "flex", flexDirection: "column", justifyContent: "center", gap: 8, overflow: "hidden" }}>
      {element.title && <Words style={{ fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: tone("accent"), fontWeight: 600, paddingBottom: 14 }}>{say(element.title)}</Words>}
      {element.items.map((item, i) => (
        <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 18, padding: "18px 0", borderTop: `1px solid ${tone("rule")}` }}>
          <Words style={{ fontFamily: HEADING, fontSize: 26, color: tone("accent"), width: 40, flexShrink: 0 }}>{String(i + 1).padStart(2, "0")}</Words>
          <Words style={{ flex: 1, minWidth: 0, fontSize: 18, fontWeight: 500 }}>{say(item.text)}</Words>
          {item.note && <Words style={{ fontSize: 13, color: tone("muted"), whiteSpace: "nowrap" }}>{say(item.note)}</Words>}
        </div>
      ))}
    </div>
  );
}

function Logo({ element, context, h, logo }: ElementProps & { element: Extract<SlideElement, { kind: "logo" }> }) {
  const end = (element.align ?? "end") === "end";
  const place: CSSProperties = { ...base, display: "flex", justifyContent: end ? "flex-end" : "flex-start", alignItems: "flex-start" };
  // eslint-disable-next-line @next/next/no-img-element
  if (logo) return <div style={place}><img src={logo} alt="" style={{ maxWidth: "100%", maxHeight: h, objectFit: "contain" }} /></div>;
  const colour = element.tone ?? "muted";
  const big = element.size === "m";
  return (
    <div style={place}>
      <div style={{ position: "relative", padding: big ? "10px 26px" : "6px 18px" }}>
        <span data-outline style={{ position: "absolute", inset: 0, border: `1px dashed ${tone(colour)}`, opacity: colour === "muted" ? 1 : 0.55 }} />
        <Words style={{ fontSize: big ? 13 : 12, letterSpacing: big ? "0.14em" : "0.1em", textTransform: "uppercase", color: tone(colour), whiteSpace: "nowrap" }}>{fillSlideWords(element.text ?? "Your logo", context).text}</Words>
      </div>
    </div>
  );
}

// The cover's ornament, drawn in its own 780 by 720 and kept against the bottom right corner of its box.
function Art() {
  return (
    <svg aria-hidden="true" width="100%" height="100%" viewBox="0 0 780 720" preserveAspectRatio="xMaxYMax slice" style={{ display: "block" }}>
      {[160, 260, 360, 460, 560].map((r) => <circle key={r} cx={780} cy={720} r={r} style={{ fill: "none", stroke: tone("cover-text"), strokeOpacity: 0.09, strokeWidth: 1 }} />)}
      <polyline points="64,640 160,618 256,628 352,584 448,592 544,540 640,510 716,462" style={{ fill: "none", stroke: tone("cover-accent"), strokeWidth: 3 }} />
      <circle cx={716} cy={462} r={7} style={{ fill: tone("cover-accent") }} />
    </svg>
  );
}

/** A Slide Element drawn at `w` by `h` slide pixels. */
export function SlideElementView(props: ElementProps) {
  const e = props.element;
  if (e.kind === "words") return <Paragraphs e={e} context={props.context} />;
  if (e.kind === "box") return <div data-box style={{ width: "100%", height: "100%", boxSizing: "border-box", background: e.fill ? tone(e.fill) : "transparent", border: e.edge ? `1px ${e.dashed ? "dashed" : "solid"} ${tone(e.edge)}` : "none", opacity: e.opacity ?? 1 }} />;
  if (e.kind === "figure") return <Figure {...props} element={e} />;
  if (e.kind === "columns") return <Columns {...props} element={e} />;
  if (e.kind === "gap-table") return <GapTable {...props} element={e} />;
  if (e.kind === "metric-table") return <MetricTable {...props} element={e} />;
  if (e.kind === "list") return <List {...props} element={e} />;
  if (e.kind === "logo") return <Logo {...props} element={e} />;
  return <Art />;
}

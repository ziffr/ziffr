// What the browser check draws (spec 0069; GLOSSARY: Slide, Slide Type, Theme): a sample of every slide type, a made-up
// deck, content that exercises the frame, the charts and a table, and Themes that try the colour rules. A new slide
// type adds its sample to SAMPLES; the check fails until it has one. Test material: no screen imports it.
import { chartTitle, drawChart, type ChartSpec } from "@ziffr/core/deck-drawing/chart";
import type { DeckDrawingInput } from "@ziffr/core/deck-drawing/draw-deck";
import { textBody, type Cell, type Row } from "@ziffr/core/deck-drawing/objects";
import type { Aside, Region, SlideSource, SlideType } from "@ziffr/core/deck-drawing/slide-type";
import type { Role } from "@ziffr/core/deck-drawing/theme";
import { STANDARD_THEMES } from "@ziffr/core/standard-themes";
import { STARTER_THEME } from "@ziffr/core/themes";
import type { CanvasData, ThemeSlides, ThemeTokens } from "@ziffr/core/types";

/** One sample of a slide type: what its description says, and the data it reads. */
export type Sample = { slide?: Partial<SlideSource>; data?: Partial<CanvasData> };

/** The samples of every slide type Ziffr has, by type: one or more, among them its hardest (long, empty, negative). */
export const SAMPLES: Record<string, Sample[]> = { cover: [{}] };

/** A made-up logo: three bars and a block, as a picture carried in the drawing. */
const LOGO = `data:image/svg+xml;base64,${btoa('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="40" viewBox="0 0 160 40"><rect x="2" y="20" width="8" height="16" fill="#E0707F"/><rect x="14" y="12" width="8" height="24" fill="#C24B5A"/><rect x="26" y="4" width="8" height="32" fill="#9B2C3B"/><rect x="46" y="12" width="110" height="16" rx="3" fill="#44505C"/></svg>')}`;

const look = (tokens: ThemeTokens, more: Partial<ThemeSlides> = {}): DeckDrawingInput["theme"] => ({ tokens, slides: { ...STARTER_THEME.slides, ...more } });
const standard = (key: string) => STANDARD_THEMES.find((t) => t.key === key)!.tokens;
const light = standard("ziffr-light");

/** The Themes of the check: the standard ones, the starter one, the fonts none of them has, and colours hard to read. */
export const THEMES: Record<string, DeckDrawingInput["theme"]> = {
  ...Object.fromEntries(STANDARD_THEMES.map((t) => [t.key, look(t.tokens, { footer: "Confidential · Northwind GmbH", logo: LOGO, logo_ratio: 4 })])),
  starter: look(STARTER_THEME.tokens),
  franklin: look({ ...light, accent: "#B24A38", fontHeading: "libre-franklin", fontBody: "libre-franklin" }, { logo: LOGO, logo_ratio: 4 }),
  georgia: look({ ...standard("paris"), fontHeading: "georgia", fontBody: "arial" }, { show_slide_number: false }),
  mono: look({ ...standard("ziffr-dark"), fontHeading: "ibm-plex-mono", fontBody: "geist-mono" }),
  faint: look({ ...light, canvas: "#FFFFFF", muted: "#C4C8CE", accent: "#FFE45C", good: "#7BE0A0", bad: "#FFB3A0", ink: "#8A8F99", cover: "#8C8F94", fontHeading: "playfair", fontBody: "inter" }, { footer: "Pale colours" }),
};

const QUARTERS = ["Q4 2024", "Q1 2025", "Q2 2025", "Q3 2025", "Q4 2025", "Q1 2026", "Q2 2026", "Q3 2026"];
const one = (v: number) => v.toFixed(1).replace("-", "−");

const revenue: ChartSpec = {
  kind: "columns",
  categories: QUARTERS,
  alt: "Revenue by quarter against its target",
  series: [
    { name: "Revenue", values: [9.6, 10.1, 10.8, 11.0, 11.7, 11.2, 11.9, 12.4], color: "neutral", pointColors: [...Array<Role>(7).fill("neutral"), "accent"], words: [9.6, 10.1, 10.8, 11.0, 11.7, 11.2, 11.9, 12.4].map(one) },
    { name: "Target", values: [9.5, 10.0, 10.5, 11.0, 11.4, 11.5, 11.8, 12.0], color: "ink", as: "marks", endLabel: "Target" },
  ],
};

const retention: ChartSpec = {
  kind: "line",
  categories: QUARTERS,
  alt: "Gross margin by quarter against its target",
  series: [
    { name: "Gross margin", values: [62.8, 62.9, 62.4, 62.1, 61.6, 61.9, 61.5, 61.2], color: "accent", words: [62.8, 62.9, 62.4, 62.1, 61.6, 61.9, 61.5, 61.2].map(one), endLabel: "Gross margin" },
    { name: "Target", values: Array<number>(8).fill(63), color: "muted", dash: true, endLabel: "Target 63.0" },
  ],
};

const months = Array.from({ length: 24 }, (_, i) => `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][i % 12]} ${i < 12 ? 2025 : 2026}`);
const swings = months.map((_, i) => (i === 5 ? null : Math.round((Math.sin(i / 2.4) * 8 - 1.5) * 10) / 10));
const net: ChartSpec = { kind: "columns", categories: months, alt: "Net change by month", series: [{ name: "Net change", values: swings, color: "accent", pointColors: swings.map((v) => ((v ?? 0) < 0 ? "bad" : "good")), words: swings.map((v) => (v === null ? null : one(v))) }] };
const mix: ChartSpec = {
  kind: "columns",
  stacked: true,
  categories: QUARTERS.slice(4),
  alt: "Revenue by segment",
  series: [
    { name: "Enterprise", values: [5.1, 5.0, 5.4, 5.9], color: "accent", words: ["5.1", "5.0", "5.4", "5.9"], wordColor: "onaccent", endLabel: "Enterprise" },
    { name: "Mid-market", values: [4.2, 4.0, 4.3, 4.4], color: "neutral", words: ["4.2", "4.0", "4.3", "4.4"], endLabel: "Mid-market" },
    { name: "Small business", values: [2.4, 2.2, 2.2, 2.1], color: "neutral2", words: ["2.4", "2.2", "2.2", "2.1"], endLabel: "Small business" },
  ],
};
const empty: ChartSpec = { kind: "line", categories: QUARTERS, alt: "No values", series: [{ name: "Nothing yet", values: QUARTERS.map(() => null), color: "accent" }] };

type Charts = { charts: [string, string, ChartSpec][] };

/** Charts side by side, each under its title. */
const charts: SlideType<Charts> = {
  id: "sample-chart",
  section: "Performance",
  fill: () => ({ headline: "", source: "", cannot: "A sample is filled by the check." }),
  draw({ charts: list }, { x, y, w, h, pen, measure }: Region) {
    const cw = (w - 32 * (list.length - 1)) / list.length;
    return list.flatMap(([title, unit, spec], i) => {
      const cx = x + i * (cw + 32);
      return [...chartTitle(pen, measure, { x: cx, y, w: cw }, title, unit), drawChart(pen, measure, { x: cx, y: y + 32, w: cw, h: h - 32 }, spec).object];
    });
  },
};

type Figures = { head: string[]; rows: string[][] };

/** A table of figures, the first column the widest. */
const table: SlideType<Figures> = {
  id: "sample-table",
  section: "Drivers",
  wide: true,
  fill: () => ({ headline: "", source: "", cannot: "A sample is filled by the check." }),
  draw({ head, rows }: Figures, { x, y, w, pen }: Region) {
    const first = Math.round(w * 0.34);
    const other = (w - first) / (head.length - 1);
    const cell = (words: string, column: number, header: boolean): Cell => ({
      body: textBody([words], { size: header ? 12 : 13, bold: header, color: header ? "muted" : "ink", align: column ? "right" : "left", valign: "middle", inset: [8, 4, 8, 4] }),
      borderBottom: { color: header ? "ink" : "rule", width: 1 },
      fill: !header && words.startsWith("×") ? "badsoft" : undefined,
    });
    const all: Row[] = [{ h: 36, header: true, cells: head.map((words, i) => cell(words, i, true)) }, ...rows.map((row) => ({ h: 44, cells: row.map((words, i) => cell(words, i, false)) }))];
    return [pen.table(x, y, [first, ...Array<number>(head.length - 1).fill(other)], all, "Every figure")];
  },
};

type Said = { headline: string; source: string; content: unknown; type: SlideType<never> | SlideType; aside?: Aside; note?: string; section?: string };

/** A slide type that says exactly this. */
function saying(id: string, said: Said): SlideType {
  const type = said.type as SlideType;
  return { ...type, id, section: said.section ?? type.section, fill: () => ({ headline: said.headline, source: said.source, aside: said.aside, note: said.note, content: said.content }) };
}

const scorecard: Figures = {
  head: ["Metric", "Latest", "Before", "Change", "Target", "Status"],
  rows: [
    ["Revenue, M€", "12.4", "11.9", "+0.5", "12.0", "✓ On target"],
    ["Gross margin, %", "61.2", "61.5", "−0.3", "63.0", "× Off target"],
    ["Net revenue retention, %", "109", "111", "−2", "112", "× Off target"],
    ["Customer acquisition cost, k€", "5.90", "6.10", "−0.20", "6.00", "✓ On target"],
    ["Months of runway", "18.6", "19.8", "−1.2", "18.0", "✓ On target"],
    ["Customer satisfaction, of 5", "4.3", "4.4", "−0.1", "4.5", "× Off target"],
  ],
};

const aside = {
  heading: "So what",
  points: [
    { lead: "Above target twice running", words: "The last two quarters closed above their targets." },
    { lead: "Growth came from large accounts", words: "Enterprise added 0.5 M€; small business fell by 0.1 M€." },
  ],
  figure: { value: "12.4 M€", words: "Revenue in the third quarter, 3 % above its target" },
};

/** The sample content slides: realistic ones first, then the hard ones. */
export const CONTENT_TYPES: Record<string, SlideType> = Object.fromEntries(
  [
    saying("summary-sample", { type: charts, section: "Summary", headline: "Revenue reached 12.4 M€ in the third quarter, 3 % above its target", source: "Ziffr; Revenue, entered by Finance", aside, content: { charts: [["Revenue by quarter", "M€", revenue]] } }),
    saying("lines-sample", { type: charts, headline: "Gross margin fell to 61.2 % and has been under its target for eight quarters", source: "Ziffr; Gross margin, calculated from Revenue and Cost of sales", content: { charts: [["Gross margin by quarter", "%", retention]] } }),
    saying("two-charts-sample", { type: charts, headline: "Enterprise grew while mid-market held and small business slipped", source: "Ziffr; Revenue by segment; Net change in customers", note: "Net change counts customers won less customers lost.", content: { charts: [["Revenue by segment", "M€", mix], ["Net change in customers", "customers", net]] } }),
    saying("table-sample", { type: table, headline: "Three of six figures are off target, led by gross margin and retention", source: "Ziffr; six Metrics, latest complete quarter", content: scorecard }),
    saying("row-sample", { type: { ...table, id: "row" }, headline: "Every figure with its change since the quarter before", source: "Ziffr; six Metrics, latest complete quarter", aside, content: { head: scorecard.head, rows: scorecard.rows.slice(0, 3) } }),
    saying("empty-sample", { type: charts, headline: "No value has been entered for this period yet", source: "Ziffr; Revenue", content: { charts: [["Revenue by quarter", "M€", empty]] } }),
    { ...charts, id: "cannot-sample", section: "Questions", fill: () => ({ headline: "The change since the quarter before cannot be shown", source: "Ziffr; Revenue by segment", cannot: "The parts of this Total no longer cover the same periods, so a step per part would mislead. Make the slide again to choose other Metrics." }) },
  ].map((type) => [type.id, type as SlideType]),
);

/** The slide of a sample, as a description lists it. */
export const slideOf = (type: string, more: Partial<SlideSource> = {}): SlideSource => ({ id: `sl_${type}`, type, metrics: [], options: {}, headline: null, ...more });

/** The data of the samples: none of the content samples reads any. */
const NO_DATA = { metrics: [], series: {} } as unknown as CanvasData;

/** The made-up deck of the check, without its design, Theme and slides. */
export const DECK = { name: "Northwind quarterly business review", period: "Third quarter 2026", date: "9 October 2026", data: NO_DATA };

/** A deck made to be hard to draw, from the longest names the shipped Packs use. */
export function hardDeck(names: string[]): { name: string; period: string; footer: string; slides: SlideSource[] } {
  const long = (length: number) => names.join(" and ").slice(0, length).trim();
  return {
    name: long(120),
    period: long(80),
    footer: long(120),
    slides: [
      slideOf("cover"),
      ...["summary-sample", "lines-sample", "table-sample", "row-sample", "cannot-sample"].map((type) => slideOf(type, { headline: long(140) })),
      { ...slideOf("two-charts-sample", { headline: `Supercalifragilisticexpialidocious${long(70)}` }), id: "sl_word" },
      { ...slideOf("empty-sample"), id: "sl_hidden", hidden: true },
    ],
  };
}

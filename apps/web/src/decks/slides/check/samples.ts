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
import type { BreakdownRow, CanvasData, Metric, ThemeSlides, ThemeTokens } from "@ziffr/core/types";

/** One sample of a slide type: what its description says, and the data it reads. */
export type Sample = { slide?: Partial<SlideSource>; data?: Partial<CanvasData>; /** Other slides of the same deck, drawn before it. */ before?: SlideSource[] };

const BEFORE = "2026-08-01";
const NOW = "2026-09-01";
const MONTHS = ["2025-10-01", "2025-11-01", "2025-12-01", "2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01", "2026-05-01", "2026-06-01", "2026-07-01", BEFORE, NOW];
const LONG = "Customer acquisition cost of the enterprise segment in German-speaking countries";

type Made = { name: string; was?: number | null; is?: number | null; /** The values of the months up to the newest, oldest first, in place of `was` and `is`. */ past?: (number | null)[]; more?: Partial<Metric>; rows?: BreakdownRow[]; rowsBefore?: BreakdownRow[] };

/** A slide's sample of made-up Metrics, listed in the order given, with their values of two months and their Breakdowns. */
function listing(made: Made[], options: Record<string, unknown> = {}, more: Partial<CanvasData> = {}): Sample {
  const metrics = made.map((m, i) => ({ id: i + 1, slug: `m${i + 1}`, name: m.name, formula: null, polarity: "higher", period: "month", decimals: 1, unit: "€", unit_position: "after", ...m.more }) as Metric);
  const dated = (m: Made) => m.past?.map((value, i) => [MONTHS[MONTHS.length - m.past!.length + i]!, value] as const) ?? ([[BEFORE, m.was], [NOW, m.is]] as const);
  const points = (m: Made) => dated(m).flatMap(([period, value]) => (typeof value === "number" ? [{ period: period as string, value }] : []));
  const rows = (m: Made) => Object.fromEntries([[BEFORE, m.rowsBefore], [NOW, m.rows]].filter(([, list]) => list));
  return {
    slide: { metrics: metrics.map((m) => m.id), options },
    data: {
      metrics,
      series: Object.fromEntries(made.map((m, i) => [`m${i + 1}`, points(m)])),
      breakdowns: Object.fromEntries(made.map((m, i) => [i + 1, rows(m)])),
      targets: {},
      projections: {},
      yearStart: 1,
      numberStyle: "1,234.5",
      ...more,
    },
  };
}

const row = (label: string, value: number, parts?: [string, number][]): BreakdownRow => ({ label, value, ...(parts ? { parts: parts.map(([l, v]) => ({ label: l, value: v })) } : {}) });
const sellers = (count: number, value: (i: number) => number) => Array.from({ length: count }, (_, i) => row(i === 2 ? LONG : `Salesperson ${i + 1}`, value(i)));
const parts = (ids: number[], more: { hidden?: boolean; others?: string[] } = {}) => ids.map((part) => ({ part, first: BEFORE, last: null, ...more }));
const totalOf = (id: number, ids: number[]) => ({ totalLists: { [id]: { parts: parts(ids), others: [], hidden: false } } });
const asTotal = { total: { targets: "own" as const, open: true } };

const gapTables: Sample[] = [
  listing([
    { name: "Bookings", is: 4_200_000, rows: sellers(27, (i) => (i - 4) * 31_000) },
    { name: "Quota", is: 4_500_000, rows: sellers(25, (i) => 200_000 + (i % 3) * 40_000) },
  ]),
  listing(
    [
      { name: "Commit", was: 900, is: 1_000, more: asTotal },
      { name: "Commit, Anna", is: 600 },
      { name: `Commit, ${LONG}`, is: 0 },
      { name: "Commit, Ben", is: -40 },
    ],
    { total: true },
    { ...totalOf(1, [2, 3, 4]), targets: { 2: [{ period: NOW, value: 500 }], 4: [{ period: NOW, value: 100 }] } },
  ),
  listing([{ name: LONG }, { name: "Quota" }]),
];

const bridges: Sample[] = [
  listing([{ name: "Revenue by region", was: 9_800_000, is: 12_400_000, rows: sellers(14, (i) => 400_000 + i * 70_000), rowsBefore: sellers(14, (i) => 900_000 - i * 40_000) }]),
  listing([
    { name: LONG, was: 40, is: -75.5, more: { formula: "{m2} - {m3} - {m4}" } },
    { name: "Revenue of the enterprise segment", was: 100, is: 40 },
    { name: "Cost of sales", was: 55, is: 70, more: { polarity: "lower" } },
    { name: "Other operating cost", was: 5, is: 45.5, more: { polarity: "lower" } },
  ]),
  listing([{ name: "Headcount" }]),
];

const regions = ["Germany, Austria and Switzerland", "North America", "United Kingdom and Ireland", "Nordic countries", "Southern Europe", "Asia and Pacific", "Latin America", "Africa"];
const segments = ["Enterprise accounts of more than 5,000 people", "Mid-market", "Small business", "Public sector", "Partners", "Self-service", "Education"];
const mosaics: Sample[] = [
  listing([{ name: "Revenue", is: 25_000, rows: regions.map((name, r) => row(name, 7_000 - r * 800, segments.map((p, i): [string, number] => [p, (7_000 - r * 800) / 7 + (i - 3) * 20]))) }]),
  listing([{ name: LONG, is: 1_000_040, rows: [row(regions[0]!, 1_000_000, [[segments[0]!, 700_000]]), row(regions[1]!, 20, [[segments[1]!, 30]]), row(regions[2]!, 20, [[segments[2]!, 20]]), row(regions[3]!, 0, [[segments[3]!, 0]])] }]),
  listing([{ name: "Net change", is: -4, rows: [row("Germany", -4, [["Enterprise", -4]])] }]),
];

const trees: Sample[] = [
  listing(
    [
      { name: "Revenue from new business", was: 800_000, is: 1_000_000, more: { formula: "{m2} * {m3} + {m4}" } },
      { name: "Deals won", was: 32, is: 50, more: { ...asTotal, unit: "" } },
      { name: "Average price of a deal", was: 25_000, is: 19_500 },
      { name: LONG, was: 0, is: 25_000, more: { polarity: "lower" } },
      ...regions.map((name, i) => ({ name: `Deals won, ${name}`, was: 4, is: i === 7 ? 22 : 4, more: { unit: "" } })),
    ],
    {},
    totalOf(2, [5, 6, 7, 8, 9, 10, 11, 12]),
  ),
  listing([
    { name: "Gross margin", was: 61.5, is: 61.2, more: { formula: "({m2} - {m3}) / {m2} * 100", unit: "%" } },
    { name: "Revenue", was: 11.9, is: 12.4 },
    { name: "Cost of sales", was: 4.6, more: { polarity: "lower" } },
  ]),
  listing([{ name: LONG, is: 4 }]),
];

const grows = (from: number, step: number, months = 12) => Array.from({ length: months }, (_, i) => from + i * step + (i % 3) * step);
const targets = (value: number) => ({ target_min: value, target_max: null });

const summaries: Sample[] = [
  listing(
    [
      { name: "Revenue", past: grows(8_200_000, 310_000), more: targets(11_000_000) },
      { name: LONG, past: grows(6_400, -90), more: { polarity: "lower", ...targets(5_000) } },
      { name: "Net change in customers", past: [4, -6, 2, 9, -12, -3, 5, 1, -8, 6, -2, -14], more: { unit: "" } },
      { name: "Headcount", more: { unit: "" } },
    ],
    { periods: 12, target: true },
  ),
  listing([{ name: "Gross margin", past: [61, 62, null, 60.5, 61.2], more: { unit: "%", ...targets(63) } }], { form: "line", target: true }),
  listing([{ name: LONG }]),
];

const chartSamples: Sample[] = [
  listing([{ name: "Revenue", past: grows(8_200_000, 310_000), more: targets(11_000_000) }, { name: LONG, past: [4, -6, 2, 9, -12, -3, 5, 1, -8, 6, -2, -14] }], { periods: 12, target: true }),
  listing(
    [
      { name: LONG, past: grows(900_000, 40_000) },
      { name: `Of which won through partners, ${LONG}`, past: grows(200_000, 30_000) },
      { name: `The plan agreed for ${LONG}`, past: grows(1_000_000, 20_000) },
    ],
    { periods: 12, part: true, reference: true },
  ),
  listing([{ name: "Net revenue retention", past: [111, 109, null, null, 108, 112, 110], more: { unit: "%", ...targets(112) } }], { form: "line", target: true }),
  listing([{ name: "Revenue", is: 100 }, { name: "Headcount", is: 4, more: { unit: "" } }], { part: true }),
];

const figureTables: Sample[] = [
  listing(
    Array.from({ length: 12 }, (_, i): Made => ({
      name: i % 3 ? `${regions[i % regions.length]}, ${i}` : `${LONG}, ${i}`,
      ...(i === 4 ? {} : { past: grows(i * 1_000_000 - 3_000_000, (i % 2 ? -1 : 1) * 45_000, i === 7 ? 1 : 12) }),
      more: i % 4 ? targets(2_000_000) : {},
    })),
  ),
  listing([{ name: LONG }, { name: "Headcount" }]),
];

const answer = "We lost two large renewals in the north.\nBoth moved to a rival that bundles support, and we had not offered a bundle. ".repeat(3).slice(0, 400);
const question = `Why did ${LONG} rise again, and what are we doing about it before the end of the year?`.slice(0, 140);
const asked = (count: number, text: string) => Array.from({ length: count }, (_, i) => ({ question: i ? `${i + 1}. ${question}`.slice(0, 140) : question, text, writtenOn: "2026-07-14" }));
const questionSample = (answers: SlideSource["answers"]): Sample => {
  const sample = listing([{ name: LONG, is: 4 }]);
  return { ...sample, slide: { ...sample.slide, answers } };
};
const questionSamples: Sample[] = [questionSample(asked(3, answer)), questionSample([...asked(1, "Pricing changed in July."), { question: "What next?", text: "", writtenOn: null }]), questionSample([])];

const note = "Counts every signed order of the month, net of cancellations received before the books close, in euros at the rate of the day it was signed. ";
const definitionSamples: Sample[] = [
  listing(
    Array.from({ length: 9 }, (_, i): Made => ({
      name: i % 3 ? `${regions[i % regions.length]}, ${i}` : `${LONG}, ${i}`,
      more: { description: i === 2 ? "" : note.repeat(1 + (i % 4)), calculation_note: i === 1 ? note.repeat(14) : null, ...(i === 5 ? { formula: "{m1} + {m2}" } : i === 6 ? asTotal : {}) },
    })),
  ),
];

/** The about slide with a table slide before it, whose Metrics it names. */
function aboutSample(count: number): Sample {
  const sample = listing(Array.from({ length: count }, (_, i): Made => ({ name: i % 3 ? `${regions[i % regions.length]}, ${i}` : `${LONG}, ${i}`, ...(i === 1 ? {} : { is: i }), more: { sources: i % 2 ? ["api"] : ["web_form", "api"], ...(i === 2 ? { formula: "{m1} + {m2}" } : {}) } })));
  return { data: sample.data, before: count ? [{ id: "sl_listed", type: "table", metrics: sample.slide!.metrics!, options: {}, headline: null }] : [] };
}

/** The samples of every slide type Ziffr has, by type: one or more, among them its hardest (long, empty, negative). */
export const SAMPLES: Record<string, Sample[]> = {
  cover: [{}],
  summary: summaries,
  chart: chartSamples,
  table: figureTables,
  "gap-table": gapTables,
  bridge: bridges,
  mosaic: mosaics,
  "driver-tree": trees,
  questions: questionSamples,
  definitions: definitionSamples,
  about: [aboutSample(14), aboutSample(0)],
};

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
export const DECK = { today: "2026-10-09", address: "https://ziffr.example.com", name: "Northwind quarterly business review", period: "Third quarter 2026", date: "9 October 2026", data: NO_DATA };

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

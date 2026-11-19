// The formats a Pack's items use that spec 0030 adds (#273): ziffr.metric/1, ziffr.dashboard-template/1 and
// ziffr.theme/1. A good file of each passes, a table of invalid and hostile ones is refused with the right message,
// and the built-in Dashboard Templates and Ziffr's starter Theme can be written in them.
import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";
import { checkMetricFile, checkMetricFileValue, METRIC_FILE_SCHEMA, type MetricFile } from "./metric-file";
import { checkDashboardTemplateFile, checkDashboardTemplateFileValue, DASHBOARD_TEMPLATE_SCHEMA, type DashboardTemplateFile } from "./dashboard-template-file";
import { checkThemeFile, checkThemeFileValue, themeFromFile, THEME_FILE_SCHEMA, type ThemeFile } from "./theme-file";
import { BUILT_IN_DASHBOARD_TEMPLATES } from "./built-in-dashboard-templates";
import { STARTER_THEME } from "./themes";
import { cleanSlides, cleanTokens } from "./theme-tokens";
import { EXAMPLE as VIEW } from "./view-design.test";
import type { FormatCheck, Schema } from "./json-check";

/** A Metric Catalog entry as a creator might write it. */
export const METRIC: MetricFile = {
  format: "ziffr.metric/1",
  name: "MRR",
  description: "Monthly recurring revenue: what customers pay each month, without one-off fees.",
  category: "Revenue",
  industries: ["saas"],
  segments: ["b2b", "b2c"],
  period: "month",
  aggregation: "last",
  polarity: "higher",
  unit: "€",
  unitPosition: "after",
  valueFormat: "currency",
  decimals: 0,
  submissionRule: "overwrite",
  targetMin: 10000,
  targetMax: 20000,
  attainmentMethod: "distance",
  sources: ["web_form", "api"],
};

/** A Dashboard Template with a story, so every kind of setting is used. */
export const DASHBOARD: DashboardTemplateFile = {
  format: "ziffr.dashboard-template/1",
  name: "Monthly overview",
  description: "The two numbers that matter, their trends and a story.",
  slots: [{ label: "MRR" }, { label: "Customers", multiple: true }],
  widgets: [
    { view: "number", slots: [0], x: 0, y: 0, w: 6, h: 4, title: "{metric} this month" },
    { view: "line", slots: [1], x: 6, y: 0, w: 6, h: 6, settings: { window: 12, display: "quarter", showTarget: true, compare: ["mom", "yoy"] } },
    {
      view: "story", slots: [], x: 0, y: 6, w: 12, h: 14,
      settings: {
        kicker: "Revenue", headline: "{metric} is {change yoy}", footnote: "Values as submitted.",
        callouts: [{ rule: "max", text: "The best month" }],
        panels: [{ type: "period-bars", slot: 0, measure: "value", periods: 12, highlight: "last", refLine: { kind: "target" }, annotations: [{ kind: "ring", rule: "largest-step", text: "Biggest change" }] }],
      },
    },
  ],
};

/** A Theme as a creator might write it: colours, fonts, cards and slide settings, no image. */
export const THEME: ThemeFile = {
  format: "ziffr.theme/1",
  name: "Board",
  colors: { canvas: "#f4f1ea", surface: "#ffffff", ink: "#1a1a1a", muted: "#6b6b6b", rule: "#d9d4c7", accent: "#b4441c", good: "#2e7d32", bad: "#c62828", band: "#e8e2d0", data: ["#1f4e79", "#b4441c"] },
  fonts: { heading: "source-serif", body: "inter", figures: "ibm-plex-mono" },
  radius: 6,
  cards: "flat",
  slides: { logoPosition: "top-right", logoWidth: 120, footer: "Board meeting", showSlideNumber: true, titleSize: 48, bodySize: 22 },
};

const text = (v: unknown) => JSON.stringify(v, null, 2);
type Case = [string, unknown, string];

const METRIC_HOSTILE: Case[] = [
  ["no name", { ...METRIC, name: undefined }, "needs the field “name”"],
  ["an owner", { ...METRIC, owner: "someone" }, "is not a field here"],
  ["Submitters", { ...METRIC, submitters: ["x"] }, "is not a field here"],
  ["values", { ...METRIC, values: [{ period: "2026-01-01", value: 1 }] }, "is not a field here"],
  ["a period it does not know", { ...METRIC, period: "fortnight" }, "must be one of “day”"],
  ["a Source it does not know", { ...METRIC, sources: ["webhook"] }, "must be one of “web_form”"],
  ["a Source twice", { ...METRIC, sources: ["api", "api"] }, "names a Source twice"],
  ["a range upside down", { ...METRIC, targetMin: 5, targetMax: 1 }, "is above targetMax"],
  ["a target beyond any value", { ...METRIC, targetMax: 1e300 }, "must be at most 1000000000000000"],
  ["too many decimals", { ...METRIC, decimals: 9 }, "must be at most 6"],
  ["markup in the unit", { ...METRIC, unit: "<b>€" }, "without markup"],
  ["a long description", { ...METRIC, description: "x".repeat(1001) }, "at most 1000"],
  ["a formula it cannot read", { ...METRIC, sources: undefined, formula: "{a} +" }, "ends where a value is missing"],
  ["a formula with other characters", { ...METRIC, sources: undefined, formula: "{a}; drop table" }, "a formula of + - * /"],
  ["a formula with Sources", { ...METRIC, formula: "{a} * 2" }, "has no Sources"],
  ["an industry that is not a key", { ...METRIC, industries: ["SaaS Companies"] }, "a key in lower case"],
];

const widget = (extra: Record<string, unknown>) => ({ ...DASHBOARD, widgets: [{ view: "number", slots: [0], x: 0, y: 0, w: 6, h: 4, ...extra }] });
const DASHBOARD_HOSTILE: Case[] = [
  ["a Free Layout", widget({ view: "canvas" }), "must be one of “number”"],
  ["a Free Layout's document", widget({ settings: { canvas: { document: {} } } }), "is not a field here"],
  ["a period of one Workspace's data", widget({ settings: { period: "2026-01-01" } }), "is not a field here"],
  ["Metric ids", widget({ metric_ids: [1, 2] }), "is not a field here"],
  ["a Slot it does not have", widget({ slots: [5] }), "is Slot 5, but the template has Slots 0 to 1"],
  ["a Panel's Slot it does not have", widget({ view: "story", slots: [], settings: { panels: [{ type: "line", slot: 3 }] } }), "is Slot 3"],
  ["a widget with no Slot", widget({ slots: [] }), "fills the widget with no Slot"],
  ["a widget off the grid", widget({ x: 10, w: 6 }), "reaches column 16"],
  ["widgets on top of each other", { ...DASHBOARD, widgets: [DASHBOARD.widgets[0], { ...DASHBOARD.widgets[0], x: 3 }] }, "overlaps widget 0"],
  ["a design widget without a design", widget({ view: "design" }), "needs “design”"],
  ["a design on another view", widget({ settings: { design: VIEW } }), "is only for the view “design”"],
  ["a design its checks refuse", widget({ view: "design", settings: { design: { ...VIEW, parts: [{ mark: "iframe" }] } } }), "must be one of “text”"],
  ["a design named outside a Pack", widget({ view: "design", settings: { design: "trend" } }), "only a Pack holding it can give"],
  ["a suggestion outside a Pack", { ...DASHBOARD, slots: [{ label: "MRR", suggests: "mrr" }, DASHBOARD.slots[1]] }, "only a Pack holding it can give"],
  ["a callout at one period", widget({ view: "story", slots: [], settings: { panels: [{ type: "line", slot: 0 }], callouts: [{ period: "2026-03-01", text: "x" }] } }), "is not a field here"],
  ["a Placeholder it does not know", widget({ title: "{constructor}" }), "Placeholders such as {metric} are allowed"],
  ["template braces", widget({ title: "{{7*7}}" }), "Placeholders such as {metric} are allowed"],
  ["an address in a headline", widget({ view: "story", slots: [0], settings: { headline: "See https://evil.example" } }), "without markup or web addresses"],
  ["too many widgets", { ...DASHBOARD, widgets: Array.from({ length: 41 }, (_, i) => ({ view: "number", slots: [0], x: 0, y: i * 4, w: 3, h: 4 })) }, "41 entries; at most 40"],
];

const THEME_HOSTILE: Case[] = [
  ["a colour that is not hex", { ...THEME, colors: { ...THEME.colors, ink: "red" } }, "# and six hex digits"],
  ["a CSS expression for a colour", { ...THEME, colors: { ...THEME.colors, ink: "#000;background:url(x)" } }, "# and six hex digits"],
  ["a missing colour", { ...THEME, colors: { ...THEME.colors, band: undefined } }, "needs the field “band”"],
  ["too many data colours", { ...THEME, colors: { ...THEME.colors, data: Array(7).fill("#000000") } }, "7 entries; at most 6"],
  ["a font Ziffr does not ship", { ...THEME, fonts: { ...THEME.fonts, body: "comic-sans" } }, "must be one of “general-sans”"],
  ["a logo", { ...THEME, slides: { logo: "data:image/svg+xml;base64,PHN2Zz4=" } }, "is not a field here"],
  ["a background image", { ...THEME, slides: { backgroundImage: "https://evil.example/x.png" } }, "is not a field here"],
  ["a radius out of range", { ...THEME, radius: 400 }, "must be at most 24"],
];

const formats: [string, Case[], (v: unknown) => FormatCheck<unknown>, (t: string) => FormatCheck<unknown>, unknown, Schema][] = [
  ["ziffr.metric/1", METRIC_HOSTILE, checkMetricFileValue, checkMetricFile, METRIC, METRIC_FILE_SCHEMA],
  ["ziffr.dashboard-template/1", DASHBOARD_HOSTILE, checkDashboardTemplateFileValue, checkDashboardTemplateFile, DASHBOARD, DASHBOARD_TEMPLATE_SCHEMA],
  ["ziffr.theme/1", THEME_HOSTILE, checkThemeFileValue, checkThemeFile, THEME, THEME_FILE_SCHEMA],
];

describe.each(formats)("%s", (format, hostile, _value, check, good, schema) => {
  it("passes a good file", () => {
    const res = check(text(good));
    expect(res.ok ? [] : res.problems).toEqual([]);
  });
  it("names a later version as one", () => {
    const later = format.replace("/1", "/2");
    const res = check(text({ ...(good as object), format: later }));
    expect(!res.ok && res.problems[0].message).toContain(`format ${later}; this Ziffr reads ${format}`);
  });
  it.each(hostile)("refuses %s", (_name, file, message) => {
    const res = check(text(file));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.problems.some((p) => `${p.path} ${p.message}`.includes(message)), JSON.stringify(res.problems)).toBe(true);
  });
  it("is a JSON Schema another validator agrees with", () => {
    const validate = new Ajv2020({ strict: false, allErrors: true }).compile(schema);
    expect(validate(good)).toBe(true);
    for (const [name, file] of hostile) {
      const value = JSON.parse(text(file));
      const ours = check(text(file));
      if (validate(value) === false) expect(ours.ok, name).toBe(false);
    }
  });
});

describe("what Ziffr has today, as files", () => {
  it("writes every built-in Dashboard Template as a ziffr.dashboard-template/1 file that passes", () => {
    for (const t of BUILT_IN_DASHBOARD_TEMPLATES) {
      const file: DashboardTemplateFile = {
        format: "ziffr.dashboard-template/1", name: t.name, description: t.description,
        slots: t.slots.map((s) => ({ label: s.label, ...(s.multiple ? { multiple: true } : {}) })),
        widgets: t.body.widgets.map((w) => ({
          view: w.view as DashboardTemplateFile["widgets"][number]["view"], slots: w.metricSlots, x: w.x, y: w.y, w: w.w, h: w.h,
          settings: Object.fromEntries(Object.entries(w.settings).filter(([, v]) => v !== undefined && v !== null)),
        })),
      };
      const res = checkDashboardTemplateFile(text(file));
      expect(res.ok ? [] : res.problems, t.name).toEqual([]);
    }
  });

  it("reads a Theme file into what a Theme stores, as the Theme editor would keep it, with no image", () => {
    const { tokens, slides, name } = themeFromFile(THEME);
    expect(name).toBe("Board");
    expect(cleanTokens(tokens)).toEqual(tokens);
    expect(cleanSlides(slides)).toEqual(slides);
    expect(tokens.ink).toBe("#1A1A1A");
    expect(slides.logo).toBeNull();
    expect(slides.background_image).toBeNull();
  });

  it("holds the starter Theme", () => {
    const t = STARTER_THEME.tokens;
    const file: ThemeFile = {
      format: "ziffr.theme/1", name: STARTER_THEME.name,
      colors: { canvas: t.canvas, surface: t.surface, ink: t.ink, muted: t.muted, rule: t.rule, accent: t.accent, good: t.good, bad: t.bad, band: t.band, data: t.data },
      fonts: { heading: t.fontHeading, body: t.fontBody, figures: t.fontFigures }, radius: t.radius, cards: t.cards,
    };
    expect(checkThemeFile(text(file)).ok).toBe(true);
    expect(themeFromFile(file).tokens).toEqual(cleanTokens(t));
  });
});

// @ts-nocheck
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
import { checkDeckTemplateFile, checkDeckTemplateFileValue, deckTemplateFromFile, DECK_TEMPLATE_SCHEMA, type DeckTemplateFile } from "./deck-template-file";
import { checkWorkflowTemplateFile, checkWorkflowTemplateFileValue, workflowTemplateFromFile, WORKFLOW_TEMPLATE_SCHEMA, type WorkflowTemplateFile } from "./workflow-template-file";
import { dashboardTemplateFromFile } from "./dashboard-template-file";
import { fromDashboardTemplate, fromDeckTemplate, fromWorkflowTemplate } from "./team-templates";
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

/** A Deck Template with a title slide and a slide of a widget, text and a box. */
export const DECK: DeckTemplateFile = {
  format: "ziffr.deck-template/1",
  name: "Board meeting",
  description: "Key figures for the quarter, then one slide per figure.",
  slots: [{ label: "Revenue" }, { label: "Cash" }],
  slides: [
    { shapes: [{ shape: "text", x: 64, y: 250, w: 1152, text: ["Board meeting"], size: "xl", scale: 1.4 }, { shape: "text", x: 64, y: 380, w: 1152, text: ["{period}"] }] },
    {
      shapes: [
        { shape: "text", x: 64, y: 56, w: 952, text: ["{metric} against its target"], size: "xl" },
        { shape: "widget", view: "line", slots: [0], x: 64, y: 150, w: 760, h: 500, settings: { window: 8, showTarget: true } },
        { shape: "box", x: 860, y: 150, w: 356, h: 500, fill: "semi", color: "light-blue", text: ["Highlights", "Risks"] },
        { shape: "widget", view: "number", slots: [1], x: 880, y: 560, w: 300, h: 80 },
      ],
    },
  ],
};

/** A Workflow Template with every kind of step. */
export const WORKFLOW: WorkflowTemplateFile = {
  format: "ziffr.workflow-template/1",
  name: "Monthly close",
  description: "Values due three working days after the month, checked and approved, then locked.",
  dueWorkingDays: 3,
  steps: [
    { type: "remind", daysBefore: 2 },
    { type: "escalate", to: "stand-in", daysAfter: 1 },
    { type: "check", changePct: 30, outsideTarget: true },
    { type: "approve", approvers: 1, values: "unusual" },
    { type: "publish", lock: true },
  ],
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
  // Tags (spec 0038): the same rules as a Tag typed in the app, one copy of them.
  ["more than 5 Tags", { ...METRIC, tags: ["a", "b", "c", "d", "e", "f"] }, "has 6 entries; at most 5"],
  ["11 Tags", { ...METRIC, tags: Array.from({ length: 11 }, (_, i) => `t${i}`) }, "has 11 entries; at most 5"],
  ["a Tag that is not a word", { ...METRIC, tags: [7] }, "must be a text"],
  ["an empty Tag", { ...METRIC, tags: [""] }, "must not be empty"],
  ["a Tag of only a hash", { ...METRIC, tags: ["#"] }, "A Tag needs a word"],
  ["a Tag of 33 characters", { ...METRIC, tags: ["x".repeat(33)] }, "A Tag is at most 32 characters"],
  ["a Tag with a comma", { ...METRIC, tags: ["a,b"] }, "has no comma"],
  ["a Tag with markup", { ...METRIC, tags: ["<img src=x onerror=alert(1)>"] }, "without markup"],
  ["a Tag with a web address", { ...METRIC, tags: ["evil.com"] }, "without markup or web addresses"],
  ["a Tag with a control character", { ...METRIC, tags: ["a\u0007b"] }, "without markup or web addresses"],
  ["a Tag with a line break", { ...METRIC, tags: ["a\nb"] }, "without markup or web addresses"],
  ["a Tag twice, in other capitals", { ...METRIC, tags: ["Finance", "finance"] }, "names a Tag twice"],
  ["a Tag as the same word with a hash", { ...METRIC, tags: ["finance", "#finance"] }, "names a Tag twice"],
  ["Tags as one text", { ...METRIC, tags: "finance, weekly" }, "must be a list"],
  ["Tags as an object", { ...METRIC, tags: { 0: "finance" } }, "must be a list"],
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
  ["a logo", { ...THEME, slides: { logo: "data:image/svg+xml;base64,PHN2Zz4=" } }, "must be “pack”"],
  ["a logo of “pack” in a Theme file on its own", { ...THEME, slides: { logo: "pack" } }, "a logo comes only from a Pack"],
  ["a background image", { ...THEME, slides: { backgroundImage: "https://evil.example/x.png" } }, "is not a field here"],
  ["a radius out of range", { ...THEME, radius: 400 }, "must be at most 24"],
];

const slide = (shape: Record<string, unknown>) => ({ ...DECK, slides: [{ shapes: [shape] }] });
const DECK_HOSTILE: Case[] = [
  ["an image", slide({ shape: "image", x: 0, y: 0, w: 10, h: 10, src: "https://evil.example/x.png" }), "must be one of “widget”, “text”, “box”"],
  ["a drawing", slide({ shape: "draw", segments: [] }), "must be one of “widget”, “text”, “box”"],
  ["a link on a box", slide({ shape: "box", x: 0, y: 0, w: 10, h: 10, url: "https://evil.example" }), "is not a field here"],
  ["a Free Layout", slide({ shape: "widget", view: "canvas", slots: [0], x: 0, y: 0, w: 100, h: 100 }), "must be one of “number”"],
  ["a Slot it does not have", slide({ shape: "widget", view: "line", slots: [4], x: 0, y: 0, w: 100, h: 100 }), "is Slot 4, but the template has Slots 0 to 1"],
  ["a shape off the slide", slide({ shape: "box", x: 1200, y: 0, w: 200, h: 10 }), "reaches past the edge of the slide"],
  ["markup in words", slide({ shape: "text", x: 0, y: 0, w: 100, text: ["<script>alert(1)</script>"] }), "without markup"],
  ["a colour that is not the editor's", slide({ shape: "text", x: 0, y: 0, w: 100, text: ["a"], color: "#ff0000" }), "must be one of “black”"],
  ["a Theme outside a Pack", { ...DECK, theme: "board" }, "only a Pack holding it can give"],
  ["too many slides", { ...DECK, slides: Array(41).fill({ shapes: [] }) }, "41 entries; at most 40"],
];

const WORKFLOW_HOSTILE: Case[] = [
  ["Approvers by name", { ...WORKFLOW, steps: [{ type: "approve", approvers: ["someone"] }] }, "must be a whole number, not a list"],
  ["a person to escalate to", { ...WORKFLOW, steps: [{ type: "escalate", to: "someone", daysAfter: 1 }] }, "must be one of “stand-in”, “owner”"],
  ["a step it does not know", { ...WORKFLOW, steps: [{ type: "webhook", url: "x" }] }, "must be one of “remind”"],
  ["two checks", { ...WORKFLOW, steps: [WORKFLOW.steps[2], WORKFLOW.steps[2]] }, "is a second “check” step"],
  ["publishing before the end", { ...WORKFLOW, steps: [WORKFLOW.steps[4], WORKFLOW.steps[0]] }, "publishing is the last step"],
  ["a Due Date out of range", { ...WORKFLOW, dueWorkingDays: 99 }, "must be at most 30"],
];

const formats: [string, Case[], (v: unknown) => FormatCheck<unknown>, (t: string) => FormatCheck<unknown>, unknown, Schema][] = [
  ["ziffr.metric/1", METRIC_HOSTILE, checkMetricFileValue, checkMetricFile, METRIC, METRIC_FILE_SCHEMA],
  ["ziffr.dashboard-template/1", DASHBOARD_HOSTILE, checkDashboardTemplateFileValue, checkDashboardTemplateFile, DASHBOARD, DASHBOARD_TEMPLATE_SCHEMA],
  ["ziffr.theme/1", THEME_HOSTILE, checkThemeFileValue, checkThemeFile, THEME, THEME_FILE_SCHEMA],
  ["ziffr.deck-template/1", DECK_HOSTILE, checkDeckTemplateFileValue, checkDeckTemplateFile, DECK, DECK_TEMPLATE_SCHEMA],
  ["ziffr.workflow-template/1", WORKFLOW_HOSTILE, checkWorkflowTemplateFileValue, checkWorkflowTemplateFile, WORKFLOW, WORKFLOW_TEMPLATE_SCHEMA],
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

describe("the Pack kit's lists", () => {
  // @ziffr/pack keeps its own lists of what Ziffr knows, so it needs nothing of the app; they must be the app's.
  it("are the app's: Views of a template, fonts, Attainment methods", async () => {
    const { TEMPLATES } = await import("./widget-templates");
    const { NOT_IN_DASHBOARD_TEMPLATES } = await import("./team-templates");
    const { FONTS } = await import("./themes");
    const { ATTAINMENT_METHODS } = await import("./attainment-method");
    const kinds = await import("@ziffr/pack/kinds");
    expect([...kinds.TEMPLATE_VIEWS]).toEqual(Object.keys(TEMPLATES).filter((t) => !NOT_IN_DASHBOARD_TEMPLATES.includes(t as never)));
    expect([...kinds.FONT_IDS]).toEqual(Object.keys(FONTS));
    expect([...kinds.ATTAINMENT_METHODS]).toEqual([...ATTAINMENT_METHODS]);
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

describe("files as what a Workspace keeps", () => {
  it("makes a Dashboard Template's widgets from a file, notes tied to their rules and Panels to their Slots", () => {
    const { slots, body } = dashboardTemplateFromFile(DASHBOARD);
    expect(slots).toEqual([{ label: "MRR", multiple: false }, { label: "Customers", multiple: true }]);
    const [story] = fromDashboardTemplate(body, [[7], [8, 9]]).filter((w) => w.template === "story");
    expect(story.settings.callouts).toEqual([{ period: "", rule: "max", text: "The best month" }]);
    expect(story.settings.panels?.[0]).toMatchObject({ metricIds: [7], annotations: [{ kind: "ring", anchor: { type: "rule", rule: "largest-step" }, text: "Biggest change" }] });
  });

  it("gives a widget the View Design its Pack names, and leaves out one whose design it does not have", () => {
    const file: DashboardTemplateFile = { ...DASHBOARD, widgets: [{ view: "design", slots: [0], x: 0, y: 0, w: 6, h: 6, settings: { design: "trend" } }] };
    expect(dashboardTemplateFromFile(file, new Map([["trend", VIEW]])).body.widgets[0].settings.design).toEqual({ id: null, body: VIEW });
    expect(dashboardTemplateFromFile(file).body.widgets).toEqual([]);
  });

  it("makes a Deck Template's slides as the deck editor makes shapes, and fills its Slots", () => {
    const body = deckTemplateFromFile(DECK, new Map(), 12);
    expect(body.themeId).toBe(12);
    const slides = fromDeckTemplate(body, [[7], [8]], (t) => t.replace("{metric}", "Revenue"));
    expect(slides.map((s) => s.map((sh) => sh.type))).toEqual([["text", "text"], ["text", "ziffr-widget", "geo", "ziffr-widget"]]);
    const [title, line, box] = slides[1];
    expect(JSON.stringify(title.props.richText)).toContain("Revenue against its target");
    expect(line.props).toMatchObject({ template: "line", metricIds: [7], w: 760, h: 500 });
    expect(JSON.parse(String(line.props.settings))).toMatchObject({ window: 8, showTarget: true });
    expect(box.props).toMatchObject({ geo: "rectangle", fill: "semi", color: "light-blue" });
  });

  it("makes a Workflow from a Workflow Template file once its Approvers are picked", () => {
    const body = workflowTemplateFromFile(WORKFLOW);
    expect(fromWorkflowTemplate(body, [])).toBeNull();
    expect(fromWorkflowTemplate(body, ["a", "b"])).toBeNull();
    expect(fromWorkflowTemplate(body, ["a"])?.steps[3]).toEqual({ type: "approve", approvers: ["a"], values: "unusual" });
  });
});

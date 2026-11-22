// Team Widget Templates and Dashboard Templates (GLOSSARY: Widget Template, Dashboard Template, Slot, Placeholder):
// turning a widget, slide or dashboard into a template with its metrics left open, and filling a template's slots to
// make it again. Pure.
import { listOf, metricsInOrder } from "./placeholders";
import { tagSourceId, takesTagSource } from "./tag-source";
import type { AnchorRule, DashboardTemplateBody, DeckTemplateBody, WorkflowConfig, WorkflowStep, WorkflowTemplateBody, WorkflowTemplateStep, DashboardTemplateWidget, Metric, Slot, SlideBody, SlideShape, TemplateId, WidgetTemplate, Widget, WidgetSettings } from "./types";

type W = Pick<Widget, "template" | "metric_ids" | "settings" | "title">;

/** Something in the widget that points at one period or one row, which another metric will not have. */
export type Specific = { key: string; kind: "period" | "row"; text: string; at: string };

/** The rules a note tied to one period or row can follow instead, when a widget becomes a template. */
export const RULES_FOR: Record<Specific["kind"], { rule: AnchorRule; label: string }[]> = {
  period: [
    { rule: "last", label: "Latest period" },
    { rule: "max", label: "Highest value" },
    { rule: "min", label: "Lowest value" },
    { rule: "largest-step", label: "Biggest change" },
    { rule: "first", label: "First period shown" },
  ],
  row: [
    { rule: "max", label: "Largest row" },
    { rule: "min", label: "Smallest row" },
  ],
};

/** Notes in a widget tied to one period or row, which another metric will not have. */
export function specifics(widget: W): Specific[] {
  const out: Specific[] = [];
  (widget.settings.callouts ?? []).forEach((c, i) => {
    if (!c.rule) out.push({ key: `callout:${i}`, kind: "period", text: c.text || "(no text)", at: c.period });
  });
  (widget.settings.panels ?? []).forEach((p, pi) =>
    (p.annotations ?? []).forEach((a, ai) => {
      if (a.anchor.type === "period") out.push({ key: `ann:${pi}:${ai}`, kind: "period", text: a.text || `(${a.kind})`, at: a.anchor.period });
      if (a.anchor.type === "row") out.push({ key: `ann:${pi}:${ai}`, kind: "row", text: a.text || `(${a.kind})`, at: a.anchor.label });
    }),
  );
  return out;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Every mention of the widget's metrics in its words becomes {metric}, {metric 2}, …; a list of all of them becomes {metrics}. */
function placeholderize(text: string | undefined, ms: Metric[]) {
  if (!text) return text;
  if (ms.length > 1) {
    const names = ms.map((m) => m.name);
    for (const list of [listOf(names), names.join(", "), names.join(" and ")]) text = text.replace(new RegExp(escape(list), "gi"), "{metrics}");
  }
  const order = ms.map((m, i) => ({ m, i })).sort((a, b) => b.m.name.length - a.m.name.length);
  let t = text!;
  for (const { m, i } of order) t = t.replace(new RegExp(`\\b${escape(m.name)}\\b`, "gi"), i === 0 ? "{metric}" : `{metric ${i + 1}}`);
  return t;
}

/** For each such note: the rule it follows from now on, or "drop" to leave it out. */
export type Choices = Record<string, AnchorRule | "drop">;

/** Slots shared by everything in one template: the same metric (or list of metrics) is one slot. */
type SlotCtx = { slots: Slot[]; slotIds: number[][]; tagSlots: Map<string, number> };
const newCtx = (): SlotCtx => ({ slots: [], slotIds: [], tagSlots: new Map() });
/** The "one or more" Slot a Tag widget becomes, with a neutral name: a template is read by the whole Workspace and a Tag's name is shown only through Metrics a person sees, so it names no Tag (spec 0038). */
function tagSlot(ctx: SlotCtx, tagId: string, name: string) {
  let i = ctx.tagSlots.get(tagId);
  if (i === undefined) {
    ctx.slotIds.push([]);
    ctx.slots.push({ label: name, multiple: true, exampleIds: [] });
    i = ctx.slots.length - 1;
    ctx.tagSlots.set(tagId, i);
  }
  return i;
}
function slotFor(ctx: SlotCtx, ids: number[]) {
  let i = ctx.slotIds.findIndex((x) => x.length === ids.length && x.every((v, j) => v === ids[j]));
  if (i < 0) {
    ctx.slotIds.push(ids);
    ctx.slots.push({ label: "", multiple: ids.length > 1, exampleIds: ids });
    i = ctx.slots.length - 1;
  }
  return i;
}
function nameSlots(ctx: SlotCtx, labels: string[]) {
  ctx.slots.forEach((x, i) => (x.label = labels[i]?.trim() || x.label || (ctx.slots.length === 1 ? "Metric" : `Metric ${i + 1}`)));
  return ctx.slots;
}

/** One widget with its metrics turned into slots of ctx. Keys of choices carry the prefix of this widget. */
function templatize(widget: W, metrics: Metric[], choices: Choices, ctx: SlotCtx, prefix = "") {
  const s = widget.settings;
  const ms = metricsInOrder(widget, metrics);
  const notices: string[] = [];
  const p = (t: string | undefined) => placeholderize(t, ms);

  // A composed story's own metric only names it; its panels carry the metrics, so they make the slots.
  const panelIds = new Set((s.panels ?? []).flatMap((x) => x.metricIds));
  const fromPanels = widget.template === "story" && panelIds.size > 0 && widget.metric_ids.every((id) => panelIds.has(id));
  const tagId = tagSourceId(s);
  const metricSlots = fromPanels ? [] : tagId ? [tagSlot(ctx, tagId, "Tagged Metrics")] : widget.metric_ids.map((id) => slotFor(ctx, [id]));
  const callouts = (s.callouts ?? []).flatMap((c, i) => {
    if (c.rule) return [{ ...c, text: p(c.text) ?? "" }];
    const choice = choices[`${prefix}callout:${i}`] ?? "drop";
    if (choice === "drop") return [];
    return [{ period: "", rule: choice, text: p(c.text) ?? "" }];
  });
  const panels = (s.panels ?? []).map((panel, pi) => {
    const annotations = (panel.annotations ?? []).flatMap((a, ai) => {
      const text = p(a.text);
      if (a.anchor.type === "rule") return [{ ...a, text }];
      const choice = choices[`${prefix}ann:${pi}:${ai}`] ?? "drop";
      if (choice === "drop") return [];
      return [{ ...a, text, anchor: { type: "rule" as const, rule: choice } }];
    });
    const fixedHighlight = panel.highlight && panel.highlight !== "last" && panel.highlight !== "projection";
    if (fixedHighlight) notices.push(`${panel.title || "A panel"} will highlight the latest period instead of ${panel.highlight}.`);
    if (panel.bridge?.period || panel.bridge?.from) notices.push("Bridges will use the latest breakdown.");
    return {
      ...panel,
      title: p(panel.title),
      annotations,
      highlight: fixedHighlight ? "last" : panel.highlight,
      bridge: panel.bridge ? { ...panel.bridge, period: null, from: null } : undefined,
      ...(panel.metricIds.length ? { slot: slotFor(ctx, panel.metricIds) } : {}),
      metricIds: [],
    };
  });
  if (s.highlight) notices.push(`The highlight on “${s.highlight}” becomes the largest row.`);
  if (s.period) notices.push("It will show the latest breakdown, not a fixed period.");
  const dropped = specifics(widget).filter((x) => (choices[prefix + x.key] ?? "drop") === "drop");
  const words = [s.kicker, s.headline, s.subline, s.footnote, s.source, widget.title, ...(s.callouts ?? []).map((c) => c.text), ...(s.panels ?? []).flatMap((x) => [x.title, ...(x.annotations ?? []).map((a) => a.text)])];
  if (words.some((t) => t && /\d/.test(t.replace(/\{[^}]*\}/g, "")))) notices.push("Some words still contain numbers. They will read the same for every metric; use {latest} or {change yoy} to have them filled in.");
  if (dropped.length) notices.push(`${dropped.length} note${dropped.length > 1 ? "s" : ""} tied to one period or row will be left out.`);

  // Only what a template means to carry: no free-layout documents, no comparison choices of the original.
  const settings: WidgetSettings = {
    window: s.window, display: s.display, showTarget: s.showTarget, showForecast: s.showForecast, rows: s.rows, fullPeriods: s.fullPeriods,
    kicker: p(s.kicker), headline: p(s.headline), subline: p(s.subline), footnote: p(s.footnote), source: p(s.source),
    highlight: null, period: null,
    ...(s.callouts ? { callouts } : {}),
    ...(s.panels ? { panels } : {}),
  };
  return { metricSlots, settings, title: p(widget.title ?? undefined) ?? null, notices };
}

/** The template a widget makes: slots, settings with slot numbers instead of metrics, and what changed on the way. */
export function toTemplate(widget: W, metrics: Metric[], choices: Choices, labels: string[] = []) {
  const ctx = newCtx();
  const { notices, ...body } = templatize(widget, metrics, choices, ctx);
  return { slots: nameSlots(ctx, labels), body, notices };
}

/** The widget a template makes once each slot has its metrics. */
export function fromTemplate(t: Pick<WidgetTemplate, "view" | "body">, fills: number[][], tagFills: (string | null)[] = []): { template: TemplateId; metric_ids: number[]; settings: WidgetSettings; title: string | null } {
  const s = t.body.settings;
  const own = t.body.metricSlots.flatMap((i) => fills[i] ?? []);
  const firstPanel = s.panels?.find((p) => p.slot !== undefined);
  // A Slot filled by a Tag (spec 0038): the widget shows all Metrics tagged so, for each viewer's own sight, and keeps no list.
  const tagged = t.body.metricSlots.length === 1 ? tagFills[t.body.metricSlots[0]] : undefined;
  if (t.body.metricSlots.some((i) => tagFills[i]) && (!tagged || !takesTagSource({ template: t.view, settings: s }))) throw new Error("A Tag can fill only a list of Metrics that nothing else uses.");
  if (tagged) return { template: t.view, metric_ids: [], settings: { ...s, tagSource: { id: tagged } }, title: t.body.title ?? null };
  // A template holds no Tag (a hand-made file might): only a person's choice of a Tag makes a Tag widget.
  const { tagSource: _t, tagView: _v, ...plain } = s; void _t; void _v;
  return {
    template: t.view,
    metric_ids: own.length || !firstPanel ? own : (fills[firstPanel.slot!] ?? []).slice(0, 1),
    settings: {
      ...plain,
      ...(s.panels ? { panels: s.panels.map(({ slot, ...panel }) => (slot === undefined ? panel : { ...panel, metricIds: fills[slot] ?? [] })) } : {}),
    },
    title: t.body.title ?? null,
  };
}

/** Fills are valid when every slot has one metric, or at least one for a "one or more" slot. */
export const fillsComplete = (slots: Slot[], fills: number[][], tagFills: (string | null)[] = []) => slots.every((s, i) => (s.multiple && Boolean(tagFills[i])) || ((fills[i]?.length ?? 0) >= 1 && (s.multiple || fills[i].length === 1)));

/** Which Slots of a Dashboard Template a Tag may fill ("All Metrics tagged…"): a "one or more" Slot that only widgets taking a
 * Tag use, each as its one and only list, so the Slot becomes a Tag widget and nothing else changes. */
export function tagFillable(slots: Slot[], body: DashboardTemplateBody): boolean[] {
  return slots.map((s, i) => {
    const users = body.widgets.filter((w) => w.metricSlots.includes(i) || (w.settings.panels ?? []).some((p) => p.slot === i));
    return s.multiple && users.length > 0 && users.every((w) => w.metricSlots.length === 1 && w.metricSlots[0] === i && !(w.settings.panels ?? []).some((p) => p.slot !== undefined) && takesTagSource({ template: w.view, settings: w.settings }));
  });
}

// Slide layouts: a whole slide saved as a template. Widgets on it share one set of slots; words in its
// text boxes become placeholders and are filled in once, when a slide is made from the layout.


/** Shapes a layout may hold: text, drawing and widgets. Images point at files the deck owns, so they stay behind. */
export const SLIDE_SHAPES = ["ziffr-widget", "text", "geo", "arrow", "line", "note", "draw", "highlight"];

const widgetOf = (sh: SlideShape): W => ({
  template: sh.props.template as TemplateId,
  metric_ids: (sh.props.metricIds as number[]) ?? [],
  settings: typeof sh.props.settings === "string" ? (JSON.parse(sh.props.settings || "{}") as WidgetSettings) : {},
  title: (sh.props.title as string) || null,
});

/** Notes tied to one period or row in any widget on a slide. */
export function slideSpecifics(shapes: SlideShape[]): Specific[] {
  return shapes.flatMap((sh, i) => (sh.type === "ziffr-widget" ? specifics(widgetOf(sh)).map((x) => ({ ...x, key: `s${i}:${x.key}` })) : []));
}

/** Rich text is a tree of nodes; only its text leaves change. */
type RichNode = { text?: string; content?: RichNode[]; [k: string]: unknown };
function mapRich(node: unknown, f: (t: string) => string): unknown {
  if (!node || typeof node !== "object") return node;
  const n = node as RichNode;
  return { ...n, ...(typeof n.text === "string" ? { text: f(n.text) } : {}), ...(Array.isArray(n.content) ? { content: n.content.map((c) => mapRich(c, f)) } : {}) };
}

/** One slide's shapes with its widgets' Metrics turned into Slots of `ctx`; keys of `choices` carry `prefix`. */
function templatizeSlide(shapes: SlideShape[], metrics: Metric[], choices: Choices, ctx: SlotCtx, prefix = "") {
  const notices: string[] = [];
  // {metric} on the slide is the first metric of its first widget, {metric 2} the next new one, and so on.
  const slideIds = [...new Set(shapes.flatMap((sh) => (sh.type === "ziffr-widget" ? metricsInOrder(widgetOf(sh), metrics).map((m) => m.id) : [])))];
  const slideMetrics = slideIds.map((id) => metrics.find((m) => m.id === id)!).filter(Boolean);
  const out = shapes.map((sh, i): SlideShape => {
    if (sh.type === "ziffr-widget") {
      const { notices: n, ...widget } = templatize(widgetOf(sh), metrics, choices, ctx, `${prefix}s${i}:`);
      notices.push(...n);
      const { metricIds: _m, settings: _s, title: _t, ...props } = sh.props; // eslint-disable-line @typescript-eslint/no-unused-vars
      return { ...sh, props, widget };
    }
    return sh.props.richText ? { ...sh, props: { ...sh.props, richText: mapRich(sh.props.richText, (t) => placeholderize(t, slideMetrics) ?? t) } } : sh;
  });
  const texts: string[] = [];
  for (const sh of out) if (sh.props.richText) mapRich(sh.props.richText, (t) => (texts.push(t), t));
  if (texts.some((t) => /\d/.test(t.replace(/\{[^}]*\}/g, "")))) notices.push("Some words still contain numbers. They will read the same for every metric; use {latest} or {change yoy} to have them filled in.");
  return { body: { shapes: out } as SlideBody, notices };
}

/** The slide layout a slide makes: shared slots for its widgets, placeholders in its words, and what changed on the way. */
export function toSlideLayout(shapes: SlideShape[], metrics: Metric[], choices: Choices, labels: string[] = []) {
  const ctx = newCtx();
  const { body, notices } = templatizeSlide(shapes, metrics, choices, ctx);
  return { slots: nameSlots(ctx, labels), body, notices: [...new Set(notices)] };
}

// Deck Templates (GLOSSARY: Deck Template): every slide of a deck, sharing one set of Slots, so a Metric shown on
// three slides is picked once. Each slide keeps its own words, with its own {metric}.

/** Notes tied to one period or row on any slide of a deck; keys name the slide (d0:, d1:, …). */
export function deckSpecifics(slides: SlideShape[][]): Specific[] {
  return slides.flatMap((shapes, j) => slideSpecifics(shapes).map((x) => ({ ...x, key: `d${j}:${x.key}` })));
}

/** The Deck Template a deck's slides make: shared Slots, each slide's shapes with Slot numbers instead of Metrics. */
export function toDeckTemplate(slides: SlideShape[][], metrics: Metric[], choices: Choices, labels: string[] = []) {
  const ctx = newCtx();
  const made = slides.map((shapes, j) => templatizeSlide(shapes, metrics, choices, ctx, `d${j}:`));
  return { slots: nameSlots(ctx, labels), body: { slides: made.map((m) => m.body) } as DeckTemplateBody, notices: [...new Set(made.flatMap((m) => m.notices))] };
}

/** The slides of a new deck from a Deck Template, once each Slot has its Metrics; words filled by `fillWords`. */
export function fromDeckTemplate(body: DeckTemplateBody, fills: number[][], fillWords: (t: string, metricIds: number[]) => string): SlideShape[][] {
  return body.slides.map((slide) => fromSlideLayout(slide, fills, fillWords));
}

// Dashboard Templates (spec 0014): a whole dashboard saved as a template. Its widgets share one set of slots, so a
// Metric drawn by three widgets is picked once; each widget keeps its own words, with its own {metric}.

/** Views a Dashboard Template cannot hold: a Free Layout keeps a drawing whose Metrics cannot be left open yet. */
export const NOT_IN_DASHBOARD_TEMPLATES: TemplateId[] = ["canvas"];

/** The Dashboard Template a dashboard makes: shared slots, each widget with slot numbers instead of Metrics, where
 * it sits, the widgets left out (by title or view) and what changed on the way. Every note tied to one period or row
 * is dropped, as a widget template does by default. */
export function toDashboardTemplate(widgets: (W & Pick<Widget, "x" | "y" | "w" | "h">)[], metrics: Metric[], labels: string[] = [], tagNames: ReadonlyMap<string, string> = new Map()) {
  const ctx = newCtx();
  const notices: string[] = [];
  const leftOut: string[] = [];
  const out: DashboardTemplateWidget[] = [];
  const ordered = [...widgets].sort((a, b) => a.y - b.y || a.x - b.x);
  ordered.forEach((w, i) => {
    if (NOT_IN_DASHBOARD_TEMPLATES.includes(w.template)) { leftOut.push(w.title || "A free layout"); return; }
    // A Tag widget needs its Tag's name for its Slot; one the person cannot see is left out, as nothing of it may be read.
    const tag = tagSourceId(w.settings);
    if (tag && !tagNames.has(tag)) { leftOut.push(w.title || "A widget of a Tag"); return; }
    const { notices: n, ...body } = templatize(w, metrics, {}, ctx, `w${i}:`);
    notices.push(...n);
    out.push({ view: w.template, ...body, x: w.x, y: w.y, w: w.w, h: w.h });
  });
  return { slots: nameSlots(ctx, labels), body: { widgets: out } as DashboardTemplateBody, leftOut, notices: [...new Set(notices)] };
}

/** The widgets of a new dashboard from a Dashboard Template, once each slot has its Metrics. */
export function fromDashboardTemplate(body: DashboardTemplateBody, fills: number[][], tagFills: (string | null)[] = []) {
  return body.widgets.map((tw) => ({ ...fromTemplate({ view: tw.view, body: tw }, fills, tagFills), x: tw.x, y: tw.y, w: tw.w, h: tw.h }));
}

/** The shapes of a new slide from a layout, with slots filled and its words filled in from today's data. */
export function fromSlideLayout(body: SlideBody, fills: number[][], fillWords: (t: string, metricIds: number[]) => string): SlideShape[] {
  const made = body.shapes.map((sh) => (sh.widget ? { sh, w: fromTemplate({ view: sh.props.template as TemplateId, body: sh.widget }, fills) } : { sh, w: null }));
  const ids = [...new Set(made.flatMap((x) => (x.w ? [...x.w.metric_ids, ...(x.w.settings.panels ?? []).flatMap((p) => p.metricIds)] : [])))];
  return made.map(({ sh, w }) => {
    const { widget: _w, ...rest } = sh; // eslint-disable-line @typescript-eslint/no-unused-vars
    if (w) return { ...rest, props: { ...sh.props, metricIds: w.metric_ids, settings: JSON.stringify(w.settings), title: w.title ?? "" } };
    return sh.props.richText ? { ...rest, props: { ...sh.props, richText: mapRich(sh.props.richText, (t) => fillWords(t, ids)) } } : rest;
  });
}

// Workflow Templates (GLOSSARY: Workflow Template): a Workflow's steps without its people.

/** A Workflow's Due Date and steps as a template: each Approve step keeps how many Approvers it has, never who; a
 * Checklist Item keeps its words, kind and day or Due Date, and Send Snapshot only that it is there, with who gets it,
 * who ticks it off, which Group may read it and which dashboard left open. A Tell step names people, so a template
 * leaves it out. */
export function toWorkflowTemplate(c: WorkflowConfig): WorkflowTemplateBody {
  return {
    dueWorkingDays: c.dueWorkingDays,
    steps: c.steps.flatMap((s): WorkflowTemplateStep[] => {
      switch (s.type) {
        case "tell": return [];
        case "approve": return [{ type: "approve", approvers: Math.min(3, s.approvers.length), values: s.values ?? "unusual", ...(s.nobodyElse ? { nobodyElse: s.nobodyElse } : {}) }];
        // An item kept to a Group stays behind: a template is read by the whole team, a Pack or an export by more.
        case "checklist": if (s.readGroup !== undefined) return []; return [s.kind === "tick" ? { type: "checklist", kind: "tick", text: s.text, dueWorkingDays: s.dueWorkingDays } : { type: "checklist", kind: "info", text: s.text, day: s.day }];
        case "send_snapshot": return [{ type: "send_snapshot" }];
        default: return [s];
      }
    }),
  };
}

/** A Workflow's Due Date and steps from a template, with the Approvers picked, in order. Null when the number of
 * people picked is not the number the template asks for. Its Checklist Items come with nobody to tell or to tick them
 * off (an item for information waits, one to tick off reads "nobody yet") and no id: saving the Workflow gives each one. */
export function fromWorkflowTemplate(t: WorkflowTemplateBody, approvers: string[]): WorkflowConfig | null {
  const wanted = t.steps.reduce((n, s) => (s.type === "approve" ? n + s.approvers : n), 0);
  if (approvers.length !== wanted || new Set(approvers).size !== approvers.length) return null;
  let next = 0;
  return {
    dueWorkingDays: t.dueWorkingDays,
    steps: t.steps.map((s): WorkflowStep => {
      switch (s.type) {
        case "approve": return { type: "approve", approvers: approvers.slice(next, (next += s.approvers)), values: s.values ?? "unusual", ...(s.nobodyElse ? { nobodyElse: s.nobodyElse } : {}) };
        case "checklist": return s.kind === "tick" ? { type: "checklist", id: "", kind: "tick", text: s.text, assignee: null, dueWorkingDays: s.dueWorkingDays } : { type: "checklist", id: "", kind: "info", text: s.text, day: s.day, people: [], groups: [] };
        case "send_snapshot": return { type: "send_snapshot", id: "", dashboardId: 0, people: [], groups: [] };
        default: return s;
      }
    }),
  };
}

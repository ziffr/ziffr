// Team Widget Templates (GLOSSARY: Widget Template, Slot, Placeholder): turning a widget into a template
// with its metrics left open, and filling a template's slots to make a widget again. Pure.
import { listOf, metricsInOrder } from "./placeholders";
import type { AnchorRule, Metric, Slot, TeamTemplate, TemplateId, Widget, WidgetSettings } from "./types";

type W = Pick<Widget, "template" | "metric_ids" | "settings" | "title">;

/** Something in the widget that points at one period or one row, which another metric will not have. */
export type Specific = { key: string; kind: "period" | "row"; text: string; at: string };

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

export type Choices = Record<string, AnchorRule | "drop">;

/** The template a widget makes: slots, settings with slot numbers instead of metrics, and what changed on the way. */
export function toTemplate(widget: W, metrics: Metric[], choices: Choices, labels: string[] = []) {
  const s = widget.settings;
  const ms = metricsInOrder(widget, metrics);
  const name = (id: number) => metrics.find((m) => m.id === id)?.name ?? "a metric";
  const slots: Slot[] = [];
  const slotIds: number[][] = [];
  const slotFor = (ids: number[]) => {
    let i = slotIds.findIndex((x) => x.length === ids.length && x.every((v, j) => v === ids[j]));
    if (i < 0) {
      slotIds.push(ids);
      slots.push({ label: "", multiple: ids.length > 1, example: ids.map(name).join(", ") });
      i = slots.length - 1;
    }
    return i;
  };
  const notices: string[] = [];
  const p = (t: string | undefined) => placeholderize(t, ms);

  // A composed story's own metric only names it; its panels carry the metrics, so they make the slots.
  const panelIds = new Set((s.panels ?? []).flatMap((x) => x.metricIds));
  const fromPanels = widget.template === "story" && panelIds.size > 0 && widget.metric_ids.every((id) => panelIds.has(id));
  const metricSlots = fromPanels ? [] : widget.metric_ids.map((id) => slotFor([id]));
  const callouts = (s.callouts ?? []).flatMap((c, i) => {
    if (c.rule) return [{ ...c, text: p(c.text) ?? "" }];
    const choice = choices[`callout:${i}`] ?? "drop";
    if (choice === "drop") return [];
    return [{ period: "", rule: choice, text: p(c.text) ?? "" }];
  });
  const panels = (s.panels ?? []).map((panel, pi) => {
    const annotations = (panel.annotations ?? []).flatMap((a, ai) => {
      const text = p(a.text);
      if (a.anchor.type === "rule") return [{ ...a, text }];
      const choice = choices[`ann:${pi}:${ai}`] ?? "drop";
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
      ...(panel.metricIds.length ? { slot: slotFor(panel.metricIds) } : {}),
      metricIds: [],
    };
  });
  if (s.highlight) notices.push(`The highlight on “${s.highlight}” becomes the largest row.`);
  if (s.period) notices.push("It will show the latest breakdown, not a fixed period.");
  const dropped = specifics(widget).filter((x) => (choices[x.key] ?? "drop") === "drop");
  if (dropped.length) notices.push(`${dropped.length} note${dropped.length > 1 ? "s" : ""} tied to one period or row will be left out.`);

  const settings: WidgetSettings = {
    ...s,
    kicker: p(s.kicker), headline: p(s.headline), subline: p(s.subline), footnote: p(s.footnote), source: p(s.source),
    highlight: null, period: null,
    ...(s.callouts ? { callouts } : {}),
    ...(s.panels ? { panels } : {}),
  };
  slots.forEach((x, i) => (x.label = labels[i]?.trim() || (slots.length === 1 ? "Metric" : `Metric ${i + 1}`)));
  return { slots, body: { metricSlots, settings, title: p(widget.title ?? undefined) ?? null }, notices };
}

/** The widget a template makes once each slot has its metrics. */
export function fromTemplate(t: Pick<TeamTemplate, "view" | "body">, fills: number[][]): { template: TemplateId; metric_ids: number[]; settings: WidgetSettings; title: string | null } {
  const s = t.body.settings;
  const own = t.body.metricSlots.flatMap((i) => fills[i] ?? []);
  const firstPanel = s.panels?.find((p) => p.slot !== undefined);
  return {
    template: t.view,
    metric_ids: own.length || !firstPanel ? own : (fills[firstPanel.slot!] ?? []).slice(0, 1),
    settings: {
      ...s,
      ...(s.panels ? { panels: s.panels.map(({ slot, ...panel }) => (slot === undefined ? panel : { ...panel, metricIds: fills[slot] ?? [] })) } : {}),
    },
    title: t.body.title ?? null,
  };
}

/** Fills are valid when every slot has one metric, or at least one for a "one or more" slot. */
export const fillsComplete = (slots: Slot[], fills: number[][]) => slots.every((s, i) => (fills[i]?.length ?? 0) >= 1 && (s.multiple || fills[i].length === 1));

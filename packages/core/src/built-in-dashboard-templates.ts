// The Dashboard Templates Ziffr ships (GLOSSARY: Dashboard Template), so a new workspace has something to start from.
// Plain data, built only from built-in Widget Templates; every workspace sees them and nobody changes them.
import { TEMPLATES } from "./widget-templates";
import type { DashboardTemplate, DashboardTemplateWidget, TemplateId, WidgetSettings } from "./types";

/** One widget at a place, with its view's default settings. */
const at = (view: TemplateId, slots: number[], x: number, y: number, w: number, h: number): DashboardTemplateWidget => ({
  view, metricSlots: slots, settings: { ...TEMPLATES[view].settings }, title: null, x, y, w, h,
});

const one = (label: string) => ({ label, multiple: false });

/** Every built-in Dashboard Template, by its text id. */
export const BUILT_IN_DASHBOARD_TEMPLATES: DashboardTemplate[] = [
  {
    id: "overview",
    owner_id: null,
    kind: "dashboard",
    name: "Overview",
    description: "Four numbers at a glance, the first two also as trends against their targets.",
    slots: [one("Main metric"), one("Second metric"), one("Third metric"), one("Fourth metric")],
    body: {
      widgets: [
        at("number", [0], 0, 0, 3, 4), at("number", [1], 3, 0, 3, 4), at("number", [2], 6, 0, 3, 4), at("number", [3], 9, 0, 3, 4),
        at("line", [0], 0, 4, 6, 6), at("line", [1], 6, 4, 6, 6),
      ],
    },
  },
  {
    id: "deep-dive",
    owner_id: null,
    kind: "dashboard",
    name: "One metric in depth",
    description: "One Metric from every side: its latest value, where it sits against the target, its trend, its periods, its history and a forecast.",
    slots: [one("Metric")],
    body: {
      widgets: [
        at("number", [0], 0, 0, 4, 4), at("gauge", [0], 4, 0, 4, 4), at("table", [0], 8, 0, 4, 10),
        at("line", [0], 0, 4, 8, 6),
        at("bars", [0], 0, 10, 6, 6), at("forecast", [0], 6, 10, 6, 7),
      ],
    },
  },
  {
    id: "side-by-side",
    owner_id: null,
    kind: "dashboard",
    name: "Two metrics side by side",
    description: "Two Metrics next to each other, and whether they move together.",
    slots: [one("First metric"), one("Second metric")],
    body: {
      widgets: [
        at("number", [0], 0, 0, 6, 4), at("number", [1], 6, 0, 6, 4),
        at("line", [0], 0, 4, 6, 6), at("line", [1], 6, 4, 6, 6),
        at("correlation", [0, 1], 0, 10, 12, 7),
      ],
    },
  },
  {
    id: "scorecard",
    owner_id: null,
    kind: "dashboard",
    name: "Scorecard",
    description: "Six Metrics as gauges against their targets: what is on track and what is not, at a glance.",
    slots: [one("First metric"), one("Second metric"), one("Third metric"), one("Fourth metric"), one("Fifth metric"), one("Sixth metric")],
    body: {
      widgets: [
        at("gauge", [0], 0, 0, 4, 5), at("gauge", [1], 4, 0, 4, 5), at("gauge", [2], 8, 0, 4, 5),
        at("gauge", [3], 0, 5, 4, 5), at("gauge", [4], 4, 5, 4, 5), at("gauge", [5], 8, 5, 4, 5),
      ],
    },
  },
  {
    id: "trends",
    owner_id: null,
    kind: "dashboard",
    name: "Trends board",
    description: "Four trends side by side against their targets, and the first one forecast. For a weekly or monthly review.",
    slots: [one("First metric"), one("Second metric"), one("Third metric"), one("Fourth metric")],
    body: {
      widgets: [
        at("line", [0], 0, 0, 6, 6), at("line", [1], 6, 0, 6, 6),
        at("line", [2], 0, 6, 6, 6), at("line", [3], 6, 6, 6, 6),
        at("forecast", [0], 0, 12, 12, 7),
      ],
    },
  },
  {
    id: "target-tracker",
    owner_id: null,
    kind: "dashboard",
    name: "Target tracker",
    description: "Three Metrics, each as its latest value and its periods coloured by whether they were on target: how often it was on track.",
    slots: [one("First metric"), one("Second metric"), one("Third metric")],
    body: {
      widgets: [
        at("number", [0], 0, 0, 3, 4), at("bars", [0], 3, 0, 9, 4),
        at("number", [1], 0, 4, 3, 4), at("bars", [1], 3, 4, 9, 4),
        at("number", [2], 0, 8, 3, 4), at("bars", [2], 3, 8, 9, 4),
      ],
    },
  },
  {
    id: "check-in",
    owner_id: null,
    kind: "dashboard",
    name: "Weekly check-in",
    description: "Four numbers with their change since the last period, and the last values of the first two: a glance to start the week.",
    slots: [one("First metric"), one("Second metric"), one("Third metric"), one("Fourth metric")],
    body: {
      widgets: [
        at("number", [0], 0, 0, 3, 4), at("number", [1], 3, 0, 3, 4), at("number", [2], 6, 0, 3, 4), at("number", [3], 9, 0, 3, 4),
        at("table", [0], 0, 4, 6, 8), at("table", [1], 6, 4, 6, 8),
      ],
    },
  },
  {
    id: "board-pack",
    owner_id: null,
    kind: "dashboard",
    name: "Board pack",
    description: "A written Finding on the first Metric and a trend with callouts for the second, with the numbers behind them: what to say, and the figures that say it.",
    slots: [one("Headline metric"), one("Second metric"), one("Third metric")],
    body: {
      widgets: [
        {
          ...at("story", [0], 0, 0, 8, 10),
          // A composed Finding whose period bars take the first Slot: the headline and kicker name the Metric and period when drawn.
          settings: {
            kicker: "{metric}, {period}",
            headline: "{metric} {change yoy} on last year",
            subline: "Change against the same period a year earlier, in %",
            // A template panel names its Slot, never Metrics (the file format has no metricIds); filling the Slots makes them.
            panels: [{ type: "period-bars", slot: 0, measure: "pct-yoy", periods: 6, highlight: "last" }] as unknown as WidgetSettings["panels"],
          },
        },
        at("number", [0], 8, 0, 4, 5), at("number", [1], 8, 5, 4, 5),
        at("story-line", [1], 0, 10, 8, 9),
        at("number", [2], 8, 10, 4, 5), at("gauge", [2], 8, 15, 4, 4),
      ],
    },
  },
];

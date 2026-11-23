// @ts-nocheck
// The Dashboard Templates Ziffr ships (GLOSSARY: Dashboard Template), so a new workspace has something to start from.
// Plain data, built only from built-in Widget Templates; every workspace sees them and nobody changes them.
import { TEMPLATES } from "./widget-templates";
import type { DashboardTemplate, DashboardTemplateWidget, TemplateId } from "./types";

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
];

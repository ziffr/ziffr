// GLOSSARY: Widget Template, View, Finding. How the Pool and Browse templates group the built-in templates.
import { ChartColumn, ChartLine, LayoutGrid, Newspaper } from "lucide-react";
import { OFFERED_TEMPLATES, type TemplateDef } from "@/views/templates";

/** The groups of built-in templates, in the order they are listed. */
export const TEMPLATE_GROUPS: { kind: TemplateDef["kind"]; title: string; icon: typeof ChartLine }[] = [
  { kind: "metric", title: "Views", icon: ChartLine },
  { kind: "analysis", title: "Analyses", icon: ChartColumn },
  { kind: "story", title: "Findings", icon: Newspaper },
  { kind: "layout", title: "Layout", icon: LayoutGrid },
];

/** Built-in templates offered on a canvas. A free layout goes only on dashboards: a slide or a free layout already is one. */
export const builtinTemplates = (layouts: boolean) => OFFERED_TEMPLATES.filter((t) => layouts || t.kind !== "layout");

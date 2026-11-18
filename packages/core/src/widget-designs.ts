// The View Design a widget carries (GLOSSARY: View Design, Widget): wherever widget settings are stored (a dashboard,
// a saved widget, a Free layout and the widget it starts from, a deck's slides), every design in them is checked
// like a file brought in.
// Security: settings come from browsers, and widgets nest: a Free layout keeps the widget it starts from
// (`canvasSeed`) and a tldraw document of widgets, each with settings of its own. Every path a design can sit on is
// walked here, so the renderer only ever sees checked designs, however the settings arrived. Pure.
import { checkViewDesignValue } from "./view-design";
import type { WidgetSettings } from "./types";

/** How deep widgets may nest inside one another (a layout's seed, a widget on a layout, …) before it is refused. */
export const MAX_WIDGET_NESTING = 6;

/** The design setting of a widget, checked: refused with an Error when it is not one that passes the checks. */
export function checkedDesignSetting(v: unknown): WidgetSettings["design"] {
  if (v === undefined || v === null) return v as null | undefined;
  const o = v as { id?: unknown; body?: unknown };
  if (typeof o !== "object" || Array.isArray(o)) throw new Error("This widget's View Design is not one.");
  const res = checkViewDesignValue(o.body);
  if (!res.ok) throw new Error(`This widget's View Design does not pass its checks: ${res.problems[0].path} ${res.problems[0].message}`);
  return { id: Number.isInteger(o.id) && (o.id as number) > 0 ? (o.id as number) : null, body: res.design };
}

/** Every View Design in a widget's settings, however deeply nested: its own, its Free layout's seed and the widgets
 * on its artboard. Each is checked; an Error names the first that fails. Settings that are not an object hold none. */
export function assertSettingsDesigns(settings: unknown, depth = 0): void {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return;
  if (depth > MAX_WIDGET_NESTING) throw new Error("This widget nests other widgets too deeply.");
  const s = settings as WidgetSettings;
  checkedDesignSetting(s.design);
  if (s.canvasSeed) assertSettingsDesigns(s.canvasSeed.settings, depth + 1);
  assertWidgetDesigns(s.canvas?.document, depth + 1);
}

/** Checks every widget's designs in a tldraw document (a deck, a slide layout, or a Free layout's artboard). */
export function assertWidgetDesigns(doc: unknown, depth = 0): void {
  if (!doc || typeof doc !== "object") return;
  if (depth > MAX_WIDGET_NESTING) throw new Error("This widget nests other widgets too deeply.");
  const walk = (v: unknown, d: number): void => {
    if (d > 40 || !v || typeof v !== "object") return;
    if (Array.isArray(v)) return v.forEach((x) => walk(x, d + 1));
    const r = v as { type?: unknown; props?: { settings?: unknown } };
    if (r.type === "ziffr-widget" && r.props) {
      let s: unknown = r.props.settings;
      if (typeof s === "string") {
        try { s = JSON.parse(s || "{}"); } catch { throw new Error("A widget's settings could not be read."); }
      }
      assertSettingsDesigns(s, depth + 1);
    }
    for (const x of Object.values(v)) walk(x, d + 1);
  };
  walk(doc, 0);
}

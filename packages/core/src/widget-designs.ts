// The View Design a widget carries (GLOSSARY: View Design, Widget): wherever widget settings are stored (a dashboard,
// a saved widget, a Free layout, a deck's slides), the design in them is checked like a file brought in.
// Security: settings come from browsers. A design that does not pass checkViewDesign is never stored, so the renderer
// only ever sees checked designs, however the settings arrived. Pure.
import { checkViewDesignValue } from "./view-design";
import type { WidgetSettings } from "./types";

/** The design setting of a widget, checked: refused with an Error when it is not one that passes the checks. */
export function checkedDesignSetting(v: unknown): WidgetSettings["design"] {
  if (v === undefined || v === null) return v as null | undefined;
  const o = v as { id?: unknown; body?: unknown };
  if (typeof o !== "object" || Array.isArray(o)) throw new Error("This widget's View Design is not one.");
  const res = checkViewDesignValue(o.body);
  if (!res.ok) throw new Error(`This widget's View Design does not pass its checks: ${res.problems[0].path} ${res.problems[0].message}`);
  return { id: Number.isInteger(o.id) && (o.id as number) > 0 ? (o.id as number) : null, body: res.design };
}

/** Checks every widget's design in a tldraw document (a deck, or a Free layout's artboard), however deeply placed. */
export function assertWidgetDesigns(doc: unknown, depth = 0): void {
  if (depth > 6 || !doc || typeof doc !== "object") return;
  const walk = (v: unknown, d: number): void => {
    if (d > 40 || !v || typeof v !== "object") return;
    if (Array.isArray(v)) return v.forEach((x) => walk(x, d + 1));
    const r = v as { type?: unknown; props?: { settings?: unknown } };
    if (r.type === "ziffr-widget" && r.props) {
      let s: unknown = r.props.settings;
      if (typeof s === "string") {
        try { s = JSON.parse(s || "{}"); } catch { throw new Error("A widget's settings could not be read."); }
      }
      const settings = (s ?? {}) as WidgetSettings;
      checkedDesignSetting(settings.design);
      assertWidgetDesigns(settings.canvas?.document, depth + 1);
    }
    for (const x of Object.values(v)) walk(x, d + 1);
  };
  walk(doc, 0);
}

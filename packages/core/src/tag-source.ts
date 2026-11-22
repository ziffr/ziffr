// "All Metrics tagged X" as a widget's source (GLOSSARY: Tag, Widget; spec 0038): the parts that need no database, so the
// template code and the app can use them. Reading a Tag source for a viewer is tag-widgets.ts.
import type { WidgetSettings } from "./types";
export { takesTagSource, withoutTagSource } from "./widget-templates";

/** Most Metrics a Tag widget draws: what a fixed widget may hold (a widget stores at most 50 Metrics); the rest are said as "and N more". */
export const TAG_WIDGET_MAX = 50;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The Tag id a widget's settings name as its source, or null: anything that is not a Tag id is no source. */
export function tagSourceId(settings: Pick<WidgetSettings, "tagSource"> | null | undefined): string | null {
  const id = settings?.tagSource?.id;
  return typeof id === "string" && UUID.test(id) ? id.toLowerCase() : null;
}

/** A copy of any stored JSON (a free layout's drawing, a deck's document) with every Tag source and Tag name drawing added taken out, at every depth and also
 * inside widget settings kept as JSON text. A widget placed inside another thing has a fixed list, never a Tag: its Metrics are then opened by that thing's Share and its
 * Tag's name must not travel with it (spec 0038). */
export function withoutNestedTagSources<T>(value: T): T {
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).filter(([k]) => k !== "tagSource" && k !== "tagView").map(([k, x]) => [k, walk(x)]));
    if (typeof v === "string" && v.trimStart().startsWith("{")) {
      // Widget settings kept as JSON text: parsed, cleaned and written again, whatever the spacing or escapes.
      try { return JSON.stringify(walk(JSON.parse(v))); } catch { return v; }
    }
    return v;
  };
  return walk(value) as T;
}

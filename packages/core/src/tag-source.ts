// "All Metrics tagged X" as a widget's source (GLOSSARY: Tag, Widget; spec 0038): the parts that need no database, so the
// template code and the app can use them. Reading a Tag source for a viewer is tag-widgets.ts.
import { templateOf, TEMPLATES } from "./widget-templates";
import type { Widget, WidgetSettings } from "./types";

/** Most Metrics a Tag widget draws: what a fixed widget may hold (a widget stores at most 50 Metrics); the rest are said as "and N more". */
export const TAG_WIDGET_MAX = 50;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The Tag id a widget's settings name as its source, or null: anything that is not a Tag id is no source. */
export function tagSourceId(settings: Pick<WidgetSettings, "tagSource"> | null | undefined): string | null {
  const id = settings?.tagSource?.id;
  return typeof id === "string" && UUID.test(id) ? id.toLowerCase() : null;
}

/** Whether a view can take a Tag instead of a list: only one whose Metrics are a single "one or more" Slot (a matrix of
 * Metrics, or a View Design asking for exactly that), since a Tag fills the whole list and nothing else. */
export function takesTagSource(widget: Pick<Widget, "template" | "settings">): boolean {
  if (!(widget.template in TEMPLATES)) return false;
  const slots = templateOf(widget).slots;
  return slots.length === 1 && slots[0].multiple;
}

/** A widget's settings without a Tag source and without what drawing added to it: for a copy that records the Metrics of the moment. */
export function withoutTagSource(settings: WidgetSettings): WidgetSettings {
  const { tagSource: _s, tagView: _v, ...rest } = settings;
  void _s; void _v;
  return rest;
}

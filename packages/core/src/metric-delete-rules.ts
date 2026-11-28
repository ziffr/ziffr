// The pure rules of deleting Metrics (spec 0065; GLOSSARY: Metric, Derived Metric, Total, Widget, Deck, Slot): the
// words a person types to confirm, the order Metrics that read each other are deleted in, and how a widget or a slide
// lets go of one. No database and nothing about who asks, so the browser may read the confirm words.
import { BUILT_IN_DESIGNS } from "./built-in-designs";
import { describedDeck } from "./deck-form";
import { TEXT_SHAPE_TYPES, textList, textMetricIds } from "./slide-text";
import { tagSourceId } from "./tag-source";
import type { Widget, WidgetSettings } from "./types";
import { templateOf } from "./widget-templates";
import { widgetMetricIds } from "./widget-metrics";

/** The most Metrics deleted, and held in one Metric Record, at once. */
export const DELETE_METRICS = 50;

/** What a person types to confirm: the Metric's name for one, "delete 3 Metrics" for several. */
export function confirmWords(names: readonly string[]): string {
  return names.length === 1 ? names[0] : `delete ${names.length} Metrics`;
}

/** Whether what was typed confirms: a name exactly, the words for several in any case. */
export function confirms(typed: unknown, names: readonly string[]): boolean {
  const said = String(typed ?? "").trim();
  if (!names.length) return false;
  return names.length === 1 ? said === names[0].trim() : said.toLowerCase() === confirmWords(names).toLowerCase();
}

/** Which of `wanted` can go and in what order, when `readers` says which Metrics read each one (a formula or a Total):
 * a Metric goes only if every reader of it goes too, and after all of them. Metrics that read each other in a circle
 * stay. */
export function deletionOrder(wanted: readonly number[], readers: ReadonlyMap<number, readonly number[]>): number[] {
  const left = new Set(wanted);
  const gone = new Set<number>();
  const order: number[] = [];
  for (let moved = true; moved; ) {
    moved = false;
    for (const id of left) {
      if ((readers.get(id) ?? []).some((r) => !gone.has(r))) continue;
      left.delete(id);
      gone.add(id);
      order.push(id);
      moved = true;
    }
  }
  return order;
}

/** The fewest Metrics a view of a list can show. */
function fewest(template: string, settings: WidgetSettings): number {
  const design = template === "design" ? settings.design?.body : (BUILT_IN_DESIGNS as Record<string, { slots: { min?: number }[] } | undefined>)[template];
  return Math.max(1, design?.slots[0]?.min ?? 1);
}

/** The list a widget keeps when it lets go of these Metrics, or null when it cannot: only a view of one list of
 * Metrics, that names them nowhere else and still has enough left, keeps working. Otherwise the widget goes whole. */
export function listWithout(widget: Pick<Widget, "template" | "metric_ids" | "settings">, gone: ReadonlySet<number>): number[] | null {
  const settings = widget.settings ?? {};
  if (tagSourceId(settings) !== null) return null;
  const slots = templateOf({ template: widget.template, settings })?.slots ?? [];
  if (slots.length !== 1 || !slots[0].multiple) return null;
  if (widgetMetricIds([], settings).some((id) => gone.has(id))) return null;
  const rest = (widget.metric_ids ?? []).filter((id) => !gone.has(id));
  return rest.length >= fewest(widget.template, settings) ? rest : null;
}

type Shape = { id?: string; typeName?: string; type?: string; props?: Record<string, unknown>; meta?: Record<string, unknown>; fromId?: string; toId?: string };

/** What a deck's slides say once they let go of Metrics, and what changed: Widgets that must go whole, Widgets that
 * keep their other Metrics, and text boxes whose live values of them are left empty. */
export type DeckWithout = { document: unknown; slides: number; removed: number; trimmed: number; emptied: number };

/** A widget shape's settings, kept as a JSON string on slides. */
function shapeSettings(raw: unknown): WidgetSettings {
  if (typeof raw !== "string") return (raw && typeof raw === "object" ? raw : {}) as WidgetSettings;
  try {
    return JSON.parse(raw) as WidgetSettings;
  } catch {
    return {};
  }
}

/** A deck's document without these Metrics, on every slide, those that keep a Snapshot's numbers included. Snapshot
 * Parts name no Metric and stay. */
export function deckWithout(document: unknown, gone: ReadonlySet<number>, made: unknown): DeckWithout {
  const doc = document as { store?: Record<string, Shape> } | null;
  const out: DeckWithout = { document, slides: 0, removed: 0, trimmed: 0, emptied: 0 };
  const description = describedDeck(document, made);
  if (description !== undefined) {
    // A made deck loses each slide that lists one of them; its cover and its last slide list none, so it stays valid.
    const slides = description?.slides.filter((s) => !s.metrics.some((id) => gone.has(id))) ?? [];
    if (!description || slides.length === description.slides.length) return out;
    return { ...out, document: { ...description, slides }, slides: description.slides.length - slides.length };
  }
  if (!doc?.store) return out;
  const dropped = new Set<string>();
  const entries = Object.entries(doc.store).flatMap(([key, shape]): [string, Shape][] => {
    if (shape?.type === "ziffr-widget") {
      const settings = shapeSettings(shape.props?.settings);
      const ids = Array.isArray(shape.props?.metricIds) ? (shape.props.metricIds as unknown[]).map(Number) : [];
      if (!widgetMetricIds(ids, settings).some((id) => gone.has(id))) return [[key, shape]];
      const rest = listWithout({ template: shape.props?.template as Widget["template"], metric_ids: ids, settings }, gone);
      if (rest === null) {
        out.removed++;
        dropped.add(String(shape.id ?? key));
        return [];
      }
      out.trimmed++;
      return [[key, { ...shape, props: { ...shape.props, metricIds: rest } }]];
    }
    if (shape?.typeName === "shape" && TEXT_SHAPE_TYPES.has(String(shape.type)) && textMetricIds(shape).some((id) => gone.has(id))) {
      out.emptied++;
      // The words stay as written; the place in the box's list is left empty, so its value shows nothing.
      const list = (textList(shape) as number[]).map((id) => (gone.has(id) ? 0 : id));
      return [[key, { ...shape, meta: { ...shape.meta, metrics: list } }]];
    }
    return [[key, shape]];
  });
  if (!out.removed && !out.trimmed && !out.emptied) return out;
  // An arrow bound to a shape that went goes loose with it.
  const kept = entries.filter(([, r]) => r?.typeName !== "binding" || !(dropped.has(String(r.fromId)) || dropped.has(String(r.toId))));
  out.document = { ...doc, store: Object.fromEntries(kept) };
  return out;
}

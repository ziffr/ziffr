// The picker's list as the core gives it, put together from the same pure pieces `listPicker` uses after the visibility check; shared by the tests of the panel and of the page.
import { groupsFor, metricsNeeded, type CanvasFact } from "@ziffr/core/method-picker-fit";
import { textsOf } from "@ziffr/core/method-picker";
import { questionFor } from "@ziffr/core/method-picker-names";
import type { EntryView, PickerList } from "@ziffr/core/analysis-picker";

export type { CanvasFact };

/** A canvas Metric as the fit rules see it: monthly, 24 periods of values, nothing special. */
export const fact = (id: number, name: string, over: Partial<CanvasFact> = {}): CanvasFact => ({ id, name, period: "month", aggregation: "sum", periods: 24, hasTarget: false, breakdownLatest: false, breakdownBefore: false, builtFrom: [], ...over });
/** The list as the core gives it for these canvas Metrics (the same pure pieces `listPicker` puts together after the visibility check). */
export function listFor(facts: CanvasFact[]): PickerList {
  const on = facts.map((f) => f.id);
  return {
    canvas: facts.map((f) => ({ id: f.id, name: f.name, period: f.period })),
    groups: groupsFor(facts).map((g) => ({
      want: g.want, question: g.question,
      entries: g.entries.map((e): EntryView => {
        const defaults = Object.fromEntries(e.slots.map((sl, i) => [sl.id, sl.optional ? [] : sl.many ? on.slice(i) : on.slice(i, i + 1)]));
        const nm = (slot: string) => facts.find((f) => f.id === defaults[slot]?.[0])?.name;
        const name = questionFor(e.id, { metric: nm("metric"), first: nm("first"), second: nm("second"), held: (defaults.held ?? []).flatMap((i) => facts.find((f) => f.id === i)?.name ?? []), metrics: (defaults.metrics ?? []).flatMap((i) => facts.find((f) => f.id === i)?.name ?? []) }, e.name);
        return { id: e.id, name, generic: e.name, sentence: e.sentence, technical: e.technical, ...textsOf(e), slots: e.slots, settings: e.settings, needs: `${metricsNeeded(e)} Metrics on the canvas`, fit: e.fit, defaults, recipeFile: false, widget: e.widget };
      }),
    })),
  };
}

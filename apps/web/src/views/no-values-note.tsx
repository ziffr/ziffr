"use client";
// Where a Widget's view or a chart has no value to draw (GLOSSARY: Widget, View, Submitter): plain words instead of bare
// axes and dashes, and, only where the page offers it to someone who submits the Metric, the way to record one.
// The words come from the data the viewer was sent and nothing else, so values kept from someone and values that do not
// exist read the same.
import { createContext, useContext, type ReactNode } from "react";
import { noValuesWords } from "@ziffr/core/total-rules";
import type { CanvasData, Metric, MetricDescription } from "@ziffr/core/types";
import { firstValueWords, NOTHING_TO_SHOW } from "./no-values-words";

/** What is known of a Metric a view would draw: a bare description, as in a preview, has no id to record under. */
type Drawn = MetricDescription & Partial<Pick<Metric, "id" | "reads_total">>;

/** What a page offers for recording a value of one of these Metrics, or null where the viewer submits none of them. */
export type RecordAction = (metrics: Drawn[]) => ReactNode;

/** Set only by a page where recording belongs (a dashboard's grid): a Read view, Present, a View Link and a deck set none. */
export const RecordActionContext = createContext<RecordAction | null>(null);

/** Whether none of these Metrics has a value in the data sent for drawing, Condensed Values included. */
export const hasNoValues = (metrics: Metric[], data: Pick<CanvasData, "series" | "condensed">) =>
  metrics.every((m) => !data.series[m.slug]?.length && !data.condensed?.[m.id]?.length);

/** The words in place of an empty view. `past` is a view frozen at an earlier date, which a new value would not fill. */
export function NoValuesNote({ metrics, template, past }: { metrics: Drawn[]; template: string; past?: boolean }) {
  const offer = useContext(RecordActionContext);
  const action = past ? null : offer?.(metrics);
  // A Total, and a formula that reads one, says why instead.
  const total = metrics.find((m) => m.total || m.reads_total);
  return (
    <div className="widget-text-xs flex h-full flex-col items-center justify-center gap-2 p-2 text-center text-muted-foreground">
      <p>{total ? noValuesWords(total) : action ? firstValueWords(template) : NOTHING_TO_SHOW}</p>
      {action}
    </div>
  );
}

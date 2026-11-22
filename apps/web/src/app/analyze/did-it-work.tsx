"use client";
// The Recipe "Did it work?" on the Analysis Canvas (GLOSSARY: Recipe, Takeaway, Change point; spec 0041, ticket 7): the first
// Metric on the canvas, the date it started, and optionally a Metric the change should not have touched. The Takeaway compares
// the periods after the date with where the Metric's own trend pointed, as a range, never a verdict. With no date it looks for
// the date of a change instead. Everything is worked out in the browser from the series the page already sent for the Metrics on
// the canvas (the ones the person may see), by the core's pure Methods; the words are the Takeaway's, as everywhere.
import { useState } from "react";
import { TakeawayView } from "@/components/takeaway-view";
import { afterDateTakeaway } from "@ziffr/core/methods/before-after";
import { changePointTakeaway } from "@ziffr/core/methods/change-point";
import type { CanvasData, Metric } from "@ziffr/core/types";

const FIELD = "h-9 w-full rounded-[var(--radius-input)] border border-input bg-card px-2.5 text-sm";

/** The card of the Recipe: asks for the date and, optionally, a Metric to set beside; shows the Takeaway. `metrics` are those on the canvas, the first is asked about. */
export function DidItWork({ data, metrics }: { data: CanvasData; metrics: Metric[] }) {
  const [metric, ...others] = metrics;
  const [date, setDate] = useState("");
  const [besideId, setBesideId] = useState("");
  // Only a Metric counted at the same period can be set beside: both are cut at the same date, period by period.
  const candidates = others.filter((o) => o.period === metric.period);
  const beside = candidates.find((o) => String(o.id) === besideId);
  const ctx = { style: data.numberStyle, yearStart: data.yearStart };
  const points = data.series[metric.slug] ?? [];
  const takeaway = date
    ? afterDateTakeaway(metric.name, points, metric.period, date, metric, ctx, beside && { name: beside.name, points: data.series[beside.slug] ?? [], unit: beside })
    : changePointTakeaway(metric.name, points, metric.period, metric, ctx);
  return (
    <section className="desk space-y-3 rounded-[var(--radius-card)] p-4" aria-label="Did it work?">
      <h2 className="text-sm font-medium">Did it work?</h2>
      <p className="text-xs text-muted-foreground">
        Name the day it started. Ziffr compares what {metric.name} did after it with where its own trend pointed. Leave the day empty to look for the day {metric.name} changed instead.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-muted-foreground">Day it started
          <input type="date" lang="en-GB" value={date} onChange={(e) => setDate(e.target.value)} className={`mt-1 ${FIELD}`} />
        </label>
        <label className="text-xs text-muted-foreground">A metric it should not have touched (optional)
          <select value={besideId} onChange={(e) => setBesideId(e.target.value)} disabled={!date || candidates.length === 0} className={`mt-1 ${FIELD}`}>
            <option value="">None</option>
            {candidates.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </label>
      </div>
      {date && others.length > candidates.length && <p className="text-xs text-muted-foreground">Metrics counted at another period than {metric.name} cannot be set beside it.</p>}
      <TakeawayView takeaway={takeaway} />
    </section>
  );
}

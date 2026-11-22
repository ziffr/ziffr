"use client";
// The popup on a point of a chart (GLOSSARY: Observation, Source, Submitter, Thread, Approval; #789): the one popup every
// chart of a widget uses, on hover, tap or keyboard focus. What the chart already has (period, value, status against
// the target, whether it waits for Approval or is locked) is shown at once; where the value came from, who submitted it
// and the open Threads are asked of the core for this one point, only where the card provides a loader.
// Visibility (AGENTS.md rule 3): only an interactive card in the app provides the loader; a View Link, a Preview and a
// Snapshot (read-only cards) do not, so they show only what their data already carries and nothing is fetched for them.
// The core names the submitter only where this person may be shown them (a Guest only themselves).
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { formatValue, targetLabel, targetStatus } from "@ziffr/core/format";
import type { ObservationDetails } from "@ziffr/core/observation-details";
import type { CanvasData, Metric } from "@ziffr/core/types";
import { cn } from "@/lib/utils";

/** Asks the core for one Observation's details. */
export type DetailsLoader = (slug: string, period: string) => Promise<ObservationDetails | null>;

const DetailsContext = createContext<DetailsLoader | null>(null);

/** Provides the loader to a card's charts; without one they fetch nothing. */
export const ObservationDetailsProvider = DetailsContext.Provider;

/** A loader that asks once per point and keeps the answer while the card is shown. */
export function cachedLoader(load: DetailsLoader): DetailsLoader {
  const seen = new Map<string, Promise<ObservationDetails | null>>();
  return (slug, period) => {
    const key = `${slug} ${period}`;
    let p = seen.get(key);
    if (!p) seen.set(key, (p = load(slug, period).catch(() => null)));
    return p;
  };
}

/** The details of one point, asked for after a short pause so passing over a chart asks for nothing. */
function useDetails(slug: string, period: string, ask: boolean): ObservationDetails | null | undefined {
  const load = useContext(DetailsContext);
  const key = `${slug} ${period}`;
  const [got, setGot] = useState<{ key: string; value: ObservationDetails | null } | null>(null);
  useEffect(() => {
    if (!load || !ask) return;
    let live = true;
    const t = setTimeout(() => void load(slug, period).then((value) => live && setGot({ key, value })), 150);
    return () => { live = false; clearTimeout(t); };
  }, [load, ask, slug, period, key]);
  return got?.key === key ? got.value : undefined;
}

type Props = {
  metric: Metric;
  period: string;
  /** The point's name, as the chart writes it ("Mar 2026", "Q1 26, 2 of 3 months"). */
  label: string;
  value: number;
  /** The target the value is judged against (the span's own for a combined series). */
  goal: { target_min: number | null; target_max: number | null };
  data: CanvasData;
  /** Whether the point is one Observation: a span of a combined series is not, and has no details to ask for. */
  single: boolean;
  /** More lines a chart adds, such as the target series or a recipe's output. */
  children?: ReactNode;
};

/** The popup on one point of a chart. */
export function ObservationTip({ metric, period, label, value, goal, data, single, children }: Props) {
  const details = useDetails(metric.slug, period, single);
  const status = targetStatus({ ...metric, ...goal }, value);
  const waits = single && data.pending?.[metric.id]?.includes(period);
  const locked = single && data.locked?.[metric.id]?.includes(period);
  return (
    <div role="tooltip" className="stock widget-text-xs max-w-[22em] space-y-[0.15em] rounded-[var(--radius-input)] px-[0.83em] py-[0.5em]">
      <div className="font-medium">{label}</div>
      <div>{metric.name}: <span className="fig font-medium">{formatValue(metric, value, data.numberStyle)}</span></div>
      {status && <div className={cn("font-medium", status === "on" ? "text-[var(--color-success)]" : "text-destructive")}>{targetLabel(metric.polarity, status)}</div>}
      {waits && <div className="text-[var(--color-accent-2)]">Not approved yet</div>}
      {!waits && locked && <div className="text-muted-foreground">Locked</div>}
      {children}
      {details && (
        <div className="text-muted-foreground">
          {details.source && <div>Source: {details.source}</div>}
          {details.submitter && <div>Submitted by {details.submitter}</div>}
          {details.openThreads > 0 && <div><span className="fig">{details.openThreads}</span> open {details.openThreads === 1 ? "Thread" : "Threads"}</div>}
        </div>
      )}
    </div>
  );
}

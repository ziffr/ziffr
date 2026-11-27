// What a Total's own page and the "Add up Metrics" form are given (GLOSSARY: Total; spec 0058, "Team totals"). Of the
// Metrics a Total adds up, only those the reader sees are named, with nothing that says how many others there are; how
// complete a period is, they learn only where they see every one counted in it.
import { assertCan, type Actor } from "./actor";
import { getShares, visibleMetricIds } from "./access";
import { db } from "./db";
import { shareableBy } from "./derived-metrics";
import { periodStart, shiftPeriod } from "./periods";
import { partsProblem } from "./total-rules";
import { readParts, unapprovedTotals } from "./total-parts";
import { listedStanding, totalStanding, type TotalStanding } from "./totals";
import { DEMO_WORKSPACE_ID } from "./team";
import { getLatestObservations, getMetrics } from "./workspace-data";
import { yearStartFor } from "./fiscal-year";
import type { Metric, Period, Point } from "./types";

// As many of the latest periods as the page lists.
const LISTED_PERIODS = 8;

/** A Metric the "Add up Metrics" form lists: what is needed to pick it and to say which go together. */
export type TotalChoice = Pick<Metric, "id" | "name" | "period" | "unit" | "format" | "aggregation">;

/** The Metrics the actor may add up: their own and those they edit that take values, are in use and have an Aggregation
 * that adds up. Guests are given nothing, as they create nothing. */
export async function totalChoices(actor: Actor): Promise<TotalChoice[]> {
  assertCan(actor, "create");
  const all = await getMetrics(actor.workspaceId);
  const mine = await shareableBy(actor.workspaceId, actor.personId, all);
  return all.filter((m) => mine.has(m.id) && !m.formula && !m.archived_at && m.aggregation !== "none").map(({ id, name, period, unit, format, aggregation }) => ({ id, name, period, unit, format, aggregation }));
}

/** What a Total's page shows besides its values. */
export type TotalPageData = {
  open: boolean;
  targets: "own" | "parts";
  /** The reader may change what it adds up (its owner and Editors; while it is open, its owner). */
  mayChange: boolean;
  /** The reader may open and close it: its owner. */
  mayOpen: boolean;
  /** The Metrics it adds up that the reader sees, with the periods each counts in. */
  parts: { id: number; slug: string; name: string; first: string; last: string | null }[];
  /** Metrics the reader could add. Empty unless they may change it. */
  choices: { id: number; name: string }[];
  /** The latest periods, newest first, as they stand for the reader. */
  periods: TotalStanding[];
  /** Shown periods that are not approved yet. */
  unapproved: string[];
};

/** A Total as its page shows it to the actor, or null where it is no Total or they do not see it. */
export async function totalPage(actor: Actor, totalId: number): Promise<TotalPageData | null> {
  const ws = actor.workspaceId;
  const all = await getMetrics(ws);
  const total = all.find((m) => m.id === totalId);
  if (!total?.total) return null;
  const seen = await visibleMetricIds(ws, actor.personId, all);
  if (!seen.has(total.id)) return null;
  const parts = (await readParts(ws))[total.id] ?? [];
  const isOwner = total.owner_id === actor.personId && actor.role !== "guest";
  const editor = isOwner || (actor.role !== "guest" && (await getShares(ws)).some((s) => s.workspace_id === ws && s.object_type === "metric" && s.object_id === total.id && s.user_id === actor.personId && s.role === "editor"));
  const demo = ws === DEMO_WORKSPACE_ID;
  const mayChange = editor && !actor.key && !demo && (isOwner || !total.total.open);
  const values = await getLatestObservations(ws, { metricIds: parts.map((p) => p.part) });
  const there = new Set(values.map((o) => `${o.metric_id} ${o.period_start}`));
  // The latest periods by the calendar, so the list itself says nothing of what a hidden Metric has a value for.
  const current = periodStart(new Date(), total.period as Period, await yearStartFor(ws, total.period as Period));
  const latest = Array.from({ length: LISTED_PERIODS }, (_, i) => shiftPeriod(current, total.period as Period, -i));
  const standing = total.inputs_withheld ? [] : totalStanding(parts, (part, period) => there.has(`${part} ${period}`), latest, total.total.open, (id) => seen.has(id));
  const periods = listedStanding(standing, parts, latest[1], values.filter((o) => seen.has(o.metric_id)).map((o) => o.period_start));
  const shown: Point[] = periods.filter((p) => p.state === "shown").map((p) => ({ period: p.period, value: 0 }));
  const [mine, owners] = mayChange ? await Promise.all([shareableBy(ws, actor.personId, all), shareableBy(ws, total.owner_id, all)]) : [new Set<number>(), new Set<number>()];
  const counted = new Set(parts.map((p) => p.part));
  const choices = all.filter((m) => mine.has(m.id) && owners.has(m.id) && !counted.has(m.id) && !m.archived_at && !partsProblem([{ ...total, formula: null }, m]));
  const bySight = new Map(all.filter((m) => seen.has(m.id)).map((m) => [m.id, m]));
  return {
    open: total.total.open,
    targets: total.total.targets,
    mayChange,
    mayOpen: isOwner && !actor.key && !demo,
    parts: parts.flatMap((p) => { const m = bySight.get(p.part); return m ? [{ id: m.id, slug: m.slug, name: m.name, first: p.first, last: p.last }] : []; }).sort((a, b) => a.name.localeCompare(b.name)),
    choices: choices.map((m) => ({ id: m.id, name: m.name })).sort((a, b) => a.name.localeCompare(b.name)),
    periods,
    unapproved: (await unapprovedTotals(ws, [{ metric: total, points: shown }]))[total.id] ?? [],
  };
}

/** The Totals that count a Metric from now on and that the actor may change, each with the last period the Metric has a
 * value for: what archiving it asks about. */
export async function totalsCounting(actor: Actor, metricId: number): Promise<{ id: number; name: string; period: Period; last: string; open: boolean }[]> {
  const ws = actor.workspaceId;
  const all = await getMetrics(ws);
  const parts = all.some((m) => m.total) ? await readParts(ws) : {};
  const counting = all.filter((m) => parts[m.id]?.some((p) => p.part === metricId && p.last === null));
  if (!counting.length) return [];
  const out = await Promise.all(counting.map((m) => totalPage(actor, m.id).then((page) => ({ m, page }))));
  const { data } = await db().from("observations").select("period_start").eq("workspace_id", ws).eq("metric_id", metricId).order("period_start", { ascending: false }).limit(1);
  return Promise.all(out.filter(({ page }) => page?.mayChange && page.parts.some((p) => p.id === metricId)).map(async ({ m, page }) => ({
    id: m.id, name: m.name, period: m.period as Period, open: page!.open,
    last: (data?.[0]?.period_start as string | undefined) ?? periodStart(new Date(), m.period as Period, await yearStartFor(ws, m.period as Period)),
  })));
}

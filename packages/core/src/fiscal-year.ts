// The Fiscal Year (spec 0017, ticket #39; GLOSSARY: Fiscal Year): the month a workspace's year starts in, which
// decides its quarters, half-years and years everywhere. Owners and Admins set it, never in the demo; every member
// reads it. It cannot move where what is stored by quarter, half-year or year would no longer start one.
import { Forbidden, type Actor } from "./actor";
import { audit } from "./audit-log";
import { db } from "./db";
import { isPeriodStart, isYearStart, JANUARY, periodLabel, toYearStart, type Span, type YearStart } from "./periods";
import { DEMO_WORKSPACE_ID } from "./team";

/** The year start of a workspace, for code that has already checked who may see it. */
export async function yearStartOf(workspaceId: string): Promise<YearStart> {
  const { data } = await db().from("workspaces").select("year_start_month").eq("id", workspaceId).maybeSingle();
  return toYearStart(data?.year_start_month);
}

/** The year start a span needs: the workspace's for a quarter, half-year or year. A day, week or month is the same
 * whatever the year start, so for those it is JANUARY without asking the database. */
export async function yearStartFor(workspaceId: string, span: Span): Promise<YearStart> {
  return span === "day" || span === "week" || span === "month" ? JANUARY : yearStartOf(workspaceId);
}

/** The actor's workspace's year start, for any member. */
export async function workspaceYearStart(actor: Pick<Actor, "workspaceId">): Promise<YearStart> {
  return yearStartOf(actor.workspaceId);
}

/** What is stored by quarter, half-year or year: one entry per distinct span start. */
type Stored = { span: Span; start: string; snapshot?: number };

// Quarterly and yearly Metrics' values and Target Series, and the Snapshots of quarters, half-years and years. Each
// starts a span under the year start it was stored with; a new year start must keep every one a start.
async function storedSpans(ws: string): Promise<{ stored: Stored[]; metrics: boolean; snapshots: boolean }> {
  const [{ data: metrics }, { data: snaps }] = await Promise.all([
    db().from("metrics").select("id, period").eq("workspace_id", ws).in("period", ["quarter", "year"]),
    db().from("dashboard_snapshots").select("id, period_kind, period_start").eq("workspace_id", ws).is("deleted_at", null).in("period_kind", ["quarter", "half", "year"]),
  ]);
  const stored: Stored[] = (snaps ?? []).map((s) => ({ span: s.period_kind as Span, start: String(s.period_start), snapshot: Number(s.id) }));
  const periodOf = new Map((metrics ?? []).map((m) => [Number(m.id), m.period as Span]));
  let hasValues = false;
  if (periodOf.size) {
    const ids = [...periodOf.keys()];
    const [{ data: obs }, { data: series }] = await Promise.all([
      db().from("observations").select("metric_id, period_start").in("metric_id", ids),
      db().from("series_values").select("metric_id, period_start").in("metric_id", ids),
    ]);
    const seen = new Set<string>();
    for (const r of [...(obs ?? []), ...(series ?? [])]) {
      const span = periodOf.get(Number(r.metric_id))!;
      const key = `${span}:${r.period_start}`;
      if (seen.has(key)) continue;
      seen.add(key);
      stored.push({ span, start: String(r.period_start) });
    }
    hasValues = seen.size > 0;
  }
  return { stored, metrics: hasValues, snapshots: Boolean(snaps?.length) };
}

/** The year start, which months it may move to, and why the others are out. */
export type YearStartChoices = { yearStart: YearStart; allowed: YearStart[]; why: string | null };

const MONTHS = Array.from({ length: 12 }, (_, i) => (i + 1) as YearStart);

/** The year start and the months it may change to now, for any member: a month is out when a quarterly or yearly
 * Metric's values, or a Snapshot of a quarter, half-year or year, would no longer start one of its spans. */
export async function yearStartChoices(actor: Pick<Actor, "workspaceId">): Promise<YearStartChoices> {
  const { yearStart, allowed, why } = await choicesIn(actor.workspaceId);
  return { yearStart, allowed, why };
}

async function choicesIn(ws: string): Promise<YearStartChoices & { stored: Stored[] }> {
  const [yearStart, { stored, metrics, snapshots }] = await Promise.all([yearStartOf(ws), storedSpans(ws)]);
  const allowed = MONTHS.filter((m) => m === yearStart || stored.every((s) => isPeriodStart(s.start, s.span, m)));
  const what = [metrics && "quarterly or yearly Metrics' values", snapshots && "Snapshots of quarters, half-years or years"].filter(Boolean).join(" and ");
  return { yearStart, allowed, why: allowed.length < 12 ? `Some months are out: the ${what} kept so far would no longer start a quarter, half-year or year.` : null, stored };
}

/** Sets the month the workspace's year starts in, for Owners and Admins; audited. Refused for a month that would
 * split what is stored by quarter, half-year or year. Snapshots of quarters and half-years that still line up take
 * the new names ("Q1 FY 2026/27"), so a Snapshot is called what its period is called everywhere else. */
export async function setYearStart(actor: Actor, month: unknown): Promise<YearStart> {
  if (actor.key || (actor.role !== "owner" && actor.role !== "admin")) throw new Forbidden("Only Owners and Admins change when the workspace's year starts.");
  // The demo is shared by every visitor: what one of them set there, all the others would see.
  if (actor.workspaceId === DEMO_WORKSPACE_ID) throw new Forbidden("The demo keeps its settings.");
  if (!isYearStart(month)) throw new Error("Pick a month from the list.");
  const choices = await choicesIn(actor.workspaceId);
  if (month === choices.yearStart) return month;
  if (!choices.allowed.includes(month)) throw new Error(choices.why ?? "The year cannot start in that month.");
  const { error } = await db().from("workspaces").update({ year_start_month: month }).eq("id", actor.workspaceId);
  if (error) throw new Error("The year start could not be saved.");
  for (const s of choices.stored) {
    if (s.snapshot) await db().from("dashboard_snapshots").update({ label: periodLabel(s.start, s.span, month) }).eq("id", s.snapshot).eq("workspace_id", actor.workspaceId);
  }
  // Only two month numbers: nothing a person typed.
  await audit(actor, { kind: "workspace.year_start_changed", object: { type: "workspace", id: actor.workspaceId }, details: { from: choices.yearStart, to: month } });
  return month;
}

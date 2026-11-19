// The Schedule (spec 0027, ticket #240; GLOSSARY: Schedule, Due Date, Stand-in, Away, Approval, Task, Question,
// Escalation): what one person has to do in a Workspace, day by day. The API, the MCP Server, the My schedule page and
// the Calendar Link all read this one function and add no rules of their own.
import { addDays, differenceInCalendarDays, format, isValid, isWeekend, parseISO } from "date-fns";
import { assertScope, Forbidden, type Actor, type KeyActor } from "./actor";
import { getGroups, threadReader, visibleMetricIds } from "./access";
import { db } from "./db";
import { feedIdsAmong } from "./feed-people";
import { yearStartOf } from "./fiscal-year";
import { periodEnd, periodLabel, periodStart, shiftPeriod, type YearStart } from "./periods";
import { addWorkingDays, dueDate, workingPeriod } from "./workflow-rules";
import { allRows, getMetrics } from "./workspace-data";
import { localTime, workspaceClock } from "./workspace-clock";
import { tokenValid } from "./tokens";
import type { Metric, Period, WorkflowConfig } from "./types";

/** What kind of duty an entry is. */
export type ScheduleKind = "value_due" | "approval" | "task" | "question";

/** One duty in a Schedule: what it is about, when, and where in Ziffr it is done. */
export type ScheduleEntry = {
  kind: ScheduleKind;
  /** The day it falls on (YYYY-MM-DD), or null for an undated Task or Question. */
  date: string | null;
  overdue: boolean;
  /** Working days (Saturdays and Sundays skipped) since it became overdue; 0 when it is not. */
  overdueWorkingDays: number;
  metric: { id: number; slug: string; name: string; period: Period };
  /** The period it is about, with its name. */
  period: { start: string; label: string };
  /** The Action behind an Approval, Task or Question; null for a value due. */
  actionId: number | null;
  /** A Task's or Question's words, as asked; null for a value due and an Approval (its words hold the value), and
   * when the person asking for a teammate's Schedule may not read that Action's Thread. */
  text: string | null;
  /** A Question the Workflow asked the Metric Owner because a value is missing (GLOSSARY: Escalation). */
  escalation: boolean;
  /** Whom the person stands in for while they are Away (a value due only). */
  standingInFor: { id: string; name: string } | null;
  /** A value due of a Metric without a Workflow: dated the first working day after its period ends. */
  noDueDate: boolean;
  /** The Workflow's Due Date in working days after the period ends; null without a Workflow. */
  dueWorkingDays: number | null;
  /** How many days before the Due Date Ziffr reminds (the Workflow's earliest Remind step), or null. */
  remindDaysBefore: number | null;
  /** Where in Ziffr it is done: a path that needs a sign-in and carries no secret. */
  path: string;
};

/** A person's Schedule: overdue entries first (whatever the span), then the span's days that have entries, then the
 * undated Tasks and Questions. */
export type Schedule = { today: string; personId: string; overdue: ScheduleEntry[]; days: { date: string; entries: ScheduleEntry[] }[]; undated: ScheduleEntry[] };

/** The longest span one Schedule covers, in days. */
export const MAX_SCHEDULE_DAYS = 90;
/** How far ahead a Schedule reaches, in days from today. */
export const MAX_SCHEDULE_AHEAD = 366;
/** How far back overdue entries reach, in days from today. */
export const OVERDUE_DAYS_BACK = 90;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const iso = (d: Date) => format(d, "yyyy-MM-dd");
const plusDays = (day: string, n: number) => iso(addDays(parseISO(day), n));
const isDay = (v: unknown): v is string => typeof v === "string" && DAY.test(v) && isValid(parseISO(v)) && iso(parseISO(v)) === v;
const KIND_ORDER: Record<ScheduleKind, number> = { value_due: 0, approval: 1, task: 2, question: 3 };

/** A span a Schedule cannot cover, with the sentence that says what to change (the API answers 400 with it). */
export class SpanRefused extends Error {}

/** Working days after `from` up to and including `to` (0 when `to` is not later). Whole weeks are counted at once: a
 * Task's due date is whatever its asker typed, so it may lie centuries back. */
export function workingDaysBetween(from: string, to: string): number {
  const days = differenceInCalendarDays(parseISO(to), parseISO(from));
  if (days <= 0) return 0;
  const weeks = Math.floor(days / 7);
  let n = weeks * 5;
  for (let d = addDays(parseISO(from), weeks * 7 + 1), end = parseISO(to); d <= end; d = addDays(d, 1)) if (!isWeekend(d)) n++;
  return n;
}

/** A span checked: real days, `from` not after `to`, at most MAX_SCHEDULE_DAYS apart, `from` at most
 * OVERDUE_DAYS_BACK days before today and `to` at most MAX_SCHEDULE_AHEAD days after it. Refuses anything else with a sentence that says what to change. */
export function checkSpan(span: { from: unknown; to: unknown }, today: string): { from: string; to: string } {
  if (!isDay(span.from) || !isDay(span.to)) throw new SpanRefused("Give from and to as days, written YYYY-MM-DD.");
  if (span.to < span.from) throw new SpanRefused("from must not be after to.");
  if (differenceInCalendarDays(parseISO(span.to), parseISO(span.from)) > MAX_SCHEDULE_DAYS) throw new SpanRefused(`from and to may be at most ${MAX_SCHEDULE_DAYS} days apart.`);
  // Nothing older than the overdue entries is ever shown; reading further back would only cost work.
  if (span.from < plusDays(today, -OVERDUE_DAYS_BACK)) throw new SpanRefused(`from may be at most ${OVERDUE_DAYS_BACK} days back.`);
  if (span.to > plusDays(today, MAX_SCHEDULE_AHEAD)) throw new SpanRefused(`to may be at most ${MAX_SCHEDULE_AHEAD} days ahead.`);
  return { from: span.from, to: span.to };
}

/** Monday to Sunday of the week a day falls in: the span a Schedule shows when none is given. */
export function weekOf(day: string): { from: string; to: string } {
  const from = periodStart(day, "week", 1);
  return { from, to: plusDays(from, 6) };
}

/** Whose Schedule it is: the actor's own, or a teammate's for an Owner or Admin. Anyone else naming a person other
 * than themselves is refused, and so is a person who is not in the Workspace. */
async function whose(actor: Actor | KeyActor, personId: unknown): Promise<string> {
  if (personId === undefined || personId === null || personId === actor.personId) return actor.personId;
  if (actor.role !== "owner" && actor.role !== "admin") throw new Forbidden("Only Owners and Admins see a teammate's Schedule.");
  if (typeof personId !== "string" || personId.length > 200) throw new Forbidden();
  const { data } = await db().from("memberships").select("user_id").eq("workspace_id", actor.workspaceId).eq("user_id", personId).maybeSingle();
  if (!data) throw new Forbidden();
  return personId;
}

type TokenFact = { metric_id: number; submitter_id: string; stand_in_id: string | null; created_at: string };
type ActionRow = { id: number; metric_id: number; period_start: string; kind: "question" | "task"; purpose: string | null; due_date: string | null; question: string; created_at: string; asker_id: string; assignee_id: string; read_group_id: number | null; workspace_id: string };
type Ctx = { today: string; lo: string; hi: string; timeZone: string; yearStart: YearStart; workflows: Map<number, WorkflowConfig> };

/** The Workspace's today and the facts every entry is worked out from. */
async function loadContext(ws: string, now: Date) {
  const [{ data: wsRow }, yearStart, { data: flows }] = await Promise.all([
    db().from("workspaces").select("time_zone").eq("id", ws).single(),
    yearStartOf(ws),
    db().from("workflows").select("id, config").eq("workspace_id", ws),
  ]);
  const timeZone = String(wsRow?.time_zone ?? "UTC");
  return { timeZone, today: localTime(now, timeZone).day, yearStart, workflows: new Map((flows ?? []).map((w) => [w.id as number, w.config as WorkflowConfig])) };
}

/** A value due for a period: built the same for Metrics with and without a Workflow. */
function valueDue(m: Metric, start: string, date: string, ctx: Ctx, cfg: WorkflowConfig | undefined, standingInFor: ScheduleEntry["standingInFor"]): ScheduleEntry {
  const overdue = date < ctx.today;
  const reminds = (cfg?.steps ?? []).flatMap((s) => (s.type === "remind" ? [s.daysBefore] : []));
  return {
    kind: "value_due", date, overdue, overdueWorkingDays: overdue ? workingDaysBetween(date, ctx.today) : 0,
    metric: { id: m.id, slug: m.slug, name: m.name, period: m.period }, period: { start, label: periodLabel(start, m.period, ctx.yearStart) },
    actionId: null, text: null, escalation: false, standingInFor, noDueDate: !cfg, dueWorkingDays: cfg ? Math.max(0, cfg.dueWorkingDays) : null,
    remindDaysBefore: reminds.length ? Math.max(...reminds) : null, path: `/schedule/submit/${encodeURIComponent(m.slug)}`,
  };
}

/** The periods of a Metric with a Workflow whose Due Date falls between ctx.lo and ctx.hi, ending on or after `since`. */
function periodsDue(m: Metric, cfg: WorkflowConfig, since: string, ctx: Ctx): { start: string; due: string }[] {
  const out: { start: string; due: string }[] = [];
  // A Due Date is at most 30 working days (under 45 calendar days) after its period ends; the period before that
  // cannot be due in the window.
  const first = [since, plusDays(ctx.lo, -50)].sort().at(-1)!;
  for (let p = periodStart(first, m.period, ctx.yearStart); periodEnd(p, m.period) <= ctx.hi; p = shiftPeriod(p, m.period, 1)) {
    const due = dueDate(p, m.period, cfg);
    if (periodEnd(p, m.period) >= since && due >= ctx.lo && due <= ctx.hi) out.push({ start: p, due });
  }
  return out;
}

/** Who the Workflow asks for a submitter's value on a day: their Stand-in while they are Away, else themselves. */
function askedOn(t: TokenFact, day: string, away: Map<string, { starts: string; ends: string }>): string {
  const a = away.get(t.submitter_id);
  return t.stand_in_id && a && a.starts <= day && day <= a.ends ? t.stand_in_id : t.submitter_id;
}

/** The values the person must submit: their own Tokens' Metrics, and those they stand in for on the day asked. */
async function valuesDue(ws: string, person: string, metrics: Map<number, Metric>, ctx: Ctx): Promise<ScheduleEntry[]> {
  const cols = "metric_id, submitter_id, stand_in_id, created_at";
  const [own, standIn] = await Promise.all([
    allRows<TokenFact>((from, to) => db().from("tokens").select(cols).eq("workspace_id", ws).eq("submitter_id", person).is("stands_in_for", null).order("id").range(from, to)),
    allRows<TokenFact>((from, to) => db().from("tokens").select(cols).eq("workspace_id", ws).eq("stand_in_id", person).is("stands_in_for", null).order("id").range(from, to)),
  ]);
  // A Feed is a program: its Metrics' values are never anyone's duty (spec 0012).
  const feeds = await feedIdsAmong([...own, ...standIn].map((t) => t.submitter_id));
  const tokens = [...own, ...standIn].filter((t) => !feeds.has(t.submitter_id) && metrics.has(t.metric_id) && !metrics.get(t.metric_id)!.formula);
  if (!tokens.length) return [];
  const ids = [...new Set(tokens.map((t) => t.metric_id))];
  // Values from a year and a Due Date before the window on: a yearly period due in it started at most that long ago.
  const [{ data: awayRows }, values, { data: names }] = await Promise.all([
    db().from("away").select("user_id, starts, ends").in("user_id", [...new Set(tokens.map((t) => t.submitter_id))]),
    allRows<{ metric_id: number; period_start: string }>((from, to) => db().from("observations").select("metric_id, period_start").eq("workspace_id", ws).in("metric_id", ids).gte("period_start", plusDays(ctx.lo, -420)).order("id").range(from, to)),
    db().from("profiles").select("id, name").in("id", [...new Set(tokens.filter((t) => t.submitter_id !== person).map((t) => t.submitter_id))]),
  ]);
  const away = new Map((awayRows ?? []).map((a) => [a.user_id as string, { starts: String(a.starts), ends: String(a.ends) }]));
  const has = new Set(values.map((v) => `${v.metric_id}:${v.period_start}`));
  const nameOf = new Map((names ?? []).map((p) => [p.id as string, p.name as string]));
  const out = new Map<string, ScheduleEntry>();
  for (const t of tokens) {
    const m = metrics.get(t.metric_id)!;
    const cfg = (m as Metric & { workflow_id?: number | null }).workflow_id ? ctx.workflows.get((m as Metric & { workflow_id: number }).workflow_id) : undefined;
    // Nobody owes a value for a period that ended before the Metric, or their Token, existed.
    const since = [m.created_at, t.created_at].map((s) => localTime(new Date(s), ctx.timeZone).day).sort().at(-1)!;
    const candidates = cfg ? periodsDue(m, cfg, since, ctx) : noDueDatePeriod(m, since, ctx);
    for (const { start, due } of candidates) {
      if (has.has(`${m.id}:${start}`) || askedOn(t, due, away) !== person) continue;
      const key = `${m.id}:${start}`;
      const mineToo = out.get(key);
      // Their own Token wins over standing in for someone else for the same value.
      if (mineToo && !mineToo.standingInFor) continue;
      const standingInFor = t.submitter_id === person ? null : { id: t.submitter_id, name: nameOf.get(t.submitter_id) ?? "a colleague" };
      out.set(key, valueDue(m, start, due, ctx, cfg, standingInFor));
    }
  }
  return [...out.values()];
}

/** A Metric without a Workflow has no Due Date: only its latest ended period, when it has no value, is due, on the
 * first working day after it ends, so a daily Metric nobody fills in does not flood the Schedule. */
function noDueDatePeriod(m: Metric, since: string, ctx: Ctx): { start: string; due: string }[] {
  const start = workingPeriod(ctx.today, m.period, ctx.yearStart);
  if (periodEnd(start, m.period) < since) return [];
  const due = addWorkingDays(periodEnd(start, m.period), 1);
  return due >= ctx.lo && due <= ctx.hi ? [{ start, due }] : [];
}

/** The open Approvals, Tasks and Questions assigned to the person. */
async function actionEntries(ws: string, person: string, metrics: Map<number, Metric>, ctx: Ctx, readable: (a: ActionRow) => boolean): Promise<ScheduleEntry[]> {
  const rows = await allRows<ActionRow>((from, to) => db().from("actions").select("id, metric_id, period_start, kind, purpose, due_date, question, created_at, asker_id, assignee_id, read_group_id, workspace_id").eq("workspace_id", ws).eq("assignee_id", person).eq("status", "open").order("id").range(from, to));
  const out: ScheduleEntry[] = [];
  for (const a of rows) {
    const m = metrics.get(a.metric_id);
    if (!m) continue;
    const cfg = (m as Metric & { workflow_id?: number | null }).workflow_id ? ctx.workflows.get((m as Metric & { workflow_id: number }).workflow_id) : undefined;
    const due = cfg ? dueDate(a.period_start, m.period, cfg) : null;
    const approval = a.purpose === "approval";
    const escalation = a.purpose === "escalation" && a.kind === "question";
    let date: string | null;
    let overdueFrom: string | null;
    if (approval) {
      // Dated the day it was asked, overdue from the day after its period's Due Date.
      date = localTime(new Date(a.created_at), ctx.timeZone).day;
      overdueFrom = due;
    } else if (escalation) {
      date = due;
      overdueFrom = due;
    } else if (a.kind === "task") {
      date = a.due_date ? String(a.due_date).slice(0, 10) : null;
      overdueFrom = date;
    } else {
      // Every other Question is undated: it is not a duty with a day.
      date = null;
      overdueFrom = null;
    }
    const overdue = overdueFrom !== null && overdueFrom < ctx.today;
    out.push({
      kind: approval ? "approval" : a.kind === "task" ? "task" : "question",
      date, overdue, overdueWorkingDays: overdue ? workingDaysBetween(overdueFrom!, ctx.today) : 0,
      metric: { id: m.id, slug: m.slug, name: m.name, period: m.period }, period: { start: a.period_start, label: periodLabel(a.period_start, m.period, ctx.yearStart) },
      actionId: a.id, text: approval || !readable(a) ? null : a.question.slice(0, 300), escalation, standingInFor: null, noDueDate: false,
      dueWorkingDays: cfg ? Math.max(0, cfg.dueWorkingDays) : null, remindDaysBefore: null, path: `/actions/${a.id}`,
    });
  }
  return out;
}

/** An entry in a few words, the same on the My schedule page and in a calendar: "Revenue for October 2026 due",
 * "Approve: Cost for October 2026", "Task: Renegotiate the shipping rate". */
export function entryTitle(e: ScheduleEntry): string {
  const about = `${e.metric.name} for ${e.period.label}`;
  if (e.kind === "value_due") return `${about} due`;
  if (e.kind === "approval") return `Approve: ${about}`;
  return `${e.kind === "task" ? "Task" : "Question"}: ${e.text ?? about}`;
}

const byKindAndName = (a: ScheduleEntry, b: ScheduleEntry) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.metric.name.localeCompare(b.metric.name) || a.period.start.localeCompare(b.period.start) || (a.actionId ?? 0) - (b.actionId ?? 0);

/** A person's Schedule in the actor's Workspace from `from` to `to` (days, both included, at most 90 days apart, `to`
 * at most 366 days ahead), with every overdue entry of the last 90 days whatever the span. The actor's own by default;
 * an Owner or Admin may name a teammate with `personId`, and then sees only entries about Metrics both may see, and no
 * words of an Action whose Thread they may not read. Needs "metrics:read" from a key. "Today" is the Workspace's.
 * `now` is the instant taken as now, for tests. */
export async function schedule(actor: Actor | KeyActor, span: { from?: unknown; to?: unknown; personId?: unknown } = {}, now = new Date()): Promise<Schedule> {
  // A Feed Key is nobody and has no Schedule; its actor has no person.
  if ((actor as { feed?: boolean }).feed || typeof actor.personId !== "string") throw new Forbidden();
  assertScope(actor, "metrics:read");
  const ws = actor.workspaceId;
  const person = await whose(actor, span.personId);
  const base = await loadContext(ws, now);
  const week = weekOf(base.today);
  const { from, to } = checkSpan({ from: span.from ?? week.from, to: span.to ?? week.to }, base.today);
  const lo = [from, plusDays(base.today, -OVERDUE_DAYS_BACK)].sort()[0];
  const hi = [to, base.today].sort().at(-1)!;
  const ctx: Ctx = { ...base, lo, hi };

  const all = await getMetrics(ws);
  // Only Metrics the person may see now; for a teammate's, only those the asking Owner or Admin may see too.
  const seen = await visibleMetricIds(ws, person, all);
  const asker = person === actor.personId ? seen : await visibleMetricIds(ws, actor.personId, all);
  const metrics = new Map(all.filter((m) => seen.has(m.id) && asker.has(m.id)).map((m) => [m.id, m]));
  let readable: (a: ActionRow) => boolean = () => true;
  if (person !== actor.personId) {
    const groups = await getGroups(ws);
    const can = threadReader(actor.personId, groups, (id) => all.find((m) => m.id === id)?.owner_id, ws);
    readable = (a) => can(a);
  }
  const entries = [...(await valuesDue(ws, person, metrics, ctx)), ...(await actionEntries(ws, person, metrics, ctx, readable))];

  const overdue = entries.filter((e) => e.overdue && e.date !== null && e.date >= plusDays(base.today, -OVERDUE_DAYS_BACK))
    .sort((a, b) => b.overdueWorkingDays - a.overdueWorkingDays || a.date!.localeCompare(b.date!) || byKindAndName(a, b));
  const byDay = new Map<string, ScheduleEntry[]>();
  for (const e of entries) if (!e.overdue && e.date !== null && e.date >= from && e.date <= to) (byDay.get(e.date) ?? byDay.set(e.date, []).get(e.date)!).push(e);
  const days = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, list]) => ({ date, entries: list.sort(byKindAndName) }));
  const undated = entries.filter((e) => e.date === null).sort(byKindAndName);
  return { today: base.today, personId: person, overdue, days, undated };
}

/** Where a value due of the Schedule is entered: the person's own form link for the Metric (their Token, or their
 * Stand-in's Token while it counts), or null when they have none. The link holds the Token's code, a credential, so it
 * is only ever given to the Token's own person, signed in, and never written into the Schedule itself. */
export async function ownFormCode(actor: Actor, slug: unknown): Promise<string | null> {
  if (actor.key || typeof slug !== "string" || !/^[a-z0-9][a-z0-9-]{0,99}$/.test(slug)) return null;
  const { data: m } = await db().from("metrics").select("id, formula").eq("workspace_id", actor.workspaceId).eq("slug", slug).maybeSingle();
  if (!m || m.formula) return null;
  const { data: tokens } = await db().from("tokens").select("code, metric_id, submitter_id, stand_in_id, stands_in_for, expires_at").eq("workspace_id", actor.workspaceId).eq("metric_id", m.id);
  const all = tokens ?? [];
  const mine = all.filter((t) => t.submitter_id === actor.personId);
  const today = localTime(new Date(), (await workspaceClock(actor)).timeZone).day;
  const usable = mine.find((t) => !t.stands_in_for) ?? mine.find((t) => tokenValid(t, all, today));
  return (usable?.code as string | undefined) ?? null;
}

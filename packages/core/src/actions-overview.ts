// The Schedule page's two views beside To do (GLOSSARY: Schedule, Action, Question, Task, Assignee, Period Timeline,
// Workflow): Asked by me, the Questions and Tasks the person asked, and the Timeline, what happened in what order.
// Neither records anything: the first reads the Actions the person may read, the second puts together the Period
// Timelines of the Workflows and the Actions of Metrics no Workflow asks for. What waits for the person is `schedule`.
// Security (AGENTS.md rule 3): an Action is returned only to someone who may read its Thread (readableActions); a value
// and its change only for a Metric the person sees; the Timeline is made of periodTimeline's lines, which count a hidden
// Metric and never name it, plus Actions about Metrics the person sees. Names of people follow peopleFor (a Guest sees
// only their own), Guest-hidden system text follows systemTextFor.
import { db } from "./db";
import type { Actor } from "./actor";
import { readableActions, systemTextFor, visibleMetricIds } from "./access";
import { getMetrics, getSeriesOf } from "./workspace-data";
import { listWorkflowNames, periodTimelineAbout, workflowPeriods, timelineContext, inZone, firstWords, type TimelineContext, type TimelineEventAbout, type TimelineKind } from "./period-timeline";
import { periodLabel, type YearStart } from "./periods";
import { yearStartOf } from "./fiscal-year";
import { formatValue } from "./format";
import { numberStyleOf } from "./workspace-settings";
import type { Action, Metric, Period } from "./types";

/** Where a row of "Asked by me" sits: answered ones wait for the asker to close them, open ones wait for a reply. */
export type AskedGroup = "answered" | "open" | "done";

/** One Action as "Asked by me" shows it. */
export type AskedRow = {
  id: number;
  kind: "question" | "task";
  status: Action["status"];
  group: AskedGroup;
  /** The question or task, with the Approval wording the web shows. */
  question: string;
  isApproval: boolean;
  metricId: number;
  metricName: string;
  /** The period, as written for a list ("Mar 2026"). */
  periodLabel: string;
  askerId: string;
  assigneeId: string;
  dueDate: string | null;
  createdAt: string;
  /** The value of the period and its change against the period before, only for a Metric the person sees. */
  value: string | null;
  changePercent: number | null;
};

const MOST_METRICS_WITH_CHANGE = 80;

/** The group an Action the person asked falls in: closed is done, answered waits for them to close it. Pure. */
export function askedGroup(a: Pick<Action, "status">): AskedGroup {
  return a.status === "closed" ? "done" : a.status === "answered" ? "answered" : "open";
}

/** The Actions the actor asked and may read, newest first, as rows. A row's value and change are read only for Metrics
 * the actor sees. */
export async function actionsAskedByMe(actor: Actor): Promise<AskedRow[]> {
  const ws = actor.workspaceId;
  const viewer = actor.personId;
  const [readable, metrics, hideSystem, yearStart, numberStyle] = await Promise.all([readableActions(ws, viewer), getMetrics(ws), systemTextFor(actor), yearStartOf(ws), numberStyleOf(ws)]);
  const picked = readable.filter((a) => a.asker_id === viewer);
  const visible = await visibleMetricIds(ws, viewer, metrics);
  const byId = new Map(metrics.map((m) => [m.id, m]));
  // The change needs the Metric's series: only for the Metrics with Actions the person sees, and not for too many.
  const wanted = [...new Set(picked.map((a) => a.metric_id).filter((id) => visible.has(id)))].slice(0, MOST_METRICS_WITH_CHANGE);
  const series = wanted.length ? await getSeriesOf(ws, metrics, wanted) : {};
  const rows: AskedRow[] = [];
  for (const a of picked) {
    const m = byId.get(a.metric_id);
    if (!m) continue;
    const points = visible.has(m.id) ? series[m.slug] ?? [] : [];
    const at = points.findIndex((p) => p.period === a.period_start);
    const here = at >= 0 ? points[at].value : null;
    const before = at > 0 ? points[at - 1].value : null;
    rows.push({
      id: a.id, kind: a.kind, status: a.status, group: askedGroup(a),
      question: hideSystem(a.question, Boolean(a.purpose)),
      isApproval: a.purpose === "approval",
      metricId: m.id, metricName: m.name, periodLabel: periodLabel(a.period_start, m.period, yearStart as YearStart, true),
      askerId: a.asker_id, assigneeId: a.assignee_id, dueDate: a.due_date ?? null, createdAt: a.created_at,
      value: here === null ? null : formatValue(m, here, numberStyle),
      changePercent: here !== null && before !== null && before !== 0 ? ((here - before) / Math.abs(before)) * 100 : null,
    });
  }
  return rows.sort((x, y) => y.createdAt.localeCompare(x.createdAt) || y.id - x.id);
}

/** How a Timeline line is marked: red needs attention, green is finished; the page also writes it as a word or a tick. */
export type TimelineTone = "attention" | "finished" | "neutral";

/** One line of the Actions page's Timeline: a Period Timeline line, or an Action's start, with where it belongs. */
export type TimelineItem = TimelineEventAbout & {
  workflowId: number | null;
  workflowName: string | null;
  period: string;
  periodLabel: string;
  tone: TimelineTone;
};

/** What the Timeline can be narrowed by: a Workflow, a Metric, a period (its first day). */
export type TimelineFilter = { workflowId?: number | null; metricId?: number | null; period?: string | null };

/** The Timeline, plus what the filters may offer: only Workflows, Metrics and periods that have lines for this person. */
export type ActionsTimeline = {
  items: TimelineItem[];
  workflows: { id: number; name: string }[];
  metrics: { id: number; name: string }[];
  periods: { start: string; label: string }[];
};

/** How many Workflows the offered list reads, and how many of them (the most recently active) the Timeline opens. */
const MOST_WORKFLOWS = 100;
const MOST_ACTIVE_WORKFLOWS = 10;
const ACTIVITY_ROWS = 300;
const PERIODS_PER_WORKFLOW = 3;
const MOST_ITEMS = 300;
/** Kinds that finish something. A Period Timeline records no more kinds than these. */
const FINISHED: TimelineKind[] = ["locked", "snapshot"];

/** The Timeline's tone for a line: an Approval still waiting needs attention (`settled` holds the Approvals already
 * approved or sent back, by their path); a Lock or a Snapshot is finished. Pure. */
export function timelineTone(e: Pick<TimelineEventAbout, "kind" | "path">, settled: ReadonlySet<string>): TimelineTone {
  if (e.kind === "approval_asked") return e.path && settled.has(e.path) ? "neutral" : "attention";
  return FINISHED.includes(e.kind) ? "finished" : "neutral";
}

/** The Workflows with the most recent doings first (Prompts sent, periods published or locked), then the rest by id,
 * newest first: from Metrics the actor sees only, so a hidden Metric cannot lift a Workflow in the order. */
async function byRecentActivity(ws: string, ctx: TimelineContext, ids: number[]): Promise<number[]> {
  const workflowOf = new Map<number, number>();
  for (const m of ctx.metrics) {
    const w = (m as Metric & { workflow_id?: number | null }).workflow_id;
    if (typeof w === "number" && ids.includes(w) && ctx.visible.has(m.id)) workflowOf.set(m.id, w);
  }
  const metricIds = [...workflowOf.keys()];
  const last = new Map<number, string>();
  if (metricIds.length) {
    const [{ data: prompts }, { data: states }] = await Promise.all([
      db().from("prompts").select("metric_id, sent_at").eq("workspace_id", ws).in("metric_id", metricIds).order("sent_at", { ascending: false }).limit(ACTIVITY_ROWS),
      db().from("period_states").select("metric_id, updated_at").eq("workspace_id", ws).in("metric_id", metricIds).order("updated_at", { ascending: false }).limit(ACTIVITY_ROWS),
    ]);
    for (const r of [...(prompts ?? []).map((p) => [p.metric_id, p.sent_at]), ...(states ?? []).map((p) => [p.metric_id, p.updated_at])]) {
      const w = workflowOf.get(r[0] as number);
      if (w !== undefined && String(r[1]) > (last.get(w) ?? "")) last.set(w, String(r[1]));
    }
  }
  return [...ids].sort((a, b) => (last.get(b) ?? "").localeCompare(last.get(a) ?? "") || b - a);
}

/** What happened lately, newest first: the Period Timelines of the Workflows the actor knows (the newest periods of the
 * most recently active ones, or of the one asked for) and the Actions on Metrics no Workflow asks for, all as this actor
 * may see them. A filter that matches nothing the actor may see (a hidden Metric, a Workflow they do not know, an id
 * that does not exist) gives the same empty answer. */
export async function actionsTimeline(actor: Actor, filter: TimelineFilter = {}): Promise<ActionsTimeline> {
  const ws = actor.workspaceId;
  const ctx = await timelineContext(actor);
  const { metrics, visible } = ctx;
  const list = await listWorkflowNames(actor, { limit: MOST_WORKFLOWS });
  const known = new Map(list.items.map((w) => [w.id, w.name]));
  const byId = new Map(metrics.map((m) => [m.id, m]));
  const wfOf = (m: Metric) => (m as Metric & { workflow_id?: number | null }).workflow_id ?? null;
  // One Workflow asked for by id is opened if it is one the actor knows; the rest are the most recently active.
  const open = filter.workflowId ? (known.has(filter.workflowId) ? [filter.workflowId] : []) : (await byRecentActivity(ws, ctx, [...known.keys()])).slice(0, MOST_ACTIVE_WORKFLOWS);
  const items: TimelineItem[] = [];
  for (const id of open) {
    const periods = filter.period ? [filter.period] : await workflowPeriods(actor, id, PERIODS_PER_WORKFLOW, ctx);
    for (const period of periods) {
      const t = await periodTimelineAbout(actor, id, period, ctx);
      const settled = new Set(t.events.filter((e) => (e.kind === "approved" || e.kind === "sent_back") && e.path).map((e) => e.path!));
      for (const e of t.events) items.push({ ...e, workflowId: id, workflowName: known.get(id)!, period, periodLabel: t.label, tone: timelineTone(e, settled) });
    }
  }
  // Actions on Metrics no Workflow asks for: only ones the actor may read about a Metric they see.
  if (!filter.workflowId) {
    const [readable, hideSystem] = await Promise.all([readableActions(ws, actor.personId), systemTextFor(actor)]);
    const name = new Map(ctx.shown.map((p) => [p.id, p.name]));
    const nameOf = (id: string) => name.get(id) ?? "Someone";
    for (const a of readable) {
      const m = byId.get(a.metric_id);
      if (!m || wfOf(m) !== null || !visible.has(m.id) || (filter.period && filter.period !== a.period_start)) continue;
      const at = new Date(a.created_at);
      const verb = a.kind === "task" ? "gave" : "asked";
      items.push({
        at: at.toISOString(), ...inZone(at, ctx.zone), kind: "action", count: 1, metricIds: [m.id], path: `/actions/${a.id}`,
        text: `${nameOf(a.asker_id)} ${verb} ${nameOf(a.assignee_id)} ${a.kind === "task" ? "a task" : "a question"} about ${m.name}`,
        items: [firstWords(hideSystem(a.question, Boolean(a.purpose)))],
        workflowId: null, workflowName: null, period: a.period_start, periodLabel: periodLabel(a.period_start, m.period as Period, ctx.yearStart), tone: "neutral",
      });
    }
  }
  // What the filters may offer comes before the Metric filter narrows the lines: every Workflow the actor knows, and the
  // Metrics and periods of what the lines show.
  const offered = {
    workflows: list.items,
    metrics: [...new Set(items.flatMap((i) => i.metricIds))].flatMap((id) => (byId.get(id) && visible.has(id) ? [{ id, name: byId.get(id)!.name }] : [])).sort((a, b) => a.name.localeCompare(b.name)),
    periods: [...new Map(items.map((i) => [i.period, i.periodLabel])).entries()].sort(([a], [b]) => b.localeCompare(a)).map(([start, label]) => ({ start, label })),
  };
  const shown = filter.metricId ? items.filter((i) => i.metricIds.includes(filter.metricId!)) : items;
  shown.sort((a, b) => b.at.localeCompare(a.at));
  return { items: shown.slice(0, MOST_ITEMS), ...offered };
}

/** How many Actions the person asked that were answered and wait for them to close: a number for the sidebar (their own
 * Actions only). */
export async function toCloseCount(actor: Actor): Promise<number> {
  const { count } = await db().from("actions").select("id", { count: "exact", head: true }).eq("workspace_id", actor.workspaceId).eq("asker_id", actor.personId).eq("status", "answered");
  return count ?? 0;
}

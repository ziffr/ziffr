// The Actions page's two views (GLOSSARY: Action, Question, Task, Assignee, Period Timeline, Workflow): the Inbox, what
// the person has to do now, and the Timeline, what happened in what order. Neither records anything: the Inbox reads the
// Actions the person may read, the Timeline puts together the Period Timelines of the Workflows and the Actions of Metrics
// no Workflow asks for.
// Security (AGENTS.md rule 3): an Action is returned only to someone who may read its Thread (readableActions); a value
// and its change only for a Metric the person sees; the Timeline is made of periodTimeline's lines, which count a hidden
// Metric and never name it, plus Actions about Metrics the person sees. Names of people follow peopleFor (a Guest sees
// only their own), Guest-hidden system text follows systemTextFor.
import { db } from "./db";
import type { Actor } from "./actor";
import { peopleFor, readableActions, systemTextFor, visibleMetricIds } from "./access";
import { getMetrics, getSeriesOf } from "./workspace-data";
import { listWorkflowNames, periodTimelineAbout, workflowPeriods, inZone, type TimelineEventAbout, type TimelineKind } from "./period-timeline";
import { periodLabel, type YearStart } from "./periods";
import { yearStartOf } from "./fiscal-year";
import { formatValue } from "./format";
import { numberStyleOf } from "./workspace-settings";
import type { Action, Metric, Period } from "./types";

/** Where an Inbox row sits for the person asking. */
export type InboxGroup = "needs_you" | "waiting" | "done";

/** One Action as the Inbox shows it. */
export type InboxRow = {
  id: number;
  kind: "question" | "task";
  status: Action["status"];
  group: InboxGroup;
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

/** Which rows an Inbox lists: the person's own, those they asked, or every one they may read. */
export type InboxScope = "mine" | "asked" | "all";

const MOST_METRICS_WITH_CHANGE = 80;

/** The group an Action falls in for this person: closed is Done; what waits for them to answer or close is Needs you;
 * every other live one is Waiting on others. Pure. */
export function inboxGroup(a: Pick<Action, "status" | "asker_id" | "assignee_id">, viewer: string): InboxGroup {
  if (a.status === "closed") return "done";
  if (a.status === "open" && a.assignee_id === viewer) return "needs_you";
  if (a.status === "answered" && a.asker_id === viewer) return "needs_you";
  return "waiting";
}

/** The Actions the actor may read, newest first, as the Inbox's rows, narrowed to `scope`. A row's value and change are
 * read only for Metrics the actor sees. */
export async function actionsInbox(actor: Actor, scope: InboxScope = "mine"): Promise<InboxRow[]> {
  const ws = actor.workspaceId;
  const viewer = actor.personId;
  const [readable, metrics, hideSystem, yearStart, numberStyle] = await Promise.all([readableActions(ws, viewer), getMetrics(ws), systemTextFor(actor), yearStartOf(ws), numberStyleOf(ws)]);
  const picked = readable.filter((a) => (scope === "all" ? true : scope === "asked" ? a.asker_id === viewer : a.asker_id === viewer || a.assignee_id === viewer));
  const visible = await visibleMetricIds(ws, viewer, metrics);
  const byId = new Map(metrics.map((m) => [m.id, m]));
  // The change needs the Metric's series: only for the Metrics with Actions the person sees, and not for too many.
  const wanted = [...new Set(picked.map((a) => a.metric_id).filter((id) => visible.has(id)))].slice(0, MOST_METRICS_WITH_CHANGE);
  const series = wanted.length ? await getSeriesOf(ws, metrics, wanted) : {};
  const rows: InboxRow[] = [];
  for (const a of picked) {
    const m = byId.get(a.metric_id);
    if (!m) continue;
    const points = visible.has(m.id) ? series[m.slug] ?? [] : [];
    const at = points.findIndex((p) => p.period === a.period_start);
    const here = at >= 0 ? points[at].value : null;
    const before = at > 0 ? points[at - 1].value : null;
    rows.push({
      id: a.id, kind: a.kind, status: a.status, group: inboxGroup(a, viewer),
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

const MOST_WORKFLOWS = 30;
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

/** What happened lately, newest first: the Period Timelines of the Workflows the actor knows (the newest periods of each)
 * and the Actions on Metrics no Workflow asks for, all as this actor may see them. */
export async function actionsTimeline(actor: Actor, filter: TimelineFilter = {}): Promise<ActionsTimeline> {
  const ws = actor.workspaceId;
  const viewer = actor.personId;
  const [list, metrics] = await Promise.all([listWorkflowNames(actor, { limit: MOST_WORKFLOWS }), getMetrics(ws)]);
  const visible = await visibleMetricIds(ws, viewer, metrics);
  const byId = new Map(metrics.map((m) => [m.id, m]));
  const wfOf = (m: Metric) => (m as Metric & { workflow_id?: number | null }).workflow_id ?? null;
  const items: TimelineItem[] = [];
  for (const wf of list.items) {
    if (filter.workflowId && filter.workflowId !== wf.id) continue;
    const periods = filter.period ? [filter.period] : await workflowPeriods(actor, wf.id, PERIODS_PER_WORKFLOW);
    for (const period of periods) {
      const t = await periodTimelineAbout(actor, wf.id, period);
      const settled = new Set(t.events.filter((e) => (e.kind === "approved" || e.kind === "sent_back") && e.path).map((e) => e.path!));
      for (const e of t.events) items.push({ ...e, workflowId: wf.id, workflowName: wf.name, period, periodLabel: t.label, tone: timelineTone(e, settled) });
    }
  }
  // Actions on Metrics no Workflow asks for: only ones the actor may read about a Metric they see.
  if (!filter.workflowId) {
    const [readable, people, hideSystem, yearStart, zone] = await Promise.all([readableActions(ws, viewer), peopleFor(actor), systemTextFor(actor), yearStartOf(ws), zoneOf(ws)]);
    const name = new Map(people.map((p) => [p.id, p.name]));
    const nameOf = (id: string) => name.get(id) ?? "Someone";
    for (const a of readable) {
      const m = byId.get(a.metric_id);
      if (!m || wfOf(m) !== null || !visible.has(m.id) || (filter.period && filter.period !== a.period_start)) continue;
      const at = new Date(a.created_at);
      const verb = a.kind === "task" ? "gave" : "asked";
      items.push({
        at: at.toISOString(), ...inZone(at, zone), kind: "action", count: 1, metricIds: [m.id], path: `/actions/${a.id}`,
        text: `${nameOf(a.asker_id)} ${verb} ${nameOf(a.assignee_id)} ${a.kind === "task" ? "a task" : "a question"} about ${m.name}`,
        items: [hideSystem(a.question, Boolean(a.purpose)).replace(/\s+/g, " ").trim().slice(0, 140)],
        workflowId: null, workflowName: null, period: a.period_start, periodLabel: periodLabel(a.period_start, m.period as Period, yearStart as YearStart), tone: "neutral",
      });
    }
  }
  // What the filters may offer comes before the Metric filter narrows the lines.
  const offered = {
    workflows: list.items.filter((w) => items.some((i) => i.workflowId === w.id) || w.id === filter.workflowId),
    metrics: [...new Set(items.flatMap((i) => i.metricIds))].flatMap((id) => (byId.get(id) && visible.has(id) ? [{ id, name: byId.get(id)!.name }] : [])).sort((a, b) => a.name.localeCompare(b.name)),
    periods: [...new Map(items.map((i) => [i.period, i.periodLabel])).entries()].sort(([a], [b]) => b.localeCompare(a)).map(([start, label]) => ({ start, label })),
  };
  const shown = filter.metricId ? items.filter((i) => i.metricIds.includes(filter.metricId!)) : items;
  shown.sort((a, b) => b.at.localeCompare(a.at));
  return { items: shown.slice(0, MOST_ITEMS), ...offered };
}

/** The Workspace's time zone. */
async function zoneOf(ws: string): Promise<string> {
  const { data } = await db().from("workspaces").select("time_zone").eq("id", ws).maybeSingle();
  return (data?.time_zone as string | undefined) ?? "UTC";
}

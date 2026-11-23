// The period timeline (GLOSSARY: Period Timeline, Workflow, Prompt, Approval, Lock, Snapshot): what happened in one
// period of a Workflow, in order: who was asked and reminded, which values came in, the Actions and Approvals about
// them, what published and locked, and the Snapshots made. It records nothing: it reads Prompts and their Deliveries,
// values, Actions, Threads, period states and Snapshots, and puts them together for one viewer.
// Security (AGENTS.md rule 3): every row is about a Metric of this Workflow in the actor's Workspace. A Metric the
// viewer cannot see appears only as a count ("1 value"): never its name, its values, who sent them or what was said
// about it. A Thread's words are shown only to someone who may read it (canReadThread), and then only their first
// words, opened from their seal here and nowhere else.
import { db } from "./db";
import { openWorkflowRow } from "./workflow-rows";
import { mayReadItem } from "./checklist-rules";
import { periodFinishedAt } from "./period-finished";
import { assertScope, Forbidden, type Actor, type KeyActor } from "./actor";
import { getGroups, peopleFor, threadReader, visibleDashboards, visibleMetricIds } from "./access";
import { getMetrics } from "./workspace-data";
import { openNames, openRows } from "./sealed-columns";
import { CONNECTORS, type ConnectorId } from "./connectors/index";
import { periodLabel, type YearStart } from "./periods";
import { yearStartOf } from "./fiscal-year";
import { formatValue } from "./format";
import { numberStyleOf } from "./workspace-settings";
import { widgetMetricIds } from "./widget-metrics";
import { workingPeriod } from "./workflow-rules";
import { localTime } from "./workspace-clock";
import type { Action, ChecklistItem, Metric, Period, WorkflowConfig } from "./types";

/** What kind of thing happened. */
export type TimelineKind = "asked" | "reminded" | "in" | "action" | "approval_asked" | "approved" | "sent_back" | "checked" | "note" | "published" | "locked" | "snapshot" | "checklist_sent" | "checklist_given" | "checklist_done" | "snapshot_sent" | "finished";

/** One line of the timeline: one event, or several of the same kind close together. */
export type TimelineEvent = {
  /** When it happened (the first of a group), as an instant. */
  at: string;
  /** The same moment in the Workspace's time zone. */
  day: string;
  time: string;
  kind: TimelineKind;
  /** One sentence. */
  text: string;
  /** How many things it stands for (people asked, values in, …). */
  count: number;
  /** For a group of values that came in: how many of the Workflow's values were in by then. */
  in?: number;
  /** Details a reader may expand: names of visible Metrics, first words of a readable Thread. */
  items: string[];
  /** Where in Ziffr to look, only for something the viewer may open. */
  path?: string;
};

/** A line with the Metrics it is about, only ones the viewer sees: for the Actions page's Timeline to filter by Metric. */
export type TimelineEventAbout = TimelineEvent & { metricIds: number[] };

/** A Workflow's period as one viewer sees it. */
export type PeriodTimeline = {
  workflow: { id: number; name: string };
  period: string;
  label: string;
  /** Values in, of the values the Workflow asks for (Derived and Archived Metrics are not asked). */
  in: number;
  of: number;
  published: number;
  locked: number;
  /** The Workflow's Checklist Tasks of the period (spec 0045): how many were given, and how many of them are done. Counts only. */
  checklist: { done: number; of: number };
  /** Whether the period is finished: every value locked and every Checklist Task of it done (period-finished.ts). */
  finished: boolean;
  events: TimelineEvent[];
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** Events of one kind closer together than this are one line. */
const GROUP_MINUTES = 60;
/** How many first words of a note the timeline keeps. */
const NOTE_WORDS = 70;

type Raw = {
  at: Date;
  kind: TimelineKind;
  /** The Metric it is about, when the viewer sees it; null otherwise. */
  metric: string | null;
  /** The person it concerns, for counting people (never shown for a Metric the viewer does not see). */
  person?: string;
  /** For a value that came in: who entered it for `person` (a Filled-in Value, spec 0046); only for a Metric the viewer sees. */
  enteredBy?: string;
  channel?: string;
  detail?: string;
  path?: string;
  /** For a single event that is not grouped: its whole sentence. */
  text?: string;
  /** A value that came in again, after one that was already in. */
  again?: boolean;
  metricId?: number;
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const list = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

/** The first words of someone's note, cut at a word. */
export function firstWords(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= NOTE_WORDS) return t;
  return `${t.slice(0, NOTE_WORDS).replace(/\s+\S*$/, "")}…`;
}

/** A moment in the Workspace's time zone: its day and "HH:mm". */
export function inZone(at: Date, zone: string): { day: string; time: string } {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(at).map((p) => [p.type, p.value]));
  return { day: localTime(at, zone).day, time: `${parts.hour}:${parts.minute}` };
}

/** The part of an Approval task's question after its Metric and period: the value and why it waits ("124, up 48 %
 * on the period before"), or null when it does not read as one. Only ever shown for a Thread the viewer may read. */
function approvalDetail(question: string | null): string | null {
  const m = /^Approve .*? for [^:]+: (.*?)\. Reply “approve”/.exec(question ?? "");
  return m ? firstWords(m[1]) : null;
}

/** The viewer: a person's Actor or their Access Key; a Feed Key has no person and sees none of this. */
function viewerOf(actor: Actor | KeyActor): string {
  if ((actor as { feed?: boolean }).feed || typeof actor.personId !== "string") throw new Forbidden();
  assertScope(actor, "metrics:read");
  return actor.personId;
}

/** What one viewer's timelines all start from, read once so that a page of many periods does not redo it. */
export type TimelineContext = {
  /** Whose facts these are: a context is used only for the same person in the same Workspace. */
  personId: string;
  workspaceId: string;
  metrics: Metric[];
  visible: Set<number>;
  groups: Awaited<ReturnType<typeof getGroups>>;
  dashboards: Awaited<ReturnType<typeof visibleDashboards>>;
  guestSees: Set<number> | null;
  yearStart: YearStart;
  numberStyle: Awaited<ReturnType<typeof numberStyleOf>>;
  zone: string;
  shown: Awaited<ReturnType<typeof peopleFor>>;
};

/** The shared facts for this viewer's timelines (the same checks periodTimeline makes, once). */
export async function timelineContext(actor: Actor | KeyActor): Promise<TimelineContext> {
  const viewer = viewerOf(actor);
  const ws = actor.workspaceId;
  const metrics = await getMetrics(ws);
  const [visible, groups, dashboards, yearStart, numberStyle, { data: clock }, shown] = await Promise.all([
    visibleMetricIds(ws, viewer, metrics), getGroups(ws), visibleDashboards(ws, viewer), yearStartOf(ws), numberStyleOf(ws),
    db().from("workspaces").select("time_zone").eq("id", ws).maybeSingle(), peopleFor(actor),
  ]);
  const guestSees = actor.role === "guest"
    ? new Set(metrics.flatMap((m) => { const id = (m as Metric & { workflow_id?: number | null }).workflow_id; return visible.has(m.id) && typeof id === "number" ? [id] : []; }))
    : null;
  return { personId: viewer, workspaceId: ws, metrics, visible, groups, dashboards, guestSees, yearStart: yearStart as YearStart, numberStyle, zone: (clock?.time_zone as string | undefined) ?? "UTC", shown };
}

/** The Workflow, if it is in the actor's Workspace: Forbidden otherwise (the same for missing and other Workspaces). */
async function workflowOf(actor: Actor | KeyActor, workflowId: number, ctx?: TimelineContext) {
  // Another person's or Workspace's facts are never used for this actor.
  if (ctx && (ctx.personId !== actor.personId || ctx.workspaceId !== actor.workspaceId)) throw new Forbidden();
  if (!Number.isInteger(workflowId)) throw new Forbidden();
  const { data } = await db().from("workflows").select("id, name").eq("id", workflowId).eq("workspace_id", actor.workspaceId).maybeSingle();
  if (!data) throw new Forbidden();
  const guestSees = ctx ? ctx.guestSees : await guestWorkflowIds(actor);
  if (guestSees && !guestSees.has(workflowId)) throw new Forbidden();
  return data as { id: number; name: string };
}

/** For a Guest, the Workflows they may know of: those of the Metrics shared with them, since a Guest sees only what
 * is shared with them (GLOSSARY: Workspace Role). Null for everyone else, who sees the Workspace's Workflows. */
export async function guestWorkflowIds(actor: Pick<Actor, "workspaceId" | "personId" | "role">): Promise<Set<number> | null> {
  if (actor.role !== "guest") return null;
  const all = await getMetrics(actor.workspaceId);
  const seen = await visibleMetricIds(actor.workspaceId, actor.personId, all);
  return new Set(all.flatMap((m) => {
    const id = (m as Metric & { workflow_id?: number | null }).workflow_id;
    return seen.has(m.id) && typeof id === "number" ? [id] : [];
  }));
}

/** The Workflow's Metrics, with the ones the viewer sees. */
async function workflowMetrics(ws: string, viewer: string, workflowId: number, ctx?: TimelineContext) {
  if (ctx) return { all: ctx.metrics, mine: ctx.metrics.filter((m) => (m as Metric & { workflow_id?: number | null }).workflow_id === workflowId), visible: ctx.visible };
  const all = await getMetrics(ws);
  const mine = all.filter((m) => (m as Metric & { workflow_id?: number | null }).workflow_id === workflowId);
  const visible = await visibleMetricIds(ws, viewer, all);
  return { all, mine, visible };
}

/** A Metric the Workflow asks a value for: not Derived, not Archived. */
const asked = (m: Metric) => !m.formula && !m.archived_at;

/** The periods of a Workflow that have something to show, newest first, the one running now included: from what the
 * viewer sees of its Metrics. At most `limit` (default 6). */
export async function workflowPeriods(actor: Actor | KeyActor, workflowId: number, limit = 6, ctx?: TimelineContext): Promise<string[]> {
  const viewer = viewerOf(actor);
  await workflowOf(actor, workflowId, ctx);
  const ws = actor.workspaceId;
  const { mine, visible } = await workflowMetrics(ws, viewer, workflowId, ctx);
  const seen = mine.filter((m) => visible.has(m.id));
  const ids = seen.map((m) => m.id);
  const [{ data: states }, { data: values }, zone, yearStart] = await Promise.all([
    ids.length ? db().from("period_states").select("period_start").eq("workspace_id", ws).in("metric_id", ids) : Promise.resolve({ data: [] }),
    ids.length ? db().from("observations").select("period_start").eq("workspace_id", ws).in("metric_id", ids) : Promise.resolve({ data: [] }),
    ctx ? Promise.resolve(ctx.zone) : db().from("workspaces").select("time_zone").eq("id", ws).maybeSingle().then((r) => (r.data?.time_zone as string | undefined) ?? "UTC"),
    ctx ? Promise.resolve(ctx.yearStart) : yearStartOf(ws),
  ]);
  const today = localTime(new Date(), zone).day;
  const out = new Set<string>([...(states ?? []), ...(values ?? [])].map((r) => String(r.period_start)));
  for (const m of seen) if (asked(m)) out.add(workingPeriod(today, m.period, yearStart));
  return [...out].sort().reverse().slice(0, Math.max(1, Math.min(24, Math.floor(limit))));
}

/** A Workflow's period as the actor may see it: ordered events, grouped where that reads better, with "N of M in". A
 * Metric they cannot see is a count ("1 value"), never a name or a word. `period` is a period's first day. */
export async function periodTimeline(actor: Actor | KeyActor, workflowId: number, period: string): Promise<PeriodTimeline> {
  const t = await periodTimelineAbout(actor, workflowId, period);
  return { ...t, events: t.events.map((e) => { const line: TimelineEvent & { metricIds?: number[] } = { ...e }; delete line.metricIds; return line; }) };
}

/** The same as periodTimeline, each line also naming the visible Metrics it is about (never a hidden one). */
export async function periodTimelineAbout(actor: Actor | KeyActor, workflowId: number, period: string, ctx?: TimelineContext): Promise<Omit<PeriodTimeline, "events"> & { events: TimelineEventAbout[] }> {
  const viewer = viewerOf(actor);
  if (!DAY.test(String(period))) throw new Error("Pick a period: its first day, as YYYY-MM-DD.");
  const wf = await workflowOf(actor, workflowId, ctx);
  const ws = actor.workspaceId;
  const { mine, visible } = await workflowMetrics(ws, viewer, workflowId, ctx);
  const ids = mine.map((m) => m.id);
  const byId = new Map(mine.map((m) => [m.id, m]));
  // The name of a Metric, only when the viewer sees it.
  const named = (id: number) => (visible.has(id) ? byId.get(id)!.name : null);
  const countable = mine.filter(asked);
  const c = ctx ?? (await timelineContext(actor));
  const { yearStart, numberStyle, zone } = c;
  const label = periodLabel(period, ((countable[0] ?? mine[0])?.period ?? "month") as Period, yearStart as YearStart);
  const base = { workflow: wf, period, label };
  if (!ids.length) return { ...base, in: 0, of: 0, published: 0, locked: 0, checklist: { done: 0, of: 0 }, finished: false, events: [] };

  const [{ data: prompts }, { data: valueRows }, { data: actions }, { data: states }, { data: tasks }] = await Promise.all([
    db().from("prompts").select("id, metric_id, submitter_id, sent_at").eq("workspace_id", ws).in("metric_id", ids).eq("period_start", period).order("sent_at").order("id"),
    db().from("observations").select("id, metric_id, value, value_sealed, submitter_id, entered_by, created_at").eq("workspace_id", ws).in("metric_id", ids).eq("period_start", period).order("created_at").order("id"),
    db().from("actions").select("id, metric_id, asker_id, assignee_id, read_group_id, purpose, kind, question, created_at, workspace_id").eq("workspace_id", ws).in("metric_id", ids).eq("period_start", period).order("id"),
    db().from("period_states").select("metric_id, state, updated_at").eq("workspace_id", ws).in("metric_id", ids).eq("period_start", period),
    // The Workflow's Checklist Tasks of the period: no Metric, so they are found by their Workflow.
    db().from("actions").select("id, asker_id, assignee_id, previous_assignee_id, read_group_id, status, question, created_at, updated_at, workspace_id, metric_id").eq("workspace_id", ws).eq("workflow_id", workflowId).eq("purpose", "checklist").eq("period_start", period).order("id"),
  ]);
  // Values are sealed with the Workspace Key: one that does not open still counts as in, but is not shown.
  const values = await openRows("observations", ws, (valueRows ?? []) as Record<string, unknown>[]);
  const promptIds = (prompts ?? []).map((p) => p.id as number);
  const { data: deliveries } = promptIds.length ? await db().from("deliveries").select("prompt_id, connector").eq("workspace_id", ws).in("prompt_id", promptIds) : { data: [] };
  const groups = c.groups;
  const channelOf = new Map((deliveries ?? []).map((d) => [d.prompt_id as number, d.connector as ConnectorId]));

  // Threads: only the ones this viewer may read are opened at all.
  const owners = new Map(mine.map((m) => [m.id, m.owner_id]));
  const readable = threadReader(viewer, groups, (id) => owners.get(id), ws, visible, actor.role);
  // Only Threads of Metrics they see, and that they may read, are opened: the columns decided on are not sealed.
  const allowed = (actions ?? []).filter((a) => visible.has(a.metric_id as number) && readable(a as unknown as Action & { workspace_id: string }));
  const opened = await openRows("actions", ws, allowed);
  // A Checklist Task is read by the same rule (no Metric to see): its words and Thread only for someone who may read it.
  const taskRows = (tasks ?? []) as unknown as (Action & { workspace_id: string })[];
  const openedTasks = await openRows("actions", ws, taskRows.filter((a) => readable(a)) as unknown as Record<string, unknown>[]);
  const mayRead = new Set([...opened, ...openedTasks].map((a) => a.id as number));
  const readableIds = [...mayRead];
  const { data: messageRows } = readableIds.length
    ? await db().from("thread_messages").select("id, action_id, author_id, body, correction_status, created_at").eq("workspace_id", ws).in("action_id", readableIds).order("created_at").order("id")
    : { data: [] };
  const messages = await openRows("thread_messages", ws, messageRows ?? []);
  const actionById = new Map(opened.map((a) => [a.id as number, a]));
  const taskById = new Map(openedTasks.map((a) => [a.id as number, a]));

  // Dashboards of this viewer that draw one of these Metrics, and their shown Snapshots of this period.
  const dashboards = c.dashboards;
  const dashIds = dashboards.map((d) => d.id);
  const { data: widgets } = dashIds.length ? await db().from("widgets").select("dashboard_id, metric_ids, settings").eq("workspace_id", ws).in("dashboard_id", dashIds) : { data: [] };
  const mineSet = new Set(ids);
  const drawing = new Set((widgets ?? []).filter((w) => widgetMetricIds(w.metric_ids as number[], w.settings as never).some((id) => mineSet.has(id))).map((w) => w.dashboard_id as number));
  const { data: snapshots } = drawing.size
    ? await db().from("dashboard_snapshots").select("id, dashboard_id, label, shown_at").eq("workspace_id", ws).in("dashboard_id", [...drawing]).eq("period_start", period).is("deleted_at", null).not("shown_at", "is", null)
    : { data: [] };

  // Names of the people on visible lines only.
  const peopleIds = new Set<string>();
  for (const p of prompts ?? []) if (visible.has(p.metric_id as number)) peopleIds.add(p.submitter_id as string);
  for (const v of values) if (visible.has(v.metric_id as number) && v.submitter_id) { peopleIds.add(v.submitter_id as string); if (v.entered_by) peopleIds.add(v.entered_by as string); }
  for (const a of [...opened, ...openedTasks]) if (mayRead.has(a.id as number)) { peopleIds.add(a.asker_id as string); peopleIds.add(a.assignee_id as string); }
  for (const m of messages) peopleIds.add(m.author_id as string);
  const { data: profileRows } = await db().from("profiles").select("id, name").in("id", [...peopleIds]);
  // A Guest is told only their own name (peopleFor): everyone else reads "Someone".
  const shown = c.shown;
  const names = new Map((await openNames(ws, profileRows)).filter((p) => shown.some((s) => s.id === p.id)).map((p) => [p.id as string, String(p.name)]));
  const nameOf = (id: string) => names.get(id) ?? "Someone";

  const raw: Raw[] = [];
  // Asked and reminded: a person's first Prompt for a Metric asks, the later ones remind.
  const firstAsk = new Set<string>();
  for (const p of prompts ?? []) {
    const key = `${p.metric_id}:${p.submitter_id}`;
    const again = firstAsk.has(key);
    firstAsk.add(key);
    const seen = visible.has(p.metric_id as number);
    raw.push({ at: new Date(p.sent_at as string), kind: again ? "reminded" : "asked", metric: seen ? named(p.metric_id as number) : null, person: p.submitter_id as string, channel: channelOf.get(p.id as number), metricId: p.metric_id as number });
  }
  // Values: the Metric's own formatting, for Metrics the viewer sees.
  for (const v of values) {
    const m = byId.get(v.metric_id as number)!;
    const seen = visible.has(m.id);
    raw.push({ at: new Date(v.created_at as string), kind: "in", metric: seen ? m.name : null, person: seen && v.submitter_id ? (v.submitter_id as string) : undefined, enteredBy: seen && !c.guestSees && v.submitter_id && v.entered_by ? (v.entered_by as string) : undefined, detail: seen && typeof v.value === "number" ? formatValue(m, v.value, numberStyle) : undefined, metricId: m.id });
  }
  const counted = new Set<number>();
  for (const r of raw) if (r.kind === "in") { r.again = counted.has(r.metricId!); counted.add(r.metricId!); }
  // Actions and what was said in their Threads.
  for (const a of opened) {
    const metricId = a.metric_id as number;
    const at = new Date(a.created_at as string);
    const metric = named(metricId);
    // A Thread this viewer may not read is not on their timeline at all: that it exists is part of it.
    if (!mayRead.has(a.id as number)) continue;
    const path = `/actions/${a.id}`;
    const purpose = a.purpose as string | null;
    if (purpose === "approval") raw.push({ at, kind: "approval_asked", metric, text: `${nameOf(a.assignee_id as string)} was asked to approve ${metric}`, detail: approvalDetail(a.question as string | null) ?? undefined, path, metricId });
    else if (purpose === "self_check") raw.push({ at, kind: "action", metric, text: `${nameOf(a.assignee_id as string)} was asked to check their own value of ${metric}`, path, metricId });
    else if (purpose === "escalation") raw.push({ at, kind: "action", metric, text: `${metric} was missing: ${nameOf(a.assignee_id as string)} was asked to follow up`, path, metricId });
    else raw.push({ at, kind: "action", metric, text: `${nameOf(a.asker_id as string)} ${a.kind === "task" ? "gave" : "asked"} ${nameOf(a.assignee_id as string)} ${a.kind === "task" ? "a task" : "a question"} about ${metric}`, detail: typeof a.question === "string" ? firstWords(a.question) : undefined, path, metricId });
  }
  // Checklist Tasks given and ticked off: the words only where the viewer may read the Task, else that one was.
  for (const t of taskRows) {
    const a = taskById.get(t.id);
    const path = a ? `/actions/${t.id}` : undefined;
    raw.push({ at: new Date(t.created_at), kind: "checklist_given", metric: null, text: a ? `“${firstWords(String(a.question ?? ""))}” was given to ${nameOf(String(a.assignee_id))}` : "A checklist task was given", path });
    if (t.status === "closed") {
      const last = [...messages].reverse().find((m) => m.action_id === t.id && m.author_id === (a?.assignee_id ?? ""));
      raw.push({ at: new Date(t.updated_at), kind: "checklist_done", metric: null, text: a ? `“${firstWords(String(a.question ?? ""))}” was ticked off` : "A checklist task was ticked off", detail: a && typeof last?.body === "string" && last.body ? firstWords(last.body) : undefined, path });
    }
  }
  for (const msg of messages) {
    const action = actionById.get(msg.action_id as number);
    if (!action) continue;
    const metric = named(action.metric_id as number);
    const at = new Date(msg.created_at as string);
    const who = nameOf(msg.author_id as string);
    const body = typeof msg.body === "string" ? msg.body : null;
    const path = `/actions/${msg.action_id}`;
    const metricId = action.metric_id as number;
    if (body === "Approved.") raw.push({ at, kind: "approved", metric, text: `${who} approved ${metric}`, path, metricId });
    else if (body !== null && /^Sent back:/.test(body)) raw.push({ at, kind: "sent_back", metric, text: `${who} sent ${metric} back`, detail: firstWords(body.replace(/^Sent back:\s*/, "")), path, metricId });
    else if (body === "Confirmed by the submitter." || body === "Corrected by the submitter.") raw.push({ at, kind: "checked", metric, text: `${who} ${body.startsWith("Confirmed") ? "confirmed" : "corrected"} their own value of ${metric}`, path, metricId });
    else raw.push({ at, kind: "note", metric, text: `${who} ${msg.correction_status === "proposed" ? "proposed a Correction to" : "left a note on"} ${metric}`, detail: body ? firstWords(body) : undefined, path, metricId });
  }
  for (const s of states ?? []) {
    if (s.state !== "published" && s.state !== "locked") continue;
    const seen = visible.has(s.metric_id as number);
    raw.push({ at: new Date(s.updated_at as string), kind: s.state, metric: seen ? named(s.metric_id as number) : null, metricId: s.metric_id as number });
  }
  for (const s of snapshots ?? []) {
    const dash = dashboards.find((d) => d.id === s.dashboard_id)!;
    raw.push({ at: new Date(s.shown_at as string), kind: "snapshot", metric: null, text: `Snapshot ${s.label} of ${dash.name} is ready`, path: `/dashboards/${dash.id}/snapshots/${s.id}` });
  }

  const own = await workflowLines({ ws, workflowId, period, label, viewer, role: actor.role, groups, dashboards, hasTasks: taskRows.length > 0 });
  raw.push(...own.lines);
  const finished = own.finished;

  raw.sort((a, b) => a.at.getTime() - b.at.getTime());
  const totalOf = countable.length;
  const events = group(raw, totalOf, zone, new Set(countable.map((m) => m.id)), nameOf);
  const inNow = new Set(values.map((v) => v.metric_id as number).filter((id) => countable.some((m) => m.id === id))).size;
  const stateOf = (s: string) => (states ?? []).filter((r) => r.state === s && countable.some((m) => m.id === r.metric_id)).length;
  return { ...base, in: inNow, of: totalOf, published: stateOf("published") + stateOf("locked"), locked: stateOf("locked"), checklist: { done: taskRows.filter((t) => t.status === "closed").length, of: taskRows.length }, finished, events };
}

/** What the Workflow itself did for a period (spec 0045), as timeline lines for one viewer, and whether the period is finished:
 * the Checklist Items and the Snapshot it sent (the claim says when and to how many, the config says what), and the moment it
 * finished. The words of a Checklist Item are shown only to someone who may read it; everyone else reads that one was sent. The
 * counts of people left out are the owner's alone. The words are the item's current ones, not the ones it had when it went
 * out: the claim keeps no words (rule 3). A Guest who may not open the Snapshot's dashboard is shown no line of it. */
async function workflowLines(a: { ws: string; workflowId: number; period: string; label: string; viewer: string; role: Actor["role"]; groups: Awaited<ReturnType<typeof getGroups>>; dashboards: Awaited<ReturnType<typeof visibleDashboards>>; hasTasks: boolean }): Promise<{ lines: Raw[]; finished: boolean }> {
  const { ws, workflowId, label, viewer, groups } = a;
  const lines: Raw[] = [];
  const flow = await openWorkflowRow(ws, (await db().from("workflows").select("id, owner_id, config").eq("id", workflowId).eq("workspace_id", ws).maybeSingle()).data);
  const steps = (flow?.config as WorkflowConfig | undefined)?.steps ?? [];
  const owner = Boolean(flow && flow.owner_id === viewer);
  const { data: stepRuns } = await db().from("workflow_step_runs").select("step_id, kind, ran_at, sent, skipped, snapshot_id").eq("workspace_id", ws).eq("workflow_id", workflowId).eq("period_start", a.period).in("kind", ["checklist", "send_snapshot"]).order("ran_at");
  const items = new Map(steps.filter((x): x is ChecklistItem => x.type === "checklist").map((x) => [x.id, x]));
  // The dashboard a sent Snapshot belongs to is the one the run kept (not whatever the step names now).
  const snapIds = (stepRuns ?? []).flatMap((r) => (r.snapshot_id ? [r.snapshot_id as number] : []));
  const { data: snaps } = snapIds.length ? await db().from("dashboard_snapshots").select("id, dashboard_id").eq("workspace_id", ws).in("id", snapIds) : { data: [] };
  const dashOf = new Map((snaps ?? []).map((x) => [x.id as number, x.dashboard_id as number]));
  const me = { id: viewer, role: a.role, groupIds: groups.filter((g) => g.members.includes(viewer)).map((g) => g.id) };
  for (const r of stepRuns ?? []) {
    const left = Number(r.skipped);
    const to = plural(Number(r.sent), "person", "people");
    const at = new Date(r.ran_at as string);
    if (r.kind === "send_snapshot") {
      // The dashboard's name and the link only to someone who may open it; a Guest who may not is shown no line at all.
      const dash = a.dashboards.find((d) => d.id === dashOf.get(r.snapshot_id as number));
      if (dash || a.role !== "guest") lines.push({ at, kind: "snapshot_sent", metric: null, text: dash ? `Sent the Snapshot ${label} of ${dash.name} to ${to}${owner && left ? `, ${left} not sent` : ""}` : `The Snapshot was sent to ${to}`, path: dash ? `/dashboards/${dash.id}/snapshots/${r.snapshot_id}` : undefined });
      continue;
    }
    const item = items.get(String(r.step_id));
    const may = Boolean(flow && item && mayReadItem(item, me, String(flow.owner_id)));
    lines.push({ at, kind: "checklist_sent", metric: null, text: may ? `Sent “${firstWords(item!.text)}” to ${to}` : "A checklist item was sent", detail: owner && left ? `${plural(left, "person", "people")} could not be told` : undefined });
  }
  // The same rule as the Send Snapshot step uses (period-finished.ts); the line is for Workflows with a checklist or the step, where it means something.
  const at = await periodFinishedAt(ws, workflowId, a.period);
  const finished = at !== null;
  if (at && (a.hasTasks || steps.some((x) => x.type === "send_snapshot"))) lines.push({ at: new Date(at), kind: "finished", metric: null, text: `${label} is finished` });
  return { lines, finished };
}

/** Raw events in time order as lines: some kinds merge when close together, the rest stand alone. */
function group(raw: Raw[], total: number, zone: string, countable: ReadonlySet<number>, nameOf: (id: string) => string): TimelineEventAbout[] {
  const MERGE: TimelineKind[] = ["asked", "reminded", "in", "published", "locked"];
  const out: TimelineEventAbout[] = [];
  const seenIn = new Set<number>();
  let i = 0;
  while (i < raw.length) {
    const first = raw[i];
    let j = i + 1;
    if (MERGE.includes(first.kind)) while (j < raw.length && raw[j].kind === first.kind && raw[j].at.getTime() - raw[j - 1].at.getTime() <= GROUP_MINUTES * 60_000) j++;
    const chunk = raw.slice(i, j);
    i = j;
    // Only Metrics the viewer sees (`metric` is null for the others) are named by id.
    const metricIds = [...new Set(chunk.filter((r) => r.metric !== null && r.metricId !== undefined).map((r) => r.metricId!))];
    out.push({ at: first.at.toISOString(), ...inZone(first.at, zone), ...line(chunk, total, seenIn, countable, nameOf), metricIds });
  }
  return out;
}

/** The sentence, count and details of one line made of one or more raw events of one kind. Metrics the viewer does not
 * see (`metric` null) are only counted, as "1 value". */
function line(chunk: Raw[], total: number, seenIn: Set<number>, countable: ReadonlySet<number>, nameOf: (id: string) => string): Pick<TimelineEvent, "kind" | "text" | "count" | "items" | "in" | "path"> {
  const first = chunk[0];
  const kind = first.kind;
  const hidden = chunk.filter((r) => r.metric === null).length;
  const shown = chunk.filter((r) => r.metric !== null);
  const values = (n: number) => plural(n, "value");
  const unseen = hidden ? [values(hidden)] : [];
  if (kind === "asked" || kind === "reminded") {
    const people = new Set(chunk.map((r) => r.person));
    // The Connectors of Prompts for Metrics the viewer sees only.
    const channels = [...new Set(shown.map((r) => r.channel).filter((c): c is ConnectorId => Boolean(c)))].map((c) => CONNECTORS[c]?.label ?? c);
    return {
      kind, count: people.size,
      text: `${kind === "asked" ? "Asked" : "Reminded"} ${plural(people.size, "person", "people")}${channels.length ? ` by ${list(channels)}` : ""}`,
      items: [...shown.map((r) => `${nameOf(r.person!)}: ${r.metric}`), ...unseen],
    };
  }
  if (kind === "in") {
    for (const r of chunk) if (r.metricId !== undefined && countable.has(r.metricId)) seenIn.add(r.metricId);
    const n = chunk.length;
    // A Filled-in Value says who entered it for whom (GLOSSARY: Filled-in Value), by the same name rules as the others.
    const entered = chunk.filter((r) => r.enteredBy).length;
    const by = (r: Raw) => `entered by ${nameOf(r.enteredBy!)} for ${nameOf(r.person!)}`;
    const sentence = n === 1 ? (first.metric ? `${first.metric} came in: ${first.detail}${first.enteredBy ? `, ${by(first)}` : ""}` : "1 value came in") : `${values(n)} came in${entered ? `, ${entered} entered for someone` : ""}`;
    return {
      kind, count: n, in: seenIn.size,
      text: `${sentence} (${seenIn.size} of ${total} in)`,
      items: [...shown.map((r) => `${r.metric}: ${r.detail}${r.again ? " (a new value)" : ""}${r.enteredBy ? `, ${by(r)}` : r.person ? `, from ${nameOf(r.person)}` : ""}`), ...unseen],
    };
  }
  if (kind === "published" || kind === "locked") {
    const n = chunk.length;
    const what = kind === "locked" ? "locked" : "published";
    return { kind, count: n, text: `${n === 1 && first.metric ? first.metric : values(n)} ${what}`, items: [...shown.map((r) => r.metric!), ...unseen] };
  }
  // A single event, with its own sentence.
  return { kind, count: 1, text: first.text ?? "", items: first.detail ? [first.detail] : [], path: first.path };
}

/** The workspace's Workflows by id and name, one page after the id `after` (scope metrics:read): to find the one to ask
 * about. Names only: a Workflow is shown to everyone in its Workspace. */
export async function listWorkflowNames(actor: Actor | KeyActor, page: { after?: number | null; limit: number }): Promise<{ items: { id: number; name: string }[]; next: number | null }> {
  viewerOf(actor);
  const limit = Math.max(1, Math.min(100, Math.floor(page.limit) || 50));
  const after = Number.isInteger(page.after) ? (page.after as number) : 0;
  // A Guest's list holds only the Workflows of the Metrics shared with them.
  const guestSees = await guestWorkflowIds(actor);
  let q = db().from("workflows").select("id, name").eq("workspace_id", actor.workspaceId).gt("id", after);
  if (guestSees) q = q.in("id", [...guestSees]);
  const { data } = await q.order("id").limit(limit + 1);
  const rows = (data ?? []) as { id: number; name: string }[];
  const items = rows.slice(0, limit);
  return { items, next: rows.length > limit ? items[items.length - 1].id : null };
}

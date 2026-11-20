// A Period Record (GLOSSARY: Period Record): one Metric's value for one period with its state, every step it went
// through in order, and the Threads about it that the viewer may read. Reads one Workspace only and returns only what
// this person may see: nothing for a Metric they do not see, and Threads and the Corrections proposed in them only
// where they may read the Thread (GLOSSARY: Thread). Words are opened (sealed columns); nothing else is sent.
import { db } from "./db";
import type { Actor } from "./actor";
import { getGroups, threadReader, visibleMetricIds } from "./access";
import { getMetrics, getSeriesOf } from "./workspace-data";
import { openRows } from "./sealed-columns";
import { peopleIn } from "./submissions";
import { yearStartOf } from "./fiscal-year";
import { periodStart } from "./periods";
import { SOURCE_LABEL } from "./format";
import type { Action, Metric, PeriodStateName } from "./types";

/** One step of a period's value, in the order it happened. */
export type PeriodStep = {
  kind: "submitted" | "replaced" | "correction_proposed" | "correction_accepted" | "correction_declined" | "approved" | "sent_back" | "published" | "locked" | "unlocked";
  /** When it happened; null for a step whose time was not kept. */
  at: string | null;
  /** Who did it, by name; null when nobody did (a Workflow closing the period). */
  person: string | null;
  /** Where it came from, such as "Slack" or "Web form"; null for steps that have no channel. */
  channel: string | null;
  /** The value the step is about, for a submitted, replaced or Correction step. */
  value: number | null;
  /** Whether a later step replaced this value: shown struck through. */
  superseded: boolean;
  /** Why, for an unlock. */
  reason: string | null;
};

/** A Thread about the period, as far as the viewer may read it. */
export type PeriodThread = {
  id: number; question: string; kind: Action["kind"]; status: Action["status"];
  /** The first message, cut short, with who wrote it; null for a Thread without one yet. */
  first: { person: string; at: string; body: string } | null;
  /** How many messages follow the first. */
  replies: number;
};

/** What a period's page shows. */
export type PeriodRecord = {
  /** Only what names the Metric and writes its values; the rest stays on the Metric's own page. */
  metric: Pick<Metric, "id" | "name" | "slug" | "period" | "owner_id" | "decimals" | "unit" | "unit_position">;
  period: string;
  /** The value now, null while there is none. */
  value: number | null;
  /** The value it was submitted as when a Correction replaced it. */
  originalValue: number | null;
  /** Where the period is in its Workflow; null for a Metric without one, or before it started. */
  state: PeriodStateName | null;
  /** The Workflow's note on the period, such as why a value waits. */
  note: string | null;
  steps: PeriodStep[];
  threads: PeriodThread[];
};

/** The unlock reason the period's note keeps while it stays unlocked. */
const unlockReason = (note: string | null | undefined) => /^Unlocked by [^\n]*? on [^:]*: ([\s\S]*)$/.exec(note ?? "")?.[1]?.trim() || null;

/** How much of a Thread's first message the page shows: the rest is one click away. */
const FIRST_WORDS = 280;

type Draft = PeriodStep & { sort: number };
type Message = { id: number; action_id: number; author_id: string; body: string; correction_value: unknown; correction_status: string | null; created_at: string };
type Event = { id: number; at: string; actor_id: string | null; actor_name: string; kind: string; details: { period?: string; proposed_by?: string; action_id?: number } | null };

/** The record of one Metric's period, for a person who sees the Metric; null when it is not theirs to see, the period
 * is not one of the Metric's, or the Metric does not exist. `period` is the period's first day, as YYYY-MM-DD. */
export async function periodRecord(actor: Actor, slug: string, period: string): Promise<PeriodRecord | null> {
  const ws = actor.workspaceId;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(period)) || Number.isNaN(Date.parse(`${period}T00:00:00Z`))) return null;
  const metrics = await getMetrics(ws);
  const metric = metrics.find((m) => m.slug === String(slug));
  if (!metric) return null;
  const [visible, yearStart, groups] = await Promise.all([visibleMetricIds(ws, actor.personId, metrics), yearStartOf(ws), getGroups(ws)]);
  // Not the Metric's to see: nothing, and nothing to tell it from a Metric that is not there.
  if (!visible.has(metric.id)) return null;
  if (periodStart(period, metric.period, yearStart) !== period) return null;

  const [{ data: obsRows }, { data: stateRow }, { data: actionRows }, { data: auditRows }] = await Promise.all([
    db().from("observations").select("id, value, submitter_id, source, original_value, imported, created_at").eq("workspace_id", ws).eq("metric_id", metric.id).eq("period_start", period).order("created_at").order("id"),
    db().from("period_states").select("state, note, updated_at").eq("workspace_id", ws).eq("metric_id", metric.id).eq("period_start", period).maybeSingle(),
    db().from("actions").select("*").eq("workspace_id", ws).eq("metric_id", metric.id).eq("period_start", period).order("id"),
    // The few events of this Metric that belong to a period's story; their details are opened below.
    db().from("audit_events").select("id, at, actor_id, actor_name, kind, details").eq("workspace_id", ws).eq("object_type", "metric").eq("object_id", String(metric.id))
      .in("kind", ["approval.given", "approval.sent_back", "approval.skipped", "self_check.confirmed", "self_check.corrected", "correction.accepted", "correction.declined", "period.locked", "period.unlocked"])
      .order("id", { ascending: false }).limit(2000),
  ]);

  // Threads this person may read, and no others: what is not theirs to read is left out whole, with its Corrections.
  const can = threadReader(actor.personId, groups, (id) => metrics.find((x) => x.id === id)?.owner_id, ws, visible);
  const opened = (await openRows("actions", ws, (actionRows ?? []) as Record<string, unknown>[])) as unknown as Action[];
  const readable = opened.filter((a) => can(a as Action & { workspace_id: string }));
  const ids = readable.map((a) => a.id);
  const messages = (ids.length ? await openRows("thread_messages", ws, (await db().from("thread_messages").select("id, action_id, author_id, body, correction_value, correction_status, created_at").eq("workspace_id", ws).in("action_id", ids).order("created_at").order("id")).data) : []) as unknown as Message[];
  const events = ((await openRows("audit_events", ws, (auditRows ?? []) as Record<string, unknown>[])) as unknown as Event[]).filter((e) => e.details?.period === period).reverse();

  // Names of the people on these steps only, and only of people in the Workspace now (members and Contacts, a Contact's
  // sealed name opened) and its Feeds, as the API does: anyone else, such as a former member, is "A former member".
  const people = new Set<string>([metric.owner_id]);
  for (const o of obsRows ?? []) if (o.submitter_id) people.add(String(o.submitter_id));
  for (const m of messages) people.add(m.author_id);
  for (const e of events) if (e.actor_id) people.add(e.actor_id);
  const [inWorkspace, { data: feeds }] = await Promise.all([
    peopleIn(ws),
    db().from("feeds").select("person_id, name").eq("workspace_id", ws).in("person_id", [...people]),
  ]);
  const names = new Map<string, string>();
  for (const f of feeds ?? []) names.set(f.person_id as string, f.name as string);
  for (const p of inWorkspace) if (people.has(p.id)) names.set(p.id, p.name);
  const who = (id: unknown): string | null => (id ? names.get(String(id)) ?? "A former member" : null);
  // An Audit Log event keeps the name it was written with: a person who has left is a former member, not that name.
  const actorOf = (e: Event): string => (e.actor_id ? who(e.actor_id)! : e.actor_name);

  const drafts: Draft[] = [];
  const push = (d: Partial<PeriodStep> & Pick<PeriodStep, "kind" | "at" | "person">) => drafts.push({ channel: null, value: null, superseded: false, reason: null, ...d, sort: drafts.length });
  const obs = obsRows ?? [];
  obs.forEach((o, i) => {
    // A value a Correction changed in place was submitted as its original; the Correction's own steps carry the new one.
    const corrected = o.original_value !== null && o.original_value !== undefined;
    push({ kind: i === 0 ? "submitted" : "replaced", at: o.created_at as string, person: who(o.submitter_id), value: corrected ? Number(o.original_value) : Number(o.value), superseded: i < obs.length - 1 || corrected,
      channel: o.imported ? "Import" : SOURCE_LABEL[o.source as keyof typeof SOURCE_LABEL] ?? String(o.source) });
  });

  // Corrections proposed in a Thread this person reads, and how each was decided: by the owner (Audit Log event), or by
  // the submitter for their own value in a Self-check.
  const used = new Set<number>();
  // An event names its Thread, so a decision in a Thread this person may not read is never taken for another's; events
  // written before they did match on the author.
  const decided = (kinds: string[], by: string, action: number) => {
    const e = events.find((x) => kinds.includes(x.kind) && !used.has(x.id) && String(x.details?.proposed_by ?? x.actor_id) === by && (x.details?.action_id === undefined || x.details.action_id === action));
    if (e) used.add(e.id);
    return e;
  };
  for (const m of messages) {
    if (m.correction_value === null || m.correction_value === undefined) continue;
    const value = Number(m.correction_value);
    const self = m.correction_status === "accepted" && events.some((x) => x.kind === "self_check.corrected" && !used.has(x.id) && x.actor_id === m.author_id && (x.details?.action_id === undefined || x.details.action_id === m.action_id));
    if (self) {
      const e = decided(["self_check.corrected"], m.author_id, m.action_id);
      push({ kind: "correction_accepted", at: e?.at ?? m.created_at, person: who(m.author_id), value });
      continue;
    }
    push({ kind: "correction_proposed", at: m.created_at, person: who(m.author_id), value, superseded: m.correction_status === "declined" });
    if (m.correction_status === "accepted" || m.correction_status === "declined") {
      const e = decided([m.correction_status === "accepted" ? "correction.accepted" : "correction.declined"], m.author_id, m.action_id);
      // Without a kept event (the demo, or one past the Audit Log's retention) the owner decided, at an unknown time.
      push({ kind: m.correction_status === "accepted" ? "correction_accepted" : "correction_declined", at: e?.at ?? null, person: e ? actorOf(e) : who(metric.owner_id), value: m.correction_status === "accepted" ? value : null });
    }
  }

  // Approvals, Self-checks and Locks, from the Audit Log: who and when, never a value.
  const state = (stateRow?.state as PeriodStateName | undefined) ?? null;
  const unlockedWhy = unlockReason(state === "published" ? (stateRow?.note as string | null) : null);
  let lockedSeen = false;
  let lastUnlock = -1;
  for (const e of events) {
    const base = { at: e.at, person: actorOf(e) };
    if (e.kind === "approval.given" || e.kind === "approval.skipped" || e.kind === "self_check.confirmed") push({ ...base, kind: "approved" });
    else if (e.kind === "approval.sent_back") push({ ...base, kind: "sent_back" });
    else if (e.kind === "period.locked") { lockedSeen = true; push({ ...base, kind: "locked" }); }
    else if (e.kind === "period.unlocked") { push({ ...base, kind: "unlocked" }); lastUnlock = drafts.length - 1; }
  }
  // The reason is kept only while the period stays unlocked, as the Workflow's note: the latest unlock carries it.
  if (lastUnlock >= 0 && unlockedWhy) drafts[lastUnlock].reason = unlockedWhy;
  // A state no event tells of: a period the Workflow closed, a published one, or one whose events are gone.
  if (state === "locked" && !lockedSeen) push({ kind: "locked", at: stateRow?.updated_at as string, person: null });
  if (state === "published") push({ kind: "published", at: stateRow?.updated_at as string, person: null, reason: lastUnlock < 0 ? unlockedWhy : null });

  // In time order; a step without a time follows the one before it, steps of one instant keep the order found.
  let before = 0;
  const timed = drafts.map((d) => { before = d.at ? Date.parse(d.at) : before; return { d, t: before }; });
  timed.sort((a, b) => a.t - b.t || a.d.sort - b.d.sort);
  const steps: PeriodStep[] = timed.map(({ d }) => ({ kind: d.kind, at: d.at, person: d.person, channel: d.channel, value: d.value, superseded: d.superseded, reason: d.reason }));

  // The Threads: the first message and how many replies follow, words as opened above.
  const threads: PeriodThread[] = readable.map((a) => {
    const mine = messages.filter((m) => m.action_id === a.id);
    const first = mine[0];
    return {
      id: a.id, question: a.question, kind: a.kind, status: a.status,
      first: first ? { person: who(first.author_id) ?? "A former member", at: first.created_at, body: (first.body ?? "").length > FIRST_WORDS ? `${first.body.slice(0, FIRST_WORDS - 1)}…` : first.body ?? "" } : null,
      replies: Math.max(0, mine.length - 1),
    };
  });

  let value: number | null = obs.length ? Number(obs[obs.length - 1].value) : null;
  const last = obs[obs.length - 1];
  // A Derived Metric has no values of its own: its value for the period is computed from its inputs.
  if (metric.formula) value = (await getSeriesOf(ws, metrics, [metric.id]))[metric.slug]?.find((p) => p.period === period)?.value ?? null;
  const { id, name, slug: key, period: span, owner_id, decimals, unit, unit_position } = metric;
  return { metric: { id, name, slug: key, period: span, owner_id, decimals, unit, unit_position }, period, value, originalValue: last && last.original_value !== null ? Number(last.original_value) : null, state, note: (stateRow?.note as string | null) ?? null, steps, threads };
}

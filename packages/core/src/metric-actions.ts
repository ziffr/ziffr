// The Actions about a Widget's Metrics (GLOSSARY: Action, Question, Task, Metric, Widget): what the "N open" mark in a
// Widget's header opens in the side panel. Security (AGENTS.md rule 3): an Action is returned only to someone who may
// read its Thread (readableActions), for a Metric the person sees; a slug that is not there or not shared is dropped
// without a word, so the list never confirms that a Metric exists. Names follow peopleFor (a Guest sees only their own),
// Guest-hidden system text follows systemTextFor. Only what the panel draws leaves here: no Thread, no ids of people.
import type { Actor } from "./actor";
import { peopleFor, readableActions, systemTextFor, visibleMetricIds } from "./access";
import { yearStartOf } from "./fiscal-year";
import { periodLabel } from "./periods";
import { getMetrics } from "./workspace-data";
import type { Action } from "./types";

/** One Action as the Widget's panel lists it. */
export type MetricActionRow = {
  id: number;
  kind: Action["kind"];
  status: Action["status"];
  isApproval: boolean;
  question: string;
  metric: { slug: string; name: string };
  /** The period it is about, as written for a list ("Mar 2026"). */
  periodLabel: string;
  /** The person it waits for, by name; null when the person may not see who that is. */
  assigneeName: string | null;
  dueDate: string | null;
};

/** At most this many Metrics in one call (a Widget draws a handful) and this many Actions in the answer. */
const MOST_PANEL_METRICS = 12;
const MOST_PANEL_ACTIONS = 100;

/** The Questions and Tasks not yet closed about the Metrics with these slugs that the person may read, newest first. */
export async function openActionsAboutMetrics(actor: Actor, slugs: readonly string[]): Promise<MetricActionRow[]> {
  const ws = actor.workspaceId;
  const wanted = new Set(slugs.slice(0, MOST_PANEL_METRICS).map(String));
  const [metrics, yearStart, hideSystem, people] = await Promise.all([getMetrics(ws), yearStartOf(ws), systemTextFor(actor), peopleFor(actor)]);
  const visible = await visibleMetricIds(ws, actor.personId, metrics);
  const picked = metrics.filter((m) => wanted.has(m.slug) && visible.has(m.id));
  const byId = new Map(picked.map((m) => [m.id, m]));
  // One read with one visibility check (not one per Metric); unshared Metrics were dropped above, Group-limited Actions by readableActions.
  const readable = picked.length ? await readableActions(ws, actor.personId) : [];
  return readable
    .filter((a) => a.status !== "closed" && a.metric_id !== null && byId.has(a.metric_id))
    .sort((x, y) => y.created_at.localeCompare(x.created_at) || y.id - x.id)
    .slice(0, MOST_PANEL_ACTIONS)
    .map((a) => {
      const m = byId.get(a.metric_id!)!;
      return {
        id: a.id, kind: a.kind, status: a.status, isApproval: a.purpose === "approval", question: hideSystem(a.question, Boolean(a.purpose)),
        metric: { slug: m.slug, name: m.name }, periodLabel: periodLabel(a.period_start, m.period, yearStart, true),
        assigneeName: people.find((p) => p.id === a.assignee_id)?.name ?? null, dueDate: a.due_date ?? null,
      };
    });
}

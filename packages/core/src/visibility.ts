// Who sees what inside a Workspace (GLOSSARY: Share, Group, Token, Stand-in, Thread). Pure: callers load the
// facts, these functions decide. Every function takes the workspace first and ignores rows from any other one,
// so a fact from another workspace can never grant anything.
import { tokenValid, type TokenRow } from "./tokens";
import { widgetMetricIds } from "./widget-metrics";
import { textBoxMetricIds } from "./slide-text";
import { liveDocument } from "./snapshot-parts";
import type { Action, Group, Metric, Share, ShareRole, WidgetSettings } from "./types";

/** A row that belongs to a Workspace. */
export type InWorkspace = { workspace_id: string };

/** The role someone has on one dashboard or deck. */
export type ObjectRole = "owner" | ShareRole;

const mine = <T extends InWorkspace>(ws: string, rows: readonly T[]) => rows.filter((r) => r.workspace_id === ws);

/** A membership of a Workspace, as far as Groups need it. */
export type MemberFact = InWorkspace & { user_id: string; role: string };

/** The workspace's Groups with the built-in Everyone group filled in: every member except Guests, who only see what
 * is shared with them by name (GLOSSARY: Workspace Role). Groups and members of other workspaces are left out. */
export function withEveryone<G extends Group & InWorkspace>(ws: string, groups: readonly G[], members: readonly MemberFact[]): G[] {
  const everyone = mine(ws, members).filter((m) => m.role !== "guest").map((m) => m.user_id);
  return mine(ws, groups).map((g) => (g.everyone ? { ...g, members: everyone } : g));
}

/** Shares per person: a share with a Group counts for each of its members (the stronger role wins). */
export function expandGroupShares(ws: string, raw: readonly (Share & InWorkspace)[], groups: readonly (Group & InWorkspace)[]): (Share & InWorkspace)[] {
  const own = mine(ws, raw);
  const out = own.filter((s) => s.user_id).map((s) => ({ ...s }));
  // The first share per person and object, looked up by key instead of searched for: a workspace with many shares
  // and large Groups would otherwise take shares × members × shares steps.
  const first = new Map<string, Share & InWorkspace>();
  for (const s of out) if (!first.has(shareKey(s.object_type, s.object_id, s.user_id))) first.set(shareKey(s.object_type, s.object_id, s.user_id), s);
  const members = new Map(mine(ws, groups).map((g) => [g.id, g.members] as const));
  for (const s of own) {
    if (!s.group_id) continue;
    for (const user of members.get(s.group_id) ?? []) {
      const key = shareKey(s.object_type, s.object_id, user);
      const have = first.get(key);
      if (!have) {
        const added = { ...s, user_id: user, via_group: s.group_id };
        out.push(added);
        first.set(key, added);
      } else if (have.role === "viewer" && s.role === "editor") have.role = "editor";
    }
  }
  return out;
}

/** One key per object and person, for looking shares up. */
const shareKey = (type: string, id: number, person: string) => `${type}\u0000${id}\u0000${person}`;

/** The person's role on a dashboard or deck: owner, a shared role, or none. */
export function objectRole(ws: string, person: string, type: "dashboard" | "deck", obj: { id: number; owner_id: string } & InWorkspace, shares: readonly (Share & InWorkspace)[]): ObjectRole | null {
  if (obj.workspace_id !== ws) return null;
  if (obj.owner_id === person) return "owner";
  return shares.find((s) => s.workspace_id === ws && s.object_type === type && s.object_id === obj.id && s.user_id === person)?.role ?? null;
}

/** The person's role on each of many dashboards or decks, by id (only those they have one on): objectRole for a list,
 * reading the shares once. */
export function objectRoles(ws: string, person: string, type: "dashboard" | "deck", objs: readonly ({ id: number; owner_id: string } & InWorkspace)[], shares: readonly (Share & InWorkspace)[]): Map<number, ObjectRole> {
  const shared = new Map<number, ShareRole>();
  // The first matching share counts, as in objectRole.
  for (const s of shares) if (s.workspace_id === ws && s.object_type === type && s.user_id === person && !shared.has(s.object_id)) shared.set(s.object_id, s.role);
  const out = new Map<number, ObjectRole>();
  for (const o of objs) {
    if (o.workspace_id !== ws) continue;
    const role = o.owner_id === person ? "owner" : shared.get(o.id);
    if (role) out.set(o.id, role);
  }
  return out;
}

/** Every metric a deck draws live, in its widgets and in the words of its text boxes, which is what its Share opens.
 * Snapshot Parts name no Metric, and what stands on a slide that keeps a Snapshot's numbers opens none (spec 0061):
 * each reader needs the Snapshot's own dashboard. */
export function deckMetricIds(document: unknown): number[] {
  return allDeckMetricIds(liveDocument(document));
}

/** Every metric named by any widget or text box on a deck's slides, slides that keep numbers included: for knowing
 * whether a Metric is still on a deck, never for who may see it. */
export function allDeckMetricIds(document: unknown): number[] {
  // A deck's slides are read like a free layout, with the same rule: nested widgets count, and a malformed Metric
  // list yields an id no visibility check accepts, so such a deck cannot be saved, shared or restored.
  if (!document || typeof document !== "object") return [];
  return [...new Set([...widgetMetricIds([], { canvas: { document } } as unknown as WidgetSettings), ...textBoxMetricIds(document)])];
}

/** The Metrics a changed deck names that whoever stores it must see: those it newly draws live, and those newly named
 * by any widget or text box at all. So none can be put on a slide that keeps numbers by someone who does not see it, to be drawn
 * live under another's save later, or to stand in the way of its owner deleting it. */
export function deckMetricIdsAdded(before: unknown, after: unknown): number[] {
  const added = [deckMetricIds, allDeckMetricIds].flatMap((ids) => {
    // A malformed marker (NaN) never counts as "already there": only real ids are.
    const had = new Set(ids(before).filter(Number.isFinite));
    return ids(after).filter((m) => !had.has(m));
  });
  return [...new Set(added)];
}

/** What decides which metrics someone sees, loaded by the caller for one workspace. */
export type MetricFacts = {
  metrics: readonly (Metric & InWorkspace)[];
  tokens: readonly (TokenRow & InWorkspace)[];
  /** Shares already expanded per person (expandGroupShares). */
  shares: readonly (Share & InWorkspace)[];
  /** Widgets on dashboards shared with the person (not owned by them). */
  sharedDashboardWidgets: readonly ({ metric_ids: number[]; settings: WidgetSettings } & InWorkspace)[];
  /** Documents of decks shared with the person (not owned by them). */
  sharedDeckDocuments: readonly ({ document: unknown } & InWorkspace)[];
};

/** The metrics a person sees: owned, submitted to (a stand-in only while valid), shared, shown on a dashboard or deck shared with them, and derived metrics they own whose inputs they all see. */
export function visibleMetricIdsFrom(ws: string, person: string, f: MetricFacts): Set<number> {
  const metrics = mine(ws, f.metrics);
  const known = new Set(metrics.map((m) => m.id));
  const tokens = mine(ws, f.tokens);
  const ids = new Set<number>();
  for (const m of metrics) if (m.owner_id === person) ids.add(m.id);
  for (const t of tokens) if (t.submitter_id === person && tokenValid(t, tokens)) ids.add(t.metric_id);
  for (const s of mine(ws, f.shares)) if (s.object_type === "metric" && s.user_id === person) ids.add(s.object_id);
  for (const w of mine(ws, f.sharedDashboardWidgets)) for (const id of widgetMetricIds(w.metric_ids, w.settings)) ids.add(id);
  for (const d of mine(ws, f.sharedDeckDocuments)) for (const id of deckMetricIds(d.document)) ids.add(id);
  // PROTOTYPE: owners already see their own metrics above, so this only matters once derived metrics can be
  // shown to people who see all their inputs (decided with the metrics ticket, #12).
  const bySlug = new Map(metrics.map((m) => [m.slug, m.id] as const).reverse()); // the first Metric with a slug, as find() would
  for (const m of metrics) {
    if (!m.formula || ids.has(m.id) || m.owner_id !== person) continue;
    const inputs = [...m.formula.matchAll(/\{([a-z0-9-]+)\}/g)].map((x) => bySlug.get(x[1]));
    if (inputs.length && inputs.every((i) => i !== undefined && ids.has(i))) ids.add(m.id);
  }
  // Only metrics of this workspace, whatever a widget or document claims.
  return new Set([...ids].filter((id) => known.has(id)));
}

/** Who may read a Thread: the people on it and the Metric's owner; anyone else only if they see its Metric (ticket
 * 323: a Thread shows the Metric's value, and a Workflow's task its reasons), and then everyone in the workspace, or
 * only the members of its Group. A Workspace Role grants nothing here, as it grants no Metric. */
export function canReadThread(ws: string, person: string, a: Pick<Action, "asker_id" | "assignee_id" | "metric_id" | "read_group_id"> & { previous_assignee_id?: string | null } & InWorkspace, metricOwner: string | undefined, groups: readonly (Group & InWorkspace)[], seesMetric: boolean): boolean {
  if (a.workspace_id !== ws) return false;
  if (a.asker_id === person || a.assignee_id === person || a.previous_assignee_id === person || metricOwner === person) return true;
  // For a Checklist Task (no Metric) `seesMetric` says whether the person may look at the Workflow at all: never a Guest.
  if (!seesMetric) return false;
  return a.read_group_id === null || mine(ws, groups).some((g) => g.id === a.read_group_id && g.members.includes(person));
}

/** What decides what a Webhook may hear of one event, loaded by the caller at the moment of sending. */
export type WebhookFacts = InWorkspace & {
  /** Whether the Metric is shared with the built-in Everyone Group, which every Member (no Guest) sees. */
  metricSeenByEveryone: boolean;
  /** The Group an Action's Thread is limited to, or null when everyone who sees the Metric reads it. */
  readGroupId: number | null;
};

/** What a Webhook hears of an event: all of it, only the structure (an Action whose words are not Everyone's), or nothing. */
export type WebhookHearing = "full" | "redacted" | "none";

/** Whether a Metric is shared with the Everyone Group, from the Groups and the Shares as stored (not expanded). */
export function metricSeenByEveryone(ws: string, metricId: number, groups: readonly (Group & InWorkspace)[], shares: readonly (Share & InWorkspace)[]): boolean {
  const everyone = new Set(mine(ws, groups).filter((g) => g.everyone).map((g) => g.id));
  return mine(ws, shares).some((s) => s.object_type === "metric" && s.object_id === metricId && s.group_id != null && everyone.has(s.group_id));
}

/** A Webhook is not a person, so it hears only what every Member sees (spec 0034, "What a Webhook may see"): a value
 * event only for a Metric Everyone sees, otherwise nothing at all; an Action event in full when its Metric is Everyone's
 * and its Thread is not limited to a Group, otherwise redacted (the structure, not the words); a `ping` is always whole.
 * Facts of another Workspace, or none, grant nothing. Pure: judged again at every send. */
export function webhookMayHear(ws: string, event: string, facts: WebhookFacts | null): WebhookHearing {
  if (event === "ping") return "full";
  if (!facts || facts.workspace_id !== ws) return "none";
  if (event.startsWith("action.")) return facts.metricSeenByEveryone && facts.readGroupId === null ? "full" : "redacted";
  return facts.metricSeenByEveryone ? "full" : "none";
}

// Who sees what inside a Workspace (GLOSSARY: Share, Group, Token, Stand-in, Thread). Pure: callers load the
// facts, these functions decide. Every function takes the workspace first and ignores rows from any other one,
// so a fact from another workspace can never grant anything.
import { tokenValid, type TokenRow } from "./tokens";
import { widgetMetricIds } from "./widget-metrics";
import type { Action, Group, Metric, Share, ShareRole, WidgetSettings } from "./types";

/** A row that belongs to a Workspace. */
export type InWorkspace = { workspace_id: string };

/** The role someone has on one dashboard or deck. */
export type ObjectRole = "owner" | ShareRole;

const mine = <T extends InWorkspace>(ws: string, rows: readonly T[]) => rows.filter((r) => r.workspace_id === ws);

/** Shares per person: a share with a Group counts for each of its members (the stronger role wins). */
export function expandGroupShares(ws: string, raw: readonly (Share & InWorkspace)[], groups: readonly (Group & InWorkspace)[]): (Share & InWorkspace)[] {
  const out = mine(ws, raw).filter((s) => s.user_id).map((s) => ({ ...s }));
  const ownGroups = mine(ws, groups);
  for (const s of mine(ws, raw).filter((x) => x.group_id)) {
    for (const user of ownGroups.find((g) => g.id === s.group_id)?.members ?? []) {
      const have = out.find((x) => x.object_type === s.object_type && x.object_id === s.object_id && x.user_id === user);
      if (!have) out.push({ ...s, user_id: user, via_group: s.group_id! });
      else if (have.role === "viewer" && s.role === "editor") have.role = "editor";
    }
  }
  return out;
}

/** The person's role on a dashboard or deck: owner, a shared role, or none. */
export function objectRole(ws: string, person: string, type: "dashboard" | "deck", obj: { id: number; owner_id: string } & InWorkspace, shares: readonly (Share & InWorkspace)[]): ObjectRole | null {
  if (obj.workspace_id !== ws) return null;
  if (obj.owner_id === person) return "owner";
  return shares.find((s) => s.workspace_id === ws && s.object_type === type && s.object_id === obj.id && s.user_id === person)?.role ?? null;
}

/** Every metric drawn by the widgets on a deck's slides. */
export function deckMetricIds(document: unknown): number[] {
  const store = (document as { store?: Record<string, { type?: string; props?: { metricIds?: unknown; settings?: unknown } }> } | null)?.store ?? {};
  const out: number[] = [];
  for (const r of Object.values(store)) {
    if (r?.type !== "ziffr-widget") continue;
    let settings: WidgetSettings | undefined;
    try { settings = typeof r.props?.settings === "string" ? JSON.parse(r.props.settings) : undefined; } catch { settings = undefined; }
    out.push(...widgetMetricIds(Array.isArray(r.props?.metricIds) ? (r.props!.metricIds as number[]) : [], settings));
  }
  return [...new Set(out.map(Number).filter(Number.isFinite))];
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
  for (const m of metrics) {
    if (!m.formula || ids.has(m.id) || m.owner_id !== person) continue;
    const inputs = [...m.formula.matchAll(/\{([a-z0-9-]+)\}/g)].map((x) => metrics.find((y) => y.slug === x[1])?.id);
    if (inputs.length && inputs.every((i) => i !== undefined && ids.has(i))) ids.add(m.id);
  }
  // Only metrics of this workspace, whatever a widget or document claims.
  return new Set([...ids].filter((id) => known.has(id)));
}

/** Who may read a Thread: the people on it, then everyone in the workspace, or only the members of its Group. */
export function canReadThread(ws: string, person: string, a: Pick<Action, "asker_id" | "assignee_id" | "metric_id" | "read_group_id"> & InWorkspace, metricOwner: string | undefined, groups: readonly (Group & InWorkspace)[]): boolean {
  if (a.workspace_id !== ws) return false;
  if (a.asker_id === person || a.assignee_id === person || metricOwner === person || a.read_group_id === null) return true;
  return mine(ws, groups).some((g) => g.id === a.read_group_id && g.members.includes(person));
}

// Snapshots for programs (ticket #435; GLOSSARY: Snapshot, Dashboard, Access Key). A key with dashboards:read lists and
// reads the Snapshots of the dashboards its creator sees, exactly as the creator would on the dashboard: drafts only
// when they may open drafts, and only the Metrics they see now. One with dashboards:write takes a Snapshot as the
// creator, through the same function the web app uses, so only a dashboard they own or edit, only of a period that is
// over. A key never shows, deletes or rewrites a Snapshot: that stays with people.
import { assertCan, assertScope, Forbidden, Refused, type Actor, type KeyActor } from "./actor";
import { noteOf, Unusable, type ApiNote } from "./api-dashboards";
import { listSnapshots, openSnapshot, takeSnapshot, type SnapshotSummary } from "./snapshots";
import { SNAPSHOT_PERIOD_KINDS, type SnapshotPeriodKind } from "./snapshot-periods";
import { widgetMetricIds } from "./widget-metrics";
import { TEMPLATES } from "./widget-templates";

/** Most values per Metric a read returns (the latest), so one answer stays small however long a Metric runs. */
export const SNAPSHOT_VALUES_PER_METRIC = 240;

/** A Snapshot as a program sees it in a list: no author, no words. */
export type ApiSnapshotSummary = {
  id: number; dashboard: number; kind: SnapshotSummary["kind"]; label: string; start: string; end: string;
  takenAt: string; automatic: boolean; shown: boolean; path: string;
};

/** One Snapshot read: the dashboard's name and introduction then, its widgets with their words, and the values it
 * kept for each Metric the creator sees now. `hiddenWidgets` counts widgets left out because they draw a Metric the
 * creator does not see (never which). `corrections` are kept values that differ from the ones recorded now. */
export type ApiSnapshot = ApiSnapshotSummary & {
  name: string; intro: string; hiddenWidgets: number;
  widgets: { id: number; view: string; title: string | null; metrics: string[]; words?: Record<string, string>; note?: ApiNote }[];
  metrics: { slug: string; name: string; unit: string; values: { period: string; value: number }[] }[];
  corrections: { metric: string; period: string; was: number; now: number | null }[];
};

const creatorOf = (actor: KeyActor): Actor => ({ personId: actor.personId, workspaceId: actor.workspaceId, role: actor.role });

const summaryOf = (s: SnapshotSummary): ApiSnapshotSummary => ({
  id: s.id, dashboard: s.dashboardId, kind: s.kind, start: s.start, end: s.end, label: s.label, takenAt: s.takenAt, automatic: s.automatic, shown: s.shownAt !== null,
  path: `/dashboards/${s.dashboardId}/snapshots/${s.id}`,
});

/** A dashboard's Snapshots the key's creator may open, newest period first (scope dashboards:read); at most 200. A
 * dashboard the creator does not see is Forbidden (404). */
export async function listSnapshotsWithKey(actor: KeyActor, dashboardId: number): Promise<ApiSnapshotSummary[]> {
  assertScope(actor, "dashboards:read");
  return (await listSnapshots(creatorOf(actor), Number(dashboardId))).map(summaryOf);
}

/** One Snapshot the key's creator may open (scope dashboards:read), cut down to what they see now. */
export async function getSnapshotWithKey(actor: KeyActor, snapshotId: number): Promise<ApiSnapshot> {
  assertScope(actor, "dashboards:read");
  const s = await openSnapshot(creatorOf(actor), Number(snapshotId));
  const slugOf = new Map(s.data.metrics.map((m) => [m.id, m.slug]));
  const widgets = s.widgets.map((w) => {
    const settings = (w.settings ?? {}) as Record<string, unknown>;
    const words: Record<string, string> = {};
    if (TEMPLATES[w.template]?.kind === "story") for (const k of ["kicker", "headline", "subline", "footnote", "source"]) if (typeof settings[k] === "string" && settings[k]) words[k] = settings[k] as string;
    return { id: w.id, view: String(w.template), title: w.title, metrics: [...new Set(widgetMetricIds(w.metric_ids ?? [], w.settings))].map((m) => slugOf.get(m)).filter((x): x is string => Boolean(x)), ...(Object.keys(words).length ? { words } : {}), ...noteOf(w) };
  });
  return {
    ...summaryOf(s), name: s.name, intro: s.intro, hiddenWidgets: s.hiddenParts, widgets,
    // Data was cut to the Metrics the creator sees now; the unit is the one the Snapshot kept.
    metrics: s.data.metrics.map((m) => ({ slug: m.slug, name: m.name, unit: m.unit, values: (s.data.series[m.slug] ?? []).slice(-SNAPSHOT_VALUES_PER_METRIC).map((p) => ({ period: p.period, value: p.value })) })),
    corrections: s.corrections.map((c) => ({ metric: c.slug, period: c.period, was: c.was, now: c.now })),
  };
}

/** Takes a Snapshot of a dashboard for a period that is over, as the key's creator (scope dashboards:write; only
 * while their role may create, and only a dashboard they own or edit and whose Metrics they all see). It starts as
 * a draft for the owner and Editors to show. A refusal in Ziffr's words about the request is Unusable (422). */
export async function takeSnapshotWithKey(actor: KeyActor, dashboardId: number, period: { kind: string; start: string }): Promise<ApiSnapshotSummary> {
  assertScope(actor, "dashboards:write");
  assertCan(creatorOf(actor), "create");
  if (!SNAPSHOT_PERIOD_KINDS.includes(period.kind as SnapshotPeriodKind)) throw new Unusable("Pick a week, month, quarter, half-year or year to take the Snapshot of.");
  let id: number;
  try {
    id = await takeSnapshot(creatorOf(actor), Number(dashboardId), period, { accessKeyId: Number(actor.key.id) });
  } catch (e) {
    // takeSnapshot's refusals (not over yet, taken already, too large) are words for the person asking; anything else is a 500.
    if (e instanceof Refused) throw new Unusable(e.message);
    throw e;
  }
  const made = (await listSnapshots(creatorOf(actor), Number(dashboardId))).find((s) => s.id === id);
  if (!made) throw new Forbidden();
  return summaryOf(made);
}

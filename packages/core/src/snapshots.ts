// Snapshots (spec 0013, ticket #175; ADR 0007; GLOSSARY: Snapshot, Dashboard, Finding, Version): a dashboard as it
// stood for one week, month or quarter. Taking one copies the dashboard's layout and the values up to the end of
// the period, as the person taking it sees them, cut down the way a View Link is: only the Metrics on it, names
// without contact details, nothing to act on. Those never change (the database refuses it). What people write about
// it, the introduction and each Finding's words, is kept apart and stays editable; every change is a Version.
//
// One visibility system, all the way through (decided on #193): a Snapshot has no audience of its own. Whoever may
// open the dashboard may open its Snapshots once they are shown, and sees in them only the Metrics they may see now,
// as on the live dashboard; until then they are drafts for the dashboard's owner and Editors who see all they kept.
// Losing access to the dashboard loses its Snapshots; losing a Metric loses it in every Snapshot too.
import { assertCan, Forbidden, type Actor } from "./actor";
import { getCanvasData, visibleDashboards, visibleMetricIds } from "./access";
import { getMetrics } from "./workspace-data";
import { audit } from "./audit-log";
import { db } from "./db";
import { widgetWithoutOutside } from "./deck-content";
import { assertSeesMetrics } from "./sharing";
import { dataAsOf, snapshotPeriod, type SnapshotPeriodKind } from "./snapshot-periods";
import { ensureBaseline, recordVersion } from "./versions";
import { shownData } from "./view-links";
import { widgetMetricIds } from "./widget-metrics";
import { localTime } from "./workspace-clock";
import type { CanvasData, Widget, WidgetSettings } from "./types";
import { JANUARY } from "./periods";

/** The words of a widget a Snapshot keeps editable: its title and a Finding's kicker, headline, subline, footnote
 * and source. Everything else about it is frozen. */
export const WORD_KEYS = ["title", "kicker", "headline", "subline", "footnote", "source"] as const;
/** One of the words a Snapshot keeps editable. */
export type WordKey = (typeof WORD_KEYS)[number];
/** The words of one widget in a Snapshot. */
export type WidgetWords = Partial<Record<WordKey, string>>;
/** What people write about a Snapshot: its introduction, and each widget's words by widget id. */
export type SnapshotWords = { intro?: string; widgets?: Record<string, WidgetWords> };

/** The frozen part of a Snapshot: the dashboard's name, theme and widgets, and the data drawn, cut at the period. */
type Frozen = { name: string; themeId: number | null; widgets: Widget[]; data: CanvasData };

/** The longest introduction, and the longest single word field, a Snapshot keeps. */
const MAX_INTRO = 4000;
const MAX_WORD = 600;
/** The largest frozen part a Snapshot may keep, in characters of JSON (the database allows a little more). */
const MAX_FROZEN = 7_500_000;
/** How many Snapshots a dashboard keeps at most, and how far back one may be taken, in years. */
export const MAX_SNAPSHOTS = 500;
const MAX_YEARS_BACK = 10;

/** Today in the workspace's own time zone, as yyyy-mm-dd. */
async function workspaceToday(ws: string): Promise<string> {
  const { data } = await db().from("workspaces").select("time_zone").eq("id", ws).maybeSingle();
  return localTime(new Date(), (data?.time_zone as string | undefined) ?? "UTC").day;
}

/** A Snapshot as lists show it, without its frozen part. */
export type SnapshotSummary = {
  id: number; dashboardId: number; kind: SnapshotPeriodKind; start: string; end: string; label: string;
  takenBy: string; takenAt: string; automatic: boolean; shownAt: string | null; wordsChangedAt: string | null;
};

/** A Snapshot opened to read: its summary, the dashboard's name and theme then, the introduction, and its widgets
 * with their words, drawn from the data it kept. `canWrite` for the dashboard's owner and Editors. */
export type OpenSnapshot = SnapshotSummary & { name: string; themeId: number | null; intro: string; widgets: Widget[]; data: CanvasData; canWrite: boolean; canDelete: boolean;
  /** How many of its widgets the reader does not get, because they draw Metrics the reader may not see now. */
  hiddenParts: number;
  corrections: Correction[] };

/** A value the Snapshot kept that differs from the one recorded now (#177): the Snapshot keeps `was`; `now` is the
 * current value, null when it was removed. Only for Metrics the reader sees now. */
export type Correction = { metricId: number; slug: string; period: string; was: number; now: number | null };

const SUMMARY = "id, dashboard_id, period_kind, period_start, period_end, label, taken_by, taken_at, automatic, shown_at, words_changed_at";

type Row = { id: number; dashboard_id: number; period_kind: SnapshotPeriodKind; period_start: string; period_end: string; label: string; taken_by: string; taken_at: string; automatic: boolean; shown_at: string | null; words_changed_at: string | null; frozen?: Frozen | null; words?: SnapshotWords };

const summary = (r: Row): SnapshotSummary => ({
  id: r.id, dashboardId: r.dashboard_id, kind: r.period_kind, start: r.period_start, end: r.period_end, label: r.label,
  takenBy: r.taken_by, takenAt: r.taken_at, automatic: r.automatic, shownAt: r.shown_at, wordsChangedAt: r.words_changed_at,
});

/** The actor's role on a dashboard of their workspace, or null. */
async function roleOn(actor: Actor, dashboardId: number) {
  return (await visibleDashboards(actor.workspaceId, actor.personId)).find((d) => d.id === dashboardId) ?? null;
}

/** A widget's words as the Snapshot starts with them: what it says now. */
function wordsOf(w: Widget): WidgetWords {
  const s = (w.settings ?? {}) as Record<string, unknown>;
  const out: WidgetWords = {};
  if (w.title) out.title = w.title;
  for (const k of WORD_KEYS) if (k !== "title" && typeof s[k] === "string" && s[k]) out[k] = s[k] as string;
  return out;
}

/** Takes a Snapshot of a dashboard for a week, month or quarter (`start` is its first day) that is over, within the
 * last ten years: the dashboard's owner and Editors, who must see every Metric on it. It starts as a draft. `today`
 * (yyyy-mm-dd) is the workspace's own day unless given, as the daily run does. Returns its id. */
export async function takeSnapshot(actor: Actor, dashboardId: number, period: { kind: unknown; start: unknown }, opts: { automatic?: boolean; today?: string } = {}): Promise<number> {
  assertCan(actor, "create");
  if (!Number.isInteger(dashboardId)) throw new Forbidden();
  const p = snapshotPeriod(period?.kind as SnapshotPeriodKind, String(period?.start ?? ""), JANUARY);
  if (!p) throw new Error("Pick a week, month or quarter to take the Snapshot of.");
  const dash = await roleOn(actor, dashboardId);
  if (!dash || (dash.role !== "owner" && dash.role !== "editor")) throw new Forbidden();
  const ws = actor.workspaceId;
  // Only a period that is over: one still running or to come would keep today's values under its name. And not
  // further back than anyone reports on, so nobody fills the database with Snapshots of the 1900s.
  const today = opts.today ?? (await workspaceToday(ws));
  if (p.end >= today) throw new Error(`${p.label} is not over yet. Take its Snapshot once it is.`);
  if (Number(p.start.slice(0, 4)) < Number(today.slice(0, 4)) - MAX_YEARS_BACK) throw new Error(`Snapshots go back ${MAX_YEARS_BACK} years at most.`);
  const { count } = await db().from("dashboard_snapshots").select("id", { count: "exact", head: true }).eq("workspace_id", ws).eq("dashboard_id", dashboardId).is("deleted_at", null);
  if ((count ?? 0) >= MAX_SNAPSHOTS) throw new Error(`A dashboard keeps ${MAX_SNAPSHOTS} Snapshots at most. Delete old ones first.`);
  const { data: rows } = await db().from("widgets").select("*").eq("workspace_id", ws).eq("dashboard_id", dashboardId).order("y").order("x");
  // Nothing in a free layout may load from another site when shown (spec 0009).
  const widgets = ((rows ?? []) as Widget[]).map(widgetWithoutOutside);
  const metricIds = [...new Set(widgets.flatMap((w) => widgetMetricIds(w.metric_ids, w.settings)))];
  // Whoever takes it vouches for what it shows: every Metric on it must be one they see.
  await assertSeesMetrics(actor, metricIds);
  const full = await getCanvasData(ws, actor.personId, { seriesOf: metricIds });
  // The values of the Metric periods complete by the period's last day; Targets and Projections as they are now.
  const data = dataAsOf(shownData(full, new Set(metricIds), dash.theme_id ?? null), p.end);
  // Each widget keeps what drawing needs, nothing else.
  const kept = widgets.map((w) => ({ id: w.id, template: w.template, metric_ids: w.metric_ids, settings: w.settings, title: w.title, x: w.x, y: w.y, w: w.w, h: w.h }) as Widget);
  const frozen: Frozen = { name: dash.name, themeId: dash.theme_id ?? null, widgets: kept, data };
  if (JSON.stringify(frozen).length > MAX_FROZEN) throw new Error("This dashboard holds too much to keep as a Snapshot. Take one of a smaller dashboard.");
  const words: SnapshotWords = { intro: String(dash.intro ?? ""), widgets: Object.fromEntries(kept.map((w) => [String(w.id), wordsOf(w)])) };
  const { data: made, error } = await db().from("dashboard_snapshots").insert({
    workspace_id: ws, dashboard_id: dashboardId, period_kind: p.kind, period_start: p.start, period_end: p.end, label: p.label,
    taken_by: actor.personId, automatic: Boolean(opts.automatic), frozen, words,
  }).select("id").single();
  if (error?.code === "23505") throw new Error(`There is a Snapshot of ${p.label} already. Open it, or delete it first.`);
  if (error || !made) throw new Error("The Snapshot could not be taken.");
  await audit(actor, { kind: "snapshot.taken", object: { type: "dashboard", id: dashboardId, name: dash.name }, details: { snapshot_id: made.id, period: p.label, automatic: Boolean(opts.automatic) } });
  return made.id as number;
}

/** A dashboard's Snapshots the actor may open, newest period first: shown ones for everyone who may open the
 * dashboard, drafts too for its owner and Editors. */
export async function listSnapshots(actor: Actor, dashboardId: number): Promise<SnapshotSummary[]> {
  if (!Number.isInteger(dashboardId)) throw new Forbidden();
  const dash = await roleOn(actor, dashboardId);
  if (!dash) throw new Forbidden();
  let q = db().from("dashboard_snapshots").select(SUMMARY).eq("workspace_id", actor.workspaceId).eq("dashboard_id", dashboardId).is("deleted_at", null);
  if (dash.role !== "owner" && dash.role !== "editor") q = q.not("shown_at", "is", null);
  const { data } = await q.order("period_start", { ascending: false }).order("id", { ascending: false }).limit(200);
  return ((data ?? []) as Row[]).map(summary);
}

/** The Snapshot with its dashboard role, if the actor may open it; Forbidden otherwise. */
async function readable(actor: Actor, snapshotId: number, columns: string) {
  if (!Number.isInteger(snapshotId)) throw new Forbidden();
  const { data } = await db().from("dashboard_snapshots").select(columns).eq("id", snapshotId).eq("workspace_id", actor.workspaceId).is("deleted_at", null).maybeSingle();
  const row = data as unknown as Row | null;
  if (!row) throw new Forbidden();
  const dash = await roleOn(actor, row.dashboard_id);
  if (!dash) throw new Forbidden();
  const writer = dash.role === "owner" || dash.role === "editor";
  // A draft is for the dashboard's owner and Editors only, and only for those who see every Metric it kept: whoever
  // reads, writes or shows a draft vouches for it, as whoever took it did (second security review of spec 0013).
  if (!row.shown_at) {
    if (!writer) throw new Forbidden();
    await assertSeesKept(actor, snapshotId);
  }
  return { row, role: dash.role, writer };
}

/** Whether the actor may read a Snapshot and its Versions, and write its words: the same rules as opening it. */
export async function snapshotAccess(actor: Actor, snapshotId: number): Promise<{ view: boolean; edit: boolean }> {
  try {
    const { writer } = await readable(actor, snapshotId, "id, dashboard_id, shown_at");
    return { view: true, edit: writer };
  } catch (err) {
    if (err instanceof Forbidden) return { view: false, edit: false };
    throw err;
  }
}

/** Refuses anyone who does not see every Metric a Snapshot kept. */
async function assertSeesKept(actor: Actor, snapshotId: number) {
  const { data } = await db().from("dashboard_snapshots").select("metrics:frozen->data->metrics").eq("id", snapshotId).eq("workspace_id", actor.workspaceId).maybeSingle();
  const kept = ((data as { metrics?: { id: number }[] | null } | null)?.metrics ?? []).map((m) => Number(m.id));
  await assertSeesMetrics(actor, kept);
}

/** A Snapshot's widgets carrying the words written about them; `extra` settings are added to each (such as asOf). */
function withWords(widgets: Widget[], words: SnapshotWords, extra: WidgetSettings = {}): Widget[] {
  return widgets.map((w) => {
    const own = words.widgets?.[String(w.id)] ?? {};
    const settings: WidgetSettings = { ...(w.settings ?? {}), ...extra };
    for (const k of WORD_KEYS) if (k !== "title") (settings as Record<string, unknown>)[k] = own[k] || undefined;
    return { ...w, title: own.title || null, settings };
  });
}

/** Opens a Snapshot to read: its widgets carry the words written about them, drawn from the data it kept. */
export async function openSnapshot(actor: Actor, snapshotId: number): Promise<OpenSnapshot> {
  const { row, role, writer } = await readable(actor, snapshotId, `${SUMMARY}, frozen, words`);
  const frozen = row.frozen as Frozen;
  const words = row.words ?? {};
  const seen = await forReader(actor, withWords(frozen.widgets, words), frozen.data, frozen.themeId);
  const corrections = await correctionsFor(actor, seen.data);
  return { ...summary(row), name: frozen.name, themeId: frozen.themeId, intro: String(words.intro ?? ""), widgets: seen.widgets, data: seen.data, hiddenParts: seen.hidden, canWrite: writer, canDelete: role === "owner", corrections };
}

/** What of a Snapshot one reader gets (spec 0013, decided on #193): visibility carries all the way through, so only
 * the Metrics they may see now, as on the live dashboard. A widget that draws any other Metric stays out whole: its
 * title and settings can name it. `hidden` counts the widgets left out. */
export async function forReader(actor: Pick<Actor, "personId" | "workspaceId">, widgets: Widget[], data: CanvasData, themeId: number | null, allowed?: readonly number[]): Promise<{ widgets: Widget[]; data: CanvasData; hidden: number }> {
  const seen = await visibleMetricIds(actor.workspaceId, actor.personId, await getMetrics(actor.workspaceId));
  // A View Link also keeps to the Metrics agreed when it was made.
  const visible = allowed ? new Set([...seen].filter((m) => allowed.includes(m))) : seen;
  const shown = widgets.filter((w) => widgetMetricIds(w.metric_ids ?? [], w.settings).every((m) => visible.has(m)));
  const ids = new Set(data.metrics.map((m) => m.id).filter((m) => visible.has(m)));
  return { widgets: shown, data: shownData(data, ids, themeId), hidden: widgets.length - shown.length };
}

/** What a View Link to a Snapshot shows (#178), read from the Snapshot each time it is opened: what it kept and the
 * words written about it, nothing else. Null when it is a draft, deleted or of another dashboard. No Actor: the
 * link's owner chose to show it, as with any View Link (view-links.ts checks the link first). */
export async function snapshotForLink(snapshotId: number, dashboardId: number, keptWords?: SnapshotWords | null): Promise<{ name: string; themeId: number | null; intro: string; widgets: Widget[]; data: CanvasData; label: string; takenAt: string; words: SnapshotWords } | null> {
  const { data } = await db().from("dashboard_snapshots").select(`${SUMMARY}, frozen, words`).eq("id", snapshotId).eq("dashboard_id", dashboardId).is("deleted_at", null).not("shown_at", "is", null).maybeSingle();
  const row = data as unknown as Row | null;
  if (!row?.frozen) return null;
  // A link shows the words as they were when its owner made it, if it kept them; changed since, they stay in Ziffr.
  const words = keptWords ?? row.words ?? {};
  const widgets = withWords(row.frozen.widgets, words);
  return { name: row.frozen.name, themeId: row.frozen.themeId, intro: String(words.intro ?? ""), widgets, data: row.frozen.data, label: row.label, takenAt: row.taken_at, words };
}

/** What a new deck made from a Snapshot starts with (#178): the dashboard's name and the period, the Snapshot's
 * introduction, and its widgets in reading order with the words written about them, each drawing only the Metric
 * periods complete by the period's last day. Only the widgets the person may see now (decided on #193); placing the
 * slides checks again that they see every Metric. */
export async function snapshotDeckSeed(actor: Actor, snapshotId: number): Promise<{ name: string; intro: string; widgets: Pick<Widget, "template" | "metric_ids" | "settings" | "title">[] }> {
  const { row } = await readable(actor, snapshotId, `${SUMMARY}, frozen, words`);
  const frozen = row.frozen as Frozen;
  const words = row.words ?? {};
  const ordered = [...frozen.widgets].sort((a, b) => a.y - b.y || a.x - b.x || a.id - b.id);
  const seen = await forReader(actor, withWords(ordered, words, { asOf: row.period_end }), frozen.data, frozen.themeId);
  return {
    name: `${frozen.name}, ${row.label}`.slice(0, 120),
    intro: String(words.intro ?? ""),
    widgets: seen.widgets.map((w) => ({ template: w.template, metric_ids: w.metric_ids, settings: w.settings, title: w.title })),
  };
}

/** The values a Snapshot kept that were corrected or removed since, of the data the reader gets from it: only
 * Metrics they see now, and checked again against what they see today. */
async function correctionsFor(actor: Actor, kept: CanvasData): Promise<Correction[]> {
  const ids = kept.metrics.map((m) => m.id);
  if (!ids.length) return [];
  // Only the series of Metrics the reader sees come back: getCanvasData leaves the others out.
  const now = await getCanvasData(actor.workspaceId, actor.personId, { seriesOf: ids });
  const out: Correction[] = [];
  for (const m of kept.metrics) {
    const current = now.series[m.slug];
    if (!current || !now.metrics.some((x) => x.id === m.id)) continue;
    const byPeriod = new Map(current.map((p) => [p.period, p.value]));
    for (const p of kept.series[m.slug] ?? []) {
      const value = byPeriod.has(p.period) ? byPeriod.get(p.period)! : null;
      if (value !== p.value) out.push({ metricId: m.id, slug: m.slug, period: p.period, was: p.value, now: value });
    }
  }
  return out;
}

/** Only the words a Snapshot keeps editable, each a string within size, for widgets it has. */
function cleanWords(input: unknown, widgetIds: Set<string>, current: SnapshotWords): SnapshotWords {
  const src = (input && typeof input === "object" ? input : {}) as { intro?: unknown; widgets?: unknown };
  const out: SnapshotWords = { intro: current.intro ?? "", widgets: { ...(current.widgets ?? {}) } };
  if (src.intro !== undefined) out.intro = String(src.intro ?? "").slice(0, MAX_INTRO);
  if (src.widgets !== undefined) {
    if (!src.widgets || typeof src.widgets !== "object" || Array.isArray(src.widgets)) throw new Error("These words cannot be saved.");
    for (const [id, w] of Object.entries(src.widgets as Record<string, unknown>)) {
      // Only widgets the Snapshot has, and only their words: its numbers, charts and layout stay as they were.
      if (!widgetIds.has(id) || !w || typeof w !== "object" || Array.isArray(w)) throw new Error("These words cannot be saved.");
      const next: WidgetWords = {};
      for (const [k, v] of Object.entries(w as Record<string, unknown>)) {
        if (!(WORD_KEYS as readonly string[]).includes(k)) throw new Error("Only the words of a Snapshot can be changed.");
        const text = String(v ?? "").slice(0, MAX_WORD);
        if (text) next[k as WordKey] = text;
      }
      out.widgets![id] = next;
    }
  }
  return out;
}

/** Changes what is written about a Snapshot (its introduction, its widgets' words): the dashboard's owner and
 * Editors. Every change is a Version; once it is shown, the Snapshot then says its words changed since. */
export async function editSnapshotWords(actor: Actor, snapshotId: number, words: unknown): Promise<void> {
  const { row, writer } = await readable(actor, snapshotId, "id, dashboard_id, shown_at, frozen, words");
  if (!writer) throw new Forbidden();
  const frozen = row.frozen as Frozen;
  // Only the widgets this writer gets in the Snapshot (#193): a widget drawing a Metric they do not see keeps its words.
  const seen = await forReader(actor, frozen.widgets, frozen.data, frozen.themeId);
  const next = cleanWords(words, new Set(seen.widgets.map((w) => String(w.id))), row.words ?? {});
  if (JSON.stringify(next) === JSON.stringify(row.words ?? {})) return;
  await ensureBaseline("snapshot", snapshotId, actor.personId);
  const { error } = await db().from("dashboard_snapshots").update({ words: next, ...(row.shown_at ? { words_changed_at: new Date().toISOString() } : {}) }).eq("id", snapshotId).eq("workspace_id", actor.workspaceId);
  if (error) throw new Error("The words could not be saved.");
  await recordVersion("snapshot", snapshotId, actor.personId);
}

/** The words a restored Version brings back for this actor: the old introduction and the old words of the widgets
 * they get in the Snapshot; a widget drawing a Metric they do not see keeps its words as they are now (#193). */
export async function restorableWords(actor: Actor, snapshotId: number, old: unknown): Promise<SnapshotWords> {
  const { data } = await db().from("dashboard_snapshots").select("frozen, words").eq("id", snapshotId).eq("workspace_id", actor.workspaceId).is("deleted_at", null).maybeSingle();
  const row = data as { frozen: Frozen | null; words: SnapshotWords | null } | null;
  if (!row?.frozen) throw new Forbidden();
  const seen = new Set((await forReader(actor, row.frozen.widgets, row.frozen.data, row.frozen.themeId)).widgets.map((w) => String(w.id)));
  const before = (old && typeof old === "object" && !Array.isArray(old) ? old : {}) as SnapshotWords;
  const now = row.words ?? {};
  const widgets: Record<string, WidgetWords> = {};
  for (const w of row.frozen.widgets) {
    const id = String(w.id);
    const pick = seen.has(id) ? before.widgets?.[id] : now.widgets?.[id];
    if (pick && typeof pick === "object") widgets[id] = pick;
  }
  return { intro: typeof before.intro === "string" ? before.intro : String(now.intro ?? ""), widgets };
}

/** Ends a Snapshot's draft: everyone who may open the dashboard sees it from now on. Its owner and Editors. */
export async function showSnapshot(actor: Actor, snapshotId: number): Promise<void> {
  const { row, writer } = await readable(actor, snapshotId, "id, dashboard_id, label, shown_at");
  if (!writer) throw new Forbidden();
  if (row.shown_at) return;
  const { error } = await db().from("dashboard_snapshots").update({ shown_at: new Date().toISOString(), shown_by: actor.personId }).eq("id", snapshotId).eq("workspace_id", actor.workspaceId).is("shown_at", null);
  if (error) throw new Error("The Snapshot could not be shown.");
  const { data: d } = await db().from("dashboards").select("name").eq("id", row.dashboard_id).eq("workspace_id", actor.workspaceId).maybeSingle();
  await audit(actor, { kind: "snapshot.shown", object: { type: "dashboard", id: row.dashboard_id, name: d?.name ?? null }, details: { snapshot_id: snapshotId, period: row.label } });
}

/** Deletes a Snapshot: its numbers and words go; only that it existed stays, so it is not taken again by itself.
 * Only the dashboard's owner, as with deleting the dashboard. */
export async function deleteSnapshot(actor: Actor, snapshotId: number): Promise<void> {
  const { row, role } = await readable(actor, snapshotId, "id, dashboard_id, label, shown_at");
  if (role !== "owner") throw new Forbidden();
  const { error } = await db().from("dashboard_snapshots").update({ deleted_at: new Date().toISOString(), deleted_by: actor.personId, frozen: null, words: {} }).eq("id", snapshotId).eq("workspace_id", actor.workspaceId).is("deleted_at", null);
  if (error) throw new Error("The Snapshot could not be deleted.");
  // Its Versions held its words: they go with it.
  await db().from("versions").delete().eq("object_type", "snapshot").eq("object_id", snapshotId);
  const { data: d } = await db().from("dashboards").select("name").eq("id", row.dashboard_id).eq("workspace_id", actor.workspaceId).maybeSingle();
  await audit(actor, { kind: "snapshot.deleted", object: { type: "dashboard", id: row.dashboard_id, name: d?.name ?? null }, details: { snapshot_id: snapshotId, period: row.label } });
}

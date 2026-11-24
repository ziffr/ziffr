// Snapshots (spec 0013, ticket #175; ADR 0007; GLOSSARY: Snapshot, Dashboard, Finding, Version): a dashboard as it
// stood for one week, month, quarter, half-year or year (spec 0020). Taking one copies the dashboard's layout and the values up to the end of
// the period, as the person taking it sees them, cut down the way a View Link is: only the Metrics on it, names
// without contact details, nothing to act on. Those never change (the database refuses it). What people write about
// it, the introduction and each Finding's words, is kept apart and stays editable; every change is a Version.
//
// One visibility system, all the way through (decided on #193): a Snapshot has no audience of its own. Whoever may
// open the dashboard may open its Snapshots once they are shown, and sees in them only the Metrics they may see now,
// as on the live dashboard; until then they are drafts for the dashboard's owner and Editors who see all they kept.
// Losing access to the dashboard loses its Snapshots; losing a Metric loses it in every Snapshot too.
import { recordedWidgets } from "./tag-widgets";
import { assertCan, Forbidden, Refused, type Actor } from "./actor";
import { sendingLimit } from "./sending-limit";
import { sendingLimitDefault } from "./sending-limits";
import { getCanvasData, peopleFor, visibleDashboards, visibleMetricIds } from "./access";
import { getMetrics } from "./workspace-data";
import { audit } from "./audit-log";
import { db } from "./db";
import { mapBreakdownLabels, openFrozenData, openObject, opening, sealFrozenData, sealing, sealObject, mapSettingsWords, WORD_KEYS } from "./sealed-words";
import { openRows, reserveIds } from "./sealed-columns";
import { workspaceCipher } from "./workspace-keys";
import { widgetWithoutOutside } from "./deck-content";
import { assertSeesMetrics } from "./sharing";
import { dataAsOf, snapshotPeriod, type SnapshotPeriodKind } from "./snapshot-periods";
import { ensureBaseline, recordVersion } from "./versions";
import { shownData } from "./view-links";
import { widgetMetricIds } from "./widget-metrics";
import { localTime } from "./workspace-clock";
import type { CanvasData, Widget, WidgetSettings } from "./types";
import { yearStartOf } from "./fiscal-year";
import { keptUnit } from "./units";
import { keptMethod } from "./attainment-method";
import { normalizeMetric } from "./metric-row";
import { numberStyleOf } from "./workspace-settings";
import { dayAfter } from "./display-periods";
import { refuseSeeded, refuseShowcase } from "./demo-seeded-rows";
import { assertSnapshotTurn, type SnapshotTurn } from "./demo-snapshot-lock";
import { DEMO_SNAPSHOT_LIMITS } from "./demo-limits";
import { DemoSizeRefused } from "./demo-visitor-limits";
import { inDemoVisit, visitorOptionalText } from "./demo-visitor-words";

/** The words of a widget a Snapshot keeps editable: its title and a Finding's kicker, headline, subline, footnote
 * and source. Everything else about it is frozen. */
export { WORD_KEYS };
/** One of the words a Snapshot keeps editable. */
export type WordKey = (typeof WORD_KEYS)[number];
/** The words of one widget in a Snapshot. */
export type WidgetWords = Partial<Record<WordKey, string>>;
/** What people write about a Snapshot: its introduction, and each widget's words by widget id. */
export type SnapshotWords = { intro?: string; widgets?: Record<string, WidgetWords> };

/** The frozen part of a Snapshot: the dashboard's name, theme and widgets, and the data drawn, cut at the period. `data`
 * is sealed as a whole where the Workspace seals (spec 0028); `metricIds` is the plain list of the Metrics it kept (ids
 * only, no names), so who may open a draft can be asked without opening it. Snapshots frozen before have neither a
 * sealed `data` nor `metricIds`: their Metrics are read from `data.metrics`. */
type Frozen = { name: string; themeId: number | null; widgets: Widget[]; data: CanvasData; metricIds?: number[] };

/** The Metric ids a Snapshot kept, from what SQL reads of its frozen part (`ids`, and the older `legacy` data.metrics).
 * Null when it says neither: a Snapshot that does not say what it kept is not opened by anyone who has not seen it, never
 * read as one that kept nothing (which every viewer would pass). */
export function keptIds(row: { ids?: unknown; legacy?: unknown } | null | undefined): number[] | null {
  const list = Array.isArray(row?.ids) ? row.ids : Array.isArray(row?.legacy) ? (row.legacy as { id?: unknown }[]).map((m) => m?.id) : null;
  return list === null ? null : list.map(Number);
}

/** The longest introduction, and the longest single word field, a Snapshot keeps. */
const MAX_INTRO = 4000;
const MAX_WORD = 600;
/** The largest frozen part a Snapshot may keep, in characters of JSON (the database allows a little more). */
const MAX_FROZEN = 7_500_000;
/** How many Snapshots a dashboard keeps at most, and how far back one may be taken, in years. */
export const MAX_SNAPSHOTS = sendingLimitDefault("snapshotsPerDashboard");
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

type Row = { id: number; dashboard_id: number; period_kind: SnapshotPeriodKind; period_start: string; period_end: string; label: string; taken_by: string; taken_at: string; automatic: boolean; shown_at: string | null; words_changed_at: string | null; workspace_id?: string; frozen?: Frozen | null; words?: SnapshotWords };

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

/** The widgets a Snapshot of a dashboard would keep, and the Metrics they draw, as the actor sees the dashboard now. */
async function snapshotWidgets(actor: Actor, dashboardId: number): Promise<{ widgets: Widget[]; metricIds: number[] }> {
  const ws = actor.workspaceId;
  const { data: rows } = await db().from("widgets").select("*").eq("workspace_id", ws).eq("dashboard_id", dashboardId).order("y").order("x");
  // Nothing in a free layout may load from another site when shown (spec 0009).
  // A widget of "all Metrics tagged X" is kept with the Metrics the person taking it sees now, and follows the Tag no more (spec 0038).
  const widgets = await recordedWidgets(actor, ((await openRows("widgets", ws, rows)) as Widget[]).map(widgetWithoutOutside));
  return { widgets, metricIds: [...new Set(widgets.flatMap((w) => widgetMetricIds(w.metric_ids, w.settings)))] };
}

/** Whether the actor may take a Snapshot of the dashboard now: the rule `takeSnapshot` applies, without taking one (its
 * owner or an Editor, who sees every Metric on it). A Workflow's Send Snapshot step asks it when saved and when it runs. */
export async function mayTakeSnapshot(actor: Actor, dashboardId: number): Promise<boolean> {
  if (!Number.isInteger(dashboardId)) return false;
  const dash = await roleOn(actor, dashboardId);
  if (!dash || (dash.role !== "owner" && dash.role !== "editor")) return false;
  try {
    await assertSeesMetrics(actor, (await snapshotWidgets(actor, dashboardId)).metricIds);
    return true;
  } catch (err) {
    if (err instanceof Forbidden) return false;
    throw err;
  }
}

/** Takes a Snapshot of a dashboard for a week, month, quarter, half-year or year (`start` is its first day) that is over, within the
 * last ten years: the dashboard's owner and Editors, who must see every Metric on it. It starts as a draft. `today`
 * (yyyy-mm-dd) is the workspace's own day unless given, as the daily run does. Returns its id. */
export async function takeSnapshot(actor: Actor, dashboardId: number, period: { kind: unknown; start: unknown }, opts: { automatic?: boolean; today?: string; accessKeyId?: number; workflowId?: number; turn?: SnapshotTurn } = {}): Promise<number> {
  assertCan(actor, "create");
  if (!Number.isInteger(dashboardId)) throw new Forbidden();
  const p = snapshotPeriod(period?.kind as SnapshotPeriodKind, String(period?.start ?? ""), await yearStartOf(actor.workspaceId));
  if (!p) throw new Refused("Pick a week, month, quarter, half-year or year to take the Snapshot of.");
  const dash = await roleOn(actor, dashboardId);
  if (!dash || (dash.role !== "owner" && dash.role !== "editor")) throw new Forbidden();
  // In the demo: only with the demo's one turn to take a Snapshot, and never of the showcase, which is refused before any numbers are computed.
  assertSnapshotTurn(actor, opts.turn);
  await refuseShowcase(actor, "dashboard", dashboardId);
  const ws = actor.workspaceId;
  // Only a period that is over: one still running or to come would keep today's values under its name. And not
  // further back than anyone reports on, so nobody fills the database with Snapshots of the 1900s.
  const today = opts.today ?? (await workspaceToday(ws));
  if (p.end >= today) throw new Refused(`${p.label} is not over yet. Take its Snapshot once it is.`);
  if (Number(p.start.slice(0, 4)) < Number(today.slice(0, 4)) - MAX_YEARS_BACK) throw new Refused(`Snapshots go back ${MAX_YEARS_BACK} years at most.`);
  const { count } = await db().from("dashboard_snapshots").select("id", { count: "exact", head: true }).eq("workspace_id", ws).eq("dashboard_id", dashboardId).is("deleted_at", null);
  const most = await sendingLimit("snapshotsPerDashboard");
  if ((count ?? 0) >= most) throw new Refused(`A dashboard keeps ${most} Snapshots at most. Delete old ones first.`);
  const { widgets, metricIds } = await snapshotWidgets(actor, dashboardId);
  // Whoever takes it vouches for what it shows: every Metric on it must be one they see.
  await assertSeesMetrics(actor, metricIds);
  const full = await getCanvasData(ws, actor.personId, { seriesOf: metricIds });
  // The values of the Metric periods complete by the period's last day; Targets and Projections as they are now.
  const data = dataAsOf(shownData(full, new Set(metricIds), dash.theme_id ?? null), p.end);
  // Each widget keeps what drawing needs, nothing else.
  const kept = widgets.map((w) => ({ id: w.id, template: w.template, metric_ids: w.metric_ids, settings: w.settings, title: w.title, x: w.x, y: w.y, w: w.w, h: w.h }) as Widget);
  // The words are kept apart (and sealed, spec 0028) and every reader puts them back on the widgets: the frozen part
  // never holds them, so it is not a second, readable copy.
  const words: SnapshotWords = { intro: String(dash.intro ?? ""), widgets: Object.fromEntries(kept.map((w) => [String(w.id), wordsOf(w)])) };
  const frozen: Frozen = { name: dash.name, themeId: dash.theme_id ?? null, widgets: kept.map((w) => ({ ...w, title: null, settings: mapSettingsWords(w.settings, () => undefined) as WidgetSettings })), data };
  // The words are bound to their Snapshot, so its id is taken first.
  const [snapshotId] = await reserveIds("dashboard_snapshots", 1);
  // The Breakdown labels it froze are words too: sealed for this Snapshot, at their place in its data.
  const cipher = await workspaceCipher(ws);
  const labelled: Frozen = { ...frozen, metricIds: data.metrics.map((m) => m.id), data: mapBreakdownLabels(frozen.data, sealing(cipher, "dashboard_snapshots", snapshotId), "frozen.data.") };
  // Then the whole data, with its values, names and Targets, as one sealed text.
  const sealedFrozen = sealFrozenData(cipher, "dashboard_snapshots", snapshotId, labelled);
  if (JSON.stringify(sealedFrozen).length > MAX_FROZEN) throw new Refused("This dashboard holds too much to keep as a Snapshot. Take one of a smaller dashboard.");
  // A visitor's Snapshot is smaller still: the demo holds twenty of them, and the size is known before anything is written.
  if (inDemoVisit(actor) && JSON.stringify(sealedFrozen).length > DEMO_SNAPSHOT_LIMITS.frozenBytes) throw new DemoSizeRefused("This dashboard holds too much to keep as a Snapshot in the demo. Take one of a smaller dashboard.");
  const { data: made, error } = await db().from("dashboard_snapshots").insert({
    id: snapshotId, workspace_id: ws, dashboard_id: dashboardId, period_kind: p.kind, period_start: p.start, period_end: p.end, label: p.label,
    taken_by: actor.personId, automatic: Boolean(opts.automatic), frozen: sealedFrozen, words: await sealedWords(ws, snapshotId, words),
  }).select("id").single();
  if (error?.code === "23505") throw new Refused(`There is a Snapshot of ${p.label} already. Open it, or delete it first.`);
  if (error || !made) throw new Error("The Snapshot could not be taken.");
  await audit(actor, { kind: "snapshot.taken", object: { type: "dashboard", id: dashboardId, name: dash.name }, accessKeyId: opts.accessKeyId, details: { snapshot_id: made.id, period: p.label, automatic: Boolean(opts.automatic), ...(opts.accessKeyId ? { via: "api" } : {}), ...(opts.workflowId ? { via: "workflow", workflow_id: opts.workflowId } : {}) } });
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
  // Newest first by the period's last day; of those ending on the same day the longer first: 2026, H2 2026, Q4
  // 2026, December 2026.
  const { data } = await q.order("period_end", { ascending: false }).order("period_start").order("id", { ascending: false }).limit(200);
  const rows = (data ?? []) as Row[];
  // A draft is listed only to those who could open it: its label and period say what it covers, so an owner or Editor
  // who does not see every Metric it kept gets neither (#448, the same rule as `readable`).
  const drafts = rows.filter((r) => !r.shown_at).map((r) => r.id);
  if (!drafts.length) return rows.map(summary);
  const [{ data: kept, error }, visible] = await Promise.all([
    db().from("dashboard_snapshots").select("id, ids:frozen->metricIds, legacy:frozen->data->metrics").eq("workspace_id", actor.workspaceId).in("id", drafts),
    visibleMetricIds(actor.workspaceId, actor.personId, await getMetrics(actor.workspaceId)),
  ]);
  if (error) throw error;
  // Allowed ones are listed, so a draft that did not come back is left out rather than shown.
  const allowed = new Set(((kept ?? []) as unknown as { id: number; ids?: unknown; legacy?: unknown }[])
    .filter((k) => (keptIds(k) ?? [-1]).every((m) => visible.has(m))).map((k) => k.id));
  return rows.filter((r) => r.shown_at || allowed.has(r.id)).map(summary);
}

/** The Snapshot with its dashboard role, if the actor may open it; Forbidden otherwise. */
async function readable(actor: Actor, snapshotId: number, columns: string) {
  if (!Number.isInteger(snapshotId)) throw new Forbidden();
  const { data } = await db().from("dashboard_snapshots").select(columns).eq("id", snapshotId).eq("workspace_id", actor.workspaceId).is("deleted_at", null).maybeSingle();
  const row = data as unknown as Row | null;
  if (!row) throw new Forbidden();
  if (row.frozen) {
    // Data that does not open reads as a Snapshot that is not there.
    const opened = await openedFrozen(actor.workspaceId, row.id, row.frozen);
    if (!opened) throw new Forbidden();
    row.frozen = opened;
  }
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
  const { data } = await db().from("dashboard_snapshots").select("ids:frozen->metricIds, legacy:frozen->data->metrics").eq("id", snapshotId).eq("workspace_id", actor.workspaceId).maybeSingle();
  const kept = keptIds(data as { ids?: unknown; legacy?: unknown } | null);
  if (kept === null) throw new Forbidden();
  await assertSeesMetrics(actor, kept);
}

/** A Snapshot's data, counting "to date" from the day after its period (spec 0018): a widget shown by quarter keeps
 * what it showed then, a quarter still running then marked so, however long ago that was. */
function keptDay(data: CanvasData, row: Pick<Row, "period_end">): CanvasData {
  return { ...data, today: dayAfter(row.period_end) };
}

/** A Snapshot's frozen part with its data and Breakdown labels opened; ones frozen before sealing pass as they are. Null
 * when the data does not open: the Snapshot then reads as missing. */
async function openedFrozen(ws: string, snapshotId: number, frozen: Frozen): Promise<Frozen | null> {
  const cipher = await workspaceCipher(ws);
  const opened = openFrozenData(cipher, "dashboard_snapshots", snapshotId, frozen);
  return opened && { ...opened, data: mapBreakdownLabels(opened.data, opening(cipher, "dashboard_snapshots", snapshotId), "frozen.data.") };
}

/** A Snapshot's words sealed for it, as they are stored (spec 0028): bound to the Workspace and the Snapshot. */
export async function sealedWords(ws: string, snapshotId: number, words: SnapshotWords): Promise<Record<string, unknown>> {
  return sealObject(await workspaceCipher(ws), { table: "dashboard_snapshots", column: "words", row: snapshotId }, words);
}

/** The words of a Snapshot row, opened; plain ones from before sealing pass as they are, ones that do not open read as
 * none. */
async function readWords(ws: string, row: { id: number; words?: unknown }): Promise<SnapshotWords> {
  return openObject(await workspaceCipher(ws), { table: "dashboard_snapshots", column: "words", row: row.id }, row.words) as SnapshotWords;
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
  const words = await readWords(actor.workspaceId, row);
  const seen = await forReader(actor, withWords(frozen.widgets, words), keptDay(frozen.data, row), frozen.themeId);
  const corrections = await correctionsFor(actor, seen.data);
  return { ...summary(row), name: frozen.name, themeId: frozen.themeId, intro: String(words.intro ?? ""), widgets: seen.widgets, data: seen.data, hiddenParts: seen.hidden, canWrite: writer, canDelete: role === "owner", corrections };
}

/** What of a Snapshot one reader gets (spec 0013, decided on #193): visibility carries all the way through, so only
 * the Metrics they may see now, as on the live dashboard. A widget that draws any other Metric stays out whole: its
 * title and settings can name it. `hidden` counts the widgets left out. A Guest is shown no one else of the people it
 * kept (the Workspace's, as its taker saw them). */
export async function forReader(actor: Pick<Actor, "personId" | "workspaceId"> & { role?: Actor["role"] }, widgets: Widget[], data: CanvasData, themeId: number | null, allowed?: readonly number[]): Promise<{ widgets: Widget[]; data: CanvasData; hidden: number }> {
  const [seen, yearStart, numberStyle] = await Promise.all([visibleMetricIds(actor.workspaceId, actor.personId, await getMetrics(actor.workspaceId)), yearStartOf(actor.workspaceId), numberStyleOf(actor.workspaceId)]);
  // A View Link also keeps to the Metrics agreed when it was made.
  const visible = allowed ? new Set([...seen].filter((m) => allowed.includes(m))) : seen;
  const shown = widgets.filter((w) => widgetMetricIds(w.metric_ids ?? [], w.settings).every((m) => visible.has(m)));
  const ids = new Set(data.metrics.map((m) => m.id).filter((m) => visible.has(m)));
  // Quarters are drawn from the workspace's year start now: a Snapshot taken under another keeps its values, and
  // Comparisons are computed, so they follow (spec 0017). Its numbers are written in the Number Style of now, and a
  // Metric kept before units had a side shows the unit its format used to add (spec 0022). Attainment is not only
  // written but computed differently by each method, so it keeps the Workspace's method and each Metric's own as they
  // were when it was taken; one taken before there was a choice keeps Ratio (#130).
  // The people frozen in it are those the person who took it saw: a Guest reads only themselves (peopleFor).
  const people = await peopleFor({ workspaceId: actor.workspaceId, personId: actor.personId, role: actor.role ?? "member" }, data.people);
  const kept = { ...data, people, metrics: data.metrics.map((m) => normalizeMetric(keptUnit(m))), yearStart, numberStyle, attainmentMethod: keptMethod(data.attainmentMethod) };
  return { widgets: shown, data: shownData(kept, ids, themeId), hidden: widgets.length - shown.length };
}

/** What a View Link to a Snapshot shows (#178), read from the Snapshot each time it is opened: what it kept and the
 * words written about it, nothing else. Null when it is a draft, deleted or of another dashboard. No Actor: the
 * link's owner chose to show it, as with any View Link (view-links.ts checks the link first). */
export async function snapshotForLink(snapshotId: number, dashboardId: number, keptWords?: SnapshotWords | null): Promise<{ name: string; themeId: number | null; intro: string; widgets: Widget[]; data: CanvasData; label: string; takenAt: string; words: SnapshotWords } | null> {
  const { data } = await db().from("dashboard_snapshots").select(`${SUMMARY}, workspace_id, frozen, words`).eq("id", snapshotId).eq("dashboard_id", dashboardId).is("deleted_at", null).not("shown_at", "is", null).maybeSingle();
  const row = data as unknown as Row | null;
  if (!row?.frozen) return null;
  const frozen = await openedFrozen(String(row.workspace_id), row.id, row.frozen);
  if (!frozen) return null;
  row.frozen = frozen;
  // A link shows the words as they were when its owner made it, if it kept them; changed since, they stay in Ziffr.
  const words = keptWords ?? await readWords(String(row.workspace_id), row);
  const widgets = withWords(row.frozen.widgets, words);
  return { name: row.frozen.name, themeId: row.frozen.themeId, intro: String(words.intro ?? ""), widgets, data: keptDay(row.frozen.data, row), label: row.label, takenAt: row.taken_at, words };
}

/** What a new deck made from a Snapshot starts with (#178): the dashboard's name and the period, the Snapshot's
 * introduction, and its widgets in reading order with the words written about them, each drawing only the Metric
 * periods complete by the period's last day. Only the widgets the person may see now (decided on #193); placing the
 * slides checks again that they see every Metric. */
export async function snapshotDeckSeed(actor: Actor, snapshotId: number): Promise<{ name: string; intro: string; widgets: Pick<Widget, "template" | "metric_ids" | "settings" | "title">[] }> {
  const { row } = await readable(actor, snapshotId, `${SUMMARY}, frozen, words`);
  const frozen = row.frozen as Frozen;
  const words = await readWords(actor.workspaceId, row);
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
function cleanWords(actor: Actor, input: unknown, widgetIds: Set<string>, current: SnapshotWords): SnapshotWords {
  const src = (input && typeof input === "object" ? input : {}) as { intro?: unknown; widgets?: unknown };
  const out: SnapshotWords = { intro: current.intro ?? "", widgets: { ...(current.widgets ?? {}) } };
  // A visitor's words go through the demo's text rules (the cleaned text is what is kept); words left as they were are not asked
  // again, since the editor sends them all back (spec 0051, ticket 10).
  const asked = (text: string, before: string | undefined, kind: "name" | "description") => (inDemoVisit(actor) && text !== (before ?? "") ? String(visitorOptionalText(actor, text, kind)) : text);
  if (src.intro !== undefined) out.intro = asked(String(src.intro ?? ""), current.intro, "description").slice(0, MAX_INTRO);
  if (src.widgets !== undefined) {
    if (!src.widgets || typeof src.widgets !== "object" || Array.isArray(src.widgets)) throw new Error("These words cannot be saved.");
    for (const [id, w] of Object.entries(src.widgets as Record<string, unknown>)) {
      // Only widgets the Snapshot has, and only their words: its numbers, charts and layout stay as they were.
      if (!widgetIds.has(id) || !w || typeof w !== "object" || Array.isArray(w)) throw new Error("These words cannot be saved.");
      const next: WidgetWords = {};
      for (const [k, v] of Object.entries(w as Record<string, unknown>)) {
        if (!(WORD_KEYS as readonly string[]).includes(k)) throw new Error("Only the words of a Snapshot can be changed.");
        const text = asked(String(v ?? ""), current.widgets?.[id]?.[k as WordKey], k === "title" || k === "kicker" || k === "headline" ? "name" : "description").slice(0, MAX_WORD);
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
  // A Snapshot the seed made keeps its words (a landing page example): refused here, before any write.
  await refuseSeeded(actor, "dashboard_snapshots", snapshotId);
  const frozen = row.frozen as Frozen;
  // Only the widgets this writer gets in the Snapshot (#193): a widget drawing a Metric they do not see keeps its words.
  const seen = await forReader(actor, frozen.widgets, frozen.data, frozen.themeId);
  const current = await readWords(actor.workspaceId, row);
  const next = cleanWords(actor, words, new Set(seen.widgets.map((w) => String(w.id))), current);
  if (JSON.stringify(next) === JSON.stringify(current)) return;
  await ensureBaseline("snapshot", snapshotId, actor.personId);
  const { error } = await db().from("dashboard_snapshots").update({ words: await sealedWords(actor.workspaceId, snapshotId, next) }).eq("id", snapshotId).eq("workspace_id", actor.workspaceId);
  if (error) throw new Error("The words could not be saved.");
  // Said after the write, from the row as it is now: a Snapshot shown while this edit was under way (by a Workflow, say) is one whose words changed since.
  await db().from("dashboard_snapshots").update({ words_changed_at: new Date().toISOString() }).eq("id", snapshotId).eq("workspace_id", actor.workspaceId).not("shown_at", "is", null);
  await recordVersion("snapshot", snapshotId, actor.personId);
}

/** The words a restored Version brings back for this actor: the old introduction and the old words of the widgets
 * they get in the Snapshot; a widget drawing a Metric they do not see keeps its words as they are now (#193). */
export async function restorableWords(actor: Actor, snapshotId: number, old: unknown): Promise<SnapshotWords> {
  const { data } = await db().from("dashboard_snapshots").select("id, frozen, words").eq("id", snapshotId).eq("workspace_id", actor.workspaceId).is("deleted_at", null).maybeSingle();
  const row = data as { id: number; frozen: Frozen | null; words: SnapshotWords | null } | null;
  const kept = row?.frozen ? await openedFrozen(actor.workspaceId, snapshotId, row.frozen) : null;
  if (!row || !kept) throw new Forbidden();
  row.frozen = kept;
  const seen = new Set((await forReader(actor, kept.widgets, kept.data, kept.themeId)).widgets.map((w) => String(w.id)));
  const before = (old && typeof old === "object" && !Array.isArray(old) ? old : {}) as SnapshotWords;
  const now = await readWords(actor.workspaceId, row);
  const widgets: Record<string, WidgetWords> = {};
  for (const w of kept.widgets) {
    const id = String(w.id);
    const pick = seen.has(id) ? before.widgets?.[id] : now.widgets?.[id];
    if (pick && typeof pick === "object") widgets[id] = pick;
  }
  return { intro: typeof before.intro === "string" ? before.intro : String(now.intro ?? ""), widgets };
}

/** Ends a Snapshot's draft: everyone who may open the dashboard sees it from now on. Its owner and Editors; `workflowId` when a Workflow's Send Snapshot step does it. */
export async function showSnapshot(actor: Actor, snapshotId: number, opts: { workflowId?: number } = {}): Promise<void> {
  const { row, writer } = await readable(actor, snapshotId, "id, dashboard_id, label, shown_at");
  if (!writer) throw new Forbidden();
  if (row.shown_at) return;
  await refuseSeeded(actor, "dashboard_snapshots", snapshotId);
  // A Workflow shows only a draft nobody has written in (a Version exists once someone does), decided in the same statement
  // that shows it, so a word written meanwhile cannot slip in between; one written in is left for its writer.
  if (opts.workflowId) {
    const { data: shown, error } = await db().rpc("show_untouched_snapshot", { p_workspace: actor.workspaceId, p_id: snapshotId, p_by: actor.personId });
    if (error) throw new Error("The Snapshot could not be shown.");
    if (!shown) throw new Refused("This Snapshot has been written in: show it by hand.");
  } else {
    const { error } = await db().from("dashboard_snapshots").update({ shown_at: new Date().toISOString(), shown_by: actor.personId }).eq("id", snapshotId).eq("workspace_id", actor.workspaceId).is("shown_at", null);
    if (error) throw new Error("The Snapshot could not be shown.");
  }
  const { data: d } = await db().from("dashboards").select("name").eq("id", row.dashboard_id).eq("workspace_id", actor.workspaceId).maybeSingle();
  await audit(actor, { kind: "snapshot.shown", object: { type: "dashboard", id: row.dashboard_id, name: d?.name ?? null }, details: { snapshot_id: snapshotId, period: row.label, ...(opts.workflowId ? { via: "workflow", workflow_id: opts.workflowId } : {}) } });
}

/** Deletes a Snapshot: its numbers and words go; only that it existed stays, so it is not taken again by itself.
 * Only the dashboard's owner, as with deleting the dashboard. */
export async function deleteSnapshot(actor: Actor, snapshotId: number): Promise<void> {
  const { row, role } = await readable(actor, snapshotId, "id, dashboard_id, label, shown_at");
  if (role !== "owner") throw new Forbidden();
  // The seed's Snapshots are never deleted in the demo: refused here, before any write.
  await refuseSeeded(actor, "dashboard_snapshots", snapshotId);
  const { error } = await db().from("dashboard_snapshots").update({ deleted_at: new Date().toISOString(), deleted_by: actor.personId, frozen: null, words: {} }).eq("id", snapshotId).eq("workspace_id", actor.workspaceId).is("deleted_at", null);
  if (error) throw new Error("The Snapshot could not be deleted.");
  // Its Versions held its words: they go with it.
  await db().from("versions").delete().eq("object_type", "snapshot").eq("object_id", snapshotId);
  const { data: d } = await db().from("dashboards").select("name").eq("id", row.dashboard_id).eq("workspace_id", actor.workspaceId).maybeSingle();
  await audit(actor, { kind: "snapshot.deleted", object: { type: "dashboard", id: row.dashboard_id, name: d?.name ?? null }, details: { snapshot_id: snapshotId, period: row.label } });
}

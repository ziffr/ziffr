// Adding a line to what a Pack set up (spec 0058, #1182; GLOSSARY: Pack, Repeat, Position, Workflow, Widget): one more
// salesperson, site or company. Only that line is made. What was set up already is changed only where the person ticks
// it and may change it: the new Metrics joining the shared Workflow and the widgets that show the lines. The rest is
// listed to do by hand.
// Security: Owners and Admins, checked by the caller. The record only says where to look: whether a thing is still
// there, whether the actor sees it and may change it is asked again of the Workspace as it is, and every change goes
// through the core operation used by hand. Only dashboards and Metrics the actor sees are named.
import { db } from "./db";
import type { Actor } from "./actor";
import { getShares, visibleDashboards, visibleMetricIds } from "./access";
import { openRows } from "./sealed-columns";
import { openWorkflowRows } from "./workflow-rows";
import { isView, templateOf } from "./widget-templates";
import { tagSourceId } from "./tag-source";
import { listed } from "./pack-places";
import { recordedSetups, type MadeThing } from "./pack-setup-record";
import { assertSetsUp, installedForSetup } from "./pack-setup-install";
import type { PlannedMetric } from "./pack-setup-build";
import type { Metric, WidgetSettings } from "./types";
import type { PackPlaces } from "./pack-places";

/** The most Metrics a widget of a list takes from one more line. */
const WIDGET_METRICS_MAX = 50;

/** What a new line is added to, as the Workspace is now. */
export type AddingTo = {
  repeat: string;
  /** The lines there are already, whose names a new one may not take. */
  taken: { repeat: string; name: string }[];
  /** The Metrics made from entries outside every Repeat, by entry: a new line's Metrics are computed from them and
   * its dashboard shows them. Only ones the actor sees and that are not archived. */
  given: Map<string, Metric>;
  /** Those of `given` the actor may compute a Metric from: they own or edit them. */
  mayCompute: Set<string>;
  made: MadeThing[];
  /** The Workspace's Metrics in use, for the lines there are. */
  active: Map<number, Metric>;
  seen: Set<number>;
};

/** What a person has made of a Repeat, read from the record and held to the Workspace as it is. */
export async function addingTo(actor: Actor, installId: number, repeat: string, metrics: Metric[], running?: number): Promise<AddingTo> {
  const record = await recordedSetups(actor, installId, running);
  if (!record.lines.some((l) => l.repeat === repeat)) throw new Error("Nothing of this was set up from the Pack here yet. Set it up first.");
  const active = new Map(metrics.filter((m) => !(m as { archived_at?: unknown }).archived_at).map((m) => [m.id, m]));
  const seen = await visibleMetricIds(actor.workspaceId, actor.personId, metrics);
  const given = new Map<string, Metric>();
  // The latest one still there wins.
  for (const t of record.made) if (t.kind === "metric" && t.line === null && active.has(t.id) && seen.has(t.id)) given.set(t.key, active.get(t.id)!);
  const edits = new Set((await getShares(actor.workspaceId)).filter((s) => s.object_type === "metric" && s.user_id === actor.personId && s.role === "editor").map((s) => s.object_id));
  const mayCompute = new Set([...given].filter(([, m]) => m.owner_id === actor.personId || edits.has(m.id)).map(([k]) => k));
  return { repeat, taken: record.lines, given, mayCompute, made: record.made, active, seen };
}

/** Something already set up that the new line may be added to, as the person ticks it. */
export type Offer = { id: string; words: string; on: boolean };
/** What adding a line changes of what is there, and what is left to do by hand. */
export type Additions = {
  offers: Offer[];
  byHand: string[];
  /** The shared Workflow the new Metrics join, when ticked, or null. */
  join: number | null;
  /** The widgets that take the new Metrics, when ticked: which of them, by the number that stands for each. */
  widgets: { id: number; dashboard: { id: number; name: string }; add: number[] }[];
};

/** Nothing to add to: a Set up that adds no line. */
export const NO_ADDITIONS: Additions = { offers: [], byHand: [], join: null, widgets: [] };

/** Where the new line's Metrics may be added to what is there: the shared Workflow, only when it is the actor's, and
 * each widget of several Metrics that shows most lines' Metrics of an entry, only on a dashboard they may change. `ticked` are
 * the offers the person ticked; nothing else changes. */
export async function additionsFor(actor: Actor, to: AddingTo, places: PackPlaces, metrics: PlannedMetric[], ticked: ReadonlySet<string>): Promise<Additions> {
  const ws = actor.workspaceId;
  const out: Additions = { offers: [], byHand: [], join: null, widgets: [] };
  const offer = (id: string, words: string) => { out.offers.push({ id, words, on: ticked.has(id) }); return ticked.has(id); };
  const shared = (kind: MadeThing["kind"]) => to.made.filter((t) => t.kind === kind && t.line === null);

  // The shared Workflow: for new Metrics that take values and follow no Workflow of their own line.
  const joining = metrics.filter((m) => !m.entry.formula && !m.workflow).map((m) => m.name);
  const flowIds = shared("workflow").map((t) => t.id);
  const { data } = await db().from("workflows").select("id, name, owner_id, config").eq("workspace_id", ws).in("id", flowIds);
  const flows = await openWorkflowRows(ws, data);
  const flow = [...flows].sort((a, b) => Number(b.id) - Number(a.id))[0];
  if (flow && joining.length) {
    if (flow.owner_id === actor.personId) {
      if (offer(`workflow:${flow.id}`, `Add ${listed(joining)} to the Workflow ${flow.name}: it asks for them, and its Approvers read the values they approve.`)) out.join = Number(flow.id);
    } else out.byHand.push(`The Workflow ${flow.name} is not yours to change, so ${listed(joining)} ${joining.length === 1 ? "does" : "do"} not follow it. Its owner can choose it on each Metric's page.`);
  }

  // The widgets that show most of the lines there are of an entry.
  const boardIds = [...new Set(shared("dashboard").map((t) => t.id))];
  const mine = new Map((await visibleDashboards(ws, actor.personId)).map((d) => [d.id, d]));
  const unseen = boardIds.filter((id) => !mine.has(id));
  const { data: existing } = await db().from("dashboards").select("id").eq("workspace_id", ws).in("id", unseen);
  if (existing?.length) out.byHand.push(`${existing.length} dashboard${existing.length === 1 ? "" : "s"} of this set that you cannot see ${existing.length === 1 ? "is" : "are"} left as ${existing.length === 1 ? "it is" : "they are"}.`);
  const seenBoards = boardIds.filter((id) => mine.has(id));
  const { data: rows } = await db().from("widgets").select("id, dashboard_id, template, title, metric_ids, settings").eq("workspace_id", ws).in("dashboard_id", seenBoards).order("id");
  for (const w of await openRows("widgets", ws, rows)) {
    const settings = (w.settings ?? {}) as WidgetSettings;
    const shows = new Set((w.metric_ids as number[]).map(Number));
    // A widget of several Metrics: its view takes a list, or it holds one already. A Tag widget keeps itself up to date,
    // and a widget that draws Panels or a free layout names its Metrics inside them.
    const template = String(w.template);
    if (tagSourceId(settings) !== null || !isView(template) || settings.panels?.length) continue;
    if (shows.size < 2 && !templateOf({ template, settings }).slots.some((x) => x.multiple)) continue;
    const add = metrics.filter((m) => {
      const lines = to.made.filter((t) => t.kind === "metric" && t.key === m.entry.pack_key && t.line?.repeat === to.repeat && to.active.has(t.id));
      // Most lines, not all: one left off a widget (or added without it) does not stop the widget being offered again.
      return 2 * lines.filter((t) => shows.has(t.id)).length > lines.length;
    });
    if (!add.length || shows.size + add.length > WIDGET_METRICS_MAX) continue;
    const board = mine.get(Number(w.dashboard_id))!;
    const names = listed(add.map((m) => m.name));
    if (board.role === "viewer") out.byHand.push(`You may not change the dashboard ${board.name}: its owner can add ${names} there.`);
    else if (offer(`widget:${w.id}`, `Add ${names} to ${w.title ? `“${String(w.title)}”` : "a widget"} on the dashboard ${board.name}. Whoever it is shared with sees them.`)) out.widgets.push({ id: Number(w.id), dashboard: { id: board.id, name: board.name }, add: add.map((m) => m.plan) });
  }

  // What the Pack says of the shared items for each of the Repeat's people is not changed: said, to do by hand.
  const positions = new Map(places.positions.filter((p) => p.per === to.repeat).map((p) => [p.key, p.name]));
  const named = (keys: (string | undefined)[]) => [...new Set(keys.flatMap((k) => (k !== undefined && positions.has(k) ? [positions.get(k)!] : [])))];
  for (const f of flows) {
    const key = shared("workflow").find((t) => t.id === Number(f.id))!.key;
    const w = places.workflows.find((x) => x.key === key);
    const who = named([...(w?.steps ?? []).flatMap((s) => [s.assignee, s.standIn, ...(s.to ?? [])]), ...(w?.tells ?? []).flatMap((t) => t.to ?? [])]);
    if (who.length) out.byHand.push(`The Workflow ${f.name} also names each ${listed(who)} in a step: add the new people there by hand.`);
  }
  const proposals: [string, string[]][] = [
    ...shared("dashboard").flatMap((t): [string, string[]][] => { const d = mine.get(t.id); const x = places.dashboards.find((y) => y.key === t.key); return d ? [[`the dashboard ${d.name}`, named([...(x?.viewers ?? []), ...(x?.editors ?? [])])]] : []; }),
    ...[...to.given].map(([k, m]): [string, string[]] => { const x = places.metrics.find((y) => y.key === k); return [`the Metric ${m.name}`, named([...(x?.viewers ?? []), ...(x?.editors ?? [])])]; }),
  ];
  for (const [item, who] of proposals) if (who.length) out.byHand.push(`The Pack proposes to share ${item} with each ${listed(who)}: share it by hand if the new people should see it.`);
  out.byHand = [...new Set(out.byHand)];
  return out;
}

/** What "Add a …" on a Pack's page starts with: what each line got so far, who holds the Positions outside the Repeat,
 * and the names taken. All of it may be changed before anything is made. */
export type LineStart = { metrics: string[]; dashboard: string; workflow: string; people: Record<string, string[]>; lines: string[] };

/** Reads what adding a line of a Repeat starts with (Owners and Admins). */
export async function packLineStart(actor: Actor, installId: number, repeat: string): Promise<LineStart> {
  assertSetsUp(actor);
  const p = await installedForSetup(actor, Number(installId));
  const record = await recordedSetups(actor, p.install.id);
  const lines = record.lines.filter((l) => l.repeat === String(repeat)).map((l) => l.name);
  if (!lines.length) throw new Error("Nothing of this was set up from the Pack here yet. Set it up first.");
  const made = (kind: MadeThing["kind"]) => [...new Set(record.made.filter((t) => t.kind === kind && t.line?.repeat === String(repeat)).map((t) => t.key))];
  // For each Position, the people of the latest Set up that put someone there.
  const latest = new Map<string, number>(record.people.map((x) => [x.position, x.setup]));
  const people: Record<string, string[]> = {};
  for (const x of record.people) if (latest.get(x.position) === x.setup) (people[x.position] ??= []).push(x.person);
  return {
    metrics: made("metric").filter((k) => p.entries.has(k)),
    dashboard: made("dashboard").find((k) => p.dashboards.has(k)) ?? "",
    workflow: made("workflow").find((k) => p.workflows.has(k)) ?? "",
    people,
    lines,
  };
}

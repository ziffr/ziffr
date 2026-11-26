// Deleting several Metrics, or one, from the app (spec 0065; GLOSSARY: Metric, Metric Owner, Metric Record, Derived
// Metric, Total, Dashboard, Widget, Deck, View Link, Archived Metric): one preview of what can go and what stands in the
// way, the changes a person ticks (taking Metrics off dashboards and decks, revoking View Links), and the deletion
// itself, which needs the record of exactly this set downloaded as it is now.
// Visibility and rights: nobody gains a right. Only the Metric Owner deletes (deleteMetric checks again), a dashboard or
// deck is changed only by who may change it, a View Link revoked only by who may revoke it, through the same operations
// as by hand. The preview names a Metric, dashboard or deck only to someone who may see it; the rest are counted. Ids
// and ticks come from a browser and are untrusted.
import { createHash } from "node:crypto";
import { visibleDashboards, visibleDecks, visibleMetricIds } from "./access";
import { archiveEach } from "./archived-metrics";
import { Forbidden, Refused, type Actor } from "./actor";
import { removeWidget, updateWidget } from "./dashboards";
import { db } from "./db";
import { readersNow } from "./deleted-metrics";
import { saveDeck } from "./decks";
import { refuseInDemo } from "./demo";
import { DEMO_WORKSPACE_ID } from "./team";
import { formulaInputs } from "./formula";
import { confirms, confirmWords, deckWithout, DELETE_METRICS, deletionOrder, listWithout, type DeckWithout } from "./metric-delete-rules";
import { isArchived } from "./metric-row";
import { deleteMetric, MetricKept } from "./metrics";
import { buildMetricRecord, recordDownloaded } from "./metric-record";
import type { Metric, Widget } from "./types";
import { allDeckMetricIds } from "./visibility";
import { revokeViewLink } from "./view-links";
import { widgetMetricIds } from "./widget-metrics";
import { allRows, getMetrics, mustRead } from "./workspace-data";

/** What the person ticked: the changes Ziffr may make so that Metrics can be deleted. */
export type DeleteChoices = { dashboards: boolean; decks: boolean; viewLinks: boolean };

/** One picked Metric in the preview: whether it can be deleted with the ticks given, why not, and whether the actor
 * may archive it instead. */
export type PlannedMetric = { id: number; name: string; archived: boolean; archivable: boolean; deletable: boolean; reasons: string[] };

/** The preview of a deletion. */
export type DeletePlan = {
  metrics: PlannedMetric[];
  /** The Metrics that can be deleted with the ticks given, in the order they would be. */
  ids: number[];
  /** What to type to confirm deleting them; empty when none can be. */
  confirm: string;
  /** What each tick would change, one line a place; empty when there is nothing of its kind to tick. */
  dashboards: string[];
  decks: string[];
  viewLinks: string[];
  /** A fingerprint of exactly what the ticks would change: the deletion asks for it, so nothing is changed that was
   * not listed. */
  seen: string;
  /** Whether a Total that is not picked counts a picked Metric that is not archived: it matters when archiving. */
  countedByTotals: boolean;
};

const DEMO_KEEPS = "The demo does not delete Metrics.";
const CHANGED = "Something changed since the preview. Look at it again.";
const UNREAD = "What uses these Metrics could not be read. Try again in a moment.";
const NO_TICKS: DeleteChoices = { dashboards: false, decks: false, viewLinks: false };

type DashboardPlace = { id: number | null; name: string; changeable: boolean; seen: boolean; owner: string };
type DeckPlace = { id: number; name: string; changeable: boolean; seen: boolean; document: unknown };
type LinkPlace = { id: number; revocable: boolean; name: string | null; what: string; metricIds: number[] };

/** Everything a deletion of the picked Metrics is decided from. */
type Facts = {
  all: Metric[];
  picked: Metric[];
  visible: Set<number>;
  widgets: (Widget & { place: DashboardPlace; uses: number[] })[];
  decks: (DeckPlace & { uses: number[] })[];
  links: LinkPlace[];
};

/** The ids as asked, if they are a list of at most DELETE_METRICS whole numbers. */
function asked(ids: unknown): number[] {
  const list = Array.isArray(ids) ? [...new Set(ids)] : [];
  if (!list.length || list.length > DELETE_METRICS || !list.every((id) => Number.isSafeInteger(id))) throw new Refused(`Pick between 1 and ${DELETE_METRICS} Metrics.`);
  return list as number[];
}

/** Only the three ticks, each on only when it says exactly true. */
function ticked(choices: unknown): DeleteChoices {
  const c = (choices && typeof choices === "object" ? choices : {}) as Partial<Record<keyof DeleteChoices, unknown>>;
  return { dashboards: c.dashboards === true, decks: c.decks === true, viewLinks: c.viewLinks === true };
}

async function facts(actor: Actor, ids: unknown): Promise<Facts> {
  if (actor.key || !actor.personId) throw new Forbidden();
  const wanted = new Set(asked(ids));
  const ws = actor.workspaceId;
  const all = await getMetrics(ws);
  const visible = await visibleMetricIds(ws, actor.personId, all);
  // A Metric the person does not see is left out as if it did not exist; their own they may always delete.
  const picked = all.filter((m) => wanted.has(m.id) && (visible.has(m.id) || m.owner_id === actor.personId));
  if (!picked.length) throw new Refused("Pick at least one Metric you can see.");
  const mine = new Set(picked.filter((m) => m.owner_id === actor.personId).map((m) => m.id));
  const usesOf = (named: number[]) => named.filter((id) => mine.has(id));
  const read = <T>(table: string, columns: string) => allRows<T>((from, to) => mustRead(db().from(table).select(columns).eq("workspace_id", ws).order("id").range(from, to) as unknown as PromiseLike<{ data: T[] | null; error: unknown }>, UNREAD));
  const today = new Date().toISOString().slice(0, 10);
  const [widgetRows, deckRows, linkRows, dashboardRows, dashboards, decks] = await Promise.all([
    read<Widget>("widgets", "id, dashboard_id, owner_id, template, metric_ids, settings, title"),
    read<{ id: number; document: unknown }>("decks", "id, document"),
    allRows<{ id: number; object_type: "dashboard" | "deck"; object_id: number; label: string | null; expires_at: string; metric_ids: unknown[] | null; snapshot_id: number | null }>((from, to) =>
      mustRead(db().from("view_links").select("id, object_type, object_id, label, expires_at, metric_ids, snapshot_id").eq("workspace_id", ws).is("revoked_at", null).gte("expires_at", today).order("id").range(from, to), UNREAD)),
    read<{ id: number; name: string; owner_id: string }>("dashboards", "id, name, owner_id"),
    visibleDashboards(ws, actor.personId),
    visibleDecks(ws, actor.personId),
  ]);
  const roles = new Map(dashboards.map((d) => [d.id, d.role]));
  const deckSeen = new Map(decks.map((d) => [d.id, d]));
  const changes = (role: string | undefined) => role === "owner" || role === "editor";
  const placeOf = (w: Widget): DashboardPlace => {
    // A saved widget (the Pool) is its owner's alone.
    if (w.dashboard_id === null) {
      const own = w.owner_id === actor.personId;
      return { id: null, name: "Your saved widgets", changeable: own, seen: own, owner: String(w.owner_id) };
    }
    const d = dashboardRows.find((x) => x.id === w.dashboard_id);
    const role = roles.get(w.dashboard_id);
    return { id: w.dashboard_id, name: role ? String(d?.name ?? "") : "", changeable: changes(role), seen: Boolean(role), owner: String(d?.owner_id ?? "") };
  };
  const widgets = widgetRows.flatMap((w) => {
    const uses = usesOf(widgetMetricIds(w.metric_ids ?? [], w.settings));
    return uses.length ? [{ ...w, place: placeOf(w), uses }] : [];
  });
  const decksUsing = deckRows.flatMap((d) => {
    const uses = usesOf(allDeckMetricIds(d.document));
    const seen = deckSeen.get(d.id);
    return uses.length ? [{ id: d.id, name: seen?.name ?? "", seen: Boolean(seen), changeable: changes(seen?.role), document: d.document, uses }] : [];
  });
  const links = linkRows.flatMap((l): LinkPlace[] => {
    const metricIds = usesOf((l.metric_ids ?? []).map(Number));
    if (!metricIds.length) return [];
    const object = l.object_type === "deck" ? deckSeen.get(l.object_id) : dashboards.find((d) => d.id === l.object_id);
    // A View Link is revoked by the owner of what it shows.
    const revocable = object?.owner_id === actor.personId;
    const name = object ? String(object.name) : null;
    const what = `${l.object_type === "deck" ? "deck" : l.snapshot_id ? "Snapshot of the dashboard" : "dashboard"}${l.label ? `, “${l.label}”` : ""}, until ${l.expires_at}`;
    return [{ id: l.id, revocable, name, what, metricIds }];
  });
  return { all, picked, visible, widgets, decks: decksUsing, links };
}

/** "Sales, Cost and 2 you cannot see": what may be named, and a count of the rest. */
function listed(names: string[], hidden: number, unseen: string): string {
  const known = [...new Set(names)].sort((a, b) => a.localeCompare(b));
  if (!hidden) return known.join(", ");
  const rest = `${hidden} ${unseen}`;
  return known.length ? `${known.join(", ")} and ${rest}` : rest;
}

const count = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/** Who reads each Metric: the Metrics whose formula names it, a Total's formula naming what it adds up. */
function readersOf(all: Metric[]): Map<number, number[]> {
  const bySlug = new Map(all.map((m) => [m.slug, m.id]));
  const out = new Map<number, number[]>();
  for (const m of all) {
    for (const slug of m.formula ? formulaInputs(m.formula) : []) {
      const input = bySlug.get(slug);
      if (input !== undefined && input !== m.id) out.set(input, [...(out.get(input) ?? []), m.id]);
    }
  }
  return out;
}

/** What stands in a Metric's way that no tick removes. */
function standing(actor: Actor, f: Facts, m: Metric): string[] {
  if (actor.workspaceId === DEMO_WORKSPACE_ID) return [DEMO_KEEPS];
  if (m.owner_id !== actor.personId) return ["Only its Metric Owner deletes it."];
  const out: string[] = [];
  const fixed = f.widgets.filter((w) => w.uses.includes(m.id) && !w.place.changeable);
  const boards = fixed.filter((w) => w.place.id !== null);
  if (boards.length) {
    const hidden = new Set(boards.filter((w) => !w.place.seen).map((w) => w.place.id)).size;
    out.push(`It is on dashboards you cannot change: ${listed(boards.filter((w) => w.place.seen).map((w) => w.place.name), hidden, "you cannot open")}.`);
  }
  if (fixed.some((w) => w.place.id === null)) out.push("Someone else has it in a saved widget.");
  const decks = f.decks.filter((d) => d.uses.includes(m.id));
  const locked = decks.filter((d) => !d.changeable);
  if (locked.length) out.push(`It is in decks you cannot change: ${listed(locked.filter((d) => d.seen).map((d) => d.name), locked.filter((d) => !d.seen).length, "you cannot open")}.`);
  // A deck that would still name it afterwards cannot be cleared from here.
  const stuck = decks.filter((d) => d.changeable && allDeckMetricIds(deckWithout(d.document, new Set([m.id])).document).includes(m.id));
  if (stuck.length) out.push(`Take it out of these decks by hand: ${listed(stuck.map((d) => d.name), 0, "")}.`);
  const links = f.links.filter((l) => l.metricIds.includes(m.id) && !l.revocable);
  if (links.length) out.push(`A View Link that still works shows it, and only the owner of what it shows revokes it: ${listed(links.flatMap((l) => l.name ?? []), links.filter((l) => l.name === null).length, "you cannot open")}.`);
  return out;
}

/** What stands in a Metric's way until its tick is on. */
function untickedFor(f: Facts, m: Metric, c: DeleteChoices): string[] {
  const out: string[] = [];
  if (!c.dashboards && f.widgets.some((w) => w.uses.includes(m.id) && w.place.changeable)) out.push("It is on a dashboard or in your saved widgets. Tick “Take them off dashboards” to include it.");
  if (!c.decks && f.decks.some((d) => d.uses.includes(m.id) && d.changeable)) out.push("It is in a deck. Tick “Take them out of decks” to include it.");
  if (!c.viewLinks && f.links.some((l) => l.metricIds.includes(m.id) && l.revocable)) out.push("A View Link that still works shows it. Tick “Revoke these View Links” to include it.");
  return out;
}

/** Why a Metric cannot go because of the Metrics that read it: those not picked, and, where nothing else is said of
 * it (`alone`), those picked that are staying. */
function becauseRead(f: Facts, id: number, readers: Map<number, number[]>, picked: ReadonlySet<number>, going: ReadonlySet<number>, alone: boolean): string[] {
  const staying = (readers.get(id) ?? []).filter((r) => !going.has(r)).flatMap((r) => f.all.find((m) => m.id === r) ?? []);
  const say = (found: Metric[], words: (names: string) => string) =>
    found.length ? [words(listed(found.filter((m) => f.visible.has(m.id)).map((m) => m.name), found.filter((m) => !f.visible.has(m.id)).length, "you cannot see"))] : [];
  const unpicked = staying.filter((m) => !picked.has(m.id));
  const outside = [
    ...say(unpicked.filter((m) => !m.total), (n) => `Calculated from it: ${n}. Pick them too, or change their formulas.`),
    ...say(unpicked.filter((m) => m.total), (n) => `Added up by Totals: ${n}. Pick them too, or remove it from them.`),
  ];
  if (outside.length || !alone) return outside;
  return say(staying, (n) => `Read by ${n}, which cannot be deleted now.`);
}

/** The widgets as they would be after these Metrics go: whole ones removed, others kept with a shorter list. */
function widgetChanges(f: Facts, going: ReadonlySet<number>) {
  return f.widgets.filter((w) => w.place.changeable && w.uses.some((id) => going.has(id))).map((w) => {
    const rest = listWithout(w, going);
    // A list is saved only by someone who sees all of it; otherwise the widget goes whole, as they could remove it.
    return { widget: w, rest: rest && rest.every((id) => f.visible.has(id)) ? rest : null };
  });
}

function dashboardLines(f: Facts, going: ReadonlySet<number>): string[] {
  const places = new Map<number | null, { name: string; removed: number; trimmed: number }>();
  for (const { widget, rest } of widgetChanges(f, going)) {
    const p = places.get(widget.place.id) ?? places.set(widget.place.id, { name: widget.place.name, removed: 0, trimmed: 0 }).get(widget.place.id)!;
    if (rest) p.trimmed++;
    else p.removed++;
  }
  return [...places.values()].map((p) => `${p.name}: ${[p.removed && `removes ${count(p.removed, "widget")}`, p.trimmed && `takes them out of ${count(p.trimmed, "widget")}`].filter(Boolean).join(", ")}`).sort();
}

function deckLines(f: Facts, going: ReadonlySet<number>): string[] {
  return f.decks.filter((d) => d.changeable && d.uses.some((id) => going.has(id))).map((d) => {
    const w = deckWithout(d.document, going);
    const parts = [w.removed && `removes ${count(w.removed, "widget")}`, w.trimmed && `takes them out of ${count(w.trimmed, "widget")}`, w.emptied && `leaves their numbers empty in ${count(w.emptied, "text")}`];
    return `${d.name}: ${parts.filter(Boolean).join(", ")}`;
  }).sort();
}

/** Which widgets, decks and View Links the ticks change for the Metrics that go. */
function fingerprintOf(f: Facts, c: DeleteChoices, going: ReadonlySet<number>): string {
  const touched = (uses: number[]) => uses.some((id) => going.has(id));
  const changes = [
    c.dashboards ? widgetChanges(f, going).map((w) => [w.widget.id, w.rest]) : [],
    c.decks ? f.decks.filter((d) => d.changeable && touched(d.uses)).map((d) => [d.id, deckWithout(d.document, going)]).map(([id, w]) => [id, (w as DeckWithout).removed, (w as DeckWithout).trimmed, (w as DeckWithout).emptied]) : [],
    c.viewLinks ? f.links.filter((l) => l.revocable && touched(l.metricIds)).map((l) => l.id) : [],
  ];
  return createHash("sha256").update(JSON.stringify(changes)).digest("hex");
}

function planFrom(actor: Actor, f: Facts, choices: DeleteChoices): DeletePlan {
  const demo = actor.workspaceId === DEMO_WORKSPACE_ID;
  const readers = readersOf(f.all);
  const picked = new Set(f.picked.map((m) => m.id));
  const hard = new Map(f.picked.map((m) => [m.id, standing(actor, f, m)]));
  const soft = new Map(f.picked.map((m) => [m.id, hard.get(m.id)!.length ? [] : untickedFor(f, m, choices)]));
  const free = f.picked.filter((m) => !hard.get(m.id)!.length);
  // What could go with every tick on: what the ticks are offered for.
  const possible = new Set(deletionOrder(free.map((m) => m.id), readers));
  const ids = deletionOrder(free.filter((m) => !soft.get(m.id)!.length).map((m) => m.id), readers);
  const going = new Set(ids);
  const metrics = f.picked.map((m): PlannedMetric => {
    const own = [...hard.get(m.id)!, ...soft.get(m.id)!];
    const reasons = going.has(m.id) ? [] : [...own, ...(m.owner_id === actor.personId && !demo ? becauseRead(f, m.id, readers, picked, going, !own.length) : [])];
    const archivable = !demo && !isArchived(m) && actor.role !== "guest" && (m.owner_id === actor.personId || ((actor.role === "owner" || actor.role === "admin") && f.visible.has(m.id)));
    return { id: m.id, name: m.name, archived: isArchived(m), archivable, deletable: going.has(m.id), reasons };
  }).sort((a, b) => a.name.localeCompare(b.name));
  const nameOf = (id: number) => f.picked.find((m) => m.id === id)!.name;
  return {
    metrics,
    ids,
    confirm: ids.length ? confirmWords(ids.map(nameOf)) : "",
    dashboards: dashboardLines(f, possible),
    decks: deckLines(f, possible),
    viewLinks: f.links.filter((l) => l.revocable && l.metricIds.some((id) => possible.has(id))).map((l) => `${l.name}: ${l.what}`),
    seen: fingerprintOf(f, choices, going),
    countedByTotals: metrics.some((m) => m.archivable && (readers.get(m.id) ?? []).some((r) => !picked.has(r) && f.all.some((x) => x.id === r && x.total))),
  };
}

/** What deleting these Metrics would do with these ticks: which can go, why the others cannot, and what each tick
 * would change. Reading only. A Metric the actor may not see is left out. */
export async function planMetricDelete(actor: Actor, ids: unknown, choices: unknown = NO_TICKS): Promise<DeletePlan> {
  return planFrom(actor, await facts(actor, ids), ticked(choices));
}

/** What a deletion did. `stopped` names the first Metric that stayed after others, or changes, had gone through. */
export type DeleteResult = { deleted: { id: number; name: string; values: number }[]; stopped: { name: string; why: string } | null; changed: number };

/** Takes the Metrics off the decks and dashboards and revokes the View Links, as the ticks said and as by hand. */
async function makeChanges(actor: Actor, f: Facts, going: ReadonlySet<number>, done: { changed: number }): Promise<void> {
  // Decks first: a deck's save checks the most, so what could refuse does so before anything else has changed.
  for (const d of f.decks.filter((x) => x.changeable && x.uses.some((id) => going.has(id)))) {
    await saveDeck(actor, d.id, deckWithout(d.document, going).document);
    done.changed++;
  }
  for (const { widget, rest } of widgetChanges(f, going)) {
    // Settings are sealed in storage and are not sent back: only the list changes.
    if (rest) await updateWidget(actor, widget.id, { metricIds: rest });
    else await removeWidget(actor, widget.id);
    done.changed++;
  }
  for (const l of f.links.filter((x) => x.revocable && x.metricIds.some((id) => going.has(id)))) {
    await revokeViewLink(actor, l.id);
    done.changed++;
  }
}

/** Why something was refused, in words meant for a person; anything else is not repeated to them. */
function whyNot(e: unknown): string {
  if (e instanceof Refused || e instanceof Forbidden || e instanceof MetricKept) return e.message;
  console.error("Deleting Metrics stopped:", (e as Error)?.message ?? "unknown error");
  return "It could not be deleted. Try again in a moment.";
}

/** What is decided from, read now, and refused unless it is still what the person previewed. */
async function asPreviewed(actor: Actor, wanted: number[], choices: unknown, seen: unknown): Promise<{ f: Facts; plan: DeletePlan }> {
  const f = await facts(actor, wanted);
  const plan = planFrom(actor, f, ticked(choices));
  if (plan.ids.length !== wanted.length || !wanted.every((id) => plan.ids.includes(id)) || plan.seen !== seen) throw new Refused(CHANGED);
  return { f, plan };
}

/** Deletes exactly these Metrics, as previewed with these ticks (`seen` is the preview's fingerprint), for their Metric
 * Owner: `confirm` is what they typed, and the record of exactly this set must have been downloaded and still be what
 * the Metrics hold. Nothing is changed when any of that does not hold. Past Snapshots keep their copy for who saw each
 * Metric before this call. */
export async function deleteChosenMetrics(actor: Actor, ids: unknown, choices: unknown, confirm: unknown, seen: unknown): Promise<DeleteResult> {
  refuseInDemo(actor);
  const wanted = asked(ids);
  const { f, plan } = await asPreviewed(actor, wanted, choices, seen);
  const names = plan.ids.map((id) => f.picked.find((m) => m.id === id)!.name);
  if (!confirms(confirm, names)) throw new Refused(`Type ${plan.confirm} to confirm.`);
  const record = await buildMetricRecord(actor, plan.ids);
  const downloaded = await recordDownloaded(actor, record.digest);
  if (downloaded === "no") throw new Refused("Download the record first.");
  if (downloaded === "changed") throw new Refused("Something changed since you downloaded the record. Download it again.");
  // Asked before anything changes: who sees a Metric through a dashboard it is about to leave keeps it too.
  const readers = await readersNow(actor.workspaceId, f.all, plan.ids);
  const result: DeleteResult = { deleted: [], stopped: null, changed: 0 };
  try {
    // Read again: making the record takes a moment, and a deck saved meanwhile must not be written over.
    await makeChanges(actor, (await asPreviewed(actor, wanted, choices, seen)).f, new Set(plan.ids), result);
  } catch (e) {
    if (!result.changed) throw e;
    return { ...result, stopped: { name: names[0], why: `Some dashboards, decks or View Links were changed, but nothing was deleted. ${whyNot(e)}` } };
  }
  for (const [i, id] of plan.ids.entries()) {
    try {
      // A value or a reply that arrived since the record was checked would be lost without being in it.
      const now = await buildMetricRecord(actor, [id]);
      if (now.metrics[0].stored !== record.metrics.find((m) => m.id === id)!.stored) throw new Refused("Something new arrived for it. Download the record again.");
      const { values } = await deleteMetric(actor, id, names[i], { keptFor: readers.get(id) ?? [] });
      result.deleted.push({ id, name: names[i], values });
    } catch (e) {
      if (!result.deleted.length && !result.changed) throw e;
      return { ...result, stopped: { name: names[i], why: whyNot(e) } };
    }
  }
  return result;
}

/** Archives the picked Metrics that the actor may archive and that are not archived yet, instead of deleting them: they
 * ask for nothing more and keep everything. Returns how many were archived. */
export async function archiveChosenMetrics(actor: Actor, ids: unknown): Promise<number> {
  const plan = await planMetricDelete(actor, ids);
  const open = plan.metrics.filter((m) => m.archivable).map((m) => m.id);
  if (!open.length) throw new Refused("There is nothing here you can archive.");
  return archiveEach(actor, open);
}

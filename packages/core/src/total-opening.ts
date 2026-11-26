// Opening and closing a Total (GLOSSARY: Total; spec 0058, "Opening a Total", decided by the owner on 2026-11-26). An
// open Total shows its sums to people who do not see every Metric it adds up. Only its owner opens it, at the screen,
// never a program and never in the demo, after being shown who learns what; if any of that changed before they confirm,
// they are asked again. Closing takes effect at once, and handing the Total over closes it.
import { createHash } from "node:crypto";
import { Forbidden, Refused, type Actor } from "./actor";
import { visibilityOfMany, visibleDashboards, visibleDecks, visibleMetricIds } from "./access";
import { audit } from "./audit-log";
import { db } from "./db";
import { refuseInDemo } from "./demo";
import { shareableBy } from "./derived-metrics";
import { formulaInputs } from "./formula";
import { snapshotsHolding, workspaceToday } from "./retention-setting";
import { peopleIn } from "./submissions";
import { readParts } from "./total-parts";
import type { TotalPart } from "./totals";
import { recordVersion } from "./versions";
import { getMetrics } from "./workspace-data";

// As many names as a list shows; the rest is counted.
const MOST_NAMED = 20;

/** Named things where the owner may see them, and how many there are in all. */
export type Shown = { count: number; names: string[] };

/** What opening a Total would show, as its owner confirms it. */
export type TotalOpening = {
  name: string;
  /** The Metrics it adds up, with the periods each counts in. */
  parts: { name: string; first: string; last: string | null }[];
  /** Who will newly see its numbers; `learns` names the one Metric whose numbers they can then work out, where they see
   * every other. */
  people: { name: string; learns: string | null }[];
  /** Working View Links and Snapshots that show it, and formulas that read it. */
  viewLinks: Shown;
  snapshots: Shown;
  formulas: Shown;
  /** Says "these lists are what I was shown": opening asks for it back. */
  fingerprint: string;
};

// The Total and its owner, who alone may open it, at the screen; refused for anyone else in the same words.
async function ownTotal(actor: Actor, totalId: number) {
  if (actor.key || actor.role === "guest" || !Number.isInteger(totalId)) throw new Forbidden();
  refuseInDemo(actor);
  const all = await getMetrics(actor.workspaceId);
  const total = all.find((m) => m.id === totalId);
  if (!total?.total || total.owner_id !== actor.personId) throw new Forbidden("Only the Total's owner opens it or closes it.");
  return { all, total };
}

const rowsOf = (parts: TotalPart[]) => [...parts].sort((a, b) => a.part - b.part);

async function read(actor: Actor, totalId: number): Promise<{ view: TotalOpening; listed: string[] }> {
  const ws = actor.workspaceId;
  const { all, total } = await ownTotal(actor, totalId);
  const mine = await shareableBy(ws, actor.personId, all);
  const parts = rowsOf((await readParts(ws))[total.id] ?? []);
  if (total.inputs_withheld || !parts.every((p) => mine.has(p.part))) throw new Refused("You open a Total only while you own or edit every Metric it adds up.");
  if (!parts.length) throw new Refused("It adds up no Metric yet.");
  const nameOf = new Map(all.map((m) => [m.id, m.name]));
  const [sight, members, people, visible, dashboards, decks, today] = await Promise.all([
    visibilityOfMany(ws, all),
    db().from("memberships").select("user_id").eq("workspace_id", ws).order("user_id"),
    peopleIn(ws),
    visibleMetricIds(ws, actor.personId, all),
    visibleDashboards(ws, actor.personId),
    visibleDecks(ws, actor.personId),
    workspaceToday(ws),
  ]);
  if (members.error) throw new Error("Who would see it could not be read. Try again in a moment.");
  const personName = new Map(people.map((p) => [p.id, p.name]));
  const newly = (members.data ?? []).flatMap((m) => {
    const id = m.user_id as string;
    const seen = sight(id).metrics;
    const unseen = parts.filter((p) => !seen.has(p.part));
    return id !== actor.personId && seen.has(total.id) && unseen.length ? [{ id, learns: unseen.length === 1 ? unseen[0].part : null }] : [];
  });
  const dashNames = new Map(dashboards.map((d) => [d.id, d.name]));
  const deckNames = new Map(decks.map((d) => [d.id, d.name]));
  const links = await db().from("view_links").select("id, object_type, object_id").eq("workspace_id", ws).contains("metric_ids", [total.id]).is("revoked_at", null).gte("expires_at", today).order("id");
  if (links.error) throw new Error("The View Links could not be read. Try again in a moment.");
  const snapshots = await snapshotsHolding(actor, total.id, "0001-01-01", { visible, dashboards: dashNames });
  const readers = all.filter((m) => !m.total && m.formula && formulaInputs(m.formula).includes(total.slug));
  const view: Omit<TotalOpening, "fingerprint"> = {
    name: total.name,
    parts: parts.map((p) => ({ name: nameOf.get(p.part)!, first: p.first, last: p.last })),
    people: newly.map((p) => ({ name: personName.get(p.id) ?? "Someone", learns: p.learns === null ? null : nameOf.get(p.learns)! })).sort((a, b) => a.name.localeCompare(b.name)),
    viewLinks: { count: (links.data ?? []).length, names: [...new Set((links.data ?? []).flatMap((l) => (l.object_type === "deck" ? deckNames : dashNames).get(l.object_id as number) ?? []))].slice(0, MOST_NAMED) },
    snapshots: { count: snapshots.snapshots, names: snapshots.names },
    formulas: { count: readers.length, names: readers.filter((m) => visible.has(m.id)).map((m) => m.name).slice(0, MOST_NAMED) },
  };
  const listed = parts.map((p) => `${p.part} ${p.first} ${p.last ?? ""}`);
  const fingerprint = createHash("sha256").update(JSON.stringify([listed, newly, (links.data ?? []).map((l) => l.id), snapshots.snapshots, readers.map((m) => m.id)])).digest("hex").slice(0, 32);
  return { view: { ...view, fingerprint }, listed };
}

/** What opening this Total would show, for its owner. */
export async function totalOpening(actor: Actor, totalId: number): Promise<TotalOpening> {
  return (await read(actor, totalId)).view;
}

const CHANGED = "What opening would show has changed since you looked. Read the lists again, then confirm.";

/** Opens a Total: its owner confirms the lists they were shown (`fingerprint`). */
export async function openTotal(actor: Actor, totalId: number, fingerprint: string): Promise<void> {
  const { view, listed } = await read(actor, totalId);
  if (view.fingerprint !== fingerprint) throw new Refused(CHANGED);
  // Opened only if the list is still this one, in one step under the Total's lock.
  const { data, error } = await db().rpc("open_total", { ws: actor.workspaceId, total: totalId, actor: actor.personId, shown: listed });
  if (error) throw new Error("The Total could not be opened.");
  if (!data) throw new Refused(CHANGED);
  await recordVersion("metric", totalId, actor.personId, { message: "Opened to people who do not see every Metric it adds up", always: true });
  // How many, never which Metric or what value.
  await audit(actor, { kind: "metric.total_opened", object: { type: "metric", id: totalId, name: view.name }, details: { parts: view.parts.length, newly_seeing: view.people.length } });
}

/** Closes a Total, in effect at once; closing a closed one changes nothing. Only its owner. */
export async function closeTotal(actor: Actor, totalId: number): Promise<void> {
  const { total } = await ownTotal(actor, totalId);
  const { data, error } = await db().from("metrics").update({ total_opened_at: null, total_opened_by: null }).eq("id", total.id).eq("workspace_id", actor.workspaceId).not("total_opened_at", "is", null).select("id");
  if (error) throw new Error("The Total could not be closed.");
  if (!data?.length) return;
  await recordVersion("metric", total.id, actor.personId, { message: "Closed to people who do not see every Metric it adds up", always: true });
  await audit(actor, { kind: "metric.total_closed", object: { type: "metric", id: total.id, name: total.name } });
}

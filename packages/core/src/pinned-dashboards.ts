// Pinned dashboards (GLOSSARY: Pinned Dashboard; ticket #509): the dashboards a person keeps in the sidebar under
// Dashboards, in their own order, at most eight, per person and Workspace. Every function takes the Actor first and
// acts on the acting person's own list only.
// Security: a pin never grants sight. What is read is filtered through the dashboards the person may open right now,
// so a dashboard that stopped being shared with them drops out without a word, and only its id and name leave here.
import { Forbidden, type Actor } from "./actor";
import { db } from "./db";
import { refuseInDemo } from "./demo";
import { switchableDashboards } from "./home";

/** How many dashboards a person may pin. */
export const MAX_PINNED = 8;

/** A pinned dashboard as the sidebar needs it: nothing more than the id and the name. */
export type PinnedDashboard = { id: number; name: string };

/** The refusal when the list is full, in words for the person. A plain Error, so every screen shows its message. */
const FULL = `You can pin up to ${MAX_PINNED} dashboards. Unpin one first.`;

/** The person's stored pins, in order. */
async function stored(actor: Actor): Promise<number[]> {
  const { data } = await db().from("pinned_dashboards").select("dashboard_id").eq("workspace_id", actor.workspaceId).eq("person_id", actor.personId).order("position");
  return (data ?? []).map((r) => r.dashboard_id as number);
}

/** Writes the order: these ids at 0, 1, 2…, so positions never have gaps or repeat. */
async function writeOrder(actor: Actor, ids: number[]): Promise<void> {
  for (const [position, id] of ids.entries()) {
    const { error } = await db().from("pinned_dashboards").update({ position }).eq("workspace_id", actor.workspaceId).eq("person_id", actor.personId).eq("dashboard_id", id);
    if (error) throw new Error("The pinned dashboards could not be put in order.");
  }
}

/** The person's pinned dashboards in their order, only those they may open now (a dashboard that is no longer shared
 * with them is left out silently). */
export async function pinnedDashboards(actor: Actor): Promise<PinnedDashboard[]> {
  if (actor.key) throw new Forbidden();
  const [ids, visible] = await Promise.all([stored(actor), switchableDashboards(actor)]);
  const byId = new Map(visible.map((d) => [d.id, d.name]));
  return ids.filter((id) => byId.has(id)).map((id) => ({ id, name: byId.get(id)! }));
}

/** Pins a dashboard the person may open, at the end of their list. Pinning one that is pinned changes nothing. */
export async function pinDashboard(actor: Actor, dashboardId: number): Promise<void> {
  if (actor.key || !Number.isInteger(dashboardId)) throw new Forbidden();
  // The demo saves nothing: a visitor who tries gets the one sentence, also where no row would be written.
  refuseInDemo(actor);
  const visible = new Set((await switchableDashboards(actor)).map((d) => d.id));
  if (!visible.has(dashboardId)) throw new Forbidden();
  // Pins of dashboards the person can no longer open are not shown, so they must not use up the places either.
  const ids = await stored(actor);
  const stale = ids.filter((id) => !visible.has(id));
  if (stale.length) await db().from("pinned_dashboards").delete().eq("workspace_id", actor.workspaceId).eq("person_id", actor.personId).in("dashboard_id", stale);
  const kept = ids.filter((id) => visible.has(id));
  if (kept.includes(dashboardId)) return;
  if (kept.length >= MAX_PINNED) throw new Error(FULL);
  const { error } = await db().from("pinned_dashboards").insert({ workspace_id: actor.workspaceId, person_id: actor.personId, dashboard_id: dashboardId, position: kept.length });
  if (error?.code === "ZF451") throw new Error(FULL);
  if (error && error.code !== "23505") throw new Error("The dashboard could not be pinned.");
  if (stale.length) await writeOrder(actor, kept.concat(dashboardId));
}

/** Unpins a dashboard; one that is not pinned changes nothing. */
export async function unpinDashboard(actor: Actor, dashboardId: number): Promise<void> {
  if (actor.key || !Number.isInteger(dashboardId)) throw new Forbidden();
  // The demo saves nothing: a visitor who tries gets the one sentence, also where no row would be written.
  refuseInDemo(actor);
  const { error } = await db().from("pinned_dashboards").delete().eq("workspace_id", actor.workspaceId).eq("person_id", actor.personId).eq("dashboard_id", dashboardId);
  if (error) throw new Error("The dashboard could not be unpinned.");
  await writeOrder(actor, await stored(actor));
}

/** Puts the person's pinned dashboards in this order. `ids` must be exactly the ones they have pinned now (as
 * `pinnedDashboards` lists them), each once; anything else is refused so a stale screen cannot drop or add a pin. */
export async function setPinnedOrder(actor: Actor, ids: number[]): Promise<void> {
  if (actor.key || !Array.isArray(ids) || ids.length > MAX_PINNED || !ids.every(Number.isInteger) || new Set(ids).size !== ids.length) throw new Forbidden();
  refuseInDemo(actor);
  const shown = (await pinnedDashboards(actor)).map((d) => d.id);
  if (shown.length !== ids.length || !shown.every((id) => ids.includes(id))) throw new Error("Your pinned dashboards changed. Reload the page and try again.");
  // Pins that are stored but not shown (no longer shared) keep their place behind the shown ones.
  const hidden = (await stored(actor)).filter((id) => !shown.includes(id));
  await writeOrder(actor, [...ids, ...hidden]);
}

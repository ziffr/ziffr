// View Links for programs (ticket #435; GLOSSARY: View Link, Snapshot, Access Key). A View Link publishes data to people
// outside the workspace, so it has a scope of its own, "view-links:write", never ticked by default, only for a program's
// key (an assistant is never given it, and text in a workspace could talk one into publishing), and only while the
// creator's role may share. A key makes, lists and revokes View Links to dashboards its creator owns, through the same
// functions the web app uses, so only Metrics the creator sees go out. The secret of a link is in the one answer that
// makes it and nowhere else: lists carry ids, labels and ends, never the link or its token. Decks are not reachable.
import { assertCan, assertScope, Forbidden, Refused, type Actor, type KeyActor } from "./actor";
import { Unusable } from "./api-dashboards";
import { db } from "./db";
import { createViewLink, listViewLinks, revokeViewLink, MAX_DAYS } from "./view-links";

/** View Links one creator may have made in any 24 hours, by any key or in the app (counted just before the insert, so
 * calls at the very same moment may overshoot by a few: the owner check, the Metrics they see and the 90 days bound the harm). */
export const VIEW_LINKS_PER_DAY = 20;
/** Most View Links a list returns. */
export const MAX_VIEW_LINKS_LISTED = 200;

/** A View Link as a program lists it: never the token or address. `snapshot` is the id of the Snapshot it shows, if any. */
export type ApiViewLink = { id: number; dashboard: number; label: string; expires: string; revoked: boolean; created: string; frozen: boolean; snapshot: number | null };

/** The View Link just made, with the one chance to read its token; the address is `/v/<token>` on the Installation. */
export type ApiMadeViewLink = ApiViewLink & { token: string; path: string };

const creatorOf = (actor: KeyActor): Actor => ({ personId: actor.personId, workspaceId: actor.workspaceId, role: actor.role });

/** Thrown when a key has made all the View Links it may today; `retryAfter` is in seconds. */
export class ViewLinkLimit extends Error {
  constructor(readonly retryAfter: number) { super(`${VIEW_LINKS_PER_DAY} View Links were made by this key's creator in the last 24 hours; try again in ${retryAfter} seconds.`); this.name = "ViewLinkLimit"; }
}

/** Refuses what is not a live program key: a View Link is only ever made by a program the person set up, never by an
 * assistant connection, whatever scopes the row holds (also guarded by a check in the database). */
async function assertProgramKey(actor: KeyActor, scope: "view-links:write") {
  assertScope(actor, scope);
  const { data: key } = await db().from("access_keys").select("kind, revoked_at").eq("id", Number(actor.key.id)).eq("workspace_id", actor.workspaceId).maybeSingle();
  if (!key || key.kind !== "program" || key.revoked_at) throw new Forbidden();
}

const shape = (dashboard: number) => (l: Awaited<ReturnType<typeof listViewLinks>>[number]): ApiViewLink => ({ id: l.id, dashboard, label: l.label ?? "", expires: String(l.expires_at).slice(0, 10), revoked: l.revoked || String(l.expires_at).slice(0, 10) < new Date().toISOString().slice(0, 10), created: l.created_at, frozen: l.frozen || l.snapshotId !== null, snapshot: l.snapshotId });

/** The View Links of a dashboard the key's creator owns, newest first (scope view-links:write), without their tokens. */
export async function listViewLinksWithKey(actor: KeyActor, dashboardId: number): Promise<ApiViewLink[]> {
  await assertProgramKey(actor, "view-links:write");
  if (!Number.isInteger(dashboardId)) throw new Forbidden();
  return (await listViewLinks(creatorOf(actor), "dashboard", dashboardId)).slice(0, MAX_VIEW_LINKS_LISTED).map(shape(dashboardId));
}

/** Makes a View Link to a dashboard the key's creator owns (scope view-links:write): live, frozen, or showing one of its
 * shown Snapshots, ending within MAX_DAYS. Returns it with its token, which is not shown again. */
export async function createViewLinkWithKey(actor: KeyActor, dashboardId: number, input: { label: string; expires: string; frozen?: boolean; snapshot?: number | null }): Promise<ApiMadeViewLink> {
  await assertProgramKey(actor, "view-links:write");
  const creator = creatorOf(actor);
  // A Guest's key gets 403 in words; whose dashboard it is stays "not found" (the core checks both again).
  assertCan(creator, "share");
  if (!Number.isInteger(dashboardId)) throw new Forbidden();
  const since = new Date(Date.now() - 86400000).toISOString();
  const { count } = await db().from("view_links").select("id", { count: "exact", head: true }).eq("workspace_id", actor.workspaceId).eq("created_by", actor.personId).gte("created_at", since);
  if ((count ?? 0) >= VIEW_LINKS_PER_DAY) throw new ViewLinkLimit(3600);
  let token: string;
  try {
    token = await createViewLink(creator, "dashboard", dashboardId, { label: input.label, expires: input.expires, frozen: Boolean(input.frozen), snapshotId: input.snapshot ?? null }, { accessKeyId: Number(actor.key.id) });
  } catch (e) {
    // The core's refusals (end date, a Snapshot not shown yet) are words for the asker; anything else is a 500.
    if (e instanceof Refused) throw new Unusable(e.message);
    throw e;
  }
  const mine = (await listViewLinks(creator, "dashboard", dashboardId)).find((l) => l.token === token);
  if (!mine) throw new Forbidden();
  return { ...shape(dashboardId)(mine), token, path: `/v/${token}` };
}

/** Revokes a View Link of the key's creator (scope view-links:write); another person's or a missing one is Forbidden. */
export async function revokeViewLinkWithKey(actor: KeyActor, linkId: number): Promise<void> {
  await assertProgramKey(actor, "view-links:write");
  if (!Number.isInteger(linkId)) throw new Forbidden();
  // Only a dashboard's link: a deck's is not reachable from the API.
  const { data: l } = await db().from("view_links").select("object_type").eq("id", linkId).eq("workspace_id", actor.workspaceId).maybeSingle();
  if (!l || l.object_type !== "dashboard") throw new Forbidden();
  await revokeViewLink(creatorOf(actor), linkId, { accessKeyId: Number(actor.key.id) });
}

export { MAX_DAYS };

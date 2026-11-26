// The Users of an Installation (spec 0066; GLOSSARY: User, Blocked User, Installation Admin): for an Installation
// Admin, who signed up, when they last signed in and whether they are blocked, with blocking, unblocking and signing
// out everywhere. Account facts only: of what a User does in a Workspace, only how many Workspaces they belong to.
// There is no way to sign in as someone else.
import { Forbidden } from "./actor";
import { db } from "./db";
import { actingAdmin, assertInstallationAdmin, serverAdminAddresses, type InstallationActor } from "./installation-admins";

/** Users one page of the list holds. */
export const USERS_PER_PAGE = 50;
/** Blocks, unblocks, sign-outs and trial extensions one Installation Admin may make in an hour. */
export const ADMIN_ACTIONS_PER_HOUR = 60;
/** The longest search the lists of the panel take. */
export const PANEL_SEARCH_MAX = 100;

/** Where a User stands: blocked, signed up but never signed in, or neither. */
export type UserStatus = "active" | "blocked" | "never_signed_in";

/** One User as the panel lists them. `userId` is the account's id, which the actions take. */
export type InstallationUser = {
  userId: string; name: string | null; email: string | null; signedUpAt: string | null; lastSignInAt: string | null;
  status: UserStatus; workspaces: number; installationAdmin: boolean; you: boolean;
};

/** One page of a list of the panel: its rows, how many there are in all, and where this page is. */
export type PanelPage<T> = { rows: T[]; total: number; page: number; pages: number; search: string };

/** A search and a page number as they come from an address: text cut to PANEL_SEARCH_MAX, a page from 1. */
export function panelQuery(query: { search?: unknown; page?: unknown }): { search: string; page: number } {
  const search = typeof query.search === "string" ? query.search.replace(/\p{Cc}/gu, " ").trim().slice(0, PANEL_SEARCH_MAX) : "";
  const page = Number(query.page);
  return { search, page: Number.isInteger(page) && page >= 1 && page <= 100_000 ? page : 1 };
}

/** A page of rows with their total, as the database functions answer them: each row carries `total`. */
export async function panelPage<R extends { total: number | string }, T>(
  query: { search?: unknown; page?: unknown }, perPage: number, read: (search: string, offset: number) => PromiseLike<{ data: unknown; error: unknown }>,
  rows: (found: R[]) => Promise<T[]>, unread: string,
): Promise<PanelPage<T>> {
  const { search, page } = panelQuery(query);
  const { data, error } = await read(search, (page - 1) * perPage);
  if (error) throw new Error(unread);
  const found = (data ?? []) as R[];
  // A page past the end (the list got shorter, or the address was typed) shows the first one.
  if (!found.length && page > 1) return panelPage({ search }, perPage, read, rows, unread);
  const total = found.length ? Number(found[0].total) : 0;
  return { rows: await rows(found), total, page, pages: Math.max(1, Math.ceil(total / perPage)), search };
}

type UserRow = { user_id: string; person_id: string | null; name: string | null; email: string | null; signed_up_at: string | null; last_sign_in_at: string | null; blocked: boolean; workspaces: number; total: number };

/** One page of Users, newest first, found by a part of their name or address. Installation Admins only. */
export async function installationUsers(actor: InstallationActor, query: { search?: unknown; page?: unknown } = {}): Promise<PanelPage<InstallationUser>> {
  await assertInstallationAdmin(actor);
  const named = serverAdminAddresses();
  return panelPage<UserRow, InstallationUser>(
    query, USERS_PER_PAGE,
    (search, offset) => db().rpc("installation_users", { p_search: search, p_limit: USERS_PER_PAGE, p_offset: offset }),
    async (found) => {
      const ids = found.map((u) => u.person_id).filter((x): x is string => Boolean(x));
      const { data: added, error } = ids.length ? await db().from("installation_admins").select("person_id").in("person_id", ids) : { data: [], error: null };
      if (error) throw new Error("The Installation Admins could not be read.");
      const admins = new Set((added ?? []).map((a) => a.person_id as string));
      return found.map((u) => ({
        userId: u.user_id, name: u.name || null, email: u.email, signedUpAt: u.signed_up_at, lastSignInAt: u.last_sign_in_at,
        status: u.blocked ? "blocked" : u.last_sign_in_at ? "active" : "never_signed_in",
        workspaces: Number(u.workspaces),
        installationAdmin: Boolean(u.person_id && admins.has(u.person_id)) || Boolean(u.email && named.includes(u.email.toLowerCase())),
        you: u.person_id === actor.personId,
      }));
    },
    "The Users could not be read.",
  );
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The words for each way the database refuses an action on a User. */
const REFUSED: Record<string, string> = {
  limit: `At most ${ADMIN_ACTIONS_PER_HOUR} such actions an hour. Try again later.`,
  gone: "There is no such User any more.",
  self: "You cannot block yourself.",
  admin: "An Installation Admin cannot be blocked. Remove them from the Installation Admins first.",
};

async function userAction(actor: InstallationActor, userId: string, action: "block" | "unblock" | "sign_out"): Promise<void> {
  const me = await actingAdmin(actor);
  if (typeof userId !== "string" || !UUID.test(userId)) throw new Error(REFUSED.gone);
  // Decided and done in one database step under a lock, with its line in the Installation's audit: the database checks
  // again that the actor is still an Installation Admin and that the User is none.
  const { data, error } = await db().rpc("installation_user_action", {
    p_actor: actor.personId, p_actor_on_server: me.onServer, p_actor_name: me.name, p_user: userId, p_action: action,
    p_server_admins: serverAdminAddresses(), p_limit: ADMIN_ACTIONS_PER_HOUR,
  });
  if (error) throw new Error("That did not work. Try again.");
  if (data === "forbidden") throw new Forbidden("Only Installation Admins may do this.");
  if (data === "unchanged") throw new Error(action === "block" ? "This User is blocked already." : "This User is not blocked.");
  if (data !== "ok") throw new Error(REFUSED[String(data)] ?? "That did not work. Try again.");
}

/** Blocks a User: no sign-in, signed out everywhere at once, and nothing acts as them until they are unblocked. Never
 * yourself, never an Installation Admin. */
export async function blockUser(actor: InstallationActor, userId: string): Promise<void> {
  await userAction(actor, userId, "block");
}

/** Lifts a block: the User may sign in again, and their keys and links work again. */
export async function unblockUser(actor: InstallationActor, userId: string): Promise<void> {
  await userAction(actor, userId, "unblock");
}

/** Ends every session of a User, so each of their browsers and apps must sign in again. Keys and connected assistants
 * are not sessions and keep working. */
export async function signOutUser(actor: InstallationActor, userId: string): Promise<void> {
  await userAction(actor, userId, "sign_out");
}

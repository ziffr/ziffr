import "server-only";
// Who is looking, and in which Workspace (GLOSSARY: Workspace, Workspace Role, Demo Mode). Signed in: the person
// behind the session, in the workspace they chose among their memberships. In Demo Mode: the "view as" cookie, in
// the demo workspace.
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Actor, WorkspaceRoleName } from "@ziffr/core/actor";
import { db } from "./db";
import { isDemo, personFor, sessionUser } from "./auth";

export const VIEWER_COOKIE = "ziffr-viewer";
/** Which of their workspaces a signed-in person is looking at. */
export const WORKSPACE_COOKIE = "ziffr-workspace";

/** The demo workspace that holds the prototype's data (see the workspaces migration). */
export const DEMO_WORKSPACE_ID = "d3e00000-0000-4000-8000-000000000001";

/** The person looking. Outside Demo Mode, someone without a session is sent to sign in. Once per request. */
export const viewerId = cache(async (): Promise<string> => {
  if (isDemo()) return (await cookies()).get(VIEWER_COOKIE)?.value ?? "sara";
  const user = await sessionUser();
  if (!user) redirect("/login");
  return personFor(user);
});

/** The workspaces the person belongs to, with their role in each. */
export async function myWorkspaces(personId: string) {
  const { data } = await db.from("memberships").select("role, workspaces(id, name)").eq("user_id", personId).order("created_at");
  return (data ?? []).map((m) => ({ ...(m.workspaces as unknown as { id: string; name: string }), role: m.role as WorkspaceRoleName }));
}

/** The workspace being looked at: the one chosen, if the person belongs to it, else their first. Someone with no
 * workspace yet is sent to create one. Once per request. */
export const currentWorkspaceId = cache(async (): Promise<string> => {
  if (isDemo()) return DEMO_WORKSPACE_ID;
  const mine = await myWorkspaces(await viewerId());
  if (!mine.length) redirect("/welcome");
  const chosen = (await cookies()).get(WORKSPACE_COOKIE)?.value;
  return (mine.find((w) => w.id === chosen) ?? mine[0]).id;
});

/** The person, workspace and Workspace Role together; refuses someone who is not a member of the workspace. */
export async function currentActor(): Promise<Actor> {
  const [personId, workspaceId] = await Promise.all([viewerId(), currentWorkspaceId()]);
  const { data } = await db.from("memberships").select("role").eq("workspace_id", workspaceId).eq("user_id", personId).maybeSingle();
  if (!data) throw new Error("Not a member of this workspace.");
  return { personId, workspaceId, role: data.role as WorkspaceRoleName };
}

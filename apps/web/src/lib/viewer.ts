import "server-only";
// Who is looking, and in which Workspace (GLOSSARY: Workspace, Workspace Role, Demo Mode). Signed in: the person
// behind the session, in the workspace they chose among their memberships. In Demo Mode: the "view as" cookie, in
// the demo workspace, as one of its made-up people (ADR 0005).
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Actor, WorkspaceRoleName } from "@ziffr/core/actor";
import { touchWorkspace } from "@ziffr/core/unused-workspaces";
import { db } from "./db";
import { isDemo, personFor, sessionUser } from "./auth";

export const VIEWER_COOKIE = "ziffr-viewer";
/** Which of their workspaces a signed-in person is looking at. */
export const WORKSPACE_COOKIE = "ziffr-workspace";

/** The demo workspace that holds the prototype's data (see the workspaces migration). */
export const DEMO_WORKSPACE_ID = "d3e00000-0000-4000-8000-000000000001";

/** The person looking. Outside Demo Mode, someone without a session is sent to sign in. Once per request. */
export const viewerId = cache(async (): Promise<string> => {
  if (await isDemo()) {
    // Only ever one of the demo's own people, whatever the cookie says: a demo visit never acts as a real person.
    const wanted = (await cookies()).get(VIEWER_COOKIE)?.value ?? "sara";
    const { data } = await db.from("memberships").select("user_id").eq("workspace_id", DEMO_WORKSPACE_ID).eq("user_id", wanted).maybeSingle();
    return data ? wanted : "sara";
  }
  const user = await sessionUser();
  if (!user) redirect("/login");
  return personFor(user);
});

/** The workspaces the person belongs to, with their role in each. */
export async function myWorkspaces(personId: string) {
  // The demo is visited, never joined: it is not one of anyone's own workspaces.
  // A Workspace still being filled by an import (spec 0040) is nobody's yet: its Owner reaches it when the job is done.
  const { data } = await db.from("memberships").select("role, workspaces!inner(id, name, importing_at)").eq("user_id", personId).neq("workspace_id", DEMO_WORKSPACE_ID).is("workspaces.importing_at", null).order("created_at");
  return (data ?? []).map((m) => ({ ...(m.workspaces as unknown as { id: string; name: string }), role: m.role as WorkspaceRoleName }));
}

/** The workspace being looked at: the one chosen, if the person belongs to it, else their first. Someone with no
 * workspace yet is sent to create one. Once per request. */
export const currentWorkspaceId = cache(async (): Promise<string> => {
  if (await isDemo()) return DEMO_WORKSPACE_ID;
  const mine = await myWorkspaces(await viewerId());
  if (!mine.length) redirect("/welcome");
  const chosen = (await cookies()).get(WORKSPACE_COOKIE)?.value;
  return (mine.find((w) => w.id === chosen) ?? mine[0]).id;
});

/** The signed-in person acting in one of their workspaces named in a form (the consent screen, spec 0023), never
 * during a demo visit; refuses a workspace they do not belong to. */
export async function actorIn(workspaceId: string): Promise<Actor> {
  if (await isDemo()) throw new Error("Leave the demo first: assistants connect only to your own workspaces.");
  const personId = await viewerId();
  const mine = await myWorkspaces(personId);
  const w = mine.find((x) => x.id === String(workspaceId));
  if (!w) throw new Error("Pick one of your workspaces.");
  return { personId, workspaceId: w.id, role: w.role };
}

/** The person looking when there is one with a Workspace, else null: for a page that opens without signing in (the form
 * link), so it never sends anyone to sign in. */
export async function optionalActor(): Promise<Actor | null> {
  if (!(await isDemo())) {
    const user = await sessionUser();
    if (!user || !(await myWorkspaces(await personFor(user))).length) return null;
  }
  return currentActor();
}

/** The person, workspace and Workspace Role together; refuses someone who is not a member of the workspace. */
export async function currentActor(): Promise<Actor> {
  const [personId, workspaceId] = await Promise.all([viewerId(), currentWorkspaceId()]);
  const { data } = await db.from("memberships").select("role").eq("workspace_id", workspaceId).eq("user_id", personId).maybeSingle();
  if (!data) throw new Error("Not a member of this workspace.");
  // A signed-in person's page or action is use of the Workspace (spec 0029); the demo's visitors are nobody.
  if (!(await isDemo())) await touchWorkspace(workspaceId);
  return { personId, workspaceId, role: data.role as WorkspaceRoleName };
}

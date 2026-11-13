import "server-only";
// Who is looking, and in which Workspace (GLOSSARY: Workspace, Workspace Role). PROTOTYPE: until sign-in (#7),
// the person comes from the "view as" cookie and the workspace is the demo workspace.
import { cookies } from "next/headers";
import type { Actor, WorkspaceRoleName } from "@ziffr/core/actor";
import { db } from "./db";

export const VIEWER_COOKIE = "ziffr-viewer";

/** The demo workspace that holds the prototype's data (see the workspaces migration). */
export const DEMO_WORKSPACE_ID = "d3e00000-0000-4000-8000-000000000001";

/** The person looking. */
export async function viewerId(): Promise<string> {
  return (await cookies()).get(VIEWER_COOKIE)?.value ?? "sara";
}

/** The workspace being looked at. */
export async function currentWorkspaceId(): Promise<string> {
  return DEMO_WORKSPACE_ID;
}

/** The person, workspace and Workspace Role together; refuses someone who is not a member of the workspace. */
export async function currentActor(): Promise<Actor> {
  const [personId, workspaceId] = await Promise.all([viewerId(), currentWorkspaceId()]);
  const { data } = await db.from("memberships").select("role").eq("workspace_id", workspaceId).eq("user_id", personId).maybeSingle();
  if (!data) throw new Error("Not a member of this workspace.");
  return { personId, workspaceId, role: data.role as WorkspaceRoleName };
}

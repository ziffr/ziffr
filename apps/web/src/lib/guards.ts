import "server-only";
// Who may do what (PROTOTYPE: identity is the "View as" cookie, so these enforce the sharing model, not real security).
// Kept out of the "use server" files: everything exported there becomes a callable action.
import { db } from "./db";
import { currentActor } from "./viewer";
import { can } from "@ziffr/core/actor";
import { visibleDashboards, visibleMetricIds } from "./access";
import { getMetrics } from "./data";

export const forbidden = () => {
  throw new Error("Forbidden");
};

export async function dashboardRole(dashboardId: number, viewer: string) {
  return (await visibleDashboards(viewer)).find((d) => d.id === dashboardId)?.role ?? null;
}

export async function assertCanEditDashboard(dashboardId: number, viewer: string) {
  const role = await dashboardRole(dashboardId, viewer);
  if (role !== "owner" && role !== "editor") forbidden();
}

export async function assertCanSeeMetrics(ids: number[], viewer: string) {
  const visible = await visibleMetricIds(viewer, await getMetrics());
  if (!ids.every((id) => visible.has(id))) forbidden();
}

/** A widget may be edited by its dashboard's owner/editors, or (saved widgets) by its owner. */
export async function assertCanEditWidget(id: number, viewer: string) {
  const { data: w } = await db.from("widgets").select("*").eq("id", id).single();
  if (!w) forbidden();
  if (w.dashboard_id === null) {
    if (w.owner_id !== viewer) forbidden();
  } else await assertCanEditDashboard(w.dashboard_id, viewer);
}


/** Themes are the workspace owner's to change. */
export async function assertWorkspaceOwner(viewer: string) {
  // Owners and admins run the workspace (GLOSSARY: Workspace Role); the actor is checked against its workspace.
  const actor = await currentActor();
  if (actor.personId !== viewer || !can(actor, "manage-members")) forbidden();
}

/** Tables whose rows belong to one Workspace and are looked up by id from a browser. */
type WorkspaceTable = "metrics" | "dashboards" | "decks" | "groups" | "themes" | "workflows" | "team_templates" | "widgets" | "actions" | "deliveries" | "view_links" | "access_requests" | "versions" | "thread_messages";

/** The workspace the acting person works in; refuses anyone who is not a member (GLOSSARY: Workspace). Every
 * top-level record a person creates is written into it. */
export async function actingWorkspace(): Promise<string> {
  return (await currentActor()).workspaceId;
}

/** Refuses ids sent by a browser that are not rows of the current workspace, so nothing in another workspace can
 * be read, changed or attached to. */
export async function assertInWorkspace(table: WorkspaceTable, ids: number[]) {
  const unique = [...new Set(ids.map(Number))];
  if (!unique.every(Number.isInteger)) forbidden();
  if (!unique.length) return;
  const ws = await actingWorkspace();
  const { data } = await db.from(table).select("id").eq("workspace_id", ws).in("id", unique);
  if ((data ?? []).length !== unique.length) forbidden();
}

/** Refuses people who are not members of the current workspace (assignees, people shared with, Group members). */
export async function assertMembers(personIds: string[]) {
  const unique = [...new Set(personIds.map(String))];
  if (!unique.length) return;
  const ws = await actingWorkspace();
  const { data } = await db.from("memberships").select("user_id").eq("workspace_id", ws).in("user_id", unique);
  if ((data ?? []).length !== unique.length) forbidden();
}

export { widgetMetricIds } from "@ziffr/core/widget-metrics";

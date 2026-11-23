// @ts-nocheck
// Home (spec 0010, ticket #146; GLOSSARY: Dashboard): the dashboard a person's Home opens, which they choose
// themselves, and the dashboards they can switch between, theirs first. Only dashboards the person may open count.
import { Forbidden, type Actor } from "./actor";
import { visibleDashboards, type DashboardAccess } from "./access";
import { db } from "./db";

/** The dashboards the person may open, theirs first (by name), then those shared with them (by name). */
export async function switchableDashboards(actor: Actor): Promise<DashboardAccess[]> {
  const all = await visibleDashboards(actor.workspaceId, actor.personId);
  const byName = (a: DashboardAccess, b: DashboardAccess) => a.name.localeCompare(b.name);
  return [...all.filter((d) => d.role === "owner").sort(byName), ...all.filter((d) => d.role !== "owner").sort(byName)];
}

/** The dashboard Home opens: the one the person chose, while they may still open it; else the first they made (the
 * oldest they own); else the first shared with them; null when there is none. */
export async function homeDashboard(actor: Actor, dashboards?: DashboardAccess[]): Promise<DashboardAccess | null> {
  const [list, { data: me }] = await Promise.all([
    dashboards ? Promise.resolve(dashboards) : switchableDashboards(actor),
    db().from("memberships").select("home_dashboard_id").eq("workspace_id", actor.workspaceId).eq("user_id", actor.personId).maybeSingle(),
  ]);
  const oldest = (ds: DashboardAccess[]) => ds.reduce<DashboardAccess | null>((a, d) => (!a || d.id < a.id ? d : a), null);
  return list.find((d) => d.id === me?.home_dashboard_id) ?? oldest(list.filter((d) => d.role === "owner")) ?? oldest(list) ?? null;
}

/** The id of the dashboard the person chose as Home, or null (whether or not they may still open it). */
export async function chosenHomeId(actor: Actor): Promise<number | null> {
  const { data } = await db().from("memberships").select("home_dashboard_id").eq("workspace_id", actor.workspaceId).eq("user_id", actor.personId).maybeSingle();
  return (data?.home_dashboard_id as number | null) ?? null;
}

/** Makes a dashboard the person may open their Home, or clears the choice with null. Their own choice only. */
export async function setHomeDashboard(actor: Actor, dashboardId: number | null): Promise<void> {
  if (actor.key) throw new Forbidden();
  if (dashboardId !== null) {
    if (!Number.isInteger(dashboardId)) throw new Forbidden();
    // Only a dashboard they may open.
    if (!(await switchableDashboards(actor)).some((d) => d.id === dashboardId)) throw new Forbidden();
  }
  const { error } = await db().from("memberships").update({ home_dashboard_id: dashboardId }).eq("workspace_id", actor.workspaceId).eq("user_id", actor.personId);
  if (error) throw new Error("Home could not be set.");
}

// Workspace Limits on the Installation Settings page (spec 0029, ticket #265; GLOSSARY: Workspace Limit, Installation
// Admin): an Installation Admin lists the Workspaces with their count of Metrics and limit, and sets one Workspace's
// limit or gives it back to the default. Being an Installation Admin still shows no Workspace's data (spec 0025):
// the list holds each Workspace's name, numbers and who set its limit, nothing else. A Workspace Owner never sets
// their own limit; Ziffr Cloud sets one through its own API (ticket 4), writing the same row.
import { Forbidden } from "./actor";
import { assertInstallationAdmin, recordInstallationEvent, type InstallationActor } from "./installation-admins";
import { db } from "./db";
import { recordAudit } from "./audit-log";
import { DEMO_WORKSPACE_ID } from "./team";
import { limitLabel, limitNumber, syncDefaultLimit } from "./workspace-limits";

/** One Workspace as the Installation Admin's list shows it: its name, how many Metrics it holds, its limit in effect
 * and whether that is its own or the default, who set its own and when, and since when it is over. */
export type WorkspaceLimitRow = {
  workspaceId: string; name: string; metrics: number; limit: number | null; label: string | null; own: boolean;
  setBy: "installation_admin" | "cloud" | null; setByName: string | null; setAt: string | null; overSince: string | null;
};

/** Every Workspace but the demo with its count and limit, by name. Installation Admins only. */
export async function workspaceLimitRows(actor: InstallationActor): Promise<WorkspaceLimitRow[]> {
  await assertInstallationAdmin(actor);
  await syncDefaultLimit();
  const { data, error } = await db().rpc("workspace_limits_overview");
  if (error) throw new Error("The Workspaces could not be read.");
  const rows = (data ?? []) as { workspace_id: string; name: string; metrics: number; limit_metrics: number | null; label: string | null; own: boolean; set_by: string | null; set_by_person: string | null; set_at: string | null; over_limit_since: string | null }[];
  // The name of whoever set a limit, only for limits set by an Installation Admin.
  const ids = [...new Set(rows.map((r) => r.set_by_person).filter((x): x is string => Boolean(x)))];
  const { data: people } = ids.length ? await db().from("profiles").select("id, name").in("id", ids) : { data: [] };
  const names = new Map((people ?? []).map((p) => [p.id as string, p.name as string]));
  return rows.map((r) => ({
    workspaceId: r.workspace_id, name: r.name, metrics: Number(r.metrics), limit: r.limit_metrics, label: r.label, own: r.own,
    setBy: r.set_by === "cloud" || r.set_by === "installation_admin" ? r.set_by : null,
    setByName: r.set_by_person ? names.get(r.set_by_person) ?? "A former Installation Admin" : null,
    setAt: r.set_at, overSince: r.over_limit_since,
  }));
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Sets a Workspace's own limit (`metrics` empty for no limit at all, `label` its name), or with null gives it back to
 * the Installation's default. Installation Admins only, never for the demo. The Workspace's Audit Log and the
 * Installation's audit record it. The last write wins, whether it was an Installation Admin's or Ziffr Cloud's. */
export async function setWorkspaceLimit(actor: InstallationActor, workspaceId: string, input: { metrics: unknown; label: unknown } | null): Promise<void> {
  await assertInstallationAdmin(actor);
  // From a browser: an id of a real Workspace, never the demo; the values checked before anything is written.
  if (typeof workspaceId !== "string" || !UUID.test(workspaceId) || workspaceId === DEMO_WORKSPACE_ID) throw new Forbidden();
  const { data: ws } = await db().from("workspaces").select("id, name").eq("id", workspaceId).maybeSingle();
  if (!ws) throw new Forbidden();
  const next = input === null ? null : { metrics: limitNumber(input.metrics), label: limitLabel(input.label) };
  const { data: before } = await db().from("workspace_limits").select("metrics, label").eq("workspace_id", workspaceId).maybeSingle();
  await syncDefaultLimit();
  const { error } = next === null
    ? await db().from("workspace_limits").delete().eq("workspace_id", workspaceId)
    : await db().from("workspace_limits").upsert({ workspace_id: workspaceId, metrics: next.metrics, label: next.label, set_by: "installation_admin", set_by_person: actor.personId, set_at: new Date().toISOString() });
  if (error) throw new Error("The limit could not be saved. Try again.");
  await recordAudit(workspaceId, actor.personId, {
    kind: "workspace.limit_changed", object: { type: "workspace", id: workspaceId },
    details: { from_limit: before?.metrics ?? null, from_label: before?.label ?? null, to_limit: next?.metrics ?? null, to_label: next?.label ?? null, by: "installation_admin", default: next === null },
  });
  await recordInstallationEvent(actor.personId, next === null ? "workspace_limit.removed" : "workspace_limit.set", workspaceId);
}

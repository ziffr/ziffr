// Archived Metrics (GLOSSARY: Archived Metric; spec 0029, ticket #264). Archiving puts a Metric aside without
// deleting its history: it keeps its description, values, Versions and Shares, asks for nothing (no Prompt, reminder
// or Escalation) and takes no values. It shows only under the Archived filter of the Metrics page, never in the Pool
// or a picker; a widget that shows it keeps drawing its history. Bringing it back makes it an ordinary Metric again.
import { db } from "./db";
import { Forbidden, type Actor } from "./actor";
import { audit } from "./audit-log";
import { recordVersion } from "./versions";
import { DEMO_WORKSPACE_ID } from "./team";

/** What a Source answers for a value sent to an Archived Metric, in the same words everywhere. */
export const ARCHIVED_REFUSAL = "This Metric is archived.";

/** The database's code for a value refused because its Metric is archived (trigger observations_not_archived). */
export const ARCHIVED_CODE = "ZF440";

// Whether a Metric is archived, and the Metrics in use, are pure and live in metric-row, so browser code uses them too.

/** The Metric, when the actor may archive it or bring it back: Owners and Admins of the workspace, and the Metric's
 * own Metric Owner. Never a Guest or a key (the API passes the key's creator), never in the demo, which every
 * visitor shares. A Metric of another workspace and a missing one are refused alike. */
async function archivable(actor: Actor, metricId: number) {
  if (actor.key || !Number.isInteger(metricId)) throw new Forbidden();
  const { data: m } = await db().from("metrics").select("id, name, owner_id, archived_at").eq("id", metricId).eq("workspace_id", actor.workspaceId).maybeSingle();
  if (!m) throw new Forbidden();
  if (actor.workspaceId === DEMO_WORKSPACE_ID) throw new Forbidden("The demo's Metrics stay as they are.");
  const may = actor.role === "owner" || actor.role === "admin" || (actor.role !== "guest" && m.owner_id === actor.personId);
  if (!may) throw new Forbidden("Only Owners, Admins and the Metric's owner archive it or bring it back.");
  return m as { id: number; name: string; owner_id: string; archived_at: string | null };
}

/** Archives a Metric: its values and history stay, it asks for nothing and takes no values from then on. Archiving
 * one that is archived already changes nothing. `origin.accessKeyId` names the key a program did it with. */
export async function archiveMetric(actor: Actor, metricId: number, origin: { accessKeyId?: number } = {}): Promise<{ archived: boolean }> {
  const m = await archivable(actor, metricId);
  if (m.archived_at) return { archived: false };
  // Only a Metric that is not archived yet, so two presses at once archive (and record) it once.
  const { data, error } = await db().from("metrics").update({ archived_at: new Date().toISOString(), archived_by: actor.personId })
    .eq("id", m.id).eq("workspace_id", actor.workspaceId).is("archived_at", null).select("id");
  if (error) throw new Error("The Metric could not be archived.");
  if (!data?.length) return { archived: false };
  await recordVersion("metric", m.id, actor.personId, { message: "Archived", always: true });
  await audit(actor, { kind: "metric.archived", object: { type: "metric", id: m.id, name: m.name }, accessKeyId: Number.isInteger(origin.accessKeyId) ? origin.accessKeyId : null });
  return { archived: true };
}

/** Thrown when an Archived Metric cannot be brought back; its message is for people. */
export class RestoreRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RestoreRefused";
  }
}

/** Brings an Archived Metric back: it is asked for and takes values again, and counts as a Metric in use. Bringing
 * back one that is not archived changes nothing. */
export async function restoreMetric(actor: Actor, metricId: number, origin: { accessKeyId?: number } = {}): Promise<{ restored: boolean }> {
  const m = await archivable(actor, metricId);
  if (!m.archived_at) return { restored: false };
  const { data, error } = await db().from("metrics").update({ archived_at: null, archived_by: null })
    .eq("id", m.id).eq("workspace_id", actor.workspaceId).not("archived_at", "is", null).select("id");
  if (error) throw new RestoreRefused(restoreRefusal(error.code));
  if (!data?.length) return { restored: false };
  await recordVersion("metric", m.id, actor.personId, { message: "Brought back from the archive", always: true });
  await audit(actor, { kind: "metric.restored", object: { type: "metric", id: m.id, name: m.name }, accessKeyId: Number.isInteger(origin.accessKeyId) ? origin.accessKeyId : null });
  return { restored: true };
}

/** Why bringing a Metric back was refused, in words of Ziffr's own: the database's stay in the server log. */
function restoreRefusal(code: string | undefined): string {
  console.error("Bringing back a Metric failed:", code ?? "no code");
  return "The Metric could not be brought back. Try again in a moment.";
}

/** Whether the actor may archive this Metric or bring it back, for showing the control; the core checks again. */
export async function canArchiveMetric(actor: Actor, metricId: number): Promise<boolean> {
  return archivable(actor, metricId).then(() => true, () => false);
}

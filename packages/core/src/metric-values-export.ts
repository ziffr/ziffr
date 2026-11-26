// Download the values of chosen Metrics (spec 0056; GLOSSARY: Metric, Observation, Number Style, Audit Log): the values
// of the Metrics a signed-in person picks, as the CSV file the Workspace download writes. Reading only: the person gets
// what they may already see on screen, a Metric they may not see is left out as if it did not exist, and the download
// is written in the Audit Log in counts.
import { Forbidden, type Actor } from "./actor";
import { visibleMetricIds } from "./access";
import { auditOrRefuse } from "./audit-log";
import { db } from "./db";
import { refuseInDemo } from "./demo";
import { valueLines } from "./trial-end";
import { getMetrics } from "./workspace-data";

/** The most Metrics one download may hold. */
export const EXPORT_METRICS = 50;
/** The most value rows one download may hold; over it the person splits the download, nothing is cut short. */
export const EXPORT_VALUE_ROWS = 250_000;

/** The values of the Metrics with these slugs that the actor may see, as CSV. Only a person with a membership in the
 * Workspace: never an Access Key (programs read values through the API with their scopes), never a Contact and never the
 * demo. A slug that is unknown and one the person may not see are treated alike: left out, never named. */
export async function exportMetricValues(actor: Actor, slugs: readonly string[]): Promise<{ csv: string; metrics: number; rows: number }> {
  if (actor.key || !actor.personId) throw new Forbidden();
  refuseInDemo(actor);
  const wanted = new Set(slugs.filter((s) => typeof s === "string" && s.length > 0 && s.length <= 100));
  if (wanted.size > EXPORT_METRICS) throw new Error(`Pick at most ${EXPORT_METRICS} Metrics for one download.`);
  const ws = actor.workspaceId;
  const { data: member } = await db().from("memberships").select("role").eq("workspace_id", ws).eq("user_id", actor.personId).maybeSingle();
  if (!member) throw new Forbidden();
  const all = await getMetrics(ws);
  const visible = await visibleMetricIds(ws, actor.personId, all);
  const ids = all.filter((m) => wanted.has(m.slug) && visible.has(m.id)).map((m) => m.id);
  if (!ids.length) throw new Error("Pick at least one Metric you can see.");
  // Counted by the database before any value is read, so a download that is too large is refused cheaply.
  const { count, error } = await db().from("observations").select("id", { count: "exact", head: true }).eq("workspace_id", ws).in("metric_id", ids);
  if (error || count === null) throw new Error("The values could not be counted. Try again in a moment.");
  if (count > EXPORT_VALUE_ROWS) throw new Error("There are too many values to download at once. Pick fewer Metrics and download them in parts.");
  const lines = await valueLines(ws, new Set(ids));
  const rows = lines.length - 1;
  // No file leaves Ziffr without its line in the Audit Log.
  await auditOrRefuse(actor, { kind: "export.metric_values", object: { type: "workspace", id: ws }, details: { metrics: ids.length, rows } });
  return { csv: `${lines.join("\r\n")}\r\n`, metrics: ids.length, rows };
}

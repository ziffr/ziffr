// Breakdown labels (GLOSSARY: Breakdown, Workspace Key; spec 0028 step 1, ticket #335): the rows of a submitted
// Breakdown made ready for record_observation, with each label sealed for its row and a blind index beside it, so the
// database merges rows by label ("add up") without ever opening one. Security: the index is an HMAC under a key of
// the Workspace, so it shows which labels are equal inside one Workspace and nothing across Workspaces; a label is
// never sent to the database in clear except the lower-cased `legacy` form, and only while the period still holds
// plain rows written before sealing (until the re-encryption job, #247, has sealed them).
import { db } from "./db";
import { reserveIds } from "./sealed-columns";
import { isSealed, normaliseForIndex, workspaceCipher, type WorkspaceCipher } from "./workspace-keys";

/** The purpose a Breakdown label's blind index is made for. */
const PURPOSE = "breakdown_rows.label";

/** A row as record_observation takes it. */
export type BreakdownInput = { label: string; value: number; id: number | null; index: string | null; indexes: string[]; legacy: string | null };

/** Whether the latest value of a period still has Breakdown rows in clear (written before sealing). */
async function hasPlainRows(workspaceId: string, metricId: number, period: string): Promise<boolean> {
  const { data: obs } = await db().from("observations").select("id").eq("workspace_id", workspaceId).eq("metric_id", metricId).eq("period_start", period).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(1);
  if (!obs?.length) return false;
  const { data: rows } = await db().from("breakdown_rows").select("label").eq("workspace_id", workspaceId).eq("observation_id", obs[0].id);
  return (rows ?? []).some((r) => !isSealed(r.label as string));
}

/** Rows to record, each label sealed for the id reserved for it, with its blind index under the current key and under
 * every key version still held (so a row merges whichever version wrote it). Where the Workspace does not seal (the
 * demo, no ZIFFR_SECRETS_KEY) labels stay plain, with no id or index, and merge by their lower-cased text. */
export async function breakdownRowsToWrite(workspaceId: string, metricId: number, period: string, rows: { label: string; value: number }[], preview = false): Promise<BreakdownInput[]> {
  // A preview (the demo) writes nothing and needs no key, id or index.
  if (!rows.length || preview) return rows.map((r) => ({ label: r.label, value: r.value, id: null, index: null, indexes: [], legacy: null }));
  const cipher = await workspaceCipher(workspaceId);
  if (!cipher.sealing) return rows.map((r) => ({ label: r.label, value: r.value, id: null, index: null, indexes: [], legacy: normaliseLegacy(r.label) }));
  const [ids, plain] = await Promise.all([reserveIds("breakdown_rows", rows.length), hasPlainRows(workspaceId, metricId, period)]);
  return rows.map((r, i) => ({
    label: cipher.seal({ table: "breakdown_rows", column: "label", row: ids[i] }, r.label), value: r.value, id: ids[i],
    index: cipher.blindIndex(PURPOSE, r.label), indexes: cipher.blindIndexes(PURPOSE, r.label), legacy: plain ? normaliseLegacy(r.label) : null,
  }));
}

/** What a plain row's lower(btrim(label)) is compared with in the database: trimmed and lower-cased like the index. */
function normaliseLegacy(label: string): string {
  return normaliseForIndex(label);
}

/** A history entry's label opened: it is the sealed label of the row it was copied from, bound to that row's id. */
export function openHistoryLabel(cipher: WorkspaceCipher, entry: { row_id: number | string | null; label: string }): string | null {
  if (entry.row_id === null || entry.row_id === undefined) return isSealed(entry.label) ? null : entry.label;
  return cipher.open({ table: "breakdown_rows", column: "label", row: entry.row_id }, entry.label);
}

// Tags as stored (GLOSSARY: Tag; spec 0038): reading the rows of a Workspace's Tags and their links to Metrics, names
// opened, and the blind index a name is found by. No one is told anything here: who may see a Tag is decided in tags.ts
// (visibleTags), which is the only door the app, the API and the MCP Server use. Versions read the Tags of a Metric from
// here, so this file imports nothing of them.
import { createHash } from "node:crypto";
import { db } from "./db";
import { openRows } from "./sealed-columns";
import { allRows } from "./workspace-data";
import { normaliseForIndex, type WorkspaceCipher } from "./workspace-keys";

/** A Tag with its name opened. */
export type TagRow = { id: string; name: string; createdBy: string | null; createdAt: string };

/** The purpose a Tag name's blind index is taken for (table.column, as every blind index is). */
export const TAG_INDEX_PURPOSE = "tags.name";

// A Workspace that does not seal yet has no key to take an index with; the plain hash is of the Workspace and the name, and the
// re-encryption job replaces it with the blind index once there is a key (it counts as older than every key version).
const plainIndex = (ws: string, name: string): string => `p1.${createHash("sha256").update(`${ws.toLowerCase()}\0tags.name\0${normaliseForIndex(name)}`, "utf8").digest("hex")}`;

/** What a Tag name is stored and found by: `current` is written, `all` is every index the name may have under the key
 * versions still held (and the plain one), so a Tag is found whichever version wrote it. */
export function tagIndexes(cipher: WorkspaceCipher, name: string): { current: string; all: string[] } {
  const plain = plainIndex(cipher.workspaceId, name);
  return { current: cipher.blindIndex(TAG_INDEX_PURPOSE, name) ?? plain, all: [...cipher.blindIndexes(TAG_INDEX_PURPOSE, name), plain] };
}

/** Every Tag of a Workspace, names opened, by name (ignoring case). A Tag whose name does not open is left out: it can be
 * shown to no one, and never as ciphertext. */
export async function readTags(ws: string): Promise<TagRow[]> {
  const rows = await allRows<Record<string, unknown>>((from, to) => db().from("tags").select("id, name, created_by, created_at").eq("workspace_id", ws).order("id").range(from, to));
  const opened = await openRows("tags", ws, rows);
  return opened
    .filter((r) => typeof r.name === "string" && r.name !== "")
    .map((r) => ({ id: String(r.id), name: String(r.name), createdBy: (r.created_by as string | null) ?? null, createdAt: String(r.created_at) }))
    .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()) || a.id.localeCompare(b.id));
}

/** The links of a Workspace's Metrics to their Tags, every one. */
export async function readLinks(ws: string): Promise<{ metric_id: number; tag_id: string }[]> {
  return allRows<{ metric_id: number; tag_id: string }>((from, to) => db().from("metric_tags").select("metric_id, tag_id").eq("workspace_id", ws).order("metric_id").order("tag_id").range(from, to));
}

/** The Tag names of one Metric, sorted, for its Version. */
export async function tagNamesOfMetric(ws: string, metricId: number): Promise<string[]> {
  const { data } = await db().from("metric_tags").select("tag_id").eq("workspace_id", ws).eq("metric_id", metricId);
  const have = new Set((data ?? []).map((l) => String(l.tag_id)));
  if (!have.size) return [];
  return (await readTags(ws)).filter((t) => have.has(t.id)).map((t) => t.name);
}

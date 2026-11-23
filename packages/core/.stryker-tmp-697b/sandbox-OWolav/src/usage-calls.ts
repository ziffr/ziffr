// @ts-nocheck
// Usage: call counters (GLOSSARY: Usage; spec 0031). How many calls programs made with keys, per day and Workspace, as
// numbers only. Calls are counted in memory in each server process and written together once a minute and when the
// event loop empties (a process killed by a signal or a crash loses at most its last minute), so a
// call costs no database write of its own. Stores no key, person or route: only the day, the kind and the Workspace (kept so deleting a Workspace deletes its counts).
import { db } from "./db";
import { DEMO_WORKSPACE_ID } from "./team";

/** What is counted: calls with a person's Access Key, with a Feed Key, and by the remote MCP Server. */
export type CallKind = "api_calls" | "feed_calls" | "mcp_calls";

/** The kind a call counts as: a Feed's by itself, the remote MCP Server's apart from other programs'. */
export const callKind = (isFeed: boolean, fromMcp: boolean): CallKind => (isFeed ? "feed_calls" : fromMcp ? "mcp_calls" : "api_calls");

/** Milliseconds between writes of the counters. */
export const USAGE_FLUSH_MS = 60_000;

const pending = new Map<string, number>();
let timer: ReturnType<typeof setInterval> | null = null;
let hooked = false;
let flushing = false;

/** Counts one call in this process. Never throws and never waits for the database; counts nothing for the demo. */
export function countCall(workspaceId: string, kind: CallKind): void {
  try {
    if (workspaceId === DEMO_WORKSPACE_ID || !/^[0-9a-f-]{36}$/i.test(workspaceId)) return;
    const key = `${new Date().toISOString().slice(0, 10)}|${kind}|${workspaceId}`;
    pending.set(key, (pending.get(key) ?? 0) + 1);
    if (pending.size > 5000 && !flushing) void flushUsageCounts();
    if (!timer) {
      timer = setInterval(() => { void flushUsageCounts(); }, USAGE_FLUSH_MS);
      timer.unref?.();
    }
    if (!hooked && typeof process !== "undefined" && typeof process.once === "function") {
      hooked = true;
      process.once("beforeExit", () => { void flushUsageCounts(); });
    }
  } catch { /* a statistic never breaks a call */ }
}

/** Writes the counted calls into usage_counts (adding to what is there) and forgets them here. Best effort: a failed
 * write puts the counts back for the next try. Returns how many counts were written. */
export async function flushUsageCounts(): Promise<number> {
  if (!pending.size || flushing) return 0;
  flushing = true;
  try { return await writeCounts(); } finally { flushing = false; }
}

async function writeCounts(): Promise<number> {
  const taken = [...pending.entries()].slice(0, 1000);
  for (const [k] of taken) pending.delete(k);
  const rows = taken.map(([k, n]) => { const [day, kind, workspace_id] = k.split("|"); return { day, kind, workspace_id, n }; });
  try {
    const { error } = await db().rpc("add_usage_counts", { p_rows: rows });
    if (error) throw new Error("The call counts could not be written.");
    return rows.length;
  } catch (e) {
    for (const [k, n] of taken) pending.set(k, (pending.get(k) ?? 0) + n);
    console.error("Usage:", e instanceof Error ? e.message : "the call counts could not be written");
    return 0;
  }
}

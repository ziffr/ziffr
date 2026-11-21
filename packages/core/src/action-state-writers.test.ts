// Nothing but changeActionState writes an Action's state (spec 0034, "One state change, one event"): a new channel that
// wrote `actions.status` itself would change an Action without telling the Webhooks, so this reads every source file
// and every migration function and fails on a writer other than action-state.ts. It is the early warning: the guard is
// the database's (a trigger refuses a change of the state that is not made by change_action_status; see
// action-state.db.test.ts), so a writer these patterns miss still fails at its first run.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { repoFile } from "./test/repo-file";

const root = fileURLToPath(repoFile("."));
/** A statement that sets `status` in the SET list of an update of actions (not one that only reads it in its WHERE). */
const SETS_STATUS = /update\s+(?:public\.)?actions(?:\s+(?:as\s+)?\w+)?\s+set\b(?:(?!\bwhere\b)[^;])*\bstatus\s*=/i;
/** The one migration that holds the function that writes the state (and the trigger that refuses every other writer). */
const THE_WRITER = "20261225730000_webhook_followups.sql";

/** The argument of the `.update(` or `.upsert(` that starts at `from`, up to its closing bracket. */
function argumentAt(text: string, from: number): string {
  let depth = 1;
  for (let i = from; i < text.length; i++) {
    if (text[i] === "(") depth++;
    else if (text[i] === ")" && --depth === 0) return text.slice(from, i);
  }
  return text.slice(from);
}

/** Whether a source writes an Action with an argument that may set the state: not an object written out without \`status\` or a spread. */
function mayWriteStatus(text: string): boolean {
  for (const m of text.matchAll(/from\(\s*["']actions["']\s*\)[\s\S]{0,400}?\.(?:update|upsert)\(/g)) {
    const arg = argumentAt(text, (m.index ?? 0) + m[0].length).trim();
    // A variable, a call or a spread can hold anything; only an object literal that never names status is plain.
    if (!arg.startsWith("{") || /\bstatus\b|\.\.\./.test(arg)) return true;
  }
  return false;
}

/** Every source file under a folder, except node_modules, build output and tests. */
function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sources(path, out);
    else if (/\.(ts|tsx|sql)$/.test(name) && !/\.test\.tsx?$/.test(name) && !name.endsWith(".d.ts")) out.push(path);
  }
  return out;
}

describe("the writers of actions.status", () => {
  it("are only changeActionState: no update of the actions table names status anywhere else", () => {
    const offenders: string[] = [];
    for (const dir of ["packages", "apps"]) {
      for (const file of sources(join(root, dir))) {
        const rel = relative(root, file);
        if (rel.endsWith("packages/core/src/action-state.ts") || rel.endsWith(".sql")) continue;
        const text = readFileSync(file, "utf8");
        // `.from("actions")` followed (in the same chain) by `.update(` or `.upsert(` with an argument that may set the state.
        if (mayWriteStatus(text)) offenders.push(rel);
        // A raw statement or a function of the database called by name that sets the state.
        if (SETS_STATUS.test(text)) offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });
  it("and no function in a migration sets it either", () => {
    const offenders = sources(join(root, "supabase/migrations")).filter((f) => !f.endsWith(THE_WRITER) && SETS_STATUS.test(readFileSync(f, "utf8")));
    expect(offenders.map((f) => relative(root, f))).toEqual([]);
  });
  it("catches a writer when there is one (the patterns themselves)", () => {
    expect(SETS_STATUS.test("update actions set status = 'closed' where id = 1;")).toBe(true);
    expect(SETS_STATUS.test("update actions set assignee_id = a where status in ('open');")).toBe(false);
    // A table alias, and a statement of another shape.
    expect(SETS_STATUS.test("update actions a set status = 'closed' where a.id = 1;")).toBe(true);
    expect(SETS_STATUS.test("update public.actions as a set updated_at = now(), a.status = 'open';")).toBe(true);
    // A literal with status, a variable, a spread and a call are all possible writers; a literal without status is not.
    expect(mayWriteStatus('await db().from("actions").update({ status: "closed", updated_at: now(1) }).eq("id", 1);')).toBe(true);
    expect(mayWriteStatus('await db().from("actions").update(patch).eq("id", 1);')).toBe(true);
    expect(mayWriteStatus('await db().from("actions").update({ ...patch, updated_at: now }).eq("id", 1);')).toBe(true);
    expect(mayWriteStatus('await db().from("actions").update(change(x)).eq("id", 1);')).toBe(true);
    expect(mayWriteStatus('await db().from("actions").update({ updated_at: new Date().toISOString() }).eq("id", 1);')).toBe(false);
  });
});

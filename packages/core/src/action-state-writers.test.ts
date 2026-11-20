// Nothing but changeActionState writes an Action's state (spec 0034, "One state change, one event"): a new channel that
// wrote `actions.status` itself would change an Action without telling the Webhooks, so this reads every source file
// and every migration function and fails on a writer other than action-state.ts.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { repoFile } from "./test/repo-file";

const root = fileURLToPath(repoFile("."));
/** A statement that sets `status` in the SET list of an update of actions (not one that only reads it in its WHERE). */
const SETS_STATUS = /update\s+(?:public\.)?actions\s+set\b(?:(?!\bwhere\b)[^;])*\bstatus\s*=/i;

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
        // `.from("actions")` followed (in the same chain) by `.update(` or `.upsert(` whose argument mentions status.
        for (const m of text.matchAll(/from\(\s*["']actions["']\s*\)[\s\S]{0,400}?\.(update|upsert)\(([\s\S]{0,300}?)\)\s*[.;\n]/g)) {
          if (/\bstatus\b/.test(m[2])) offenders.push(rel);
        }
        // A raw statement or a function of the database called by name that sets the state.
        if (SETS_STATUS.test(text)) offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });
  it("and no function in a migration sets it either", () => {
    const offenders = sources(join(root, "supabase/migrations")).filter((f) => SETS_STATUS.test(readFileSync(f, "utf8")));
    expect(offenders.map((f) => relative(root, f))).toEqual([]);
  });
  it("catches a writer when there is one (the patterns themselves)", () => {
    expect(SETS_STATUS.test("update actions set status = 'closed' where id = 1;")).toBe(true);
    expect(SETS_STATUS.test("update actions set assignee_id = a where status in ('open');")).toBe(false);
    const bad = 'await db().from("actions").update({ status: "closed", updated_at: now }).eq("id", 1);\n';
    expect(/from\(\s*["']actions["']\s*\)[\s\S]{0,400}?\.(update|upsert)\(([\s\S]{0,300}?)\)\s*[.;\n]/.exec(bad)?.[2]).toContain("status");
  });
});

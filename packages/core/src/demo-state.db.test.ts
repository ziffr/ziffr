// The demo's state (spec 0051, ticket 1; GLOSSARY: Demo Reset): every seed of the demo moves its Generation and clears
// the flag that a visitor changed it, in the same transaction as the seed. Only the SQL step is run here (the core's
// part, resetDemoWorkspace, is tried by demo-read-only.db.test.ts).
import { describe, expect, it } from "vitest";
import { db } from "./db";
import { readDemoState } from "./demo-reset";

/** Marks the demo changed, as a visitor's write will (spec 0051, ticket 3). */
async function markChanged() {
  const { error } = await db().from("demo_state").update({ changed_since_reset: true, last_change_at: new Date().toISOString() }).eq("id", true);
  expect(error).toBeNull();
}

describe("demo_state", () => {
  it("has exactly one row, which the core reads", async () => {
    const state = await readDemoState();
    expect(state).not.toBeNull();
    expect(state?.generation).toBeGreaterThanOrEqual(1);
    expect((await db().from("demo_state").select("id", { count: "exact", head: true })).count).toBe(1);
  });

  it("moves the Generation and clears the flag at each reset", async () => {
    const before = await readDemoState();
    await markChanged();
    expect((await readDemoState())?.changedSinceReset).toBe(true);
    const { data: done, error } = await db().rpc("demo_reset", { min_gap: "0 seconds" });
    expect(error).toBeNull();
    expect(done).toBe(true);
    const after = await readDemoState();
    expect(after?.generation).toBe((before?.generation ?? 0) + 1);
    expect(after?.changedSinceReset).toBe(false);
    expect(after?.lastChangeAt).toBeNull();
    expect(after?.resetAt?.getTime()).toBeGreaterThanOrEqual(before?.resetAt?.getTime() ?? 0);
  });

  it("leaves the Generation and the flag alone when the reset is refused as too soon", async () => {
    await db().rpc("demo_reset", { min_gap: "0 seconds" });
    await markChanged();
    const before = await readDemoState();
    const { data: done } = await db().rpc("demo_reset", { min_gap: "1 hour" });
    expect(done).toBe(false);
    const after = await readDemoState();
    expect(after?.generation).toBe(before?.generation);
    expect(after?.changedSinceReset).toBe(true);
  });
});

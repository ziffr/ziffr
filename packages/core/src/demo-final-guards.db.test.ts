// Two guards of the demo's final review (spec 0051, D6 and D8; GLOSSARY: Demo Mode, Demo Reset): a visit may write only where the
// demo is the Installation's only Workspace, and the end of a seed is marked for its own Generation alone. Written for CI: the
// author could not run it against a database.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { db, seedingDemo } from "./db";
import { DemoReadOnly } from "./demo";
import { readDemoState, resetDemoWorkspace } from "./demo-reset";
import { visitingDemo } from "./demo-visiting";
import { forgetStoredSettings } from "./settings-in-effect";
import { DEMO_WORKSPACE_ID } from "./team";
import { workspace } from "./test/db-fixtures";
import { assertDemoIsOnlyWorkspace } from "./test/demo-walk";

const VISIT = "0123456789abcdef0123456789abcdef";
const cleanups: (() => Promise<void>)[] = [];
const setOpen = async (on: boolean) => { await db().from("demo_state").update({ open_to_visitors: on }).eq("id", true).throwOnError(); };

beforeAll(async () => {
  await assertDemoIsOnlyWorkspace();
  vi.stubEnv("ZIFFR_DEMO_ONLY", "1");
  vi.stubEnv("ZIFFR_DEMO_CHANGES", "1");
  forgetStoredSettings();
});
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
afterAll(async () => {
  // The demo back to a whole seed (the last test made a bare reset): the full reset as the job makes it, closed, its end marked.
  // (A minute apart from the last reset is what it asks for.) It marks the seed's end itself.
  await seedingDemo(async () => { await db().from("workspaces").update({ created_at: "2026-01-01T00:00:00Z" }).eq("id", DEMO_WORKSPACE_ID).throwOnError(); });
  await resetDemoWorkspace();
  await setOpen(false);
  vi.unstubAllEnvs();
  forgetStoredSettings();
}, 180_000);

describe("a visit may write only where the demo is the only Workspace (D6)", () => {
  it("is refused by the database, with the Installation open, while another Workspace exists", async () => {
    await setOpen(true);
    const generation = Number((await readDemoState())?.generation);
    const w = await workspace("A real Workspace");
    cleanups.push(w.cleanup);
    await visitingDemo({ generation, visit: VISIT }, async () => {
      await expect(db().from("dashboards").update({ name: "x" }).eq("workspace_id", DEMO_WORKSPACE_ID)).rejects.toBeInstanceOf(DemoReadOnly);
    });
    expect((await db().from("demo_state").select("changed_since_reset").single()).data?.changed_since_reset).toBe(false);
  });

  it("is not switched on by the reset job while another Workspace exists", async () => {
    const w = await workspace("A real Workspace");
    cleanups.push(w.cleanup);
    expect(await resetDemoWorkspace({ openToVisitors: true })).toBeTypeOf("boolean");
    expect((await db().from("demo_state").select("open_to_visitors").single()).data?.open_to_visitors).toBe(false);
  });
});

describe("the end of a seed is marked for its own Generation (D8)", () => {
  it("marks nothing for another Generation, and the right one for the current", async () => {
    expect((await db().rpc("demo_reset", { min_gap: "0 seconds" })).error).toBeNull();
    const generation = Number((await readDemoState())?.generation);
    expect((await db().rpc("demo_seed_done", { p_generation: generation - 1 })).error).toBeNull();
    expect((await readDemoState())?.seedDoneAt).toBeNull();
    expect((await db().rpc("demo_seed_done", { p_generation: generation })).error).toBeNull();
    expect((await readDemoState())?.seedDoneAt).not.toBeNull();
  });
});

// @ts-nocheck
// Make room against the real database (spec 0029, ticket #270): the Metrics to archive for a smaller Size, oldest
// latest value first and ticked until enough are, only for Owners and Admins and only Metrics they see.
import { afterEach, describe, expect, it } from "vitest";
import { Forbidden } from "./actor";
import { db } from "./db";
import { archiveForRoom, makeRoomPlan, roomTarget } from "./make-room";
import { share } from "./sharing";
import { workspace } from "./test/db-fixtures";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });

/** Five Metrics of Sara's with latest values in different months (one with none), one of Ben's not shared, one archived. */
async function setup() {
  const w = await workspace(); cleanups.push(w.cleanup);
  const sara = await w.person("owner"); const adam = await w.person("admin"); const ben = await w.person("member");
  const m = async (name: string, latest: string | null) => { const x = await w.metric(sara, { name }); if (latest) { await w.value(x.id, "2026-01-01", 1); await w.value(x.id, latest, 2); } return x; };
  const fresh = await m("Fresh", "2026-10-01"); const quiet = await m("Quiet", "2026-03-01"); const never = await m("Never", null);
  const middle = await m("Middle", "2026-06-01"); const recent = await m("Recent", "2026-09-01");
  const hidden = await w.metric(ben, { name: "Ben's own" });
  const gone = await w.metric(sara, { name: "Gone" });
  await db().from("metrics").update({ archived_at: new Date().toISOString() }).eq("id", gone.id);
  return { w, sara, adam, ben, fresh, quiet, never, middle, recent, hidden };
}

describe("Make room", () => {
  it("offers the Metrics the person sees, oldest latest value first, ticked until enough", async () => {
    const { w, sara, never, quiet, middle, recent, fresh } = await setup();
    const plan = await makeRoomPlan(w.actor(sara), 3);
    expect(plan).toMatchObject({ metrics: 6, to: 3, need: 3, hidden: 1 });
    expect(plan.offered.map((m) => m.id)).toEqual([never.id, quiet.id, middle.id, recent.id, fresh.id]);
    expect(plan.offered[0]).toEqual({ id: never.id, name: "Never", latest: null });
    expect(plan.ticked).toEqual([never.id, quiet.id, middle.id]);
    // Never a value: only names and periods.
    expect(Object.keys(plan.offered[1]).sort()).toEqual(["id", "latest", "name"]);
    expect((await makeRoomPlan(w.actor(sara), 10)).need).toBe(0);
  });

  it("is for Owners and Admins only, with a real number", async () => {
    const { w, adam, ben } = await setup();
    expect((await makeRoomPlan(w.actor(adam, "admin"), 3)).offered).toEqual([]);
    await expect(makeRoomPlan(w.actor(ben, "member"), 3)).rejects.toThrow(Forbidden);
    for (const bad of ["0", "-1", "1.5", "abc", "", "2000000"]) expect(() => roomTarget(bad)).toThrow(Forbidden);
    expect(roomTarget("50")).toBe(50);
  });

  it("archives what was ticked, leaving out what the person may not archive", async () => {
    const { w, sara, ben, never, quiet, hidden } = await setup();
    await expect(archiveForRoom(w.actor(ben, "member"), [never.id])).rejects.toThrow(Forbidden);
    await expect(archiveForRoom(w.actor(sara), ["1"])).rejects.toThrow("Tick at most");
    expect(await archiveForRoom(w.actor(sara), [never.id, quiet.id, hidden.id, never.id])).toBe(2);
    const { data } = await db().from("metrics").select("id").eq("workspace_id", w.id).not("archived_at", "is", null);
    expect((data ?? []).map((r) => r.id).sort()).toEqual(expect.arrayContaining([never.id, quiet.id]));
    expect((data ?? []).map((r) => r.id)).not.toContain(hidden.id);
    // Shared with Sara, Ben's Metric can be archived by her as an Owner.
    await share(w.actor(ben, "member"), "metric", hidden.id, sara, "viewer");
    expect(await archiveForRoom(w.actor(sara), [hidden.id])).toBe(1);
  });
});

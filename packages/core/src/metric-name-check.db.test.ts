// The name check for a new or renamed Metric, against the real database: same names across case and spaces, never
// the Metric being renamed, and never a Metric the person may not see.
import { afterEach, describe, expect, it } from "vitest";
import { sameNamedMetrics } from "./metric-name-check";
import { workspace } from "./test/db-fixtures";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });

describe("sameNamedMetrics", () => {
  it("finds a Metric of the same name, ignoring case and spaces, and not the one being renamed", async () => {
    const w = await workspace(); cleanups.push(w.cleanup);
    const ben = await w.person("member");
    const own = await w.metric(ben, { name: "Support tickets" });
    const found = await sameNamedMetrics(w.actor(ben, "member"), "  support   TICKETS ");
    expect(found).toEqual([{ slug: own.slug, name: "Support tickets", owner: expect.any(String), mine: true }]);
    expect(await sameNamedMetrics(w.actor(ben, "member"), "Support tickets", own.id)).toEqual([]);
    expect(await sameNamedMetrics(w.actor(ben, "member"), "   ")).toEqual([]);
    expect(await sameNamedMetrics(w.actor(ben, "member"), "Something else")).toEqual([]);
  });

  it("does not reveal a Metric the person may not see", async () => {
    const w = await workspace(); cleanups.push(w.cleanup);
    const ben = await w.person("member"); const cleo = await w.person("member");
    await w.metric(ben, { name: "Secret margin" });
    expect(await sameNamedMetrics(w.actor(cleo, "member"), "Secret margin")).toEqual([]);
  });
});

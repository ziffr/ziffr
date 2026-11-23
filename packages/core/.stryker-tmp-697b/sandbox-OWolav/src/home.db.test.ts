// @ts-nocheck
// Home (spec 0010, ticket #146): the starting dashboard and the switcher's list, against the real database.
import { afterEach, describe, expect, it } from "vitest";
import { Forbidden } from "./actor";
import { createDashboard } from "./dashboards";
import { share } from "./sharing";
import { db } from "./db";
import { chosenHomeId, homeDashboard, setHomeDashboard, switchableDashboards } from "./home";
import { workspace } from "./test/db-fixtures";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws(name?: string) { const w = await workspace(name); cleanups.push(w.cleanup); return w; }

describe("Home", () => {
  it("opens the chosen dashboard while it may be opened, else the first own, else the first shared", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member");
    const benA = w.actor(ben, "member");
    expect(await homeDashboard(benA)).toBeNull();
    const sales = await createDashboard(w.actor(sara), "Sales");
    await share(w.actor(sara), "dashboard", sales, ben, "viewer");
    expect((await homeDashboard(benA))?.id).toBe(sales);
    const mine = await createDashboard(benA, "Zebra");
    const mine2 = await createDashboard(benA, "Alpha");
    // Theirs first, by name; then shared.
    expect((await switchableDashboards(benA)).map((d) => d.id)).toEqual([mine2, mine, sales]);
    // The first one Ben made, though another sorts first by name.
    expect((await homeDashboard(benA))?.id).toBe(mine);
    await setHomeDashboard(benA, sales);
    expect((await homeDashboard(benA))?.id).toBe(sales);
    expect(await chosenHomeId(benA)).toBe(sales);
    // No longer shared: the default again, though the choice is kept until changed.
    await db().from("shares").delete().eq("object_type", "dashboard").eq("object_id", sales);
    expect((await homeDashboard(benA))?.id).toBe(mine);
    await setHomeDashboard(benA, null);
    expect(await chosenHomeId(benA)).toBeNull();
  });

  it("is each person's own choice, of a dashboard they may open in their workspace", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member");
    const hers = await createDashboard(w.actor(sara), "Payroll");
    await expect(setHomeDashboard(w.actor(ben, "member"), hers)).rejects.toEqual(expect.any(Forbidden));
    const other = await ws("Other"); const zoe = await other.person("owner");
    const zoes = await createDashboard(other.actor(zoe), "Elsewhere");
    await expect(setHomeDashboard(w.actor(sara), zoes)).rejects.toEqual(expect.any(Forbidden));
    await setHomeDashboard(w.actor(sara), hers);
    expect(await chosenHomeId(w.actor(ben, "member"))).toBeNull();
  });
});

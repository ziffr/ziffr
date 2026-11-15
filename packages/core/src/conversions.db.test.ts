// Turning one into another (spec 0010, ticket #149; spec 0013): the makings of a deck, against the database.
import { afterEach, describe, expect, it } from "vitest";
import { Forbidden } from "./actor";
import { createDashboard, placeWidget, saveDashboardText } from "./dashboards";
import { deckSeed } from "./conversions";
import { workspace } from "./test/db-fixtures";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws(name?: string) { const w = await workspace(name); cleanups.push(w.cleanup); return w; }
const forbidden = expect.any(Forbidden);

describe("conversions", () => {
  it("give a deck its makings, in reading order, only from what the person may open", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member");
    const a = await w.metric(sara, { name: "Revenue" }); const b = await w.metric(sara, { name: "Cost" });
    const dash = await createDashboard(w.actor(sara), "October");
    await saveDashboardText(w.actor(sara), dash, { intro: "What happened." });
    await placeWidget(w.actor(sara), dash, { type: "metric", id: b.id }, { x: 6, y: 0 });
    await placeWidget(w.actor(sara), dash, { type: "metric", id: a.id }, { x: 0, y: 0 });
    const seed = await deckSeed(w.actor(sara), dash);
    expect(seed).toMatchObject({ name: "October", intro: "What happened." });
    expect(seed.widgets.map((x) => x.metric_ids)).toEqual([[a.id], [b.id]]);
    await expect(deckSeed(w.actor(ben, "member"), dash)).rejects.toEqual(forbidden);
    const other = await ws("Other"); const zoe = await other.person("owner");
    await expect(deckSeed(other.actor(zoe), dash)).rejects.toEqual(forbidden);
  });
});

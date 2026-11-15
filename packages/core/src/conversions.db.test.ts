// Turning one into another (spec 0010, ticket #149): a story from a dashboard, the makings of a deck, against the database.
import { afterEach, describe, expect, it } from "vitest";
import { Forbidden } from "./actor";
import { createDashboard, placeWidget } from "./dashboards";
import { deckSeed, storyFromDashboard } from "./conversions";
import { dashboardWidgets } from "./page-data";
import { share } from "./sharing";
import { createStory, saveStoryText, visibleStories } from "./stories";
import { workspace } from "./test/db-fixtures";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws(name?: string) { const w = await workspace(name); cleanups.push(w.cleanup); return w; }
const forbidden = expect.any(Forbidden);

describe("conversions", () => {
  it("make a story from a dashboard the person may open: its own copy, in reading order, one Finding per row", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member"); const gus = await w.person("guest");
    const a = await w.metric(sara, { name: "Revenue" }); const b = await w.metric(sara, { name: "Cost" });
    const dash = await createDashboard(w.actor(sara), "Overview");
    await placeWidget(w.actor(sara), dash, { type: "metric", id: b.id }, { x: 6, y: 0 });
    await placeWidget(w.actor(sara), dash, { type: "metric", id: a.id }, { x: 0, y: 0 });
    // Ben may look at it, so he may make his own story of it; a Guest may not create; a stranger sees nothing.
    await share(w.actor(sara), "dashboard", dash, ben, "viewer");
    const story = await storyFromDashboard(w.actor(ben, "member"), dash);
    expect((await visibleStories(w.actor(ben, "member"))).find((s) => s.id === story)).toMatchObject({ name: "Overview", role: "owner" });
    const findings = await dashboardWidgets(w.actor(ben, "member"), story);
    expect(findings.map((f) => [f.metric_ids[0], f.x, f.w])).toEqual([[a.id, 0, 12], [b.id, 0, 12]]);
    await share(w.actor(sara), "dashboard", dash, gus, "viewer");
    await expect(storyFromDashboard(w.actor(gus, "guest"), dash)).rejects.toEqual(forbidden);
    const other = await ws("Other"); const zoe = await other.person("owner");
    await expect(storyFromDashboard(other.actor(zoe), dash)).rejects.toEqual(forbidden);
    // A story is a story already.
    await expect(storyFromDashboard(w.actor(sara), await createStory(w.actor(sara), "S"))).rejects.toEqual(forbidden);
  });

  it("give a deck its makings only from what the person may open", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member");
    const a = await w.metric(sara, { name: "Revenue" });
    const story = await createStory(w.actor(sara), "October");
    await saveStoryText(w.actor(sara), story, { intro: "What happened." });
    await placeWidget(w.actor(sara), story, { type: "metric", id: a.id });
    const seed = await deckSeed(w.actor(sara), story);
    expect(seed).toMatchObject({ name: "October", intro: "What happened.", kind: "story" });
    expect(seed.widgets.map((x) => x.metric_ids)).toEqual([[a.id]]);
    await expect(deckSeed(w.actor(ben, "member"), story)).rejects.toEqual(forbidden);
  });
});

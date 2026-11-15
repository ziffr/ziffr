// Stories (spec 0010, ticket #148): kept as dashboards of kind "story", with their own operations, against the database.
import { afterEach, describe, expect, it } from "vitest";
import { Forbidden } from "./actor";
import { createDashboard } from "./dashboards";
import { db } from "./db";
import { switchableDashboards, setHomeDashboard } from "./home";
import { dashboardWidgets } from "./page-data";
import { share } from "./sharing";
import { addFinding, createStory, moveFinding, saveStoryText, visibleStories } from "./stories";
import { visibleMetricIds } from "./access";
import { buildView } from "./view-links";
import { getMetrics } from "./workspace-data";
import { workspace } from "./test/db-fixtures";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws(name?: string) { const w = await workspace(name); cleanups.push(w.cleanup); return w; }
const forbidden = expect.any(Forbidden);

describe("stories", () => {
  it("are listed apart from dashboards, written by their owner and Editors, and never a Home", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member"); const ann = await w.person("member");
    const dash = await createDashboard(w.actor(sara), "Overview");
    const story = await createStory(w.actor(sara), "October in short");
    expect((await visibleStories(w.actor(sara))).map((s) => s.id)).toEqual([story]);
    expect((await switchableDashboards(w.actor(sara))).map((d) => d.id)).toEqual([dash]);
    await expect(setHomeDashboard(w.actor(sara), story)).rejects.toEqual(forbidden);
    // Only for stories: a dashboard is not changed through them.
    await expect(saveStoryText(w.actor(sara), dash, { intro: "x" })).rejects.toEqual(forbidden);

    await share(w.actor(sara), "dashboard", story, ben, "editor");
    await share(w.actor(sara), "dashboard", story, ann, "viewer");
    await saveStoryText(w.actor(ben, "member"), story, { name: "October", intro: "Revenue grew." });
    await expect(saveStoryText(w.actor(ann, "member"), story, { intro: "mine" })).rejects.toEqual(forbidden);
    await expect(saveStoryText(w.actor(ben, "member"), story, { name: "  " })).rejects.toThrow(/title/);
    const { data } = await db().from("dashboards").select("name, intro, kind").eq("id", story).single();
    expect(data).toEqual({ name: "October", intro: "Revenue grew.", kind: "story" });
    expect((await visibleStories(w.actor(ann, "member"))).map((s) => s.role)).toEqual(["viewer"]);
  });

  it("add Findings only about Metrics the writer sees, keep them one per row, and reorder them", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member");
    const a = await w.metric(sara, { name: "Revenue" }); const b = await w.metric(sara, { name: "Cost" }); const secret = await w.metric(ben, { name: "Payroll" });
    const story = await createStory(w.actor(sara), "Month");
    await addFinding(w.actor(sara), story, a.id);
    await addFinding(w.actor(sara), story, b.id);
    await expect(addFinding(w.actor(sara), story, secret.id)).rejects.toEqual(forbidden);
    let list = await dashboardWidgets(w.actor(sara), story);
    expect(list.map((x) => [x.metric_ids[0], x.template, x.x, x.w])).toEqual([[a.id, "story", 0, 12], [b.id, "story", 0, 12]]);
    await moveFinding(w.actor(sara), story, list[1].id, -1);
    list = await dashboardWidgets(w.actor(sara), story);
    expect(list.map((x) => x.metric_ids[0])).toEqual([b.id, a.id]);
    // Shared, a story shows its Metrics to its readers, as a dashboard does.
    await share(w.actor(sara), "dashboard", story, ben, "viewer");
    expect((await visibleMetricIds(w.id, ben, await getMetrics(w.id))).has(a.id)).toBe(true);
    // Through a View Link it reads as a story: its introduction comes along; a dashboard's link has none.
    await saveStoryText(w.actor(sara), story, { intro: "What happened." });
    expect((await buildView("dashboard", story))?.story).toEqual({ intro: "What happened." });
    expect((await buildView("dashboard", await createDashboard(w.actor(sara), "Board")))?.story).toBeUndefined();
  });
});

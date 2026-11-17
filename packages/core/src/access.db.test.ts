// Who sees what, as loaded from the real database (GLOSSARY: Share, Group, Token, Stand-in): dashboards, decks and
// Metrics read their shares once and decide as before, and nothing of another workspace counts.
import { afterEach, describe, expect, it } from "vitest";
import { canvasSeries, getCanvasData, revealedBy, visibleDashboards, visibleDecks, visibleMetricIds } from "./access";
import { Forbidden } from "./actor";
import { share } from "./sharing";
import { db } from "./db";
import { workspace } from "./test/db-fixtures";
import { getMetrics } from "./workspace-data";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws(name?: string) { const w = await workspace(name); cleanups.push(w.cleanup); return w; }
async function insert(table: string, row: Record<string, unknown>) {
  const { data, error } = await db().from(table).insert(row).select("id").single();
  if (error) throw new Error(error.message);
  return data.id as number;
}

describe("visibility facts", () => {
  it("give roles through people and Groups, the stronger winning, and Metrics through shares, Tokens and shared dashboards", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member"); const anna = await w.person("member"); const zoe = await w.person("member");
    const ops = await insert("groups", { name: "Ops", workspace_id: w.id });
    for (const u of [ben, anna]) await db().from("group_members").insert({ group_id: ops, user_id: u, workspace_id: w.id });
    const board = await insert("dashboards", { name: "Board", owner_id: sara, workspace_id: w.id });
    const deck = await insert("decks", { name: "Review", owner_id: sara, workspace_id: w.id, document: {} });
    const shown = await w.metric(sara, { name: "Shown" }); const direct = await w.metric(sara, { name: "Direct" }); const submitted = await w.metric(sara, { name: "Submitted" }); const hidden = await w.metric(sara, { name: "Hidden" });
    await insert("widgets", { owner_id: sara, dashboard_id: board, template: "line", metric_ids: [shown.id], settings: {}, workspace_id: w.id });
    await insert("shares", { object_type: "dashboard", object_id: board, group_id: ops, role: "viewer", workspace_id: w.id });
    await insert("shares", { object_type: "dashboard", object_id: board, user_id: anna, role: "editor", workspace_id: w.id });
    await insert("shares", { object_type: "deck", object_id: deck, group_id: ops, role: "editor", workspace_id: w.id });
    await insert("shares", { object_type: "metric", object_id: direct.id, user_id: anna, role: "viewer", workspace_id: w.id });
    await w.token(submitted.id, ben);
    // A dashboard of another workspace with the same people named counts for nobody here.
    const other = await ws("Other");
    await insert("dashboards", { name: "Elsewhere", owner_id: zoe, workspace_id: other.id });

    expect((await visibleDashboards(w.id, ben)).map((d) => [d.id, d.role])).toEqual([[board, "viewer"]]);
    expect((await visibleDashboards(w.id, anna)).map((d) => [d.id, d.role])).toEqual([[board, "editor"]]);
    expect(await visibleDashboards(w.id, zoe)).toEqual([]);
    expect((await visibleDecks(w.id, anna)).map((d) => [d.id, d.role])).toEqual([[deck, "editor"]]);

    const metrics = await getMetrics(w.id);
    const seen = async (p: string) => [...(await visibleMetricIds(w.id, p, metrics))].sort((a, b) => a - b);
    expect(await seen(ben)).toEqual([shown.id, submitted.id].sort((a, b) => a - b));
    expect(await seen(anna)).toEqual([shown.id, direct.id].sort((a, b) => a - b));
    expect(await seen(zoe)).toEqual([]);
    expect(await seen(sara)).toEqual([shown.id, direct.id, submitted.id, hidden.id].sort((a, b) => a - b));

    // Sharing Direct and Submitted would show Ben Direct (he submits to the other), Anna Submitted (Direct is hers).
    const revealed = await revealedBy(w.id, [direct.id, submitted.id], sara);
    expect(revealed[ben]).toEqual(["Direct"]);
    expect(revealed[anna]).toEqual(["Submitted"]);
    expect(revealed[zoe].sort()).toEqual(["Direct", "Submitted"]);
    expect(revealed[`g${ops}`].sort()).toEqual(["Direct", "Submitted"]);
    expect(revealed[sara]).toBeUndefined();
  });
});

describe("canvas series (ticket #125)", () => {
  it("sends only the series a page asks for, with a Derived Metric's visible inputs, and fetches more only of what the person sees", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member");
    const a = await w.metric(sara, { name: "A" }); const b = await w.metric(sara, { name: "B" }); const hidden = await w.metric(sara, { name: "Hidden" });
    const ratio = await w.metric(sara, { name: "Ratio", formula: `{${a.slug}} / {${b.slug}}` });
    await w.value(a.id, "2026-10-01", 10); await w.value(b.id, "2026-10-01", 4); await w.value(hidden.id, "2026-10-01", 9999.5);
    for (const m of [a, ratio]) await share(w.actor(sara), "metric", m.id, ben, "viewer");

    // Sara's dashboard draws Ratio: its series and its inputs' go out, nothing else; a Metric with no values gets [].
    const page = await getCanvasData(w.id, sara, { seriesOf: [ratio.id] });
    expect(Object.keys(page.series).sort()).toEqual([a.slug, b.slug, ratio.slug].sort());
    expect(page.series[ratio.slug]).toEqual([{ period: "2026-10-01", value: 2.5 }]);
    expect(page.metrics.map((m) => m.id).sort()).toEqual([a.id, b.id, hidden.id, ratio.id].sort());
    expect(Object.keys((await getCanvasData(w.id, sara, { seriesOf: (v) => v.slice(0, 1).map((m) => m.id) })).series)).toHaveLength(1);
    expect((await getCanvasData(w.id, sara, { seriesOf: [] })).series).toEqual({});

    // Ben sees A and Ratio, not B: Ratio's value is computed from both, but B's series stays out.
    const forBen = await getCanvasData(w.id, ben, { seriesOf: [ratio.id, hidden.id] });
    expect(Object.keys(forBen.series).sort()).toEqual([a.slug, ratio.slug].sort());
    expect(forBen.series[ratio.slug]).toEqual([{ period: "2026-10-01", value: 2.5 }]);

    // Fetching more: only visible Metrics, whole positive ids, at most 200.
    const more = await canvasSeries(w.actor(ben, "member"), [hidden.id, b.id, a.id]);
    expect(Object.keys(more.series)).toEqual([a.slug]);
    // A value no slug can hold (slugs are hex, without a point): the hidden Metric's value must not be sent.
    expect(JSON.stringify(more)).not.toContain("9999.5");
    for (const bad of ["1,2", [1.5], [-1], [0], Array.from({ length: 201 }, (_, i) => i + 1), [`${a.id}`]]) {
      await expect(canvasSeries(w.actor(ben, "member"), bad)).rejects.toEqual(expect.any(Forbidden));
    }
    // Another workspace's actor gets nothing of this one.
    const other = await ws("Other"); const zoe = await other.person("owner");
    expect((await canvasSeries(other.actor(zoe), [a.id, b.id])).series).toEqual({});
  });
});

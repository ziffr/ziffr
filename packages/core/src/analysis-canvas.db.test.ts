// The Analysis Canvas as stored (GLOSSARY: Analysis Canvas): what a person drops on it stays there, in order, in
// their workspace, and only Metrics they see may land on it.
import { afterEach, describe, expect, it } from "vitest";
import { canvasAdd, canvasExplain, canvasMetricIds, canvasRemove, canvasSet, canvasState } from "./dashboards";
import { workspace } from "./test/db-fixtures";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws(name?: string) { const w = await workspace(name); cleanups.push(w.cleanup); return w; }

describe("Analysis Canvas", () => {
  it("keeps what is added, in order, and takes it off again", async () => {
    const w = await ws(); const sara = await w.person("owner");
    const a = await w.metric(sara, { name: "A" }); const b = await w.metric(sara, { name: "B" });
    const me = w.actor(sara, "owner");
    await canvasAdd(me, [a.id]);
    expect(await canvasMetricIds(me)).toEqual([a.id]);
    await canvasAdd(me, [b.id, a.id]);
    expect(await canvasMetricIds(me)).toEqual([a.id, b.id]);
    await canvasRemove(me, a.id);
    expect(await canvasMetricIds(me)).toEqual([b.id]);
    await canvasSet(me, [a.id, b.id]);
    expect(await canvasMetricIds(me)).toEqual([a.id, b.id]);
  });

  it("keeps which Metric is the one to explain apart from the order, and moves the mark when that Metric leaves (#988)", async () => {
    const w = await ws(); const sara = await w.person("owner");
    const [a, b, c] = [await w.metric(sara, { name: "A" }), await w.metric(sara, { name: "B" }), await w.metric(sara, { name: "C" })];
    const me = w.actor(sara, "owner");
    await canvasAdd(me, [a.id, b.id, c.id]);
    expect(await canvasState(me)).toEqual({ ids: [a.id, b.id, c.id], explains: null });
    await canvasExplain(me, b.id);
    expect(await canvasState(me)).toEqual({ ids: [a.id, b.id, c.id], explains: b.id });
    // Setting the canvas again in another order keeps the mark while its Metric is there.
    await canvasSet(me, [c.id, b.id, a.id]);
    expect(await canvasState(me)).toEqual({ ids: [c.id, b.id, a.id], explains: b.id });
    // Another mark replaces it: only one at a time.
    await canvasExplain(me, a.id);
    expect((await canvasState(me)).explains).toBe(a.id);
    await canvasRemove(me, a.id);
    expect(await canvasState(me)).toEqual({ ids: [c.id, b.id], explains: b.id });
    await canvasRemove(me, b.id);
    expect(await canvasState(me)).toEqual({ ids: [c.id], explains: c.id });
    // A Recipe names its own.
    await canvasSet(me, [a.id, b.id], b.id);
    expect((await canvasState(me)).explains).toBe(b.id);
    // A Metric that is not on the canvas is refused, and nothing changes.
    await expect(canvasExplain(me, c.id)).rejects.toThrow("not on the canvas");
    expect((await canvasState(me)).explains).toBe(b.id);
  });
});

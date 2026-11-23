// The Analysis Canvas as stored (GLOSSARY: Analysis Canvas): what a person drops on it stays there, in order, in
// their workspace, and only Metrics they see may land on it.
import { afterEach, describe, expect, it } from "vitest";
import { canvasAdd, canvasMetricIds, canvasRemove, canvasSet } from "./dashboards";
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
});

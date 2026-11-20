// GET /api/v1/metrics/{slug}/thread over HTTP (ticket #407): the shape, the scope and a bad period. Which Threads a key
// may read is proven in packages/core/src/api-thread.db.test.ts.
import { afterEach, describe, expect, it } from "vitest";
import { createAccessKey } from "@ziffr/core/access-keys";
import { workspace } from "@ziffr/core/test/db-fixtures";
import { GET } from "./route";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

async function setup(scopes: ("metrics:read" | "values:submit")[]) {
  const w = await workspace(); cleanups.push(w.cleanup);
  const ben = await w.person("member"); const m = await w.metric(ben);
  await w.value(m.id, "2026-10-01", 5, ben);
  await w.action({ metric_id: m.id, period_start: "2026-10-01", asker_id: ben, assignee_id: ben, question: "Why?" });
  const { secret } = await createAccessKey(w.actor(ben, "member"), { name: "Assistant", scopes, expiresOn: inDays(30) });
  return (period: string) => GET(new Request(`http://ziffr.test/api/v1/metrics/${m.slug}/thread?period=${period}`, { headers: { authorization: `Bearer ${secret}` } }), { params: Promise.resolve({ slug: m.slug }) });
}

describe("GET /api/v1/metrics/{slug}/thread", () => {
  it("answers the readable Threads of a period, and nothing for a period without one", async () => {
    const get = await setup(["metrics:read"]);
    const res = await get("2026-10-01");
    expect(res.status).toBe(200);
    expect((await res.json()).threads).toEqual([expect.objectContaining({ question: "Why?", messages: [] })]);
    expect((await (await get("2026-09-01")).json()).threads).toEqual([]);
  });
  it("refuses a bad period and a key without metrics:read", async () => {
    expect((await (await setup(["metrics:read"]))("yesterday")).status).toBe(400);
    expect((await (await setup(["values:submit"]))("2026-10-01")).status).toBe(403);
  });
});

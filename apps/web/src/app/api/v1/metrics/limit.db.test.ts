// The Workspace Limit through the API (spec 0029, ticket #265): creating a Metric past the rule answers 403 with the
// code workspace_limit, the app's words, and the count and limit; so does bringing an Archived Metric back.
import { afterEach, describe, expect, it } from "vitest";
import { createAccessKey } from "@ziffr/core/access-keys";
import { archiveMetric } from "@ziffr/core/archived-metrics";
import { getMetrics } from "@ziffr/core/workspace-data";
import { workspace } from "@ziffr/core/test/db-fixtures";
import { POST as create } from "./route";
import { POST as restore } from "./[slug]/restore/route";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

describe("the Workspace Limit through the API", () => {
  it("answers 403 workspace_limit with the count and limit, and creates nothing", async () => {
    const w = await workspace(); cleanups.push(w.cleanup);
    const sara = await w.person("owner");
    const a = await w.metric(sara, { name: "A" }); await w.metric(sara, { name: "B" });
    await archiveMetric(w.actor(sara), a.id);
    await w.limit(1, "Free", 20);
    const { secret } = await createAccessKey(w.actor(sara), { name: "Builder", scopes: ["metrics:read", "metrics:write"], expiresOn: inDays(30) });
    const headers = { authorization: `Bearer ${secret}`, "content-type": "application/json" };

    const refused = await create(new Request("http://ziffr.test/api/v1/metrics", { method: "POST", headers, body: JSON.stringify({ name: "C" }) }), undefined as never);
    expect(refused.status).toBe(403);
    expect(await refused.json()).toEqual({ error: { code: "workspace_limit", message: "This Workspace holds 1 Metric, as many as its Size Free allows. Archive a Metric, or ask an Owner to change the Size.", count: 1, limit: 1 } });
    expect(await getMetrics(w.id)).toHaveLength(2);

    const back = await restore(new Request(`http://ziffr.test/api/v1/metrics/${a.slug}/restore`, { method: "POST", headers }), { params: Promise.resolve({ slug: a.slug }) });
    expect(back.status).toBe(403);
    expect((await back.json()).error).toMatchObject({ code: "workspace_limit", count: 1, limit: 1 });
  });
});

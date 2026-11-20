// GET /api/v1/find over HTTP (ticket #412): key sign-in, scope, the words, and the answer's shape. What a key may find is
// proven in the core's search.db.test.ts.
import { afterEach, describe, expect, it } from "vitest";
import { createAccessKey } from "@ziffr/core/access-keys";
import { workspace } from "@ziffr/core/test/db-fixtures";
import { GET } from "./route";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const call = (path: string, key?: string) => GET(new Request(`http://ziffr.test${path}`, { headers: key ? { authorization: `Bearer ${key}` } : {} }), undefined);

async function setup(scopes: ("metrics:read" | "values:submit")[] = ["metrics:read"]) {
  const w = await workspace(); cleanups.push(w.cleanup);
  const ben = await w.person("member");
  const churn = await w.metric(ben, { name: "Churn rate" });
  await w.metric(await w.person("owner"), { name: "Churn of someone else" });
  const { secret } = await createAccessKey(w.actor(ben, "member"), { name: "Script", scopes, expiresOn: inDays(30) });
  return { key: secret, churn };
}

describe("GET /api/v1/find", () => {
  it("needs a key and the scope metrics:read", async () => {
    expect((await call("/api/v1/find?q=churn")).status).toBe(401);
    expect((await call("/api/v1/find?q=churn", (await setup(["values:submit"])).key)).status).toBe(403);
  });
  it("answers Metric + period, then Metrics, only those the key's creator sees", async () => {
    const { key, churn } = await setup();
    const res = await call("/api/v1/find?q=churn%20march%202026", key);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ items: [
      { slug: churn.slug, name: "Churn rate", archived: false, period: "2026-03-01", period_label: "March 2026" },
      { slug: churn.slug, name: "Churn rate", archived: false, period: null, period_label: null },
    ] });
  });
  it("answers 400 for no words or too many", async () => {
    const { key } = await setup();
    for (const q of ["", "q=", `q=${"x".repeat(101)}`]) expect((await call(`/api/v1/find?${q.startsWith("q=") || q === "" ? q : `q=${q}`}`, key)).status, q).toBe(400);
  });
});

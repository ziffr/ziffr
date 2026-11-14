// The read endpoints over HTTP (spec 0002, ticket #48): a Metric, its values, people and Groups. Paging, ranges,
// status codes and the error shape; what a key may see is proven in the core's api.db.test.ts.
import { afterEach, describe, expect, it } from "vitest";
import { createAccessKey } from "@ziffr/core/access-keys";
import { workspace } from "@ziffr/core/test/db-fixtures";
import { GET as metric } from "./route";
import { GET as observations } from "./observations/route";
import { GET as people } from "../../people/route";
import { GET as groups } from "../../groups/route";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const req = (path: string, key: string) => new Request(`http://ziffr.test${path}`, { headers: { authorization: `Bearer ${key}` } });
const ctx = (slug: string) => ({ params: Promise.resolve({ slug }) });

async function setup() {
  const w = await workspace(); cleanups.push(w.cleanup);
  const ben = await w.person("member"); const sara = await w.person("owner");
  const m = await w.metric(ben, { name: "Orders", period: "week" });
  const hidden = await w.metric(sara, { name: "Payroll" });
  const weeks = ["2026-01-05", "2026-01-12", "2026-01-19", "2026-01-26"];
  for (const [i, p] of weeks.entries()) await w.value(m.id, p, i + 1);
  const { secret } = await createAccessKey(w.actor(ben, "member"), { name: "Script", scopes: ["metrics:read"], expiresOn: inDays(30) });
  return { key: secret, m, hidden };
}

describe("read endpoints", () => {
  it("describe a Metric, and answer 404 for a hidden one and 400 for a malformed slug", async () => {
    const { key, m, hidden } = await setup();
    const ok = await metric(req(`/api/v1/metrics/${m.slug}`, key), ctx(m.slug));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual(expect.objectContaining({ slug: m.slug, name: "Orders", period: "week" }));
    const gone = await metric(req(`/api/v1/metrics/${hidden.slug}`, key), ctx(hidden.slug));
    expect(gone.status).toBe(404);
    expect(await gone.json()).toEqual({ error: { code: "not_found", message: "Not found." } });
    expect((await metric(req("/api/v1/metrics/Bad%20Slug", key), ctx("Bad Slug"))).status).toBe(400);
  });
  it("return values in a range, paged with a cursor, and refuse a bad range", async () => {
    const { key, m } = await setup();
    const path = `/api/v1/metrics/${m.slug}/observations?from=2026-01-12&to=2026-01-26&limit=2`;
    const first = await (await observations(req(path, key), ctx(m.slug))).json();
    expect(first.items.map((o: { period: string; value: number }) => [o.period, o.value])).toEqual([["2026-01-12", 2], ["2026-01-19", 3]]);
    expect(first.next).toEqual(expect.any(String));
    const second = await (await observations(req(`${path}&cursor=${first.next}`, key), ctx(m.slug))).json();
    expect(second).toEqual({ items: [expect.objectContaining({ period: "2026-01-26", value: 4, state: "recorded" })], next: null });
    for (const bad of ["from=2026-02-01&to=2026-01-01", "from=January", "cursor=nonsense", "limit=500"]) {
      const res = await observations(req(`/api/v1/metrics/${m.slug}/observations?${bad}`, key), ctx(m.slug));
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe("invalid_request");
    }
  });
  it("list people with ids and names only, and Groups, a page at a time", async () => {
    const { key } = await setup();
    const first = await (await people(req("/api/v1/people?limit=1", key), undefined)).json();
    expect(first.items).toEqual([{ id: expect.any(String), name: expect.any(String), contact: false }]);
    const second = await (await people(req(`/api/v1/people?limit=1&cursor=${first.next}`, key), undefined)).json();
    expect(second.items[0].id).not.toBe(first.items[0].id);
    expect(second.next).toBeNull();
    const g = await (await groups(req("/api/v1/groups", key), undefined)).json();
    expect(g).toEqual({ items: [{ id: expect.any(Number), name: "Everyone in the workspace", everyone: true }], next: null });
  });
});

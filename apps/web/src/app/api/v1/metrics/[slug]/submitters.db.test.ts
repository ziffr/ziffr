// Submitters through the API (ticket #217; GLOSSARY: Submitter, Source): GET and POST /metrics/{slug}/submitters,
// GET /feeds, and Sources and Submitters on POST /metrics. Naming Submitters needs metrics:edit and a creator who
// owns the Metric or is its Editor; a key made only to create Metrics is refused.
import { afterEach, describe, expect, it } from "vitest";
import { createAccessKey } from "@ziffr/core/access-keys";
import { createFeed } from "@ziffr/core/feeds";
import { share } from "@ziffr/core/sharing";
import { workspace } from "@ziffr/core/test/db-fixtures";
import * as feeds from "../../feeds/route";
import * as metrics from "../route";
import * as submitters from "./submitters/route";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const req = (method: string, path: string, key: string, body?: unknown) =>
  new Request(`http://ziffr.test/api/v1${path}`, { method, headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const ctx = (slug: string) => ({ params: Promise.resolve({ slug }) });

async function setup() {
  const w = await workspace(); cleanups.push(w.cleanup);
  const ben = await w.person("member"); const sara = await w.person("owner"); const ann = await w.person("member");
  const contact = await w.contact({ email: "field@example.test" });
  const { id: crm } = await createFeed(w.actor(sara, "owner"), "CRM");
  const mine = await w.metric(ben, { name: "Orders" });
  const viewed = await w.metric(sara, { name: "Payroll" });
  await share(w.actor(sara), "metric", viewed.id, ben, "viewer");
  const key = async (scopes: ("metrics:read" | "metrics:write" | "metrics:edit")[]) => (await createAccessKey(w.actor(ben, "member"), { name: "Setup", scopes, expiresOn: inDays(30) })).secret;
  return { w, ben, ann, contact, crm, mine, viewed, editor: await key(["metrics:read", "metrics:write", "metrics:edit"]), creating: await key(["metrics:read", "metrics:write"]), reader: await key(["metrics:read"]) };
}

describe("Submitters through the API", () => {
  it("adds and removes Submitters for the creator's own Metrics, with metrics:edit only", async () => {
    const { ann, contact, crm, mine, viewed, editor, creating, reader } = await setup();
    const change = (slug: string, key: string, body: unknown) => submitters.POST(req("POST", `/metrics/${slug}/submitters`, key, body), ctx(slug));
    expect((await change(mine.slug, creating, { add: [ann] })).status).toBe(403);
    expect((await change(mine.slug, reader, { add: [ann] })).status).toBe(403);
    expect((await change(viewed.slug, editor, { add: [ann] })).status).toBe(403);
    expect((await change(mine.slug, editor, {})).status).toBe(400);
    expect((await change(mine.slug, editor, { add: Array.from({ length: 21 }, (_, i) => `p${i}`) })).status).toBe(400);
    expect((await change(mine.slug, editor, { add: ["someone-else"] })).status).toBe(422);
    const ok = await change(mine.slug, editor, { add: [ann, contact, crm] });
    expect(ok.status).toBe(200);
    const body = await ok.json();
    expect(body).toMatchObject({ added: 3, removed: 0 });
    expect(body.items.map((x: { kind: string }) => x.kind).sort()).toEqual(["contact", "feed", "person"]);
    // Read with metrics:read: ids, names and kinds, never contact details.
    const list = await (await submitters.GET(req("GET", `/metrics/${mine.slug}/submitters`, reader), ctx(mine.slug))).json();
    expect(list.items).toHaveLength(3);
    expect(Object.keys(list.items[0]).sort()).toEqual(["id", "kind", "name"]);
    expect(await (await change(mine.slug, editor, { remove: [contact] })).json()).toMatchObject({ added: 0, removed: 1 });
  });

  it("creates a Metric with its Sources, and its Submitters only with metrics:edit; lists Feeds with metrics:edit", async () => {
    const { ann, crm, editor, creating } = await setup();
    const create = (key: string, body: unknown) => metrics.POST(req("POST", "/metrics", key, body), { params: Promise.resolve({}) } as never);
    const plain = await create(creating, { name: "Visits", sources: ["web_form"] });
    expect(plain.status).toBe(201);
    expect((await plain.json()).sources).toEqual(["web_form"]);
    expect((await create(creating, { name: "Calls", submitters: [ann] })).status).toBe(403);
    expect((await create(editor, { name: "Calls", sources: ["fax"] })).status).toBe(400);
    expect((await create(editor, { name: "Calls", submitters: ["nobody"] })).status).toBe(422);
    const made = await create(editor, { name: "Calls", sources: ["mail"], submitters: [ann, crm] });
    expect(made.status).toBe(201);
    expect((await made.json()).sources.sort()).toEqual(["api", "mail"]);
    expect((await feeds.GET(req("GET", "/feeds", creating), {} as never)).status).toBe(403);
    expect(await (await feeds.GET(req("GET", "/feeds", editor), {} as never)).json()).toEqual({ items: [{ id: crm, name: "CRM" }] });
  });
});

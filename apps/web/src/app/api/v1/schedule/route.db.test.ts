// GET /api/v1/schedule over HTTP (spec 0027, ticket #241; GLOSSARY: Schedule): a key that may read metrics gets its
// creator's Schedule with links into Ziffr, one that may only submit values or a Feed Key gets 403, a span the core
// refuses is 400, and every call is in the Access Log. The answer matches the OpenAPI document's schema.
import { afterEach, describe, expect, it } from "vitest";
import { createAccessKey } from "@ziffr/core/access-keys";
import { createFeed, createFeedKey } from "@ziffr/core/feeds";
import { accessLogOf, workspace } from "@ziffr/core/test/db-fixtures";
import { ScheduleAnswer } from "../schemas";
import { GET } from "./route";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const get = (secret: string, q = "") => GET(new Request(`http://ziffr.test/api/v1/schedule${q}`, { headers: { authorization: `Bearer ${secret}` } }), {} as never);

describe("GET /api/v1/schedule", () => {
  it("answers the key's creator's Schedule, overdue first, with links into Ziffr", async () => {
    const w = await workspace(); cleanups.push(w.cleanup);
    const sara = await w.person("owner"); const ben = await w.person("member");
    // A Metric of long ago without a Workflow: last period, without a value, is overdue or due today.
    const m = await w.metric(sara, { name: "Revenue", created_at: "2025-01-01T00:00:00Z" });
    await w.token(m.id, ben, { created_at: "2025-01-01T00:00:00Z" });
    const today = inDays(0);
    const task = await w.action({ metric_id: m.id, period_start: "2026-01-01", asker_id: sara, assignee_id: ben, kind: "task", question: "Renegotiate the shipping rate", due_date: today });
    const { id, secret } = await createAccessKey(w.actor(ben, "member"), { name: "Read", scopes: ["metrics:read"], expiresOn: inDays(30) });
    const res = await get(secret, `?from=${today}&to=${today}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(ScheduleAnswer.parse(body)).toEqual(body);
    const all = [...body.overdue, ...body.days.flatMap((d: { entries: unknown[] }) => d.entries)];
    expect(all).toContainEqual(expect.objectContaining({ kind: "value_due", metric: { slug: m.slug, name: "Revenue" }, no_due_date: true, url: `http://ziffr.test/schedule/submit/${m.slug}` }));
    expect(all).toContainEqual(expect.objectContaining({ kind: "task", date: today, action_id: task, text: "Renegotiate the shipping rate", url: `http://ziffr.test/actions/${task}` }));
    expect(await accessLogOf(id)).toEqual([{ method: "GET", route: "/api/v1/schedule", status: 200, submitted: 0 }]);
  });

  it("gives an Owner or Admin a teammate's Schedule, only about Metrics they see, and refuses everyone else", async () => {
    const w = await workspace(); cleanups.push(w.cleanup);
    const sara = await w.person("owner"); const ann = await w.person("admin"); const ben = await w.person("member"); const eve = await w.person("member");
    const shared = await w.metric(sara, { name: "Revenue", created_at: "2025-01-01T00:00:00Z" });
    const own = await w.metric(ben, { name: "Ben's own", created_at: "2025-01-01T00:00:00Z" });
    await w.token(shared.id, ben, { created_at: "2025-01-01T00:00:00Z" }); await w.token(own.id, ben, { created_at: "2025-01-01T00:00:00Z" });
    const key = async (who: string, role: "owner" | "admin" | "member") => createAccessKey(w.actor(who, role), { name: "Read", scopes: ["metrics:read"], expiresOn: inDays(30) });
    const names = (body: { overdue: { metric: { name: string } }[]; days: { entries: { metric: { name: string } }[] }[] }) => [...body.overdue, ...body.days.flatMap((d) => d.entries)].map((e) => e.metric.name).sort();
    const today = inDays(0);
    const saras = await key(sara, "owner");
    const res = await get(saras.secret, `?from=${today}&to=${today}&person_id=${ben}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.person_id).toBe(ben);
    // Sara sees Revenue (hers), not Ben's own Metric.
    expect(names(body)).toEqual(["Revenue"]);
    expect(names(await (await get((await key(ben, "member")).secret, `?from=${today}&to=${today}`)).json())).toEqual(["Ben's own", "Revenue"]);
    // Ann, an Admin, sees neither.
    expect(names(await (await get((await key(ann, "admin")).secret, `?person_id=${ben}`)).json())).toEqual([]);
    const eves = await key(eve, "member");
    const refused = await get(eves.secret, `?person_id=${ben}`);
    expect(refused.status).toBe(403);
    expect((await refused.json()).error.message).toMatch(/Only Owners and Admins/);
    // Naming yourself is your own Schedule; someone not in the workspace is not found.
    expect((await get(eves.secret, `?person_id=${eve}`)).status).toBe(200);
    expect((await get(saras.secret, "?person_id=t-nobody")).status).toBe(404);
    expect((await get(saras.secret, "?person_id=a%2Cb")).status).toBe(400);
    expect(await accessLogOf(saras.id)).toEqual(expect.arrayContaining([{ method: "GET", route: "/api/v1/schedule", status: 200, submitted: 0 }, { method: "GET", route: "/api/v1/schedule", status: 404, submitted: 0 }]));
    expect(await accessLogOf(eves.id)).toEqual(expect.arrayContaining([{ method: "GET", route: "/api/v1/schedule", status: 403, submitted: 0 }]));
  });

  it("refuses a key that may only submit values, a Feed Key, and spans the Schedule cannot cover", async () => {
    const w = await workspace(); cleanups.push(w.cleanup);
    const sara = await w.person("owner");
    const { secret: submitOnly } = await createAccessKey(w.actor(sara), { name: "Submit", scopes: ["values:submit"], expiresOn: inDays(30) });
    expect((await get(submitOnly)).status).toBe(403);
    const feed = await createFeed(w.actor(sara), "CRM");
    const { secret: feedKey } = await createFeedKey(w.actor(sara), feed.id, { name: "CRM", expiresOn: inDays(30) });
    expect((await get(feedKey)).status).toBe(403);
    const { secret } = await createAccessKey(w.actor(sara), { name: "Read", scopes: ["metrics:read"], expiresOn: inDays(30) });
    for (const q of [`?from=${inDays(5)}&to=${inDays(1)}`, `?from=${inDays(0)}&to=${inDays(91)}`, `?from=${inDays(370)}&to=${inDays(380)}`, "?from=tomorrow"]) {
      const res = await get(secret, q);
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe("invalid_request");
    }
    expect((await get(secret)).status).toBe(200);
  });
});

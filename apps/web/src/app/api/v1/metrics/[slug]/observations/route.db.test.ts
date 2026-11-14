// POST /api/v1/metrics/{slug}/observations over HTTP (spec 0002, ticket #49): status codes, the error shape,
// Idempotency-Key and what lands in the Access Log. The rules themselves are proven in api-submissions.db.test.ts.
import { afterEach, describe, expect, it } from "vitest";
import { createAccessKey } from "@ziffr/core/access-keys";
import { periodStart } from "@ziffr/core/format";
import { accessLogOf, workspace } from "@ziffr/core/test/db-fixtures";
import { POST } from "./route";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

async function setup(scopes: ("metrics:read" | "values:submit")[] = ["metrics:read", "values:submit"]) {
  const w = await workspace(); cleanups.push(w.cleanup);
  const ben = await w.person("member");
  const m = await w.metric(ben, { submission_rule: "add" }); await w.token(m.id, ben);
  const { id, secret } = await createAccessKey(w.actor(ben, "member"), { name: "Shop export", scopes, expiresOn: inDays(30) });
  const post = (body: unknown, headers: Record<string, string> = {}) => POST(new Request(`http://ziffr.test/api/v1/metrics/${m.slug}/observations`, {
    method: "POST", body: typeof body === "string" ? body : JSON.stringify(body), headers: { authorization: `Bearer ${secret}`, "content-type": "application/json", ...headers },
  }), { params: Promise.resolve({ slug: m.slug }) });
  return { w, m, id, post };
}

describe("POST /api/v1/metrics/{slug}/observations", () => {
  it("answers 201 with the outcome, logs the submitted value, and replays a repeated Idempotency-Key", async () => {
    const { id, post } = await setup();
    const res = await post({ value: 5 }, { "idempotency-key": "run-1" });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ status: "recorded", period: periodStart(new Date(), "month"), value: 5, detail: expect.any(String) });
    expect(res.headers.get("x-ziffr-submitted")).toBeNull();
    const again = await post({ value: 5 }, { "idempotency-key": "run-1" });
    expect(again.status).toBe(201);
    expect(again.headers.get("idempotent-replayed")).toBe("true");
    expect((await again.json()).value).toBe(5);
    const conflict = await post({ value: 6 }, { "idempotency-key": "run-1" });
    expect(conflict.status).toBe(409);
    expect((await conflict.json()).error.code).toBe("conflict");
    // Without the key the rule adds: 5 + 7.
    expect((await (await post({ value: 7 })).json()).value).toBe(12);
    expect((await accessLogOf(id)).map(({ status, submitted }) => ({ status, submitted }))).toEqual([{ status: 201, submitted: 1 }, { status: 201, submitted: 0 }, { status: 409, submitted: 0 }, { status: 201, submitted: 1 }]);
  });
  it("answers 422 locked for a locked period, 400 for a bad body and 403 without the scope", async () => {
    const { w, m, post } = await setup();
    await w.lock(m.id, periodStart(new Date(), "month"));
    const locked = await post({ value: 1 });
    expect(locked.status).toBe(422);
    expect((await locked.json()).error.code).toBe("locked");
    for (const bad of ["not json", { value: "12" }, { value: 1, extra: true }, { value: 1, period: "May" }]) expect((await post(bad)).status).toBe(400);
    expect((await post({ value: 1 }, { "idempotency-key": "x".repeat(201) })).status).toBe(400);
    expect((await (await setup(["metrics:read"])).post({ value: 1 })).status).toBe(403);
  });
});

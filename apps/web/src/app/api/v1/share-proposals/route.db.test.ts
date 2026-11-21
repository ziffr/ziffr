// The Share Proposal endpoint over HTTP (ticket #538, GLOSSARY: Share Proposal, Access Key): shapes and status codes, the
// scopes (Propose sharing and Read dashboards), that what the creator may not share answers 404, and that nothing is
// shared or sent by proposing. The core's own rules are proven in share-proposals.db.test.ts.
import { existsSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAccessKey } from "@ziffr/core/access-keys";
import type { Scope } from "@ziffr/core/actor";
import { createDashboard } from "@ziffr/core/dashboards";
import { accessLogOf, rowsOf, workspace } from "@ziffr/core/test/db-fixtures";
import { POST as propose } from "./route";

vi.setConfig({ testTimeout: 120_000, hookTimeout: 60_000 });
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

async function setup(scopes: Scope[] = ["shares:propose", "dashboards:read"]) {
  const w = await workspace(); cleanups.push(w.cleanup);
  const sara = await w.person("owner"); const ben = await w.person("member");
  const dash = await createDashboard(w.actor(ben, "member"), "Coffee");
  const bens = await createDashboard(w.actor(sara), "Saras");
  const { id, secret } = await createAccessKey(w.actor(ben, "member"), { name: "Assistant", scopes, expiresOn: inDays(30) });
  const req = (body: unknown) => new Request("http://ziffr.test/api/v1/share-proposals", { method: "POST", body: JSON.stringify(body), headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" } });
  return { w, ben, sara, dash, other: bens, id, req };
}

describe("Share Proposals over HTTP", () => {
  it("prepares a View Link and answers where the person confirms, sharing and sending nothing", async () => {
    const { w, ben, dash, id, req } = await setup();
    const res = await propose(req({ dashboard: dash, email: "jenny@example.test", ends: inDays(10), message: "Hello" }), undefined);
    expect(res.status).toBe(201);
    const p = await res.json();
    expect(p).toMatchObject({ status: "open", how: "view_link", recipient: "jenny@example.test", message: "Hello", dashboard: { id: dash, name: "Coffee" }, url: expect.stringMatching(/\/actions\/share\/\d+$/), preview: { id: dash, name: "Coffee" } });
    expect(await rowsOf("view_links", { workspace_id: w.id })).toEqual([]);
    expect(await rowsOf("share_proposals", { proposer_id: ben, status: "open" })).toHaveLength(1);
    expect((await accessLogOf(id)).map((c) => `${c.method} ${c.status}`)).toEqual(["POST 201"]);
  });
  it("needs both scopes, and refuses what the creator may not share", async () => {
    const a = await setup(["dashboards:read"]);
    expect((await propose(a.req({ dashboard: a.dash, email: "a@example.test", ends: inDays(3) }), undefined)).status).toBe(403);
    const b = await setup(["shares:propose"]);
    expect((await propose(b.req({ dashboard: b.dash, email: "a@example.test", ends: inDays(3) }), undefined)).status).toBe(403);
    const c = await setup();
    // Someone else's dashboard: the same answer as one that does not exist.
    expect((await propose(c.req({ dashboard: c.other, email: "a@example.test", ends: inDays(3) }), undefined)).status).toBe(404);
    expect((await propose(c.req({ dashboard: 999999999, email: "a@example.test", ends: inDays(3) }), undefined)).status).toBe(404);
  });
  it("answers bad input with words (422) or a bad shape (400)", async () => {
    const { dash, req } = await setup();
    const late = await propose(req({ dashboard: dash, email: "a@example.test", ends: inDays(200) }), undefined);
    expect(late.status).toBe(422);
    expect((await late.json()).error.message).toMatch(/end date/);
    expect((await propose(req({ dashboard: dash, email: "nobody" , ends: inDays(2) }), undefined)).status).toBe(422);
    expect((await propose(req({ dashboard: dash }), undefined)).status).toBe(422);
    expect((await propose(req({ dashboard: "x", email: "a@example.test" }), undefined)).status).toBe(400);
    expect((await propose(req({ dashboard: dash, email: "a@example.test", ends: inDays(2), confirm: true }), undefined)).status).toBe(400);
  });
  it("has no way to confirm or decline through a key: there is no such route", () => {
    expect(existsSync(new URL("./[id]", import.meta.url))).toBe(false);
    expect(existsSync(new URL("./confirm", import.meta.url))).toBe(false);
  });
});

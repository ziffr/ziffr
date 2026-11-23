// @ts-nocheck
// The Ziffr Cloud API and the handover against the real database (spec 0029, ticket #267): only signed, fresh, unseen
// calls pass; without ZIFFR_CLOUD_KEY nothing is there; it reads numbers only and sets limits; the handover is for
// Owners only and its token cannot sign a call.
import { createHmac, hkdfSync } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { Forbidden } from "./actor";
import { checkCloudCall, cloudLimits, CloudNotFound, cloudWorkspace, handover, setCloudLimit, signCloudCall, type CloudCaller } from "./cloud-api";
import { db } from "./db";
import { DEMO_WORKSPACE_ID } from "./team";
import { opened, workspace } from "./test/db-fixtures";

const KEY = "k".repeat(40);
const env = { ZIFFR_CLOUD_KEY: KEY, ZIFFR_CLOUD_URL: "https://cloud.example.test", ZIFFR_SITE_URL: "https://ziffr.example.test/app" };
const cleanups: (() => Promise<void>)[] = [];
beforeEach(() => { process.env.ZIFFR_CLOUD_KEY = KEY; });
afterEach(async () => { delete process.env.ZIFFR_CLOUD_KEY; for (const c of cleanups.splice(0)) await c(); });
afterAll(async () => { await db().from("cloud_api_calls").delete().neq("signature", ""); });
const caller: CloudCaller = { cloud: true };
async function ws() { const w = await workspace("Acme Secret Name"); cleanups.push(w.cleanup); return w; }
const call = (over: { method?: string; path?: string; body?: string; at?: number; header?: string | null } = {}) => {
  const req = { method: over.method ?? "PUT", path: over.path ?? "/api/cloud/v1/workspaces/x/limit", body: over.body ?? "{\"metrics\":50}" };
  const header = over.header !== undefined ? over.header : signCloudCall({ ...req, at: over.at }, env);
  return checkCloudCall({ ...req, header }, env);
};

describe("signed calls", () => {
  it("answer 404 without the key, and pass only signed, fresh and unseen", async () => {
    expect(await checkCloudCall({ header: signCloudCall({ method: "GET", path: "/p" }, env), method: "GET", path: "/p", body: "" }, {})).toEqual({ ok: false, status: 404 });
    expect(await checkCloudCall({ header: "t=1, v1=00", method: "GET", path: "/p", body: "" }, { ZIFFR_CLOUD_KEY: "short" })).toEqual({ ok: false, status: 404 });
    expect(await call({ header: null })).toEqual({ ok: false, status: 401 });
    expect(await call({ header: `t=${Math.floor(Date.now() / 1000)}, v1=${"0".repeat(64)}` })).toEqual({ ok: false, status: 401 });
    expect(await call({ at: Date.now() - 6 * 60_000 })).toEqual({ ok: false, status: 401 });
    expect(await call({ at: Date.now() + 6 * 60_000 })).toEqual({ ok: false, status: 401 });
    // A body changed after signing, or another path or method, does not match.
    const header = signCloudCall({ method: "PUT", path: "/api/cloud/v1/workspaces/x/limit", body: "{\"metrics\":50}" }, env);
    expect(await checkCloudCall({ header, method: "PUT", path: "/api/cloud/v1/workspaces/x/limit", body: "{\"metrics\":5000}" }, env)).toEqual({ ok: false, status: 401 });
    expect(await checkCloudCall({ header, method: "PUT", path: "/api/cloud/v1/workspaces/y/limit", body: "{\"metrics\":50}" }, env)).toEqual({ ok: false, status: 401 });
    expect(await checkCloudCall({ header, method: "PUT", path: "/api/cloud/v1/workspaces/x/limit", body: "{\"metrics\":50}" }, env)).toEqual({ ok: true, caller });
    // The same call again is a replay.
    expect(await checkCloudCall({ header, method: "PUT", path: "/api/cloud/v1/workspaces/x/limit", body: "{\"metrics\":50}" }, env)).toEqual({ ok: false, status: 401 });
  });

  it("takes at most 60 calls a minute", async () => {
    await db().from("cloud_api_calls").delete().neq("signature", "");
    await db().from("cloud_api_calls").insert(Array.from({ length: 60 }, (_, i) => ({ signature: String(i).padStart(64, "0") })));
    expect(await call({ path: "/limited" })).toEqual({ ok: false, status: 429 });
    await db().from("cloud_api_calls").delete().neq("signature", "");
    expect(await call({ path: "/limited" })).toEqual({ ok: true, caller });
  });

  it("refuses a signature made with the handover key", async () => {
    const t = String(Math.floor(Date.now() / 1000));
    const handoverKey = Buffer.from(hkdfSync("sha256", Buffer.from(KEY), Buffer.alloc(0), "ziffr/cloud-handover/v1", 32));
    const { createHash } = await import("node:crypto");
    const text = `${t}\nGET\n/p\n${createHash("sha256").update("").digest("hex")}`;
    const v1 = createHmac("sha256", handoverKey).update(text).digest("hex");
    expect(await checkCloudCall({ header: `t=${t}, v1=${v1}`, method: "GET", path: "/p", body: "" }, env)).toEqual({ ok: false, status: 401 });
  });
});

describe("what Ziffr Cloud reads and sets", () => {
  it("reads numbers only: no name, Metric, value or person", async () => {
    const w = await ws(); const sara = await w.person("owner");
    await w.metric(sara, { name: "Secret revenue" }); await w.metric(sara, { name: "Other" });
    const read = await cloudWorkspace(caller, w.id);
    expect(Object.keys(read).sort()).toEqual(["exists", "id", "label", "limit", "metrics", "next", "over_limit_since", "room", "set_by", "trial_ends_at"]);
    expect(read).toMatchObject({ id: w.id, exists: true, metrics: 2, limit: null, set_by: null });
    expect(JSON.stringify(read)).not.toMatch(/Acme|Secret|Other|owner/);
    expect(await cloudWorkspace(caller, DEMO_WORKSPACE_ID)).toMatchObject({ exists: false, metrics: null });
    expect(await cloudWorkspace(caller, "not-an-id")).toMatchObject({ exists: false });
  });

  it("sets a limit with a coming change, falls back to the default with null, and records both", async () => {
    const w = await ws(); const sara = await w.person("owner");
    await w.metric(sara); await w.metric(sara); await w.metric(sara);
    const set = await setCloudLimit(caller, w.id, { metrics: 2, label: "Small", next: { label: "Team", on: "2026-12-01" } });
    expect(set).toMatchObject({ metrics: 3, limit: 2, label: "Small", room: 3, set_by: "cloud", next: { label: "Team", on: "2026-12-01" } });
    expect(set.over_limit_since).not.toBeNull();
    expect((await cloudLimits(caller, { limit: 100 })).items.map((i) => i.id)).toContain(w.id);
    const back = await setCloudLimit(caller, w.id, { metrics: null });
    expect(back).toMatchObject({ limit: null, set_by: null, over_limit_since: null });
    expect((await cloudLimits(caller, { limit: 100 })).items.map((i) => i.id)).not.toContain(w.id);
    const events = await opened("audit_events", w.id, (await db().from("audit_events").select("id, actor_id, actor_name, details").eq("workspace_id", w.id).eq("kind", "workspace.limit_changed").order("id")).data);
    expect(events.map((e) => [e.actor_id, e.actor_name, (e.details as { by: string }).by])).toEqual([[null, "Ziffr Cloud", "cloud"], [null, "Ziffr Cloud", "cloud"]]);
    const { data: installation } = await db().from("installation_audit_events").select("actor_name, kind").eq("subject", w.id).order("id");
    expect(installation).toEqual([{ actor_name: "Ziffr Cloud", kind: "workspace_limit.set" }, { actor_name: "Ziffr Cloud", kind: "workspace_limit.removed" }]);
    await db().from("installation_audit_events").delete().eq("subject", w.id);
  });

  it("refuses a Workspace that is not there, and values out of range", async () => {
    await expect(setCloudLimit(caller, "00000000-0000-4000-8000-000000000000", { metrics: 5 })).rejects.toBeInstanceOf(CloudNotFound);
    await expect(setCloudLimit(caller, DEMO_WORKSPACE_ID, { metrics: 5 })).rejects.toBeInstanceOf(CloudNotFound);
    const w = await ws();
    await expect(setCloudLimit(caller, w.id, { metrics: 0 })).rejects.toThrow("whole number");
    await expect(setCloudLimit(caller, w.id, { metrics: 5, label: "x".repeat(31) })).rejects.toThrow("30 characters");
    await expect(setCloudLimit(caller, w.id, { metrics: 5, label: "Small", next: { label: "Team", on: "2026-02-30" } })).rejects.toThrow("a day");
  });
});

describe("the handover", () => {
  it("is for Owners signed in with a proven address, with a token signed by the handover key, and never for others", async () => {
    const w = await ws(); const sara = await w.person("owner", { email: "sara@acme.test" });
    await expect(handover(w.actor(sara), "size", env)).rejects.toThrow("Sign in with your email address");
    const { data: auth } = await db().auth.admin.createUser({ email: `sara-${w.id.slice(0, 8)}@acme.test`, email_confirm: true });
    cleanups.push(async () => { await db().auth.admin.deleteUser(auth.user!.id); });
    await db().from("profiles").update({ auth_user_id: auth.user!.id }).eq("id", sara);
    const { url, token } = await handover(w.actor(sara), "billing", env);
    expect(url).toBe("https://cloud.example.test/handover");
    const [body, mac] = token.split(".");
    const handoverKey = Buffer.from(hkdfSync("sha256", Buffer.from(KEY), Buffer.alloc(0), "ziffr/cloud-handover/v1", 32));
    expect(createHmac("sha256", handoverKey).update(body).digest("base64url")).toBe(mac);
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    expect(payload).toMatchObject({ v: 1, purpose: "billing", workspace: { id: w.id, name: "Acme Secret Name" }, person: { id: sara, email: "sara@acme.test" }, role: "owner", aud: "https://ziffr.example.test" });
    expect(payload.exp - payload.iat).toBe(300);
    expect(payload.exp - Date.now() / 1000).toBeLessThanOrEqual(300);
    expect(payload.nonce).toMatch(/^[A-Za-z0-9_-]{22}$/);
    // The token is no signature for a call.
    expect(await checkCloudCall({ header: `t=${Math.floor(Date.now() / 1000)}, v1=${Buffer.from(mac, "base64url").toString("hex")}`, method: "GET", path: "/p", body: "" }, env)).toEqual({ ok: false, status: 401 });

    const adam = await w.person("admin"); const ben = await w.person("member");
    await expect(handover(w.actor(adam, "admin"), "size", env)).rejects.toThrow(Forbidden);
    await expect(handover(w.actor(ben, "member"), "size", env)).rejects.toThrow(Forbidden);
    // An Actor that claims to be an Owner is checked against the membership too.
    await expect(handover(w.actor(ben, "owner"), "size", env)).rejects.toThrow(Forbidden);
    await expect(handover({ personId: sara, workspaceId: DEMO_WORKSPACE_ID, role: "owner" }, "size", env)).rejects.toThrow(Forbidden);
    await expect(handover(w.actor(sara), "size", { ZIFFR_CLOUD_KEY: KEY })).rejects.toThrow(Forbidden);
    await expect(handover(w.actor(sara), "size", { ZIFFR_CLOUD_KEY: KEY, ZIFFR_CLOUD_URL: "http://cloud.example.test" })).rejects.toThrow(Forbidden);
  });
});

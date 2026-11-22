// Trial Limits against the real database (spec 0040, ticket 2): Ziffr Cloud sets them in one step, the environment wins,
// a change applies to running trials at once, lowering deletes nothing, and every limit the database guards holds when
// requests come at once (Metrics, keys, Feed keys, Feeds, assistants, View Links, messages a day).
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Forbidden } from "./actor";
import { approveConnection, mcpResource, registerClient } from "./assistant-connections";
import { createAccessKey } from "./access-keys";
import { cloudTrialLimits, setCloudTrialLimits } from "./cloud-api";
import { db } from "./db";
import { createFeed, createFeedKey } from "./feeds";
import { createMetric } from "./metrics";
import { createViewLink } from "./view-links";
import { forgetStoredSettings, settingsInEffect } from "./settings-in-effect";
import { workspace } from "./test/db-fixtures";
import { TRIAL_LIMITS, trialLimitsFrom } from "./trial-limits";
import { forgetTrialLimitsSync, syncTrialLimits, trialLimitsInEffect } from "./trial-limits-in-effect";
import { claimTrialSend } from "./trials";

const caller = { cloud: true } as const;
const cleanups: (() => Promise<void>)[] = [];
let savedSettings: Record<string, unknown>[] = [];
const ENV = TRIAL_LIMITS.map((l) => l.name);
const savedEnv: Record<string, string | undefined> = {};
let savedKey: string | undefined;
beforeAll(async () => { savedSettings = (await db().from("installation_settings").select("*")).data ?? []; });
afterAll(async () => {
  await db().from("installation_settings").delete().neq("name", "");
  if (savedSettings.length) await db().from("installation_settings").insert(savedSettings);
  forgetStoredSettings();
  forgetTrialLimitsSync();
  await syncTrialLimits(true);
});
beforeEach(async () => {
  // Hosted Ziffr: the days a trial lasts are read only where there is a Ziffr Cloud key.
  savedKey = process.env.ZIFFR_CLOUD_KEY;
  process.env.ZIFFR_CLOUD_KEY = "k".repeat(40);
  for (const n of ENV) { savedEnv[n] = process.env[n]; delete process.env[n]; }
  await db().from("installation_settings").delete().like("name", "ZIFFR_TRIAL_%");
  forgetStoredSettings();
});
afterEach(async () => {
  if (savedKey === undefined) delete process.env.ZIFFR_CLOUD_KEY; else process.env.ZIFFR_CLOUD_KEY = savedKey;
  for (const n of ENV) { if (savedEnv[n] === undefined) delete process.env[n]; else process.env[n] = savedEnv[n]; }
  for (const c of cleanups.splice(0)) await c();
  await db().from("installation_settings").delete().like("name", "ZIFFR_TRIAL_%");
  forgetStoredSettings();
  forgetTrialLimitsSync();
  await syncTrialLimits(true);
});
const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

/** A Trial Workspace with its Owner. */
async function trial() {
  const w = await workspace("Trial");
  cleanups.push(async () => {
    await db().from("access_keys").delete().eq("workspace_id", w.id);
    await db().from("view_links").delete().eq("workspace_id", w.id);
    await w.cleanup();
  });
  await w.trial(day(7));
  const owner = await w.person("owner");
  return { ...w, owner, actor: w.actor(owner) };
}
const fulfilled = (r: PromiseSettledResult<unknown>[]) => r.filter((x) => x.status === "fulfilled").length;
const firstError = (r: PromiseSettledResult<unknown>[]) => (r.find((x) => x.status === "rejected") as PromiseRejectedResult | undefined)?.reason?.message as string | undefined;

describe("Ziffr Cloud sets the Trial Limits", () => {
  it("answers numbers and where each comes from, and nothing else", async () => {
    const before = await cloudTrialLimits(caller);
    expect(Object.keys(before).sort()).toEqual(["limits", "sources"]);
    expect(before.limits).toEqual({ ...trialLimitsFrom({}), days: null });
    expect(new Set(Object.values(before.sources))).toEqual(new Set(["default"]));
    const after = await setCloudTrialLimits(caller, { days: 10, metrics: 30, webhooks: 0 });
    expect(after.limits).toMatchObject({ days: 10, metrics: 30, webhooks: 0, keys: 2 });
    expect(after.sources).toMatchObject({ days: "cloud", metrics: "cloud", webhooks: "cloud", keys: "default" });
    expect(Object.keys(after.limits).sort()).toEqual(TRIAL_LIMITS.map((l) => l.key).sort());
  });

  it("replaces all of them: a limit left out falls back to its default, whoever set it", async () => {
    await db().from("installation_settings").insert({ name: "ZIFFR_TRIAL_LIMIT_FEEDS", value: "7", sealed: false });
    forgetStoredSettings();
    await setCloudTrialLimits(caller, { metrics: 30, keys: 4 });
    const second = await setCloudTrialLimits(caller, { keys: 5 });
    expect(second.limits).toMatchObject({ metrics: 25, keys: 5, feeds: 2, days: null });
    const { data } = await db().from("installation_settings").select("name, set_by").like("name", "ZIFFR_TRIAL_%");
    expect(data).toEqual([{ name: "ZIFFR_TRIAL_LIMIT_KEYS", set_by: "cloud" }]);
  });

  it("takes only whole numbers inside each range, and saves nothing when one is wrong", async () => {
    await setCloudTrialLimits(caller, { metrics: 30 });
    for (const l of TRIAL_LIMITS) {
      for (const bad of [l.min - 1, l.max + 1, 1.5, "7", null, Number.NaN, 1e12]) {
        await expect(setCloudTrialLimits(caller, { metrics: 40, [l.key]: bad } as never), `${l.key}=${String(bad)}`).rejects.toThrow();
      }
    }
    await expect(setCloudTrialLimits(caller, { metrics: 40, nope: 3 } as never)).rejects.toThrow(/not a Trial Limit/);
    await expect(setCloudTrialLimits(caller, [] as never)).rejects.toThrow();
    expect((await cloudTrialLimits(caller)).limits.metrics).toBe(30);
    for (const l of TRIAL_LIMITS) {
      expect((await setCloudTrialLimits(caller, { [l.key]: l.min })).limits[l.key]).toBe(l.min);
      expect((await setCloudTrialLimits(caller, { [l.key]: l.max })).limits[l.key]).toBe(l.max);
    }
  });

  it("is for Ziffr Cloud only", async () => {
    await expect(setCloudTrialLimits({} as never, { metrics: 30 })).rejects.toBeInstanceOf(Forbidden);
    await expect(cloudTrialLimits(null as never)).rejects.toBeInstanceOf(Forbidden);
  });

  it("is overruled by the server's environment, and an out-of-range environment value counts for nothing", async () => {
    await setCloudTrialLimits(caller, { metrics: 30, keys: 4 });
    process.env.ZIFFR_TRIAL_LIMIT_METRICS = "12";
    process.env.ZIFFR_TRIAL_LIMIT_KEYS = "999";
    const now = await cloudTrialLimits(caller);
    expect(now.limits).toMatchObject({ metrics: 12, keys: 2 });
    expect(now.sources).toMatchObject({ metrics: "server", keys: "server" });
    expect((await trialLimitsInEffect()).metrics).toBe(12);
  });

  it("leaves one whole answer when two calls come at once", async () => {
    for (let i = 0; i < 4; i++) {
      await Promise.all([setCloudTrialLimits(caller, { metrics: 31 }), setCloudTrialLimits(caller, { metrics: 32, keys: 3 })]);
      forgetStoredSettings();
      const { limits } = await cloudTrialLimits(caller);
      const mine = { metrics: limits.metrics, keys: limits.keys };
      expect([{ metrics: 31, keys: 2 }, { metrics: 32, keys: 3 }], JSON.stringify(mine)).toContainEqual(mine);
    }
  });

  it("is written into the row the triggers read", async () => {
    await setCloudTrialLimits(caller, { metrics: 33, keys: 3, feeds: 4, assistants: 2, viewLinks: 7, webhooks: 3 });
    const { data } = await db().from("trial_limits").select("metrics, keys, feeds, assistants, view_links").single();
    expect(data).toEqual({ metrics: 33, keys: 3, feeds: 4, assistants: 2, view_links: 7 });
    expect(Object.keys(await settingsInEffect()).includes("ZIFFR_TRIAL_LIMIT_WEBHOOKS")).toBe(true);
  });

  it("cannot be read or written by a browser's role", async () => {
    const { error } = await db().rpc("set_cloud_trial_limits", { p_values: { ZIFFR_TRIAL_DAYS: "5" } });
    expect(error).toBeNull();
    for (const bad of [{ ZIFFR_SMTP_URL: "1" }, { ZIFFR_TRIAL_LIMIT_METRICS: "x" }, { ZIFFR_TRIAL_LIMIT_: "1" }, [1]]) {
      expect((await db().rpc("set_cloud_trial_limits", { p_values: bad })).error, JSON.stringify(bad)).not.toBeNull();
    }
    const { data } = await db().from("installation_settings").select("name").eq("name", "ZIFFR_SMTP_URL");
    expect(data).toEqual([]);
  });
});

describe("a change applies to a running trial at once, and lowering deletes nothing", () => {
  it("Metrics", async () => {
    const t = await trial();
    await setCloudTrialLimits(caller, { metrics: 6 });
    const made = await Promise.allSettled(Array.from({ length: 10 }, (_, i) => createMetric(t.actor, { name: `Metric ${i}` })));
    expect(fulfilled(made)).toBe(6);
    expect(firstError(made)).toMatch(/at most 6 Metrics/);
    await setCloudTrialLimits(caller, { metrics: 7 });
    await createMetric(t.actor, { name: "Seventh" });
    // Lowered under what it holds: nothing goes, nothing more comes.
    await setCloudTrialLimits(caller, { metrics: 5 });
    await expect(createMetric(t.actor, { name: "Eighth" })).rejects.toThrow(/at most 5 Metrics/);
    const { count } = await db().from("metrics").select("id", { count: "exact", head: true }).eq("workspace_id", t.id);
    expect(count).toBe(7);
  });

  it("Access Keys", async () => {
    const t = await trial();
    await setCloudTrialLimits(caller, { keys: 3 });
    const made = await Promise.allSettled(Array.from({ length: 8 }, (_, i) => createAccessKey(t.actor, { name: `k${i}`, scopes: ["metrics:read"], expiresOn: day(3) })));
    expect(fulfilled(made)).toBe(3);
    expect(firstError(made)).toMatch(/at most 3 Access Keys/);
    await setCloudTrialLimits(caller, { keys: 1 });
    await expect(createAccessKey(t.actor, { name: "more", scopes: ["metrics:read"], expiresOn: day(3) })).rejects.toThrow(/at most 1 Access Key that/);
    const { count } = await db().from("access_keys").select("id", { count: "exact", head: true }).eq("workspace_id", t.id).is("revoked_at", null);
    expect(count).toBe(3);
  });

  it("Feeds, and Feed Keys per Feed", async () => {
    const t = await trial();
    await setCloudTrialLimits(caller, { feeds: 3 });
    const names = ["A", "B", "C", "D", "E"].map((n) => `${n}-${t.id.slice(0, 8)}`);
    const feeds = await Promise.allSettled(names.map((n) => createFeed(t.actor, n)));
    expect(fulfilled(feeds)).toBe(3);
    expect(firstError(feeds)).toMatch(/at most 3 Feeds/);
    const feed = (feeds.find((r) => r.status === "fulfilled") as PromiseFulfilledResult<{ id: string }>).value.id;
    const keys = await Promise.allSettled(Array.from({ length: 6 }, (_, i) => createFeedKey(t.actor, feed, { name: `fk${i}`, expiresOn: day(3) })));
    expect(fulfilled(keys)).toBe(3);
    expect(firstError(keys)).toMatch(/at most 3 keys/);
    await setCloudTrialLimits(caller, { feeds: 1 });
    await expect(createFeed(t.actor, `F-${t.id.slice(0, 8)}`)).rejects.toThrow(/at most 1 Feed\./);
  });

  it("connected assistants", async () => {
    const t = await trial();
    await setCloudTrialLimits(caller, { assistants: 2 });
    const redirect = "https://claude.ai/api/mcp/auth_callback";
    const client = await registerClient({ client_name: "Claude", redirect_uris: [redirect] }, `198.51.${Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}`);
    cleanups.push(async () => { await db().from("oauth_clients").delete().eq("id", client.id); });
    const params = { response_type: "code", client_id: client.id, redirect_uri: redirect, code_challenge: "A".repeat(43), code_challenge_method: "S256", state: "s", scope: "metrics:read", resource: mcpResource() };
    const made = await Promise.allSettled(Array.from({ length: 5 }, () => approveConnection(t.actor, params, { scopes: ["metrics:read"], endsOn: day(3) })));
    expect(fulfilled(made)).toBe(2);
    expect(firstError(made)).toMatch(/2 assistants at a time/);
  });

  it("View Links, that work", async () => {
    const t = await trial();
    await setCloudTrialLimits(caller, { viewLinks: 4 });
    const { data: d } = await db().from("dashboards").insert({ name: "Board", owner_id: t.owner, workspace_id: t.id }).select("id").single();
    const link = (i: number) => createViewLink(t.actor, "dashboard", d!.id as number, { label: `L${i}`, expires: day(3), frozen: false });
    const made = await Promise.allSettled(Array.from({ length: 9 }, (_, i) => link(i)));
    expect(fulfilled(made)).toBe(4);
    expect(firstError(made)).toMatch(/at most 4 View Links that work/);
    // The database says so too, whatever the caller: ZF437.
    const raw = await db().from("view_links").insert({ token: randomUUID(), object_type: "dashboard", object_id: d!.id, created_by: t.owner, label: "", expires_at: day(3), workspace_id: t.id });
    expect(raw.error?.code).toBe("ZF437");
    // A revoked link makes room; lowering below what is there deletes nothing.
    const { data: one } = await db().from("view_links").select("id").eq("workspace_id", t.id).limit(1).single();
    await db().from("view_links").update({ revoked_at: new Date().toISOString() }).eq("id", one!.id);
    await link(100);
    await setCloudTrialLimits(caller, { viewLinks: 0 });
    await expect(link(101)).rejects.toThrow(/at most 0 View Links/);
    const { count } = await db().from("view_links").select("id", { count: "exact", head: true }).eq("workspace_id", t.id);
    expect(count).toBe(5);
  });

  it("messages a day, over all Connectors, also when claimed at once", async () => {
    const t = await trial();
    await setCloudTrialLimits(caller, { messagesPerDay: 10 });
    const ids: number[] = [];
    for (let i = 0; i < 14; i++) {
      const { data } = await db().from("deliveries").insert({ connector: ["email", "slack", "telegram"][i % 3], recipient_id: t.owner, kind: "notice", workspace_id: t.id, subject: "s", body: "b", mail_state: "queued" }).select("id").single();
      ids.push(data!.id as number);
    }
    const answers = await Promise.all(ids.map((id) => claimTrialSend(id)));
    expect(answers.filter((a) => a === "ok")).toHaveLength(10);
    expect(answers.filter((a) => a === "wait")).toHaveLength(4);
    await setCloudTrialLimits(caller, { messagesPerDay: 12 });
    const more = await Promise.all(ids.map((id) => claimTrialSend(id)));
    expect(more.filter((a) => a === "ok")).toHaveLength(12);
  });

  it("does not touch a Workspace that is not a trial", async () => {
    const w = await workspace();
    cleanups.push(w.cleanup);
    const owner = await w.person("owner");
    await setCloudTrialLimits(caller, { metrics: 5 });
    for (let i = 0; i < 8; i++) await createMetric(w.actor(owner), { name: `M${i}` });
  });
});

// Ask me now through the core, against the real database and the local Mailpit (spec 0021, ticket 4): the current
// Prompt to the Metric's owner who submits it, at once, at most once in ten minutes per Metric.
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { Forbidden } from "./actor";
import { askMeNow, askMeNowBy, canAskNow, NOT_DELIVERED, shownReason } from "./ask-now";
import { TRIAL_HOLDS_BACK } from "./trials";
import { db } from "./db";
import { workspace } from "./test/db-fixtures";

const SETTINGS = { ZIFFR_SMTP_URL: process.env.TEST_SMTP_URL ?? "smtp://127.0.0.1:55425", ZIFFR_MAIL_FROM: "Ziffr <ziffr@example.test>", ZIFFR_SITE_URL: "https://ziffr.example.test" };
const saved: Record<string, string | undefined> = {};
beforeAll(() => { for (const [k, v] of Object.entries(SETTINGS)) { saved[k] = process.env[k]; process.env[k] = v; } });
afterAll(() => { for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v; });
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws() { const w = await workspace(); cleanups.push(w.cleanup); return w; }
const address = () => `owner-${randomUUID().slice(0, 8)}@example.test`;

describe("Ask me now", () => {
  it("emails the owner who submits the Metric its current Prompt at once", async () => {
    const w = await ws(); const sara = await w.person("owner", { email: address() });
    const m = await w.metric(sara, { sources: ["web_form", "mail"] }); await w.token(m.id, sara);
    expect(await canAskNow(w.actor(sara), m.id)).toBe(true);
    expect(await askMeNow(w.actor(sara), m.id)).toMatchObject({ connector: "email", state: "sent" });
    const { data } = await db().from("prompts").select("metric_id, submitter_id").eq("metric_id", m.id);
    expect(data).toEqual([{ metric_id: m.id, submitter_id: sara }]);
  });

  it("asks once in ten minutes per Metric, also for two presses at once", async () => {
    const w = await ws(); const sara = await w.person("owner", { email: address() });
    const m = await w.metric(sara); await w.token(m.id, sara);
    const both = await Promise.allSettled([askMeNow(w.actor(sara), m.id), askMeNow(w.actor(sara), m.id)]);
    expect(both.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    await expect(askMeNow(w.actor(sara), m.id)).rejects.toThrow(/a moment ago/);
    // Ten minutes later it asks again.
    await db().from("ask_now_claims").update({ asked_at: new Date(Date.now() - 11 * 60_000).toISOString() }).eq("metric_id", m.id);
    await askMeNow(w.actor(sara), m.id);
    const { count } = await db().from("prompts").select("id", { count: "exact", head: true }).eq("metric_id", m.id);
    expect(count).toBe(2);
  });

  it("is refused to anyone but the owner who submits it, and for a Derived Metric", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member");
    const m = await w.metric(sara); await w.token(m.id, ben);
    // Ben submits but does not own it; Sara owns it but does not submit it.
    for (const who of [ben, sara]) {
      expect(await canAskNow(w.actor(who), m.id)).toBe(false);
      await expect(askMeNow(w.actor(who), m.id)).rejects.toBeInstanceOf(Forbidden);
    }
    const derived = await w.metric(sara, { formula: `{${m.slug}} * 2` }); await w.token(derived.id, sara);
    await expect(askMeNow(w.actor(sara), derived.id)).rejects.toBeInstanceOf(Forbidden);
    // Another workspace's Metric does not exist for this actor.
    const other = await ws(); const olga = await other.person("owner");
    await expect(askMeNow({ ...other.actor(olga) }, m.id)).rejects.toBeInstanceOf(Forbidden);
    const { count } = await db().from("prompts").select("id", { count: "exact", head: true }).eq("metric_id", m.id);
    expect(count).toBe(0);
  });

  it("asks by each given way with one result each, and shows only Ziffr's own reasons", async () => {
    const w = await ws(); const sara = await w.person("owner", { email: address() });
    const m = await w.metric(sara, { sources: ["web_form", "mail", "telegram"] }); await w.token(m.id, sara);
    const results = await askMeNowBy(w.actor(sara), m.id, ["email", "telegram"]);
    expect(results.map((r) => r.connector)).toEqual(["email", "telegram"]);
    expect(results[0].state).toBe("sent");
    // Telegram is not set up here: it says so per way instead of stopping the email.
    expect(["outbox", "failed", "queued"]).toContain(results[1].state);
    await expect(askMeNowBy(w.actor(sara), m.id, ["nope" as never])).rejects.toBeInstanceOf(Forbidden);
    expect(shownReason(TRIAL_HOLDS_BACK.notOwner)).toBe(TRIAL_HOLDS_BACK.notOwner);
    expect(shownReason("550 5.1.1 <x@y>: Recipient address rejected by smtp.example")).toBe(NOT_DELIVERED);
    expect(shownReason(null)).toBeNull();
  });
});

// The monthly usage digest against the real database (spec 0031, ticket #368; GLOSSARY: Usage): who gets it, when it is
// skipped, the opt-out and the signed unsubscribe link, that one Owner's month is claimed once, and that it says only
// what that Owner sees, with no value.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { sendDelivery, type OutgoingMail } from "./mail";
import { forgetStoredSettings } from "./settings-in-effect";
import { DEMO_WORKSPACE_ID } from "./team";
import { digestOptedOut, workspace } from "./test/db-fixtures";
import { DemoReadOnly } from "./demo";
import { DIGEST_NAMES, optOutOfUsageDigestByToken, setUsageDigest, usageDigestJob, usageDigestTokenValid } from "./usage-digest";
import { signDigestToken, verifyDigestToken } from "./usage-digest-token";

const ENV = { ZIFFR_SMTP_URL: "smtp://127.0.0.1:1", ZIFFR_MAIL_FROM: "ziffr@example.test", ZIFFR_SITE_URL: "https://ziffr.example.test", ZIFFR_JOB_SECRET: "j".repeat(40) };
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
const dayAgo = (n: number) => daysAgo(n).slice(0, 10);
/** The 2nd of the current month, noon UTC: inside the days the digest goes out. */
const early = () => { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 2, 12)); };
const later = (now: Date, months: number) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + months, 2, 12));
const cleanups: (() => Promise<void>)[] = [];
const saved: Record<string, string | undefined> = {};
beforeEach(() => { for (const [k, v] of Object.entries(ENV)) { saved[k] = process.env[k]; process.env[k] = v; } forgetStoredSettings(); });
afterEach(async () => {
  for (const k of Object.keys(ENV)) if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
  forgetStoredSettings();
  for (const c of cleanups.splice(0)) await c().catch(() => {});
});
const digests = async (ws: string) => (await db().from("deliveries").select("id, recipient_id, kind, connector, mail_state, subject, body").eq("workspace_id", ws).eq("kind", "digest")).data ?? [];
const mail = (n: string) => `${n}-${Math.random().toString(36).slice(2, 8)}@example.test`;

/** A Workspace counted for 120 days with Owner Sara (an address of her own), an Admin, a Member and a Metric of Sara's
 * nobody opened. */
async function setup(over: { countedDaysAgo?: number } = {}) {
  const w = await workspace("Quiet Co"); cleanups.push(w.cleanup);
  const sara = await w.person("owner", { email: mail("sara") });
  const adam = await w.person("admin", { email: mail("adam") });
  const ben = await w.person("member", { email: mail("ben") });
  await db().from("workspaces").update({ usage_since: dayAgo(over.countedDaysAgo ?? 120) }).eq("id", w.id);
  const quiet = await w.metric(sara, { name: "Dusty visits", created_at: daysAgo(120) });
  return { w, sara, adam, ben, quiet };
}

describe("who gets the digest", () => {
  it("queues one email to each Owner who has an address, and to nobody else", async () => {
    const { w, sara, adam, ben } = await setup();
    const olga = await w.person("owner", { email: mail("olga") });
    await w.metric(olga, { name: "Olga's dusty thing", created_at: daysAgo(120) });
    const r = await usageDigestJob(early());
    expect(r.sent).toBe(2);
    const d = await digests(w.id);
    expect(d.map((x) => x.recipient_id).sort()).toEqual([sara, olga].sort());
    expect(d.every((x) => x.connector === "email" && x.mail_state === "queued")).toBe(true);
    for (const p of [adam, ben]) expect(d.map((x) => x.recipient_id)).not.toContain(p);
    const hers = d.find((x) => x.recipient_id === sara)!;
    expect(hers.subject).toBe("Unused in Quiet Co on Ziffr");
    expect(hers.body).toContain("1 Metric not opened for 90 days");
    expect(hers.body).toContain("Dusty visits");
    expect(hers.body).toContain("https://ziffr.example.test/settings/usage");
  });

  it("says only what that Owner sees: another Owner's Metric is not named to them", async () => {
    const { w, sara } = await setup();
    const olga = await w.person("owner", { email: mail("olga") });
    await w.metric(olga, { name: "Olga's secret plan", created_at: daysAgo(120) });
    await usageDigestJob(early());
    const d = await digests(w.id);
    const hers = d.find((x) => x.recipient_id === sara)!;
    const theirs = d.find((x) => x.recipient_id === olga)!;
    expect(hers.body).not.toContain("secret plan");
    expect(theirs.body).not.toContain("Dusty visits");
    expect(theirs.body).toContain("Olga's secret plan");
  });

  it("names at most five a list, counts the rest, and holds no value", async () => {
    const { w, sara } = await setup();
    for (let i = 0; i < 7; i++) {
      const m = await w.metric(sara, { name: `Extra ${i}`, created_at: daysAgo(120) });
      await w.value(m.id, "2020-01-01", 987654321 + i, sara);
    }
    await usageDigestJob(early());
    const [d] = await digests(w.id);
    expect(d.body).toContain("8 Metrics not opened for 90 days");
    expect(d.body).toContain("and 3 more");
    expect((d.body as string).split("\n").filter((l) => l.startsWith("  - ")).length).toBeLessThanOrEqual(DIGEST_NAMES * 2);
    expect(d.body).not.toMatch(/9876543/);
  });
});

describe("when nothing is sent", () => {
  it("sends nothing when nothing is unused, and nothing for a Workspace within 90 days of counting", async () => {
    const quietly = await setup({ countedDaysAgo: 30 });
    const used = await setup();
    await used.w.value(used.quiet.id, dayAgo(3).slice(0, 8) + "01", 1, used.sara);
    await db().from("view_counts").insert({ workspace_id: used.w.id, day: dayAgo(3), subject_kind: "metric", subject_id: used.quiet.id, n_app: 2 });
    await usageDigestJob(early());
    expect(await digests(quietly.w.id)).toEqual([]);
    expect(await digests(used.w.id)).toEqual([]);
  });

  it("sends nothing for a trial, and nothing for the demo", async () => {
    const t = await setup();
    await t.w.trial(dayAgo(-10));
    const before = (await db().from("deliveries").select("id", { count: "exact", head: true }).eq("workspace_id", DEMO_WORKSPACE_ID).eq("kind", "digest")).count;
    await usageDigestJob(early());
    expect(await digests(t.w.id)).toEqual([]);
    expect((await db().from("deliveries").select("id", { count: "exact", head: true }).eq("workspace_id", DEMO_WORKSPACE_ID).eq("kind", "digest")).count).toBe(before);
  });

  it("acts only on days 1 to 7 of a month", async () => {
    const { w } = await setup();
    const mid = new Date(Date.UTC(early().getUTCFullYear(), early().getUTCMonth(), 15, 7));
    expect(await usageDigestJob(mid)).toEqual({ sent: 0, skipped: 0, failed: 0 });
    expect(await digests(w.id)).toEqual([]);
  });

  it("does nothing without working email or without a key to sign the link", async () => {
    const { w } = await setup();
    delete process.env.ZIFFR_SMTP_URL; forgetStoredSettings();
    expect((await usageDigestJob(early())).sent).toBe(0);
    process.env.ZIFFR_SMTP_URL = ENV.ZIFFR_SMTP_URL; delete process.env.ZIFFR_JOB_SECRET; forgetStoredSettings();
    expect((await usageDigestJob(early())).sent).toBe(0);
    expect(await digests(w.id)).toEqual([]);
  });

  it("skips an Owner with no usable address, without using up their month", async () => {
    const w = await workspace("No Address"); cleanups.push(w.cleanup);
    const sara = await w.person("owner");
    await db().from("workspaces").update({ usage_since: dayAgo(120) }).eq("id", w.id);
    await w.metric(sara, { created_at: daysAgo(120) });
    await usageDigestJob(early());
    expect(await digests(w.id)).toEqual([]);
    expect((await db().from("usage_digests").select("person_id").eq("workspace_id", w.id)).data).toEqual([]);
  });
});

describe("opting out and unsubscribing", () => {
  it("an Owner who switched it off gets none, and one who switches it on again gets it", async () => {
    const { w, sara } = await setup();
    await setUsageDigest(w.actor(sara), false);
    expect(await digestOptedOut(sara)).toBe(true);
    await usageDigestJob(early());
    expect(await digests(w.id)).toEqual([]);
    await setUsageDigest(w.actor(sara), true);
    expect(await digestOptedOut(sara)).toBe(false);
    await usageDigestJob(early());
    expect(await digests(w.id)).toHaveLength(1);
  });

  it("refuses the switch in the demo", async () => {
    await expect(setUsageDigest({ personId: "x", workspaceId: DEMO_WORKSPACE_ID, role: "owner" }, false)).rejects.toThrow(DemoReadOnly);
  });

  it("the email carries a signed one-click link that works without signing in, and stops all their Workspaces", async () => {
    const { w, sara } = await setup();
    const w2 = await workspace("Second"); cleanups.push(w2.cleanup);
    await db().from("memberships").insert({ workspace_id: w2.id, user_id: sara, role: "owner" });
    await usageDigestJob(early());
    const [d] = await digests(w.id);
    const sent: OutgoingMail[] = [];
    expect(await sendDelivery(d.id as number, async (m) => { sent.push(m); return { messageId: "m1" }; })).toBe("sent");
    const link = sent[0].unsubscribe!;
    expect(link).toMatch(/^https:\/\/ziffr\.example\.test\/api\/unsubscribe\/digest\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/);
    expect(sent[0].text).toContain(link);
    const token = link.split("/").pop()!;
    expect(verifyDigestToken(token)).toBe(sara);
    // Checking it changes nothing; using it stops the digest, twice without harm, and not for a changed token.
    expect(usageDigestTokenValid(token)).toBe(true);
    expect(await digestOptedOut(sara)).toBe(false);
    expect(await optOutOfUsageDigestByToken(`${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`)).toBe(false);
    expect(await optOutOfUsageDigestByToken(token)).toBe(true);
    expect(await optOutOfUsageDigestByToken(token)).toBe(true);
    expect(await digestOptedOut(sara)).toBe(true);
  });

  it("one queued for an Owner who was demoted since is never sent", async () => {
    const { w, sara } = await setup();
    await usageDigestJob(early());
    const [d] = await digests(w.id);
    await w.person("owner");
    await w.setRole(sara, "member");
    const sent: OutgoingMail[] = [];
    expect(await sendDelivery(d.id as number, async (m) => { sent.push(m); return { messageId: "m3" }; })).toBe("failed");
    expect(sent).toEqual([]);
  });

  it("names are one plain line: no hidden or direction-changing characters, no links", async () => {
    const { w, sara } = await setup();
    await w.metric(sara, { name: "Pay\u202Eevil\u200B https://evil.example/x\nBcc: a@b.c", created_at: daysAgo(120) });
    await usageDigestJob(early());
    const [d] = await digests(w.id);
    expect(d.body).not.toMatch(/[\u200b-\u200f\u202a-\u202e\u2066-\u2069]/);
    expect(d.body).not.toContain("https://evil");
    expect(d.body).toContain("https: //evil.example/x Bcc: a@b.c");
  });

  it("a signed token for a person who is gone changes nothing", async () => {
    expect(await optOutOfUsageDigestByToken(signDigestToken("t-nobody")!)).toBe(true);
    expect((await db().from("usage_digest_opt_outs").select("person_id").eq("person_id", "t-nobody")).data).toEqual([]);
  });

  it("one queued before they stopped is never sent", async () => {
    const { w, sara } = await setup();
    await usageDigestJob(early());
    const [d] = await digests(w.id);
    await setUsageDigest(w.actor(sara), false);
    const sent: OutgoingMail[] = [];
    expect(await sendDelivery(d.id as number, async (m) => { sent.push(m); return { messageId: "m2" }; })).toBe("failed");
    expect(sent).toEqual([]);
    expect((await db().from("deliveries").select("mail_state").eq("id", d.id).single()).data?.mail_state).toBe("failed");
  });
});

describe("once a month", () => {
  it("sends once under repeated and parallel runs, and again the next month", async () => {
    const { w } = await setup();
    const now = early();
    const runs = await Promise.all([usageDigestJob(now), usageDigestJob(now), usageDigestJob(now)]);
    expect(runs.reduce((n, r) => n + r.sent, 0)).toBe(1);
    await usageDigestJob(now);
    expect(await digests(w.id)).toHaveLength(1);
    await usageDigestJob(later(now, 1));
    expect(await digests(w.id)).toHaveLength(2);
  });

  it("a month with nothing to say is still handled, so it is not looked at again", async () => {
    const { w, sara, quiet } = await setup();
    await w.value(quiet.id, dayAgo(3).slice(0, 8) + "01", 1, sara);
    await db().from("view_counts").insert({ workspace_id: w.id, day: dayAgo(3), subject_kind: "metric", subject_id: quiet.id, n_app: 1 });
    const now = early();
    await usageDigestJob(now);
    expect((await db().from("usage_digests").select("month").eq("workspace_id", w.id).eq("person_id", sara)).data).toHaveLength(1);
    expect(await digests(w.id)).toEqual([]);
  });
});

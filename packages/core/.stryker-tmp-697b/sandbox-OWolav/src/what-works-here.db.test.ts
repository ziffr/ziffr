// @ts-nocheck
// What works here, against the real database and the local Mailpit (spec 0021, ticket 5). For each set of settings,
// what whatWorksHere says is what the delivery queue then does: "real" is sent, "simulated" stays in the Outbox. So the
// explanation and the behaviour cannot drift apart.
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { deliverPrompt } from "./deliveries";
import { DEMO_WORKSPACE_ID } from "./team";
import { whatThisZiffrOffers, whatWorksHere, WAYS, type Way, type WayState } from "./what-works-here";
import { workspace } from "./test/db-fixtures";
const CLOUD = { ZIFFR_CLOUD_KEY: "k".repeat(32) };

const KEYS = ["ZIFFR_SMTP_URL", "ZIFFR_MAIL_FROM", "ZIFFR_SITE_URL", "ZIFFR_INBOUND_DOMAIN", "ZIFFR_INBOUND_SECRET", "ZIFFR_SLACK_CLIENT_ID", "ZIFFR_SLACK_CLIENT_SECRET", "ZIFFR_SLACK_SIGNING_SECRET", "ZIFFR_SECRETS_KEY", "ZIFFR_TELEGRAM_BOT_TOKEN", "ZIFFR_TRIAL_DAYS", "ZIFFR_TRIAL_MAX"];
const saved: Record<string, string | undefined> = {};
beforeEach(() => { for (const k of KEYS) { saved[k] = process.env[k]; delete process.env[k]; } });
afterEach(() => { for (const k of KEYS) if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; });
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
const MAIL = { ZIFFR_SMTP_URL: process.env.TEST_SMTP_URL ?? "smtp://127.0.0.1:55425", ZIFFR_MAIL_FROM: "Ziffr <ziffr@example.test>", ZIFFR_SITE_URL: "https://ziffr.example.test" };
const of = (ways: WayState[], w: Way) => ways.find((x) => x.way === w)!;

/** A workspace (a trial ending in `trialDays`, or an ordinary one) whose Owner submits one Metric. */
async function setUp(trialDays: number | null = null) {
  const w = await workspace();
  cleanups.push(w.cleanup);
  if (trialDays !== null) await db().from("workspaces").update({ trial_ends_at: new Date(Date.now() + trialDays * 86_400_000).toISOString() }).eq("id", w.id);
  const owner = await w.person("owner", { email: `o-${randomUUID().slice(0, 8)}@example.test`, slack_handle: "owner" });
  const m = await w.metric(owner, { sources: ["web_form", "mail", "slack", "telegram"] });
  await w.token(m.id, owner);
  return { w, owner, m };
}
/** What the queue did with a Prompt asked for by `via`: sent, or kept in the Outbox (a way that does not reach the person goes by email). */
async function promptBy(s: Awaited<ReturnType<typeof setUp>>, via: "email" | "slack" | "telegram") {
  await deliverPrompt({ metricId: s.m.id, submitterId: s.owner, via });
  const { data } = await db().from("deliveries").select("mail_state").eq("workspace_id", s.w.id).order("id", { ascending: false }).limit(1).single();
  return data!.mail_state as string;
}
const expected = (state: WayState["state"]) => (state === "real" ? "sent" : "outbox");

describe("what works here says what the queue does", () => {
  it("without a mail server: email is simulated and stays in the Outbox", async () => {
    const s = await setUp();
    const ways = await whatWorksHere(s.w.actor(s.owner));
    expect(of(ways, "email").state).toBe("simulated");
    expect(await promptBy(s, "email")).toBe(expected("simulated"));
  });

  it("with a mail server: email is real and sent; replies are off without an inbound domain", async () => {
    Object.assign(process.env, MAIL);
    const s = await setUp();
    const ways = await whatWorksHere(s.w.actor(s.owner));
    expect(of(ways, "email").state).toBe("real");
    expect(of(ways, "email-replies").state).toBe("off");
    expect(await promptBy(s, "email")).toBe(expected("real"));
  });

  it("without a Slack app or a Telegram bot: both are simulated and stay in the Outbox", async () => {
    const s = await setUp();
    const ways = await whatWorksHere(s.w.actor(s.owner));
    for (const via of ["slack", "telegram"] as const) {
      expect(of(ways, via).state).toBe("simulated");
      expect(await promptBy(s, via)).toBe(expected("simulated"));
    }
  });

  it("in a trial: email is real for the Owner, with the trial's limits named", async () => {
    Object.assign(process.env, MAIL);
    const s = await setUp(7);
    const ways = await whatWorksHere(s.w.actor(s.owner));
    expect(of(ways, "email")).toMatchObject({ state: "real", limit: expect.stringMatching(/To you and the colleagues who accepted their invitation, never to Contacts: at most 100/) });
    expect(of(ways, "api").limit).toMatch(/At most 2 Access Keys/);
    expect(await promptBy(s, "email")).toBe(expected("real"));
  });

  it("in an ended trial: everything is off, and nothing is sent", async () => {
    Object.assign(process.env, MAIL);
    const s = await setUp(-1);
    const ways = await whatWorksHere(s.w.actor(s.owner));
    expect(ways.every((w) => w.state === "off")).toBe(true);
    expect(await promptBy(s, "email")).toBe("outbox");
  });

  it("in the demo: messages are simulated, programs are off, even with a mail server", async () => {
    Object.assign(process.env, MAIL);
    const ways = await whatWorksHere({ workspaceId: DEMO_WORKSPACE_ID });
    expect(ways.map((w) => w.way)).toEqual([...WAYS]);
    expect(["email", "slack", "telegram"].map((w) => of(ways, w as Way).state)).toEqual(["simulated", "simulated", "simulated"]);
    expect(["api", "mcp", "feeds"].map((w) => of(ways, w as Way).state)).toEqual(["off", "off", "off"]);
  });
});

describe("what this Ziffr offers someone signed out", () => {
  it("offers no trial without the setting, with a wrong one, or without a Ziffr Cloud key (spec 0040)", async () => {
    expect((await whatThisZiffrOffers({})).trial).toBeNull();
    expect((await whatThisZiffrOffers({ ZIFFR_TRIAL_DAYS: "7" })).trial).toBeNull();
    expect((await whatThisZiffrOffers({ ZIFFR_CLOUD_KEY: "short", ZIFFR_TRIAL_DAYS: "7" })).trial).toBeNull();
    expect((await whatThisZiffrOffers({ ...CLOUD, ZIFFR_TRIAL_DAYS: "90" })).trial).toBeNull();
  });
  it("offers a trial with its days and what works in it", async () => {
    const offers = await whatThisZiffrOffers({ ...MAIL, ...CLOUD, ZIFFR_TRIAL_DAYS: "7" });
    expect(offers.trial?.days).toBe(7);
    expect(of(offers.trial!.ways, "email").state).toBe("real");
    expect(of(offers.trial!.ways, "slack").state).toBe("simulated");
  });
  it("points to the Installation settings page for each Connector that page can set up", async () => {
    // Mail, Slack and Telegram are all set on that page now (spec 0025); a simulated one says where.
    const offers = await whatThisZiffrOffers({ ...CLOUD, ZIFFR_TRIAL_DAYS: "7" });
    for (const w of ["email", "slack", "telegram"] as Way[]) {
      expect(of(offers.trial!.ways, w).state).toBe("simulated");
      expect(of(offers.trial!.ways, w).reason).toMatch(/Installation settings page/);
    }
  });
});

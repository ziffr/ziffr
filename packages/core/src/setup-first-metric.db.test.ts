// The Setup Guide's First Metric step against the real database, the local Mailpit and the fake Slack and Telegram (spec
// 0052, ticket 9; GLOSSARY: Setup Guide, Prompt, Submitter, Source, Quiet Hours, Test Metric): each direction of the loop
// on its own and together, what does not count (another person's value, one from before the guide, a viewer who may not
// see the Metric), the Quiet Hours and the ten minutes between asks in words, Ask me for it, the Test Metric of a trial,
// and who may use the step at all. Nothing is sent outside this machine.
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { Forbidden, type Actor } from "./actor";
import { db } from "./db";
import { setMyQuietHours } from "./quiet-hours";
import { setPreference } from "./questions";
import { askForFirstMetric, askMeForFirstMetric, firstMetricStep, pickFirstMetric, sendFirstMetricValue, setupFirstValue } from "./setup-first-metric";
import { setSetupFirstMetric, startSetupGuide } from "./setup-guide";
import { finishSlackInstall, startSlackInstall } from "./slack-connection";
import { setTelegramEnabled } from "./telegram-connection";
import { DEMO_WORKSPACE_ID } from "./team";
import { fakeSlack } from "./test/fake-slack";
import { fakeTelegram } from "./test/fake-telegram";
import { workspace } from "./test/db-fixtures";

const MAIL = { ZIFFR_SMTP_URL: process.env.TEST_SMTP_URL ?? "smtp://127.0.0.1:55425", ZIFFR_MAIL_FROM: "Ziffr <ziffr@example.test>", ZIFFR_SITE_URL: "https://ziffr.example.test" };
const saved: Record<string, string | undefined> = {};
let slack: Awaited<ReturnType<typeof fakeSlack>>;
let tg: Awaited<ReturnType<typeof fakeTelegram>>;
beforeAll(async () => {
  for (const [k, v] of Object.entries(MAIL)) { saved[k] = process.env[k]; process.env[k] = v; }
  slack = await fakeSlack(); tg = await fakeTelegram();
});
afterAll(async () => {
  await slack.stop(); await tg.stop();
  for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
});
const made: Awaited<ReturnType<typeof workspace>>[] = [];
afterEach(async () => {
  for (const w of made.splice(0)) { await db().from("deliveries").delete().eq("workspace_id", w.id); await w.cleanup(); }
});
const address = (who: string) => `${who}-${randomUUID().slice(0, 8)}@example.test`;
/** A Workspace whose Owner owns and submits the guide's Metric (MRR) and has the guide started. */
async function fresh(over: { submits?: boolean } = {}) {
  const w = await workspace("First Co");
  made.push(w);
  const email = address("owner");
  const owner = await w.person("owner", { email });
  const o = w.actor(owner, "owner");
  const m = await w.metric(owner, { name: "MRR", unit: "EUR" });
  const code = over.submits === false ? null : await w.token(m.id, owner);
  await startSetupGuide(o);
  await setSetupFirstMetric(o, m.id);
  return { w, owner, o, m, code, email };
}
/** Puts a value as the viewer's own, through a Source, in the way a reply, an answer or a form would have. */
const answer = async (w: { id: string }, metricId: number, submitter: string, source: string, value = 5) => {
  await db().from("observations").insert({ metric_id: metricId, period_start: "2027-01-01", value, submitter_id: submitter, source, workspace_id: w.id });
};
const aroundNow = () => { const h = new Date().getUTCHours(); return { fromHour: (h + 23) % 24, toHour: (h + 2) % 24, days: [], timeZone: null }; };

describe("out and in, each on its own and together", () => {
  it("out only: a Prompt by email arrives, the step says what to look for, and it does not tick", async () => {
    const { w, o, m, code, email } = await fresh();
    const r = await askForFirstMetric(o);
    expect(r.results).toHaveLength(1);
    expect(r.results[0]).toMatchObject({ connector: "email", state: "sent" });
    expect(r.results[0].look).toContain(`An email from Ziffr to ${email}`);
    expect(r.results[0].look).toContain("What’s the number for MRR");
    // The viewer's own form link comes back with the answer, and only once they have asked.
    expect(r.formCode).toBe(code);
    const s = await firstMetricStep(o);
    expect(s).toMatchObject({ out: true, in: false, value: null, works: null, formCode: code });
    expect(s.asked.map((a) => [a.connector, a.state, a.held])).toEqual([["email", "sent", false]]);
    expect(await setupFirstValue(o)).toEqual({ out: true, in: false, value: null, works: null });
    // Before asking, no form code reached the browser.
    const before = await fresh();
    expect((await firstMetricStep(before.o)).formCode).toBeNull();
    expect(m.id).toBeGreaterThan(0); expect(w.id).toBeTruthy();
  });

  it("in only: a value the viewer sent counts as in, and the step still waits for out", async () => {
    const { w, o, m, owner } = await fresh();
    await answer(w, m.id, owner, "web_form", 5);
    const s = await firstMetricStep(o);
    expect(s).toMatchObject({ out: false, in: true, works: null });
    expect(s.value).toMatchObject({ value: "5 EUR", source: "web_form" });
  });

  it("both: a typed value through the form's own intake ticks the step, and the step says what arrived", async () => {
    const { o } = await fresh();
    await askForFirstMetric(o);
    const sent = await sendFirstMetricValue(o, "48200");
    expect(sent.ok).toBe(true);
    const s = await firstMetricStep(o);
    expect(s).toMatchObject({ out: true, in: true });
    expect(s.works).toMatch(/^MRR for .+: 48.?200 EUR, through the form\. The loop works\.$/);
    const p = await setupFirstValue(o);
    expect(p).toMatchObject({ out: true, in: true, works: s.works });
    expect(Object.keys(p).sort()).toEqual(["in", "out", "value", "works"]);
  });

  it("a value from someone else, from before the guide began or through no Source does not count", async () => {
    const { w, o, m, owner } = await fresh();
    await askForFirstMetric(o);
    const ben = await w.person("member");
    await w.token(m.id, ben);
    await answer(w, m.id, ben, "web_form");
    await answer(w, m.id, null as never, "web_form");
    // One of the viewer's own from before the guide began.
    await answer(w, m.id, owner, "web_form", 7);
    await db().from("observations").update({ created_at: new Date(Date.now() - 86_400_000).toISOString() }).eq("metric_id", m.id).eq("submitter_id", owner);
    await db().from("setup_guides").update({ started_at: new Date(Date.now() - 3_600_000).toISOString() }).eq("workspace_id", w.id);
    expect(await setupFirstValue(o)).toMatchObject({ out: true, in: false });
    // The viewer's own, afterwards, counts.
    await answer(w, m.id, owner, "mail", 9);
    expect(await setupFirstValue(o)).toMatchObject({ out: true, in: true });
  });

  it("a Prompt for another Metric or to another person does not count as out", async () => {
    const { w, o, m, owner } = await fresh();
    const other = await w.metric(owner, { name: "Visits" }); await w.token(other.id, owner);
    const ben = await w.person("member", { email: address("ben") }); await w.token(m.id, ben);
    const { data: p1 } = await db().from("prompts").insert({ metric_id: other.id, submitter_id: owner, source: "email", text: "?", period_start: "2027-01-01", workspace_id: w.id }).select("id").single();
    const { data: p2 } = await db().from("prompts").insert({ metric_id: m.id, submitter_id: ben, source: "email", text: "?", period_start: "2027-01-01", workspace_id: w.id }).select("id").single();
    await db().from("deliveries").insert([
      { workspace_id: w.id, connector: "email", recipient_id: owner, kind: "prompt", subject: "s", body: "b", prompt_id: p1!.id, mail_state: "sent" },
      { workspace_id: w.id, connector: "email", recipient_id: ben, kind: "prompt", subject: "s", body: "b", prompt_id: p2!.id, mail_state: "sent" },
    ]);
    expect((await setupFirstValue(o)).out).toBe(false);
  });
});

describe("Quiet Hours and the ten minutes", () => {
  it("says before asking that the request will wait, counts a held Prompt as out, and says so after", async () => {
    const { o } = await fresh();
    await setMyQuietHours(o, aroundNow());
    expect((await firstMetricStep(o)).quietBefore).toMatch(/^You are in your Quiet Hours until \d\d:\d\d( on \w+)?: the request will wait until then\./);
    const r = await askForFirstMetric(o);
    expect(r.results[0].state).toBe("queued");
    expect(r.held).toMatch(/^Held by your Quiet Hours until /);
    const s = await firstMetricStep(o);
    expect(s.out).toBe(true);
    expect(s.asked[0]).toMatchObject({ connector: "email", state: "queued", held: true });
    // Outside them, nothing is said.
    await setMyQuietHours(o, null);
    expect((await firstMetricStep(o)).quietBefore).toBeNull();
  });

  it("says when Ask me now may be pressed again, refuses a second ask, and frees it after ten minutes", async () => {
    const { o, m } = await fresh();
    expect((await firstMetricStep(o)).cooldown).toBeNull();
    await askForFirstMetric(o);
    // Ten minutes from now may be tomorrow: the words then name the weekday after the time.
    expect((await firstMetricStep(o)).cooldown).toMatch(/^You asked a moment ago\. Ziffr asks at most once every 10 minutes: you can ask again in \d+ minutes?, at \d\d:\d\d( on \w+)?\.$/);
    await expect(askForFirstMetric(o)).rejects.toThrow(/a moment ago/);
    await db().from("ask_now_claims").update({ asked_at: new Date(Date.now() - 11 * 60_000).toISOString() }).eq("metric_id", m.id);
    expect((await firstMetricStep(o)).cooldown).toBeNull();
    await askForFirstMetric(o);
  });
});

describe("Slack and Telegram, answered", () => {
  it("asks by the person's chosen ways, each says what to look for, and an answer by either ticks the step", async () => {
    const w = await workspace("Chat Co"); made.push(w);
    const email = address("sara");
    const sara = await w.person("owner", { email });
    const o = w.actor(sara, "owner");
    slack.newTeam();
    const state = new URL(await startSlackInstall(o)).searchParams.get("state")!;
    expect(await finishSlackInstall(o, { code: "code-1234567890", state })).toBe("connected");
    slack.user(email);
    await setTelegramEnabled(o, true);
    const chat = Date.now() * 100 + 7;
    await db().from("telegram_links").insert({ workspace_id: w.id, person_id: sara, telegram_user_id: chat, chat_id: chat });
    await setPreference(o, sara, "reminder", ["slack", "telegram"]);
    const m = await w.metric(sara, { name: "Coffee", sources: ["web_form", "slack", "telegram", "mail"] });
    await w.token(m.id, sara);
    await startSetupGuide(o);
    await setSetupFirstMetric(o, m.id);
    const r = await askForFirstMetric(o);
    expect(r.results.map((x) => [x.connector, x.state])).toEqual([["slack", "sent"], ["telegram", "sent"]]);
    expect(r.results[0].look).toContain("direct message from the Ziffr app in Slack");
    expect(r.results[1].look).toContain("message from Ziffr’s bot in Telegram");
    // The answer comes back on Telegram, then it ticks; an answer on Slack would do the same.
    await answer(w, m.id, sara, "telegram", 12);
    const s = await firstMetricStep(o);
    expect(s.works).toMatch(/^Coffee for .+: 12, by Telegram answer\. The loop works\.$/);
    await db().from("observations").delete().eq("metric_id", m.id);
    await answer(w, m.id, sara, "slack", 13);
    expect((await firstMetricStep(o)).works).toContain("by Slack answer");
  });
});

describe("Ask me for it and picking another Metric", () => {
  it("adds the owner who does not submit as a Submitter, once, and only for a Metric they own", async () => {
    const { w, o, m, owner } = await fresh({ submits: false });
    expect((await firstMetricStep(o)).metric).toMatchObject({ mine: true, submitting: false, canAsk: false });
    await expect(askForFirstMetric(o)).rejects.toBeInstanceOf(Forbidden);
    await askMeForFirstMetric(o);
    await askMeForFirstMetric(o);
    expect((await firstMetricStep(o)).metric).toMatchObject({ mine: true, submitting: true, canAsk: true });
    const { count } = await db().from("tokens").select("id", { count: "exact", head: true }).eq("metric_id", m.id).eq("submitter_id", owner);
    expect(count).toBe(1);
    // An Admin who does not own it cannot ask to be asked for it: the step names the owner and offers their own.
    const admin = await w.person("admin");
    const a = w.actor(admin, "admin");
    await expect(askMeForFirstMetric(a)).rejects.toBeInstanceOf(Forbidden);
    // Not shared with the Admin yet: the guide's Metric is not named to them, and nothing of it is polled.
    expect((await firstMetricStep(a)).metric).toBeNull();
    expect(await setupFirstValue(a)).toEqual({ out: false, in: false, value: null, works: null });
    await w.share(m.id, admin);
    const s = await firstMetricStep(a);
    expect(s.metric).toMatchObject({ mine: false, canAsk: false });
    expect(s.metric!.ownerName).toMatch(/^owner /);
    await expect(askForFirstMetric(a)).rejects.toBeInstanceOf(Forbidden);
    await expect(sendFirstMetricValue(a, "5")).rejects.toBeInstanceOf(Forbidden);
  });

  it("lists only the viewer's own Metrics that take values, and picks only from them", async () => {
    const { w, o, m, owner } = await fresh();
    const mine = await w.metric(owner, { name: "Visits" });
    const derived = await w.metric(owner, { name: "Double", formula: `{${m.slug}} * 2` });
    const archived = await w.metric(owner, { name: "Old", archived_at: new Date().toISOString() });
    const ben = await w.person("member");
    const theirs = await w.metric(ben, { name: "Ben's" });
    const names = (await firstMetricStep(o)).choices.map((c) => c.name);
    expect(names).toContain("Visits");
    expect(names).not.toContain("Ben's");
    expect(names).not.toContain("Old");
    await pickFirstMetric(o, mine.id);
    expect((await firstMetricStep(o)).metric?.name).toBe("Visits");
    for (const bad of [theirs.id, derived.id, archived.id, 0, -1, 1.5, "7", null, undefined, Number.NaN]) await expect(pickFirstMetric(o, bad)).rejects.toBeInstanceOf(Forbidden);
    expect((await firstMetricStep(o)).metric?.name).toBe("Visits");
  });
});

describe("Ask me for it is limited like Ask me now", () => {
  it("claims the ten minutes, so two presses at once add and ask once, and a later one says to wait", async () => {
    const { w, o, m, owner } = await fresh({ submits: false });
    const both = await Promise.allSettled([askMeForFirstMetric(o), askMeForFirstMetric(o)]);
    expect(both.filter((r) => r.status === "fulfilled").length).toBeGreaterThanOrEqual(1);
    const { count } = await db().from("tokens").select("id", { count: "exact", head: true }).eq("metric_id", m.id).eq("submitter_id", owner);
    expect(count).toBe(1);
    const { count: prompts } = await db().from("prompts").select("id", { count: "exact", head: true }).eq("metric_id", m.id);
    expect(prompts).toBe(1);
    // Taken off and put back within the ten minutes: refused in words, and nothing is sent.
    await db().from("tokens").delete().eq("metric_id", m.id).eq("submitter_id", owner);
    await expect(askMeForFirstMetric(o)).rejects.toThrow(/a moment ago\. Ask again in 10 minutes/);
    expect((await db().from("prompts").select("id", { count: "exact", head: true }).eq("metric_id", m.id)).count).toBe(1);
    expect(w.id).toBeTruthy();
  });

  it("stops at 20 a day with the number and the wait, counting Test Messages, and at 5 in a trial", async () => {
    for (const trial of [false, true]) {
      const { w, o, m, owner } = await fresh({ submits: false });
      if (trial) await w.trial("2099-01-01");
      const cap = trial ? 5 : 20;
      // The day's places are used up (by Test Messages and earlier presses).
      await db().from("test_message_sends").insert(Array.from({ length: cap }, () => ({ workspace_id: w.id, person_id: owner, way: "email", at: new Date(Date.now() - 3_600_000).toISOString() })));
      await expect(askMeForFirstMetric(o)).rejects.toThrow(new RegExp(`${cap} times today, counting test messages\\. Try again in \\d+ (minutes|hours)\\.`));
      expect((await db().from("tokens").select("id", { count: "exact", head: true }).eq("metric_id", m.id).eq("submitter_id", owner)).count).toBe(0);
      expect((await db().from("prompts").select("id", { count: "exact", head: true }).eq("metric_id", m.id)).count).toBe(0);
      // One place fewer is used: it goes through.
      await db().from("ask_now_claims").delete().eq("metric_id", m.id);
      const one = await db().from("test_message_sends").select("id").eq("workspace_id", w.id).eq("person_id", owner).limit(1);
      await db().from("test_message_sends").delete().eq("id", one.data![0].id as number);
      await askMeForFirstMetric(o);
      expect((await firstMetricStep(o)).metric?.submitting).toBe(true);
    }
  });

  it("claims nothing when the person already submits it", async () => {
    const { o, m } = await fresh();
    await askMeForFirstMetric(o);
    expect((await db().from("ask_now_claims").select("metric_id").eq("metric_id", m.id)).data).toEqual([]);
  });
});

describe("a trial's Test Metric", () => {
  it("is the First Metric from the start, the Owner's own value counts as in, and Ask me for it works as anywhere", async () => {
    const w = await workspace("Trial Co"); made.push(w);
    const owner = await w.person("owner", { email: address("trial") });
    const o = w.actor(owner, "owner");
    const m = await w.metric(owner, { name: "Cups of coffee", unit: "cups", period: "day" });
    await w.trial("2099-01-01");
    await db().from("workspaces").update({ trial_test_metric_id: m.id }).eq("id", w.id);
    const s = await firstMetricStep(o);
    expect(s.trial).toBe(true);
    expect(s.metric).toMatchObject({ id: m.id, name: "Cups of coffee", mine: true, submitting: false });
    expect((await db().from("setup_guides").select("first_metric_id").eq("workspace_id", w.id).single()).data).toEqual({ first_metric_id: m.id });
    await askMeForFirstMetric(o);
    await answer(w, m.id, owner, "web_form", 3);
    expect(await setupFirstValue(o)).toMatchObject({ in: true });
    // Picking another Metric afterwards is the person's choice and is kept.
    const other = await w.metric(owner, { name: "Tea" });
    await pickFirstMetric(o, other.id);
    expect((await firstMetricStep(o)).metric?.name).toBe("Tea");
  });
});

describe("who may use the step", () => {
  it("is for Owners and Admins: a Member, a Guest, a key and the demo are refused, and the demo's poll says nothing", async () => {
    const { w, o } = await fresh();
    const member = w.actor(await w.person("member"), "member");
    const guest = w.actor(await w.person("guest"), "guest");
    const key = { ...o, key: { id: 1, scopes: [] } } as unknown as Actor;
    for (const a of [member, guest, key]) {
      await expect(firstMetricStep(a)).rejects.toBeInstanceOf(Forbidden);
      await expect(setupFirstValue(a)).rejects.toBeInstanceOf(Forbidden);
      await expect(askForFirstMetric(a)).rejects.toBeInstanceOf(Forbidden);
      await expect(askMeForFirstMetric(a)).rejects.toBeInstanceOf(Forbidden);
      await expect(pickFirstMetric(a, 1)).rejects.toBeInstanceOf(Forbidden);
      await expect(sendFirstMetricValue(a, "1")).rejects.toBeInstanceOf(Forbidden);
    }
    const demo: Actor = { personId: o.personId, workspaceId: DEMO_WORKSPACE_ID, role: "owner" };
    await expect(firstMetricStep(demo)).rejects.toThrow();
    await expect(askForFirstMetric(demo)).rejects.toThrow();
    expect(await setupFirstValue(demo)).toEqual({ out: false, in: false, value: null, works: null });
  });

  it("returns nothing of anyone else: no other person's address, Metric or form code", async () => {
    const { w, o, m } = await fresh();
    const ben = await w.person("member", { email: address("ben-secret") });
    const benCode = await w.token(m.id, ben);
    await w.metric(ben, { name: "Ben's private Metric" });
    await askForFirstMetric(o);
    const all = JSON.stringify([await firstMetricStep(o), await setupFirstValue(o), await askForFirstMetric(o).catch((e) => String(e))]);
    expect(all).not.toContain("ben-secret");
    expect(all).not.toContain(benCode);
    expect(all).not.toContain("Ben's private Metric");
  });

  it("with no Metric chosen, says so and asks for nothing", async () => {
    const { w, o } = await fresh();
    await setSetupFirstMetric(o, null);
    const s = await firstMetricStep(o);
    expect(s.metric).toBeNull();
    expect(s).toMatchObject({ out: false, in: false, works: null, asked: [], formCode: null });
    await expect(askForFirstMetric(o)).rejects.toThrow(/Choose a Metric/);
    await expect(askMeForFirstMetric(o)).rejects.toThrow(/Choose a Metric/);
    await expect(sendFirstMetricValue(o, "1")).rejects.toThrow(/Choose a Metric/);
    expect(await setupFirstValue(o)).toMatchObject({ out: false, in: false });
    expect(w.id).toBeTruthy();
  });
});

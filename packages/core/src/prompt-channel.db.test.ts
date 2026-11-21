// Where a Prompt goes (ticket #599; GLOSSARY: Prompt, Delivery Preference, Source), against the database: the person's
// chosen way counts only if the Metric accepts answers that way, else the first allowed way that reaches them (Slack,
// Telegram, email); with none, the Prompt waits in the Outbox as "Not sent: …" and the owner is told once.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { db } from "./db";
import { askMeNow } from "./ask-now";
import { deliverPrompt } from "./deliveries";
import { FORM_LINK } from "./mail";
import { nextPromptWays } from "./prompt-preview";
import { finishSlackInstall, startSlackInstall } from "./slack-connection";
import { setTelegramEnabled } from "./telegram-connection";
import { fakeSlack } from "./test/fake-slack";
import { fakeTelegram } from "./test/fake-telegram";
import { opened, workspace } from "./test/db-fixtures";
import type { SourceId } from "./types";

let slack: Awaited<ReturnType<typeof fakeSlack>>;
let tg: Awaited<ReturnType<typeof fakeTelegram>>;
beforeAll(async () => { slack = await fakeSlack(); tg = await fakeTelegram(); });
afterAll(async () => { await slack.stop(); await tg.stop(); });
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
const mail = (who: string) => `${who}-${Math.random().toString(36).slice(2, 8)}@example.test`;
let next = Date.now() * 100 + 40;

/** A workspace with Slack connected and Telegram on; the submitter is on Slack, on Telegram and has an address as asked. */
async function setup(o: { sources: SourceId[]; chosen?: "slack" | "telegram" | "email"; slack?: boolean; telegram?: boolean; email?: boolean }) {
  const w = await workspace(); cleanups.push(w.cleanup);
  const sara = await w.person("owner", { email: mail("sara") });
  slack.newTeam();
  const state = new URL(await startSlackInstall(w.actor(sara))).searchParams.get("state")!;
  expect(await finishSlackInstall(w.actor(sara), { code: "code-1234567890", state })).toBe("connected");
  await setTelegramEnabled(w.actor(sara), true);
  const address = o.email === false ? undefined : mail("ann");
  const ann = await w.person("member", { email: address });
  if (o.slack !== false && address) slack.user(address);
  if (o.telegram !== false) { const chat = ++next; await db().from("telegram_links").insert({ workspace_id: w.id, person_id: ann, telegram_user_id: chat, chat_id: chat }); }
  if (o.chosen) await db().from("delivery_preferences").insert({ workspace_id: w.id, user_id: ann, kind: "reminder", connector: o.chosen });
  const m = await w.metric(sara, { name: "Coffee", sources: o.sources });
  await w.token(m.id, ann);
  return { w, sara, ann, m };
}
const prompts = async (wsId: string, recipient: string) => await opened("deliveries", wsId, (await db().from("deliveries").select("*").eq("workspace_id", wsId).eq("recipient_id", recipient).eq("kind", "prompt").order("id")).data);
const notices = async (wsId: string, recipient: string) => await opened("deliveries", wsId, (await db().from("deliveries").select("*").eq("workspace_id", wsId).eq("recipient_id", recipient).eq("kind", "notice").order("id")).data);

describe("a Prompt goes only where its answer is accepted", () => {
  it("a Slack-only Metric is asked on Slack although email is chosen, and no form link goes out", async () => {
    const { w, sara, ann, m } = await setup({ sources: ["slack"], chosen: "email" });
    const r = await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara });
    expect(r).toMatchObject({ connector: "slack", chosen: false });
    const [d] = await prompts(w.id, ann);
    expect(d.connector).toBe("slack");
    expect(String(d.body)).not.toContain(FORM_LINK);
    expect(String(d.body)).toContain("Reply with the number");
  });

  it("goes by the chosen way when the Metric accepts it and it reaches the person", async () => {
    for (const via of ["slack", "telegram"] as const) {
      const { w, sara, ann, m } = await setup({ sources: ["slack", "telegram", "web_form"], chosen: via });
      expect(await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara })).toMatchObject({ connector: via, chosen: true });
      expect((await prompts(w.id, ann)).map((d) => d.connector)).toEqual([via]);
    }
  });

  it("falls to Telegram when the chosen Slack does not reach the person", async () => {
    const { w, sara, ann, m } = await setup({ sources: ["slack", "telegram"], chosen: "slack", slack: false });
    expect(await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara })).toMatchObject({ connector: "telegram", chosen: false });
    expect((await prompts(w.id, ann)).map((d) => d.connector)).toEqual(["telegram"]);
  });

  it("falls to email with a form link when only the Web form is open besides an unreachable chat", async () => {
    const { w, sara, ann, m } = await setup({ sources: ["slack", "web_form"], chosen: "slack", slack: false });
    expect(await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara })).toMatchObject({ connector: "email", chosen: false });
    const [d] = await prompts(w.id, ann);
    expect(String(d.body)).toContain(FORM_LINK);
    expect((await db().from("prompts").select("source").eq("metric_id", m.id)).data).toEqual([{ source: "web_form" }]);
  });

  it("an email for a Mail-only Metric asks for a reply and carries no form link", async () => {
    const { w, sara, ann, m } = await setup({ sources: ["mail"], chosen: "email" });
    expect(await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara })).toMatchObject({ connector: "email", chosen: true });
    const [d] = await prompts(w.id, ann);
    expect(String(d.body)).toContain("reply to this email");
    expect(String(d.body)).not.toContain(FORM_LINK);
  });

  it("never sends a form link for a Metric that refuses the Web form, whatever the chosen way", async () => {
    const { w, sara, ann, m } = await setup({ sources: ["slack", "telegram"], chosen: "email" });
    await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara });
    for (const d of await prompts(w.id, ann)) expect(String(d.body)).not.toContain(FORM_LINK);
  });
});

describe("when no allowed way reaches the person", () => {
  it("keeps it in the Outbox as Not sent, sends it nowhere else, and tells the owner once", async () => {
    const { w, sara, ann, m } = await setup({ sources: ["slack"], chosen: "email", slack: false });
    const posted = slack.of("chat.postMessage").length;
    const r = await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara });
    expect(r).toMatchObject({ state: "outbox", notSent: "Not sent: this Metric takes values only by Slack, and they have no linked Slack account." });
    const [d] = await prompts(w.id, ann);
    expect(d).toMatchObject({ mail_state: "outbox", last_error: "Not sent: this Metric takes values only by Slack, and they have no linked Slack account.", prompt_id: null });
    expect(String(d.body)).not.toContain(FORM_LINK);
    expect(slack.of("chat.postMessage")).toHaveLength(posted);
    expect((await db().from("prompts").select("id").eq("metric_id", m.id)).data).toEqual([]);
    const told = await notices(w.id, sara);
    expect(told).toHaveLength(1);
    expect(String(told[0].subject)).toContain("Coffee");
    // Asked again, it waits again, and the owner is not told again.
    await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara });
    expect(await prompts(w.id, ann)).toHaveLength(2);
    expect(await notices(w.id, sara)).toHaveLength(1);
  });

  it("is told again after a Prompt went and a later one fails", async () => {
    const { w, sara, ann, m } = await setup({ sources: ["slack"], slack: false });
    await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara });
    slack.user((await db().from("profiles").select("email").eq("id", ann).single()).data!.email);
    expect(await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara })).toMatchObject({ connector: "slack" });
    await db().from("slack_links").delete().eq("workspace_id", w.id).eq("person_id", ann);
    await db().from("profiles").update({ email: null }).eq("id", ann);
    await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara });
    expect(await notices(w.id, sara)).toHaveLength(2);
  });

  it("says what is missing when there is no way: an API-only Metric, and chat ways nobody is linked to", async () => {
    const api = await setup({ sources: ["api"] });
    expect(await deliverPrompt({ metricId: api.m.id, submitterId: api.ann, senderId: api.sara })).toMatchObject({ state: "outbox", notSent: expect.stringContaining("none of") });
    const none = await setup({ sources: ["slack", "telegram"], telegram: false, email: false });
    expect(await deliverPrompt({ metricId: none.m.id, submitterId: none.ann, senderId: none.sara })).toMatchObject({ notSent: "Not sent: this Metric takes values only by Slack or Telegram, and they have no linked Slack account and have not connected Telegram." });
  });
});

describe("Ask me now and the Metric page say where it goes", () => {
  it("Ask me now says where it was sent and whether that was the person's own way", async () => {
    const { w, sara, m } = await setup({ sources: ["slack"], chosen: "email" });
    await db().from("tokens").insert({ code: `tk-own-${Math.random()}`, metric_id: m.id, submitter_id: sara });
    slack.user((await db().from("profiles").select("email").eq("id", sara).single()).data!.email);
    const r = await askMeNow(w.actor(sara), m.id);
    expect(r).toMatchObject({ connector: "slack", label: "Slack", chosen: false });
  });

  it("Ask me now says when it stayed unsent, in the reason's own words", async () => {
    const { w, sara, m } = await setup({ sources: ["telegram"] });
    await db().from("tokens").insert({ code: `tk-own-${Math.random()}`, metric_id: m.id, submitter_id: sara });
    const r = await askMeNow(w.actor(sara), m.id);
    expect(r).toMatchObject({ state: "outbox", note: expect.stringMatching(/^Not sent: /) });
  });

  it("the preview shows each submitter's next way to the owner, and only their own line to anyone else", async () => {
    const { w, sara, ann, m } = await setup({ sources: ["slack"], chosen: "email", slack: false });
    const mine = await nextPromptWays(w.actor(sara), m.id);
    expect(mine[ann]).toMatchObject({ ok: false, text: "Can’t reach: link Slack", fix: null });
    const own = await nextPromptWays(w.actor(ann), m.id);
    expect(Object.keys(own)).toEqual([ann]);
    expect(own[ann].fix).toEqual({ label: "Link Slack", href: "/connectors" });
    const ok = await setup({ sources: ["slack"], chosen: "email" });
    // The preview reads links only (no call to Slack); a first Prompt matches the person by address and links them.
    await deliverPrompt({ metricId: ok.m.id, submitterId: ok.ann, senderId: ok.sara });
    expect((await nextPromptWays(ok.w.actor(ok.sara), ok.m.id))[ok.ann]).toMatchObject({ ok: true, text: "By Slack", why: "They chose email, but this Metric does not take values by email." });
  });

  it("a Guest who still owns the Metric sees no one else's line", async () => {
    const { w, sara, ann, m } = await setup({ sources: ["slack"], slack: false });
    await w.person("owner"); // a workspace keeps one
    await w.setRole(sara, "guest");
    expect(await nextPromptWays(w.actor(sara, "guest"), m.id)).toEqual({});
    expect(Object.keys(await nextPromptWays(w.actor(ann), m.id))).toEqual([ann]);
  });
});

describe("Slack is asked about a person only when it can decide the way", () => {
  it("not when the person's chosen way is accepted and reaches them", async () => {
    const { sara, ann, m } = await setup({ sources: ["slack", "web_form"], chosen: "email", slack: false });
    const before = slack.of("users.lookupByEmail").length;
    expect(await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara })).toMatchObject({ connector: "email", chosen: true });
    expect(slack.of("users.lookupByEmail")).toHaveLength(before);
  });
});


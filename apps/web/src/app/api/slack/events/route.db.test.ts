// POST /api/slack/events and /api/slack/interactions over HTTP (spec 0007, ticket #104): Slack's signature, its age,
// url_verification, the size limit, and an event that arrives twice (Slack retries) taken once, end to end with a
// real Prompt sent to the fake Slack Web API.
import { createHmac, randomBytes } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { deliverPrompt } from "@ziffr/core/deliveries";
import { connectorsView } from "@ziffr/core/page-data";
import { finishSlackInstall, slackBot, startSlackInstall } from "@ziffr/core/slack-connection";
import { fakeSlack, SLACK_SETTINGS } from "@ziffr/core/test/fake-slack";
import { valuesOf, workspace } from "@ziffr/core/test/db-fixtures";
import { POST } from "./route";
import { POST as INTERACT } from "../interactions/route";

let slack: Awaited<ReturnType<typeof fakeSlack>>;
beforeAll(async () => { slack = await fakeSlack(); });
afterAll(async () => { await slack.stop(); });
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });

const SECRET = SLACK_SETTINGS.ZIFFR_SLACK_SIGNING_SECRET;
const sign = (body: string, ts = Math.floor(Date.now() / 1000), secret = SECRET) => ({ "x-slack-request-timestamp": String(ts), "x-slack-signature": `v0=${createHmac("sha256", secret).update(`v0:${ts}:${body}`).digest("hex")}` });
const post = (body: string, headers: Record<string, string>, handler = POST, type = "application/json") => handler(new Request("http://ziffr.test/api/slack/events", { method: "POST", body, headers: { "content-type": type, ...headers } }));
const CHALLENGE = JSON.stringify({ type: "url_verification", token: "x", challenge: "3eZbrw1aBm2rZgRNFdxV2595E9CY3gmdALWMmHkvFXO7tYXAYM8P" });

describe("POST /api/slack/events", () => {
  it("answers url_verification only when signed with the secret a moment ago", async () => {
    expect((await post(CHALLENGE, {})).status).toBe(404);
    expect((await post(CHALLENGE, sign(CHALLENGE, undefined, "z".repeat(32)))).status).toBe(404);
    expect((await post(CHALLENGE, sign(CHALLENGE, Math.floor(Date.now() / 1000) - 600))).status).toBe(404);
    expect((await post(CHALLENGE, sign(CHALLENGE, Math.floor(Date.now() / 1000) + 600))).status).toBe(404);
    expect((await post(`${CHALLENGE} `, sign(CHALLENGE))).status).toBe(404);
    const ok = await post(CHALLENGE, sign(CHALLENGE));
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe("3eZbrw1aBm2rZgRNFdxV2595E9CY3gmdALWMmHkvFXO7tYXAYM8P");
    // Without Slack set up there is nothing here.
    const saved = process.env.ZIFFR_SLACK_SIGNING_SECRET;
    delete process.env.ZIFFR_SLACK_SIGNING_SECRET;
    expect((await post(CHALLENGE, sign(CHALLENGE))).status).toBe(404);
    process.env.ZIFFR_SLACK_SIGNING_SECRET = saved;
  });

  it("refuses a body over 64 KB before reading its signature, also when it does not say its length", async () => {
    const big = JSON.stringify({ type: "x", pad: "x".repeat(70 * 1024) });
    expect((await post(big, sign(big))).status).toBe(413);
    const chunk = new TextEncoder().encode("x".repeat(16 * 1024));
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({ pull(c) { if (sent++ > 40) c.close(); else c.enqueue(chunk); } });
    const res = await POST(new Request("http://ziffr.test/api/slack/events", { method: "POST", body: stream, headers: sign("x"), duplex: "half" } as RequestInit));
    expect(res.status).toBe(413);
    expect(sent).toBeLessThan(10);
  });

  it("records a reply in a Prompt's thread once, however often Slack delivers the event", async () => {
    const w = await workspace(); cleanups.push(w.cleanup);
    const sara = await w.person("owner");
    slack.newTeam();
    const state = new URL(await startSlackInstall(w.actor(sara))).searchParams.get("state")!;
    expect(await finishSlackInstall(w.actor(sara), { code: "code-1234567890", state })).toBe("connected");
    const bot = (await slackBot(w.id))!;
    const annMail = `ann-${randomBytes(4).toString("hex")}@example.test`;
    const ann = await w.person("member", { email: annMail });
    const annSlack = slack.user(annMail);
    const m = await w.metric(sara, { name: "Orders", sources: ["web_form", "slack"] });
    await w.token(m.id, ann);
    await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara, via: "slack" });
    const d = (await connectorsView(w.actor(sara))).deliveries.find((x) => x.recipient_id === ann)!;
    expect(d.mail_state).toBe("sent");
    // Where the message went, as the fake Slack got it.
    const { channel, ts } = slack.of("chat.postMessage").at(-1)!.answer as { channel: string; ts: string };
    const event = JSON.stringify({ type: "event_callback", team_id: bot.teamId, api_app_id: bot.appId, event_id: `Ev${randomBytes(6).toString("hex").toUpperCase()}`, event: { type: "message", channel_type: "im", channel, user: annSlack, text: "23", ts: `${Number(ts.split(".")[0]) + 5}.000100`, thread_ts: ts } });
    const first = await post(event, sign(event));
    expect(await first.json()).toEqual({ outcome: "recorded" });
    const retry = await post(event, { ...sign(event), "x-slack-retry-num": "1", "x-slack-retry-reason": "http_timeout" });
    expect(retry.status).toBe(200);
    expect(await retry.json()).toEqual({ outcome: "duplicate" });
    expect(await valuesOf(m.id)).toMatchObject([{ value: 23, submitter_id: ann, source: "slack" }]);
  });
});

describe("POST /api/slack/interactions", () => {
  it("takes only signed button presses, as Slack sends them", async () => {
    const form = `payload=${encodeURIComponent(JSON.stringify({ type: "block_actions", team: { id: "TNOPE" }, actions: [] }))}`;
    expect((await post(form, {}, INTERACT, "application/x-www-form-urlencoded")).status).toBe(404);
    expect((await post(form, sign(form), INTERACT, "application/x-www-form-urlencoded")).status).toBe(200);
    expect((await post("payload=%7Bnot", sign("payload=%7Bnot"), INTERACT, "application/x-www-form-urlencoded")).status).toBe(400);
  });
});

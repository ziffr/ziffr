// Sending by Slack (spec 0007, ticket #103), against the database and a fake Slack Web API on this machine: sent,
// failed, retried, waiting on a limit and on Slack's 429; nothing without a connection, for someone not on Slack, or
// after they stopped; text from the workspace escaped; email's queue never sends a Slack Delivery.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { db } from "./db";
import { deliverNotice, deliverPrompt } from "./deliveries";
import { MAX_ATTEMPTS } from "./mail";
import { ask } from "./questions";
import { finishSlackInstall, slackBot, startSlackInstall } from "./slack-connection";
import { sendSlackDelivery, sendWaitingSlack, slackSends, SLACK_PER_RECIPIENT_PER_HOUR } from "./slack-send";
import { STARTER_THEME } from "./themes";
import { DEMO_WORKSPACE_ID } from "./team";
import type { Actor } from "./actor";
import { fakeSlack } from "./test/fake-slack";
import { workspace } from "./test/db-fixtures";

let slack: Awaited<ReturnType<typeof fakeSlack>>;
beforeAll(async () => { slack = await fakeSlack(); });
afterAll(async () => { await slack.stop(); });
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
const mail = (who: string) => `${who}-${Math.random().toString(36).slice(2, 8)}@example.test`;

async function connect(actor: Actor) {
  slack.newTeam();
  const state = new URL(await startSlackInstall(actor)).searchParams.get("state")!;
  expect(await finishSlackInstall(actor, { code: "code-1234567890", state })).toBe("connected");
}
/** A connected workspace with an owner and a member on Slack, and a Metric the member submits to. */
async function setup(sources = ["web_form", "slack"]) {
  const w = await workspace(); cleanups.push(w.cleanup);
  const sara = await w.person("owner", { email: mail("sara") });
  await connect(w.actor(sara));
  const annMail = mail("ann");
  const ann = await w.person("member", { email: annMail });
  const annSlack = slack.user(annMail);
  const m = await w.metric(sara, { name: "Field visits", sources });
  const code = await w.token(m.id, ann);
  return { w, sara, ann, annSlack, m, code };
}
const latest = async (wsId: string, recipient: string) => (await db().from("deliveries").select("*").eq("workspace_id", wsId).eq("recipient_id", recipient).order("id", { ascending: false }).limit(1).single()).data!;
const posts = () => slack.of("chat.postMessage");

describe("sending by Slack", () => {
  it("sends a Prompt as a direct message, with a Stop button, and keeps where it went", async () => {
    const { w, sara, ann, annSlack, m } = await setup();
    const before = posts().length;
    expect(await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara, via: "slack" })).toBeTruthy();
    const d = await latest(w.id, ann);
    expect(d).toMatchObject({ connector: "slack", mail_state: "sent", attempts: 1, slack_channel: `D${annSlack.slice(1)}` });
    expect(d.slack_ts).toBe(d.provider_id);
    expect(slack.of("conversations.open").at(-1)?.params.users).toBe(annSlack);
    const post = posts().at(-1)!;
    expect(posts()).toHaveLength(before + 1);
    expect(post.token).toBe((await slackBot(w.id))!.token);
    expect(post.params.text).toContain("Reply with the number, here in the thread.");
    // The buttons sit in an attachment, which carries the side bar in the Workspace Theme's (readable) accent.
    const [attachment] = JSON.parse(post.params.attachments);
    expect(attachment.blocks[1].elements).toMatchObject([{ action_id: "ziffr_stop", value: String(d.id) }]);
    expect(attachment.color).toMatch(/^#[0-9A-F]{6}$/);
  });

  it("sends as the Workspace, with its name and logo, once Slack granted chat:write.customize (#650)", async () => {
    const { w, sara, ann, m } = await setup();
    const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
    await db().from("themes").insert({ workspace_id: w.id, owner_id: sara, name: "Brand", is_default: true, tokens: STARTER_THEME.tokens, slides: { ...STARTER_THEME.slides, logo: png } });
    const name = (await db().from("workspaces").select("name").eq("id", w.id).single()).data!.name;
    await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara, via: "slack" });
    const post = posts().at(-1)!;
    expect(post.params.username).toBe(name);
    expect(post.params.icon_url).toMatch(new RegExp(`^https://ziffr\\.example\\.test/api/brand/logo/${w.id}/[0-9a-f]{16}$`));
    // A connection made before the scope existed keeps the app's own name and icon, and nothing breaks.
    await db().from("slack_installations").update({ scopes: "chat:write,im:write" }).eq("workspace_id", w.id);
    await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara, via: "slack" });
    const old = posts().at(-1)!;
    expect(old.params.username).toBeUndefined();
    expect(old.params.icon_url).toBeUndefined();
    expect((await latest(w.id, ann)).mail_state).toBe("sent");
  });

  it("posts no Prompt on Slack for a Metric that does not take answers by Slack", async () => {
    const { w, sara, ann, m } = await setup(["web_form"]);
    const before = posts().length;
    await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara, via: "slack" });
    expect((await latest(w.id, ann)).connector).toBe("email");
    expect(posts()).toHaveLength(before);
  });

  it("escapes what people wrote, so it cannot become a link or a mention", async () => {
    const { w, sara, ann, m } = await setup();
    await ask(w.actor(sara), { metricId: m.id, period: "2026-10-01", assigneeId: ann, text: "Why? <!channel> & <https://evil.example|your bank>", via: "slack" });
    const text = posts().at(-1)!.params.text;
    expect(text).toContain("&lt;!channel&gt; &amp; &lt;https://evil.example|your bank&gt;");
    expect(text).not.toContain("<!channel>");
    expect(text).toMatch(/<https:\/\/ziffr\.example\.test\/actions\/\d+\|Open in Ziffr>/);
    // Notices carry people's names, which anyone may have chosen: escaped too.
    await db().from("delivery_preferences").insert({ workspace_id: w.id, user_id: ann, kind: "update", connector: "slack" });
    await deliverNotice(w.id, { recipientId: ann, senderId: sara, subject: "Access", text: "<https://evil.example|Your session ended> asks for access", link: "/connectors" });
    const notice = posts().at(-1)!.params.text;
    expect(notice).toContain("&lt;https://evil.example|Your session ended&gt; asks for access");
    expect(notice).toContain("<https://ziffr.example.test/connectors|Open in Ziffr>");
  });

  it("sends nothing without a connection, in the demo, to someone not on Slack, or after they stopped", async () => {
    const w = await workspace(); cleanups.push(w.cleanup);
    const sara = await w.person("owner");
    const ann = await w.person("member", { email: mail("ann") });
    const m = await w.metric(sara);
    await w.token(m.id, ann);
    const before = posts().length;
    await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara, via: "slack" });
    expect((await latest(w.id, ann)).mail_state).toBe("outbox");
    expect(await slackSends(DEMO_WORKSPACE_ID)).toBe(false);
    const s = await setup();
    const nobody = await s.w.person("member", { email: mail("nobody") });
    await s.w.token(s.m.id, nobody);
    await deliverPrompt({ metricId: s.m.id, submitterId: nobody, senderId: s.sara, via: "slack" });
    // Nobody on Slack has their address: the Prompt goes the way that does reach them, an email.
    expect((await latest(s.w.id, nobody)).connector).toBe("email");
    await db().from("slack_opt_outs").insert({ workspace_id: s.w.id, person_id: s.ann });
    await deliverPrompt({ metricId: s.m.id, submitterId: s.ann, senderId: s.sara, via: "slack" });
    expect(await latest(s.w.id, s.ann)).toMatchObject({ mail_state: "failed", last_error: "They stopped reminders on Slack." });
    expect(posts()).toHaveLength(before);
  });

  it("retries a failed send with the job, and never as an email", async () => {
    const { w, sara, ann, m } = await setup();
    slack.fail("chat.postMessage", { error: "internal_error" });
    await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara, via: "slack" });
    const d = await latest(w.id, ann);
    expect(d).toMatchObject({ mail_state: "queued", attempts: 1, last_error: "Slack refused it (internal_error)." });
    // Email's job does not see it.
    const { data: emailDue } = await db().rpc("due_deliveries", { p_limit: 500, p_max_attempts: MAX_ATTEMPTS });
    expect((emailDue as number[]).map(Number)).not.toContain(Number(d.id));
    await db().from("deliveries").update({ last_attempt_at: new Date(Date.now() - 120_000).toISOString() }).eq("id", d.id);
    await sendWaitingSlack(500);
    expect((await latest(w.id, ann)).mail_state).toBe("sent");
  });

  it("waits for Slack's Retry-After, and for Ziffr's limits, without using an attempt", async () => {
    const { w, sara, ann, annSlack, m } = await setup();
    slack.fail("chat.postMessage", { status: 429, retryAfter: 120 });
    await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara, via: "slack" });
    const d = await latest(w.id, ann);
    expect(d).toMatchObject({ mail_state: "queued", attempts: 0 });
    expect(new Date(d.not_before).getTime()).toBeGreaterThan(Date.now() + 100_000);
    expect((await db().from("slack_sends").select("id").eq("delivery_id", d.id)).data).toHaveLength(0);
    const bot = (await slackBot(w.id))!;
    await db().from("slack_sends").insert(Array.from({ length: SLACK_PER_RECIPIENT_PER_HOUR }, () => ({ workspace_id: w.id, team_id: bot.teamId, recipient_key: `${bot.teamId}:${annSlack}` })));
    await db().from("deliveries").update({ not_before: null }).eq("id", d.id);
    expect(await sendSlackDelivery(d.id)).toBe("waiting");
    expect((await latest(w.id, ann)).attempts).toBe(0);
  });

  it("ends the connection when Slack says the token is gone", async () => {
    const { w, sara, ann, m } = await setup();
    slack.fail("chat.postMessage", { error: "token_revoked" });
    await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara, via: "slack" });
    expect(await latest(w.id, ann)).toMatchObject({ mail_state: "failed", last_error: "Slack is not connected any more." });
    expect(await slackBot(w.id)).toBeNull();
    expect(await slackSends(w.id)).toBe(false);
  });
});

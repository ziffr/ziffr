// Connection notices (spec 0016, spec 0007), against the database, fake Telegram and Slack APIs and Mailpit: a member is
// emailed when an account becomes theirs, whoever loses an account to someone else is emailed, the email's link
// disconnects exactly that connection with no sign-in, and the notices are limited.
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { CONNECTION_NOTICES_PER_HOUR, chatDisconnectView, disconnectByLink, tellConnected } from "./connection-notices";
import { CONNECTION_NOTICE } from "./connection-notice-words";
import { finishSlackInstall, slackBot, startSlackInstall } from "./slack-connection";
import { linkSlackByCode, slackUserFor, startSlackLink } from "./slack-people";
import { confirmTelegram } from "./telegram-confirm";
import { setTelegramEnabled } from "./telegram-connection";
import { receiveTelegramUpdate } from "./telegram-inbound";
import { personOfTelegramUser, startTelegramLink, startTelegramLinkByForm } from "./telegram-people";
import { fakeSlack, slackId } from "./test/fake-slack";
import { fakeTelegram } from "./test/fake-telegram";
import { opened, rowsOf, workspace } from "./test/db-fixtures";
import type { Actor } from "./actor";

const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:55424";
const MAIL = { ZIFFR_SMTP_URL: process.env.TEST_SMTP_URL ?? "smtp://127.0.0.1:55425", ZIFFR_MAIL_FROM: "Ziffr <ziffr@example.test>" };
const saved: Record<string, string | undefined> = {};
let tg: Awaited<ReturnType<typeof fakeTelegram>>;
let slack: Awaited<ReturnType<typeof fakeSlack>>;
beforeAll(async () => {
  tg = await fakeTelegram();
  slack = await fakeSlack();
  for (const [k, v] of Object.entries(MAIL)) { saved[k] = process.env[k]; process.env[k] = v; }
});
afterAll(async () => {
  await slack.stop();
  await tg.stop();
  for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
});
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });

let next = Date.now() * 100;
const id = () => ++next;
const address = (who: string) => `${who}-${randomUUID().slice(0, 8)}@example.test`;
const message = (userId: number, text: string) => ({ update_id: id(), message: { message_id: id() % 1_000_000, from: { id: userId, is_bot: false, first_name: "Phone", username: "phone_tg" }, chat: { id: userId, type: "private" }, date: Math.floor(Date.now() / 1000), text } });
const codeOf = (url: string) => new URL(url).searchParams.get("start")!;

/** The connection notices made for a person, oldest first, their words opened. */
async function notices(ws: string, person: string) {
  const rows = await rowsOf("deliveries", { workspace_id: ws, recipient_id: person, external_ref: CONNECTION_NOTICE });
  const open = await opened("deliveries", ws, rows as never[]) as unknown as { id: number; subject: string; body: string; mail_state: string; sender_id: string | null; connector: string }[];
  return open.sort((a, b) => a.id - b.id);
}
const linkIn = (body: string) => /\/api\/disconnect-chat\/(\S+)$/.exec(body)![1];

async function setup() {
  const w = await workspace(); cleanups.push(w.cleanup);
  const owner = await w.person("owner", { email: address("owner") });
  await setTelegramEnabled(w.actor(owner), true);
  const saraMail = address("sara");
  const sara = await w.person("member", { email: saraMail });
  const ben = await w.person("member", { email: address("ben") });
  /** Connect Telegram signed in, then Start from an account. */
  const connect = async (person: string, user: number) => receiveTelegramUpdate(message(user, `/start ${codeOf((await startTelegramLink(w.actor(person, "member"))).url)}`));
  return { w, owner, sara, saraMail, ben, connect };
}
async function connectSlack(actor: Actor) {
  slack.newTeam();
  const state = new URL(await startSlackInstall(actor)).searchParams.get("state")!;
  expect(await finishSlackInstall(actor, { code: "code-1234567890", state })).toBe("connected");
  return (await slackBot(actor.workspaceId))!;
}

describe("telling a member an account became theirs", () => {
  it("emails them for a Telegram account they were not connected to, with a button that disconnects it", async () => {
    const { w, sara, saraMail, connect } = await setup();
    const user = id();
    expect(await connect(sara, user)).toBe("linked");
    const [mail] = await notices(w.id, sara);
    expect(mail).toMatchObject({ subject: "Telegram was connected to you in Ziffr", connector: "email", sender_id: null, mail_state: "sent" });
    expect(mail.body).toMatch(/in the workspace “Test” on \d{1,2} \w+ \d{4} at \d\d:\d\d \(.+\)/);
    expect(mail.body).toContain("Telegram account: “Phone” (@phone_tg)");
    const { messages } = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${saraMail}" subject:"Telegram was connected"`)}`)).json() as { messages: { ID: string }[] };
    const sent = (await (await fetch(`${MAILPIT}/api/v1/message/${messages[0].ID}`)).json()) as { Text: string; HTML: string };
    const url = `https://ziffr.example.test/api/disconnect-chat/${linkIn(mail.body)}`;
    // A button to the link in the HTML; the plain text keeps the address, alone on its line.
    expect(sent.HTML).toMatch(new RegExp(`<a href="${url.replace(/[.?]/g, "\\$&")}"[^>]*>Not you\\? Disconnect it</a>`));
    expect(sent.Text).toContain(`<${url}>`);

    // The same account again changes nothing and sends nothing; another account is told.
    await connect(sara, user);
    expect(await notices(w.id, sara)).toHaveLength(1);
    await connect(sara, id());
    expect(await notices(w.id, sara)).toHaveLength(2);
  });

  it("disconnects exactly the connection the link was made for, once, and drops a waiting code", async () => {
    const { w, sara, connect } = await setup();
    const first = id();
    await connect(sara, first);
    const old = linkIn((await notices(w.id, sara))[0].body);
    const second = id();
    await connect(sara, second);
    const current = linkIn((await notices(w.id, sara))[1].body);
    // The earlier link ends nothing now.
    expect(await chatDisconnectView(old)).toEqual({ service: "telegram", workspace: "Test", connected: false });
    expect(await disconnectByLink(old)).toEqual({ service: "telegram", workspace: "Test" });
    expect(await personOfTelegramUser(w.id, second)).toBe(sara);
    for (const wrong of ["", "nonsense", `${current.slice(0, -2)}aa`, `x${current}`]) {
      expect(await chatDisconnectView(wrong)).toBeNull();
      expect(await disconnectByLink(wrong)).toBeNull();
    }
    expect(await chatDisconnectView(current)).toEqual({ service: "telegram", workspace: "Test", connected: true });
    expect(await personOfTelegramUser(w.id, second)).toBe(sara);
    const waiting = codeOf((await startTelegramLink(w.actor(sara, "member"))).url);
    expect(await disconnectByLink(current)).toEqual({ service: "telegram", workspace: "Test" });
    expect(await personOfTelegramUser(w.id, second)).toBeNull();
    expect(await receiveTelegramUpdate(message(id(), `/start ${waiting}`))).toBe("refused");
    expect(await disconnectByLink(current)).not.toBeNull();
    expect((await chatDisconnectView(current))!.connected).toBe(false);
  });

  it("tells whoever loses a Telegram account to someone else, naming nobody", async () => {
    const { w, owner, sara, ben, connect } = await setup();
    const user = id();
    await connect(sara, user);
    await connect(ben, user);
    const lost = (await notices(w.id, sara))[1];
    expect(lost.subject).toBe("Telegram was disconnected from you in Ziffr");
    expect(lost.body).toContain("/connectors?account=telegram");
    expect(lost.body).not.toMatch(/member [0-9a-f]{4}|phone_tg/);
    expect((await notices(w.id, ben)).map((n) => n.subject)).toEqual(["Telegram was connected to you in Ziffr"]);

    // Also when a Contact's confirmation moves the account.
    const email = address("cleo");
    const cleo = await w.contact({ email });
    const form = await w.token((await w.metric(owner)).id, cleo);
    await receiveTelegramUpdate(message(user, `/start ${codeOf((await startTelegramLinkByForm(form)).url)}`));
    const number = tg.of("sendMessage").filter((c) => c.params.chat_id === user).map((c) => /Your number is (\d{4})\./.exec(String(c.params.text))?.[1]).filter(Boolean).at(-1)!;
    const asked = await opened("deliveries", w.id, await rowsOf("deliveries", { workspace_id: w.id, recipient_id: cleo }) as never[]) as unknown as { body: string }[];
    const token = /\/api\/confirm-telegram\/(\S+)$/.exec(asked[0].body)![1];
    expect(await notices(w.id, ben)).toHaveLength(1);
    expect(await confirmTelegram(token, number)).toMatchObject({ connected: true });
    expect((await notices(w.id, ben)).at(-1)!.subject).toBe("Telegram was disconnected from you in Ziffr");
    // A Contact is no member: no member's notice for them.
    expect(await notices(w.id, cleo)).toEqual([]);
  });

  it("emails them for a Slack account their code connects, and whoever was that Slack user before", async () => {
    const { w, owner, sara, saraMail, ben } = await setup();
    const bot = await connectSlack(w.actor(owner));
    const saraSlack = slack.user(saraMail, { real_name: "Sara Slack" });
    expect(await slackUserFor(bot, sara)).toMatchObject({ userId: saraSlack });
    const link = async (person: string, user: string) => linkSlackByCode(bot, user, `link ${(await startSlackLink(w.actor(person, "member"))).code}`);
    expect(await link(ben, saraSlack)).toBe("Test");
    expect((await notices(w.id, sara)).map((n) => n.subject)).toEqual(["Slack was connected to you in Ziffr", "Slack was disconnected from you in Ziffr"]);
    const [mine] = await notices(w.id, ben);
    expect(mine.body).toContain(`Slack account: “Sara Slack” (member ID ${saraSlack}) in the Slack workspace “Acme”`);
    expect((await chatDisconnectView(linkIn(mine.body)))!.connected).toBe(true);
    await disconnectByLink(linkIn(mine.body));
    expect(await rowsOf("slack_links", { workspace_id: w.id, person_id: ben })).toEqual([]);
    // A user Slack says nothing about is named by the member ID.
    const unknown = slackId("U");
    await link(ben, unknown);
    expect((await notices(w.id, ben)).at(-1)!.body).toContain(`Slack account: member ID ${unknown} in the Slack workspace “Acme”`);
  });

  it("emails a member once when their Slack account is found by address, also when asked at once, and no Contact", async () => {
    const { w, owner, sara, saraMail } = await setup();
    const bot = await connectSlack(w.actor(owner));
    slack.user(saraMail);
    await Promise.all(Array.from({ length: 6 }, () => slackUserFor(bot, sara)));
    await slackUserFor(bot, sara);
    const found = await notices(w.id, sara);
    expect(found).toHaveLength(1);
    // Left to the deliveries job, with the way to a link of one's own and no link that disconnects.
    expect(found[0].mail_state).toBe("queued");
    expect(found[0].body).toMatch(/found your Slack account by your email address[\s\S]*\/connectors\?account=slack$/);
    const email = address("cleo");
    const cleo = await w.contact({ email });
    slack.user(email);
    expect(await slackUserFor(bot, cleo)).toMatchObject({ by: "email" });
    expect(await notices(w.id, cleo)).toEqual([]);
  });

  it("sends a person only a few notices an hour", async () => {
    const { w, sara } = await setup();
    for (let i = 0; i < CONNECTION_NOTICES_PER_HOUR + 3; i++) await tellConnected({ workspaceId: w.id, personId: sara, service: "telegram", account: "“Phone”", by: "code", linkedAt: new Date(), queue: true });
    expect(await notices(w.id, sara)).toHaveLength(CONNECTION_NOTICES_PER_HOUR);
  });
});

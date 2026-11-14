// Connecting Slack and finding people there (spec 0007, tickets #101 and #102), against the database and a fake
// Slack Web API on this machine.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { db } from "./db";
import { openSecret, sealSecret } from "./secrets";
import { disconnectSlack, finishSlackInstall, slackBot, slackConnection, slackConnectionEnded, startSlackInstall } from "./slack-connection";
import { linkSlackByCode, mySlackLink, slackUserFor, startSlackLink } from "./slack-people";
import { DEMO_WORKSPACE_ID } from "./team";
import type { Actor } from "./actor";
import { fakeSlack } from "./test/fake-slack";
import { workspace } from "./test/db-fixtures";

let slack: Awaited<ReturnType<typeof fakeSlack>>;
beforeAll(async () => { slack = await fakeSlack(); });
afterAll(async () => { await slack.stop(); });
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });

const stateOf = (url: string) => new URL(url).searchParams.get("state")!;
async function connect(actor: Actor) {
  slack.newTeam();
  return finishSlackInstall(actor, { code: "code-1234567890", state: stateOf(await startSlackInstall(actor)) });
}
const mail = (who: string) => `${who}-${Math.random().toString(36).slice(2, 8)}@example.test`;

describe("connecting Slack", () => {
  it("connects with Ziffr's own state and keeps the bot token sealed for that workspace only", async () => {
    const w = await workspace(); cleanups.push(w.cleanup);
    const sara = await w.person("owner");
    const url = await startSlackInstall(w.actor(sara));
    expect(new URL(url).pathname).toBe("/oauth/v2/authorize");
    expect(new URL(url).searchParams.get("scope")).toBe("chat:write,im:write,im:history,users:read,users:read.email");
    slack.newTeam();
    expect(await finishSlackInstall(w.actor(sara), { code: "code-1234567890", state: stateOf(url) })).toBe("connected");
    const exchange = slack.of("oauth.v2.access").at(-1)!;
    expect(exchange.params).toMatchObject({ client_id: "111.222", client_secret: "client-secret-for-tests", code: "code-1234567890", redirect_uri: "https://ziffr.example.test/api/slack/oauth" });
    const { data: row } = await db().from("slack_installations").select("*").eq("workspace_id", w.id).single();
    expect(row.bot_token).not.toContain("xoxb-");
    expect(openSecret(row.bot_token, `slack-bot:${w.id}`)).toBe(slack.install.access_token);
    // Copied to another workspace's row, it does not open.
    expect(openSecret(row.bot_token, `slack-bot:${DEMO_WORKSPACE_ID}`)).toBeNull();
    expect(openSecret(sealSecret("x", "a", Buffer.alloc(32, 1)), "a", Buffer.alloc(32, 2))).toBeNull();
    // The page learns the name, never the token.
    const view = await slackConnection(w.actor(sara));
    expect(view).toMatchObject({ enabled: true, canManage: true, team: { name: "Acme" } });
    expect(JSON.stringify(view)).not.toContain("xoxb");
    expect((await slackBot(w.id))?.token).toBe(slack.install.access_token);
  });

  it("refuses a used, made-up, old or other person's state, and Members", async () => {
    const w = await workspace(); cleanups.push(w.cleanup);
    const sara = await w.person("owner");
    const admin = await w.person("admin");
    const ann = await w.person("member");
    await expect(startSlackInstall(w.actor(ann, "member"))).rejects.toThrow();
    const state = stateOf(await startSlackInstall(w.actor(sara)));
    // Another Owner or Admin of the same workspace cannot finish what Sara started.
    expect(await finishSlackInstall(w.actor(admin, "admin"), { code: "code-1234567890", state })).toBe("refused");
    // That attempt used it up.
    expect(await finishSlackInstall(w.actor(sara), { code: "code-1234567890", state })).toBe("refused");
    expect(await finishSlackInstall(w.actor(sara), { code: "code-1234567890", state: "x".repeat(32) })).toBe("refused");
    const old = stateOf(await startSlackInstall(w.actor(sara)));
    await db().from("slack_install_states").update({ created_at: new Date(Date.now() - 11 * 60_000).toISOString() }).eq("state", old);
    expect(await finishSlackInstall(w.actor(sara), { code: "code-1234567890", state: old })).toBe("refused");
    // A state made in another workspace does nothing here.
    const other = await workspace(); cleanups.push(other.cleanup);
    const olga = await other.person("owner");
    const elsewhere = stateOf(await startSlackInstall(other.actor(olga)));
    expect(await finishSlackInstall({ ...w.actor(sara), personId: olga }, { code: "code-1234567890", state: elsewhere })).toBe("refused");
    expect(await slackBot(w.id)).toBeNull();
  });

  it("refuses org installs, a Slack workspace connected to another Ziffr workspace, and the demo", async () => {
    const w = await workspace(); cleanups.push(w.cleanup);
    const sara = await w.person("owner");
    slack.newTeam();
    slack.install = { ...slack.install, is_enterprise_install: true };
    expect(await finishSlackInstall(w.actor(sara), { code: "code-1234567890", state: stateOf(await startSlackInstall(w.actor(sara))) })).toBe("org_install");
    slack.install = { ...slack.install, is_enterprise_install: false };
    expect(await finishSlackInstall(w.actor(sara), { code: "code-1234567890", state: stateOf(await startSlackInstall(w.actor(sara))) })).toBe("connected");
    const other = await workspace(); cleanups.push(other.cleanup);
    const olga = await other.person("owner");
    // Same Slack workspace again (no newTeam): it answers to the first Ziffr workspace, whose token stays good.
    expect(await finishSlackInstall(other.actor(olga), { code: "code-1234567890", state: stateOf(await startSlackInstall(other.actor(olga))) })).toBe("elsewhere");
    expect(slack.of("auth.revoke")).toHaveLength(0);
    expect(await slackBot(w.id)).not.toBeNull();
    await expect(startSlackInstall({ personId: "sara", workspaceId: DEMO_WORKSPACE_ID, role: "owner" })).rejects.toThrow();
  });

  it("opens a token sealed under the previous key and seals it again under the current one (spec 0009)", async () => {
    const w = await workspace(); cleanups.push(w.cleanup);
    const sara = await w.person("owner");
    expect(await connect(w.actor(sara))).toBe("connected");
    const oldKey = Buffer.alloc(32, 9);
    const sealedOld = sealSecret(slack.install.access_token, `slack-bot:${w.id}`, oldKey);
    await db().from("slack_installations").update({ bot_token: sealedOld }).eq("workspace_id", w.id);
    expect(await slackBot(w.id)).toBeNull();
    process.env.ZIFFR_SECRETS_KEY_PREVIOUS = oldKey.toString("base64");
    try {
      expect((await slackBot(w.id))?.token).toBe(slack.install.access_token);
      const { data } = await db().from("slack_installations").select("bot_token").eq("workspace_id", w.id).single();
      expect(data!.bot_token).not.toBe(sealedOld);
      expect(openSecret(data!.bot_token, `slack-bot:${w.id}`)).toBe(slack.install.access_token);
    } finally {
      delete process.env.ZIFFR_SECRETS_KEY_PREVIOUS;
    }
    // Sealed again, it opens without the previous key.
    expect((await slackBot(w.id))?.token).toBe(slack.install.access_token);
  });

  it("disconnects in Ziffr, or when Slack says the app is gone", async () => {
    const w = await workspace(); cleanups.push(w.cleanup);
    const sara = await w.person("owner");
    expect(await connect(w.actor(sara))).toBe("connected");
    await expect(disconnectSlack(w.actor(await w.person("member"), "member"))).rejects.toThrow();
    await disconnectSlack(w.actor(sara));
    expect(slack.of("auth.revoke").at(-1)?.token).toBe(slack.install.access_token);
    expect(await slackBot(w.id)).toBeNull();
    expect((await slackConnection(w.actor(sara))).team).toBeNull();
    // The Audit Log has both, with the Slack workspace's name and never its token.
    const { data: events } = await db().from("audit_events").select("kind, details").eq("workspace_id", w.id).order("id");
    expect(events?.map((e) => e.kind)).toEqual(["slack.connected", "slack.disconnected"]);
    expect(events?.[0].details).toEqual({ slack_team: "Acme" });
    expect(JSON.stringify(events)).not.toContain("xoxb");
    expect(await connect(w.actor(sara))).toBe("connected");
    await slackConnectionEnded(slack.install.team.id);
    expect(await slackBot(w.id)).toBeNull();
  });
});

describe("finding people on Slack", () => {
  it("finds a member by their proven address and a Contact by the address kept for them, never by handle", async () => {
    const w = await workspace(); cleanups.push(w.cleanup);
    const sara = await w.person("owner");
    await connect(w.actor(sara));
    const bot = (await slackBot(w.id))!;
    const annMail = mail("ann");
    const ann = await w.person("member", { email: annMail, slack_handle: "@ann" });
    const annSlack = slack.user(annMail.toUpperCase());
    expect(await slackUserFor(bot, ann)).toEqual({ userId: annSlack, by: "email" });
    expect(await mySlackLink(w.actor(ann, "member"))).toBe("email");
    // Kept: the second time Slack is not asked.
    const asked = slack.of("users.lookupByEmail").length;
    expect(await slackUserFor(bot, ann)).toEqual({ userId: annSlack, by: "email" });
    expect(slack.of("users.lookupByEmail")).toHaveLength(asked);
    const kimMail = mail("kim");
    const kim = await w.contact({ email: kimMail, slack_handle: "@kim" });
    const kimSlack = slack.user(kimMail);
    expect(await slackUserFor(bot, kim)).toEqual({ userId: kimSlack, by: "email" });
    // A Contact known only by a handle is nobody on Slack.
    const lee = await w.contact({ slack_handle: "@lee" });
    slack.user("lee@example.test", { id: "ULEE" });
    expect((await slackUserFor(bot, lee)).userId).toBeNull();
  });

  it("finds nobody deleted, a bot, of another Slack workspace, or outside the workspace", async () => {
    const w = await workspace(); cleanups.push(w.cleanup);
    const sara = await w.person("owner");
    await connect(w.actor(sara));
    const bot = (await slackBot(w.id))!;
    const gone = mail("gone"); slack.user(gone, { deleted: true });
    const robo = mail("robo"); slack.user(robo, { is_bot: true });
    const guest = mail("guest"); slack.user(guest, { team_id: "TOTHER" });
    for (const email of [gone, robo, guest, mail("nobody")]) expect((await slackUserFor(bot, await w.person("member", { email }))).userId).toBeNull();
    const other = await workspace(); cleanups.push(other.cleanup);
    const olgaMail = mail("olga");
    const olga = await other.person("owner", { email: olgaMail });
    slack.user(olgaMail);
    expect((await slackUserFor(bot, olga)).userId).toBeNull();
  });

  it("looks again when the address changes, and one Slack user is one person", async () => {
    const w = await workspace(); cleanups.push(w.cleanup);
    const sara = await w.person("owner");
    await connect(w.actor(sara));
    const bot = (await slackBot(w.id))!;
    const first = mail("ann");
    const ann = await w.person("member", { email: first });
    const annSlack = slack.user(first);
    expect((await slackUserFor(bot, ann)).userId).toBe(annSlack);
    const second = mail("ann2");
    await db().from("profiles").update({ email: second }).eq("id", ann);
    expect((await slackUserFor(bot, ann)).userId).toBeNull();
    // A Contact with Ann's old address cannot take her Slack user... once Ann is matched again by a new address.
    const annSlack2 = slack.user(second);
    expect((await slackUserFor(bot, ann)).userId).toBe(annSlack2);
    const twin = await w.contact({ email: second });
    expect(await slackUserFor(bot, twin)).toEqual({ userId: null, why: "Someone else here is that Slack user." });
    // A Contact found first by a member's address gives way to the member, whose address is proven.
    const benMail = mail("ben");
    const benSlack = slack.user(benMail);
    const impostor = await w.contact({ email: benMail });
    expect((await slackUserFor(bot, impostor)).userId).toBe(benSlack);
    const ben = await w.person("member", { email: benMail });
    expect(await slackUserFor(bot, ben)).toEqual({ userId: benSlack, by: "email" });
    expect((await slackUserFor(bot, impostor)).userId).toBeNull();
  });

  it("links a member by a code they send the bot, once, within ten minutes, in their own workspace only", async () => {
    const w = await workspace(); cleanups.push(w.cleanup);
    const sara = await w.person("owner");
    await connect(w.actor(sara));
    const bot = (await slackBot(w.id))!;
    const ann = await w.person("member", { email: mail("ann") });
    const { code } = await startSlackLink(w.actor(ann, "member"));
    expect(code).toMatch(/^ZIF-[A-Z2-7]{16}$/);
    // Another Ziffr workspace's bot cannot use it.
    const other = await workspace(); cleanups.push(other.cleanup);
    const olga = await other.person("owner");
    await connect(other.actor(olga));
    expect(await linkSlackByCode((await slackBot(other.id))!, "UANNSLACK", `link ${code}`)).toBeNull();
    expect(await linkSlackByCode(bot, "UANNSLACK", `link ${code.toLowerCase()}`)).toBe("Test");
    expect(await slackUserFor(bot, ann)).toEqual({ userId: "UANNSLACK", by: "code" });
    expect(await linkSlackByCode(bot, "UMALLORY", `link ${code}`)).toBeNull();
    const late = (await startSlackLink(w.actor(ann, "member"))).code;
    await db().from("slack_link_codes").update({ created_at: new Date(Date.now() - 11 * 60_000).toISOString() }).eq("code", late);
    expect(await linkSlackByCode(bot, "UMALLORY", late)).toBeNull();
    expect(await slackUserFor(bot, ann)).toEqual({ userId: "UANNSLACK", by: "code" });
    await expect(startSlackLink({ personId: "sara", workspaceId: DEMO_WORKSPACE_ID, role: "owner" })).rejects.toThrow();
  });
});

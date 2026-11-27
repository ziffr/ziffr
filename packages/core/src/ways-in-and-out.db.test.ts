// Ways in and out against the database (spec 0052, ticket 8; GLOSSARY: Setup Guide, Delivery Preference, Connector): the
// person's own Delivery Preference is written only with ways that really work here, never another person's or the team's,
// a Member's step carries no Workspace-level action, a Guest, an Access Key and the demo get nothing, and a saved
// preference is what ticks the step (from state, not from a flag).
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { Forbidden, type Actor } from "./actor";
import { db } from "./db";
import { DemoReadOnly } from "./demo";
import { setupGuide } from "./setup-guide";
import { DEMO_WORKSPACE_ID } from "./team";
import { workspace } from "./test/db-fixtures";
import { CONNECT_FIRST, waysInAndOut, setMyPromptWays } from "./ways-in-and-out";
import { setTelegramEnabled } from "./telegram-connection";
import { fakeTelegram } from "./test/fake-telegram";

const MAIL = { ZIFFR_SMTP_URL: process.env.TEST_SMTP_URL ?? "smtp://127.0.0.1:55425", ZIFFR_MAIL_FROM: "Ziffr <ziffr@example.test>", ZIFFR_SITE_URL: "https://ziffr.example.test" };
const made: Awaited<ReturnType<typeof workspace>>[] = [];
afterEach(async () => {
  for (const k of Object.keys(MAIL)) delete process.env[k];
  for (const w of made.splice(0)) await w.cleanup();
});
async function fresh() {
  const w = await workspace("Ways Co");
  made.push(w);
  const owner = await w.person("owner", { email: `o-${randomUUID().slice(0, 8)}@example.test` });
  const member = await w.person("member", { email: `m-${randomUUID().slice(0, 8)}@example.test` });
  const guest = await w.person("guest");
  return { w, owner: w.actor(owner, "owner"), member: w.actor(member, "member"), guest: w.actor(guest, "guest") };
}
const prefs = async (workspaceId: string, userId: string | null) => {
  const q = db().from("delivery_preferences").select("connector, position").eq("workspace_id", workspaceId).eq("kind", "reminder").order("position");
  return ((userId === null ? await q.is("user_id", null) : await q.eq("user_id", userId)).data ?? []).map((p) => p.connector);
};

describe("the person's own Delivery Preference", () => {
  it("is saved in order for a Member too, and touches nobody else's and not the team's", async () => {
    Object.assign(process.env, MAIL);
    const { w, owner, member } = await fresh();
    await setMyPromptWays(owner, ["email"]);
    await setMyPromptWays(member, ["email"]);
    expect(await prefs(w.id, member.personId)).toEqual(["email"]);
    // A Member's save does not replace the Owner's, and an empty list goes back to the team's default for that person only.
    await setMyPromptWays(member, []);
    expect(await prefs(w.id, member.personId)).toEqual([]);
    expect(await prefs(w.id, owner.personId)).toEqual(["email"]);
    expect(await prefs(w.id, null)).toEqual([]);
  });

  it("takes only ways that really work here, each once, up to three", async () => {
    Object.assign(process.env, MAIL);
    const { w, owner } = await fresh();
    // No Slack app and no Telegram bot on this Installation: those would only ever be kept in the Outbox.
    await expect(setMyPromptWays(owner, ["slack"])).rejects.toThrow("Only a way that works on this Ziffr can be chosen.");
    await expect(setMyPromptWays(owner, ["email", "telegram"])).rejects.toThrow("Only a way that works");
    await expect(setMyPromptWays(owner, ["email", "email"])).rejects.toBeInstanceOf(Forbidden);
    await expect(setMyPromptWays(owner, ["whatsapp"])).rejects.toBeInstanceOf(Forbidden);
    await expect(setMyPromptWays(owner, ["email", "slack", "telegram", "email"])).rejects.toBeInstanceOf(Forbidden);
    await expect(setMyPromptWays(owner, "email")).rejects.toBeInstanceOf(Forbidden);
    await expect(setMyPromptWays(owner, [{ toString: () => "email" }, "../x"])).rejects.toBeInstanceOf(Forbidden);
    expect(await prefs(w.id, owner.personId)).toEqual([]);
  });

  it("is refused for email on an Installation without a mail server", async () => {
    const { owner } = await fresh();
    await expect(setMyPromptWays(owner, ["email"])).rejects.toThrow("Only a way that works");
  });

  it("is refused for a Guest, an Access Key and the demo", async () => {
    Object.assign(process.env, MAIL);
    const { guest, owner } = await fresh();
    await expect(setMyPromptWays(guest, ["email"])).rejects.toBeInstanceOf(Forbidden);
    await expect(setMyPromptWays({ ...owner, key: { id: "k", scopes: ["*"] } } as unknown as Actor, ["email"])).rejects.toBeInstanceOf(Forbidden);
    await expect(setMyPromptWays({ ...owner, workspaceId: DEMO_WORKSPACE_ID }, ["email"])).rejects.toBeInstanceOf(DemoReadOnly);
    await expect(waysInAndOut(guest)).rejects.toBeInstanceOf(Forbidden);
    await expect(waysInAndOut({ ...owner, workspaceId: DEMO_WORKSPACE_ID })).rejects.toBeInstanceOf(DemoReadOnly);
  });

  it("ticks the step from the saved preference, for the person who saved it only", async () => {
    Object.assign(process.env, MAIL);
    const { owner, member } = await fresh();
    const ticked = async (a: Actor) => (await setupGuide(a))!.steps.find((s) => s.id === "ways")!.ticked;
    expect(await ticked(member)).toBe(false);
    await setMyPromptWays(member, ["email"]);
    expect(await ticked(member)).toBe(true);
    // An Owner has no Setup Guide at all.
    expect(await setupGuide(owner)).toBeNull();
  });
});

describe("what each person sees of the step", () => {
  it("gives an Owner the Workspace's cards and the links for more ways, with their own preference", async () => {
    Object.assign(process.env, MAIL);
    const { owner } = await fresh();
    await setMyPromptWays(owner, ["email"]);
    const s = await waysInAndOut(owner);
    expect(s.manages).toBe(true);
    expect(s.cards.map((c) => c.way)).toEqual(["web-form", "email", "slack", "telegram", "paste"]);
    expect(s.cards.find((c) => c.way === "email")).toMatchObject({ status: "ready", canTest: true });
    expect(s.askedBy).toEqual(["email"]);
    expect(s.askable).toEqual(["email"]);
    expect(s.more.map((m) => m.href)).toEqual(["/settings/keys", "/settings/assistants", "/settings/feeds", "/connectors/send", "/settings/webhooks"]);
  });

  it("gives a Member only their own ways: no Workspace-level action, no Workspace links, nothing of the Owner's choice", async () => {
    Object.assign(process.env, MAIL);
    const { owner, member } = await fresh();
    await setMyPromptWays(owner, ["email"]);
    const s = await waysInAndOut(member);
    expect(s.manages).toBe(false);
    expect(s.askedBy).toEqual([]);
    for (const c of s.cards) expect(["add-slack", "turn-on-telegram"]).not.toContain(c.action);
    expect(s.more.map((m) => m.href)).toEqual(["/settings/keys"]);
  });

  it("says in words what this Ziffr lacks, and carries no address, token or other person's details", async () => {
    const { owner } = await fresh();
    const s = await waysInAndOut(owner);
    expect(s.cards.find((c) => c.way === "email")).toMatchObject({ status: "missing-here", canTest: false });
    expect(s.cards.find((c) => c.way === "email")!.line).toContain("This Ziffr has no mail server yet.");
    expect(JSON.stringify(s)).not.toMatch(/@example\.test|xoxb-|bot_token/);
  });
});

describe("a way the person has not linked", () => {
  let tg: Awaited<ReturnType<typeof fakeTelegram>>;
  beforeAll(async () => { tg = await fakeTelegram(); });
  afterAll(async () => { await tg.stop(); });

  it("is refused in words and shown locked until they link it, then it can be chosen", async () => {
    Object.assign(process.env, MAIL);
    process.env.ZIFFR_SITE_URL = "https://ziffr.example.test";
    const { w, owner, member } = await fresh();
    await setTelegramEnabled(owner, true);
    // Telegram works in this Workspace, but this Member has not connected theirs.
    await expect(setMyPromptWays(member, ["telegram"])).rejects.toThrow(CONNECT_FIRST.telegram);
    await expect(setMyPromptWays(member, ["email", "telegram"])).rejects.toThrow(CONNECT_FIRST.telegram);
    expect(await prefs(w.id, member.personId)).toEqual([]);
    const before = await waysInAndOut(member);
    expect(before.askable).toEqual(["email"]);
    expect(before.locked).toEqual(["telegram"]);
    // Linking (the chat the one-time link would record) makes it available.
    await db().from("telegram_links").insert({ workspace_id: w.id, person_id: member.personId, telegram_user_id: Date.now(), chat_id: Date.now() });
    await setMyPromptWays(member, ["telegram", "email"]);
    expect(await prefs(w.id, member.personId)).toEqual(["telegram", "email"]);
    const after = await waysInAndOut(member);
    expect(after.askable).toEqual(["email", "telegram"]);
    expect(after.locked).toEqual([]);
  });
});

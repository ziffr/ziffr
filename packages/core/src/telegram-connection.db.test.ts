// Telegram per workspace (spec 0016, ticket #24), against the database and a fake Bot API on this machine: the bot
// is known by getMe, Owners and Admins turn Telegram on (which registers the webhook) and off, nobody else can, and
// never in the demo or without a bot.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { db } from "./db";
import { DEMO_WORKSPACE_ID } from "./team";
import { telegramWebhookSecret } from "./telegram-api";
import { forgetTelegramBot, setTelegramEnabled, telegramConnection, telegramOnIn } from "./telegram-connection";
import { fakeTelegram, TELEGRAM_SETTINGS } from "./test/fake-telegram";
import { workspace } from "./test/db-fixtures";

let tg: Awaited<ReturnType<typeof fakeTelegram>>;
beforeAll(async () => { tg = await fakeTelegram(); });
afterAll(async () => { await tg.stop(); });
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); forgetTelegramBot(); });

describe("Telegram per workspace", () => {
  it("is off until an Owner turns it on, which registers the webhook with its secret", async () => {
    const w = await workspace(); cleanups.push(w.cleanup);
    const sara = await w.person("owner");
    expect(await telegramConnection(w.actor(sara))).toEqual({ configured: true, bot: { username: "ziffr_test_bot" }, enabled: false, canManage: true, polling: false });
    expect(await telegramOnIn(w.id)).toBe(false);

    await setTelegramEnabled(w.actor(sara), true);
    expect(await telegramOnIn(w.id)).toBe(true);
    const hook = tg.of("setWebhook").at(-1)!;
    expect(hook.params).toEqual({
      url: "https://ziffr.example.test/api/telegram/updates",
      secret_token: telegramWebhookSecret(),
      allowed_updates: ["message", "callback_query", "my_chat_member"],
      max_connections: 10,
    });
    expect(String(hook.params.secret_token)).toMatch(/^[0-9a-f]{64}$/);

    await setTelegramEnabled(w.actor(sara), false);
    expect(await telegramOnIn(w.id)).toBe(false);
    const { data: events } = await db().from("audit_events").select("kind").eq("workspace_id", w.id).order("id");
    expect(events!.map((e) => e.kind)).toEqual(["telegram.turned_on", "telegram.turned_off"]);
  });

  it("lets an Admin switch it, but not a Member or a Guest, and never in the demo", async () => {
    const w = await workspace(); cleanups.push(w.cleanup);
    const admin = await w.person("admin");
    const member = await w.person("member");
    const guest = await w.person("guest");
    await setTelegramEnabled(w.actor(admin, "admin"), true);
    expect(await telegramOnIn(w.id)).toBe(true);
    expect((await telegramConnection(w.actor(member, "member"))).canManage).toBe(false);
    await expect(setTelegramEnabled(w.actor(member, "member"), false)).rejects.toThrow();
    await expect(setTelegramEnabled(w.actor(guest, "guest"), false)).rejects.toThrow();
    expect(await telegramOnIn(w.id)).toBe(true);

    const demoOwner = { personId: "demo-owner", workspaceId: DEMO_WORKSPACE_ID, role: "owner" as const };
    await expect(setTelegramEnabled(demoOwner, true)).rejects.toThrow(/demo/);
    expect(await telegramOnIn(DEMO_WORKSPACE_ID)).toBe(false);
    expect((await telegramConnection(demoOwner)).canManage).toBe(false);
  });

  it("stays off when Telegram cannot be reached or refuses the token", async () => {
    const w = await workspace(); cleanups.push(w.cleanup);
    const sara = await w.person("owner");
    tg.fail("setWebhook", { code: 500 });
    await expect(setTelegramEnabled(w.actor(sara), true)).rejects.toThrow(/could not be told/);
    expect(await telegramOnIn(w.id)).toBe(false);

    forgetTelegramBot();
    tg.fail("getMe", { code: 401 });
    expect((await telegramConnection(w.actor(sara))).bot).toBeNull();
    forgetTelegramBot();
    tg.fail("getMe", { code: 401 });
    await expect(setTelegramEnabled(w.actor(sara), true)).rejects.toThrow(/does not accept/);
    expect(await telegramOnIn(w.id)).toBe(false);
  });

  it("needs https for a webhook, but not with polling", async () => {
    const w = await workspace(); cleanups.push(w.cleanup);
    const sara = await w.person("owner");
    process.env.ZIFFR_SITE_URL = "http://localhost:3000";
    await expect(setTelegramEnabled(w.actor(sara), true)).rejects.toThrow(/https/);
    process.env.ZIFFR_TELEGRAM_POLLING = "1";
    const before = tg.of("setWebhook").length;
    await setTelegramEnabled(w.actor(sara), true);
    expect(tg.of("setWebhook").length).toBe(before);
    expect((await telegramConnection(w.actor(sara))).polling).toBe(true);
    delete process.env.ZIFFR_TELEGRAM_POLLING;
    process.env.ZIFFR_SITE_URL = TELEGRAM_SETTINGS.ZIFFR_SITE_URL;
  });

  it("is not there at all without a bot token", async () => {
    const w = await workspace(); cleanups.push(w.cleanup);
    const sara = await w.person("owner");
    const token = process.env.ZIFFR_TELEGRAM_BOT_TOKEN;
    delete process.env.ZIFFR_TELEGRAM_BOT_TOKEN;
    try {
      expect(await telegramConnection(w.actor(sara))).toEqual({ configured: false, bot: null, enabled: false, canManage: false, polling: false });
      await expect(setTelegramEnabled(w.actor(sara), true)).rejects.toThrow(/not set up/);
      expect(await telegramOnIn(w.id)).toBe(false);
    } finally {
      process.env.ZIFFR_TELEGRAM_BOT_TOKEN = token;
    }
  });

  it("never sends the bot token anywhere but the request path, and the fake saw only the right one", () => {
    expect(tg.calls.length).toBeGreaterThan(0);
    expect(tg.calls.every((c) => c.tokenOk)).toBe(true);
    expect(JSON.stringify(tg.calls.map((c) => c.params))).not.toContain(TELEGRAM_SETTINGS.ZIFFR_TELEGRAM_BOT_TOKEN);
  });
});

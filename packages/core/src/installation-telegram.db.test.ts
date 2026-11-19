// Telegram on the Installation Settings page against the real database and a fake Telegram (spec 0025, ticket #199):
// only an Installation Admin sets the bot token; it is checked with getMe before it is stored, sealed, and the webhook
// is registered with the secret derived from it; replacing or removing it lets go of the old bot's webhook; the token
// in effect is what the webhook, the queue and "What works here" then use; the environment still wins. No real token.
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { claimInstallation, prepareSetupCode } from "./installation-admins";
import { checkTelegram, installationSettingsView, saveInstallationSettings } from "./installation-settings";
import { forgetStoredSettings, settingSources, settingsInEffect } from "./settings-in-effect";
import { telegramOn, telegramWebhookSecret } from "./telegram-api";
import { telegramSecretOk } from "./telegram-inbound";
import { fakeTelegram, OTHER_BOT_TOKEN, TELEGRAM_SETTINGS } from "./test/fake-telegram";
import { workspace } from "./test/db-fixtures";
import { whatWorksHere } from "./what-works-here";

const TOKEN = TELEGRAM_SETTINGS.ZIFFR_TELEGRAM_BOT_TOKEN;
let savedAdmins: Record<string, unknown>[] = [];
let savedSettings: Record<string, unknown>[] = [];
const cleanups: (() => Promise<void>)[] = [];
let tg: Awaited<ReturnType<typeof fakeTelegram>>;
const savedPolling = process.env.ZIFFR_TELEGRAM_POLLING;

beforeAll(async () => {
  savedAdmins = (await db().from("installation_admins").select("*")).data ?? [];
  savedSettings = (await db().from("installation_settings").select("*")).data ?? [];
});
afterAll(async () => {
  await db().from("installation_admins").delete().neq("person_id", "");
  if (savedAdmins.length) await db().from("installation_admins").insert(savedAdmins);
  await db().from("installation_settings").delete().neq("name", "");
  if (savedSettings.length) await db().from("installation_settings").insert(savedSettings);
  forgetStoredSettings();
});
beforeEach(async () => {
  await db().from("installation_admins").delete().neq("person_id", "");
  await db().from("installation_settings").delete().neq("name", "");
  tg = await fakeTelegram();
  // The fake knows the token; the page, not the environment, holds it in these tests.
  delete process.env.ZIFFR_TELEGRAM_BOT_TOKEN;
  delete process.env.ZIFFR_TELEGRAM_POLLING;
  delete process.env.ZIFFR_INSTALLATION_ADMINS;
  forgetStoredSettings();
});
afterEach(async () => {
  await tg.stop();
  if (savedPolling === undefined) delete process.env.ZIFFR_TELEGRAM_POLLING; else process.env.ZIFFR_TELEGRAM_POLLING = savedPolling;
  for (const c of cleanups.splice(0)) await c();
  forgetStoredSettings();
});

/** The Installation claimed by a new signed-in person, who is then its Installation Admin. */
async function admin() {
  let code = "";
  await prepareSetupCode({ fresh: true }, (c) => { code = c; });
  const id = `t-${randomUUID()}`;
  const { data } = await db().auth.admin.createUser({ email: `tg-${id.slice(2, 10)}@example.test`, email_confirm: true });
  const { error } = await db().from("profiles").insert({ id, name: `Admin ${id.slice(2, 6)}`, role: "", color: "#000", email: `tg-${id.slice(2, 10)}@example.test`, auth_user_id: data.user!.id });
  if (error) throw error;
  cleanups.push(async () => {
    await db().from("installation_admins").delete().eq("person_id", id);
    await db().from("profiles").delete().eq("id", id);
    await db().auth.admin.deleteUser(data.user!.id).catch(() => {});
  });
  await claimInstallation({ personId: id }, code);
  return { personId: id };
}

const telegramOf = async (a: { personId: string }) => (await installationSettingsView(a)).sections.find((s) => s.id === "telegram")!;

describe("setting the Telegram bot on the page", () => {
  it("only an Installation Admin, never an Owner of a Workspace", async () => {
    await admin();
    const w = await workspace();
    cleanups.push(w.cleanup);
    const owner = w.actor(await w.person("owner"));
    await expect(saveInstallationSettings(owner, "telegram", { ZIFFR_TELEGRAM_BOT_TOKEN: TOKEN })).rejects.toThrow(/Only Installation Admins/);
    await expect(checkTelegram(owner)).rejects.toThrow(/Only Installation Admins/);
    expect(tg.calls).toEqual([]);
  });

  it("checks the token with Telegram before storing it, and stores nothing Telegram refuses", async () => {
    const a = await admin();
    await expect(saveInstallationSettings(a, "telegram", { ZIFFR_TELEGRAM_BOT_TOKEN: "not a token" })).rejects.toThrow(/looks like/);
    tg.fail("getMe", { code: 401 });
    await expect(saveInstallationSettings(a, "telegram", { ZIFFR_TELEGRAM_BOT_TOKEN: TOKEN })).rejects.toThrow(/does not accept this token/);
    tg.fail("getMe", { code: 502 });
    await expect(saveInstallationSettings(a, "telegram", { ZIFFR_TELEGRAM_BOT_TOKEN: TOKEN })).rejects.toThrow(/could not be reached/);
    expect((await db().from("installation_settings").select("name")).data).toEqual([]);
    expect(tg.of("setWebhook")).toEqual([]);
  });

  it("stores it sealed, names the bot, registers the webhook with the derived secret, and turns Telegram on", async () => {
    const a = await admin();
    expect(await telegramOn()).toBe(false);
    const out = await saveInstallationSettings(a, "telegram", { ZIFFR_TELEGRAM_BOT_TOKEN: TOKEN });
    expect(out).toEqual({ notice: "Saved: @ziffr_test_bot. Telegram now sends answers to this Ziffr.", warning: null });
    const { data: row } = await db().from("installation_settings").select("value, sealed").eq("name", "ZIFFR_TELEGRAM_BOT_TOKEN").single();
    expect(row!.sealed).toBe(true);
    expect(row!.value).not.toContain(TOKEN.split(":")[1]);
    const secret = telegramWebhookSecret(await settingsInEffect());
    expect(secret).toMatch(/^[0-9a-f]{64}$/);
    const hook = tg.of("setWebhook").at(-1)!;
    expect(hook).toMatchObject({ tokenOk: true, params: { url: "https://ziffr.example.test/api/telegram/updates", secret_token: secret } });
    expect(await telegramOn()).toBe(true);
    expect(await telegramSecretOk(secret)).toBe(true);
    expect(await telegramSecretOk("0".repeat(64))).toBe(false);
    const section = await telegramOf(a);
    expect(section).toMatchObject({ working: true, detail: "Bot @ziffr_test_bot" });
    expect(JSON.stringify(await installationSettingsView(a))).not.toContain(TOKEN.split(":")[1]);
    // Workspaces now see a bot they can turn on, where before it was simulated.
    const w = await workspace();
    cleanups.push(w.cleanup);
    const owner = await w.person("owner");
    expect((await whatWorksHere(w.actor(owner))).find((x) => x.way === "telegram")!.state).toBe("off");
    const { data: events } = await db().from("installation_audit_events").select("kind, subject").eq("actor_id", a.personId);
    expect(events).toEqual(expect.arrayContaining([{ kind: "setting.set", subject: "ZIFFR_TELEGRAM_BOT_TOKEN" }]));
    expect(JSON.stringify(events)).not.toContain(TOKEN);
  });

  it("saves a working token but says so when Telegram is not told where to send answers", async () => {
    const a = await admin();
    tg.fail("setWebhook", { code: 400 });
    const out = await saveInstallationSettings(a, "telegram", { ZIFFR_TELEGRAM_BOT_TOKEN: TOKEN });
    expect(out.notice).toBe("Saved: @ziffr_test_bot.");
    expect(out.warning).toMatch(/not told where to send answers/);
    expect(await telegramOn()).toBe(true);
    // Without https the webhook cannot work; polling needs none.
    const site = process.env.ZIFFR_SITE_URL;
    process.env.ZIFFR_SITE_URL = "http://localhost:3001";
    try {
      expect((await saveInstallationSettings(a, "telegram", { ZIFFR_TELEGRAM_BOT_TOKEN: TOKEN })).warning).toMatch(/https/);
      // The section does not say Working while answers cannot arrive, and says why (#256).
      expect(await telegramOf(a)).toMatchObject({ working: false, detail: expect.stringMatching(/^Bot @ziffr_test_bot answers, but answers cannot arrive: .*https/) });
      process.env.ZIFFR_TELEGRAM_POLLING = "1";
      const before = tg.of("setWebhook").length;
      expect((await saveInstallationSettings(a, "telegram", { ZIFFR_TELEGRAM_BOT_TOKEN: TOKEN })).notice).toMatch(/polling/);
      expect(tg.of("setWebhook")).toHaveLength(before);
      expect(await telegramOf(a)).toMatchObject({ working: true, detail: "Bot @ziffr_test_bot" });
    } finally {
      if (site === undefined) delete process.env.ZIFFR_SITE_URL; else process.env.ZIFFR_SITE_URL = site;
    }
  });

  it("says Not working when Telegram lost the webhook, until Check Telegram tells it again", async () => {
    const a = await admin();
    await saveInstallationSettings(a, "telegram", { ZIFFR_TELEGRAM_BOT_TOKEN: TOKEN });
    expect((await telegramOf(a)).working).toBe(true);
    delete tg.webhook["7000000001"];
    expect(await telegramOf(a)).toMatchObject({ working: false, detail: "Bot @ziffr_test_bot answers, but Telegram does not send answers to this Ziffr. Choose Check Telegram to tell it." });
    expect((await checkTelegram(a)).ok).toBe(true);
    expect(await telegramOf(a)).toMatchObject({ working: true, detail: "Bot @ziffr_test_bot" });
  });

  it("lets go of the old bot's webhook when the token is replaced or removed", async () => {
    const a = await admin();
    await saveInstallationSettings(a, "telegram", { ZIFFR_TELEGRAM_BOT_TOKEN: TOKEN });
    expect(tg.webhook["7000000001"]).toBe("https://ziffr.example.test/api/telegram/updates");
    const out = await saveInstallationSettings(a, "telegram", { ZIFFR_TELEGRAM_BOT_TOKEN: OTHER_BOT_TOKEN });
    expect(out.notice).toMatch(/@ziffr_other_bot/);
    expect(tg.webhook).toEqual({ "7000000002": "https://ziffr.example.test/api/telegram/updates" });
    const removed = await saveInstallationSettings(a, "telegram", { ZIFFR_TELEGRAM_BOT_TOKEN: null });
    expect(removed.notice).toMatch(/Telegram removed/);
    expect(tg.webhook).toEqual({});
    expect(await telegramOn()).toBe(false);
    expect((await telegramOf(a)).working).toBe(false);
  });

  it("goes back to the default bot when the page's is removed, and tells Telegram", async () => {
    const a = await admin();
    process.env.ZIFFR_TELEGRAM_BOT_TOKEN_DEFAULT = OTHER_BOT_TOKEN;
    try {
      await saveInstallationSettings(a, "telegram", { ZIFFR_TELEGRAM_BOT_TOKEN: TOKEN });
      expect(tg.webhook["7000000001"]).toBeDefined();
      const out = await saveInstallationSettings(a, "telegram", { ZIFFR_TELEGRAM_BOT_TOKEN: null });
      expect(out.notice).toMatch(/default bot/);
      expect(tg.webhook).toEqual({ "7000000002": "https://ziffr.example.test/api/telegram/updates" });
      expect(await telegramOn()).toBe(true);
    } finally {
      delete process.env.ZIFFR_TELEGRAM_BOT_TOKEN_DEFAULT;
    }
  });

    it("leaves a token set on the server alone", async () => {
    const a = await admin();
    process.env.ZIFFR_TELEGRAM_BOT_TOKEN = TOKEN;
    expect((await settingSources()).ZIFFR_TELEGRAM_BOT_TOKEN).toBe("server");
    await expect(saveInstallationSettings(a, "telegram", { ZIFFR_TELEGRAM_BOT_TOKEN: OTHER_BOT_TOKEN })).rejects.toThrow(/set on the server/);
    await expect(saveInstallationSettings(a, "telegram", { ZIFFR_TELEGRAM_BOT_TOKEN: null })).rejects.toThrow(/set on the server/);
    expect((await telegramOf(a)).settings[0]).toMatchObject({ source: "server", value: null, hint: null });
    expect(tg.of("deleteWebhook")).toEqual([]);
  });
});

describe("Check Telegram", () => {
  it("names the bot, registers the webhook again, and passes on Telegram's last delivery error", async () => {
    const a = await admin();
    expect(await checkTelegram(a)).toEqual({ ok: false, message: "No bot token is set." });
    await saveInstallationSettings(a, "telegram", { ZIFFR_TELEGRAM_BOT_TOKEN: TOKEN });
    delete tg.webhook["7000000001"];
    expect(await checkTelegram(a)).toEqual({ ok: true, message: "@ziffr_test_bot answers, and Telegram sends answers to this Ziffr." });
    expect(tg.webhook["7000000001"]).toBe("https://ziffr.example.test/api/telegram/updates");
    tg.reportError("Wrong response from the webhook: 404 Not Found");
    const r = await checkTelegram(a);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/last error: Wrong response from the webhook: 404 Not Found/);
    tg.fail("getMe", { code: 401 });
    expect((await checkTelegram(a)).ok).toBe(false);
  });
});

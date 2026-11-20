// Installation Settings on the page (spec 0025, ticket #197; GLOSSARY: Installation Settings, Installation Admin):
// what an Installation Admin sees of each setting and how they change one. Only Installation Admins, never with a
// key. A secret value is sealed before it is stored and never comes back: the page learns that it is set and at
// most its last four characters. A value set on the server wins and cannot be changed here. Every change is in the
// Installation's audit by the setting's name, never its value.
import { assertInstallationAdmin, recordInstallationEvent, type InstallationActor } from "./installation-admins";
import { INSTALLATION_SETTINGS, SETTINGS_SECTIONS, settingNamed, type SettingDefinition, type SettingsSectionId } from "./installation-catalogue";
import { db } from "./db";
import { trialSettings } from "./trials";
import { headerSafe, inboundEnabled, isAddress, mailEnabled, smtpOptions, smtpTransportWith, type MailTransport } from "./mail";
import { checkedMailHost, MailHostError, privateMailHost, privateMailHostsAllowed } from "./mail-hosts";
import { secretsKey, sealSecret } from "./secrets";
import { botUsername, forgetTelegramBot, registerTelegramWebhook, TELEGRAM_NEEDS_HTTPS, telegramBot, telegramWebhookUrl } from "./telegram-connection";
import { callTelegram, TELEGRAM_TOKEN, TelegramError, telegramEnabled, telegramPolling, telegramToken } from "./telegram-api";
import { slackEnabled } from "./slack-api";
import { slackCreateAppLink, slackEventsCheckedAt } from "./slack-setup";
import { defaultLimitFrom, limitLabel, limitNumber, syncDefaultLimit } from "./workspace-limits";
import { forgetStoredSettings, settingContext, settingSources, settingsInEffect, storedSettings, type SettingSource } from "./settings-in-effect";

/** One setting as the page shows it. `value` only for a setting that is not secret; `hint` (the last four
 * characters) only for a secret saved on the page. Only what the page needs goes to the browser. */
export type SettingView = SettingDefinition & { source: SettingSource; value: string | null; hint: string | null; unreadable: boolean };

/** One section with its settings and whether it works with the settings in effect. */
export type SectionView = { id: SettingsSectionId; title: string; purpose: string; ready: boolean; working: boolean; detail: string | null; settings: SettingView[] };

/** What a save tells the page: a line to show, and a problem that did not stop the save (Telegram not told where to
 * send answers, an old bot not let go). */
export type SaveOutcome = { notice: string | null; warning: string | null };

/** What the Slack section shows besides its fields: the link that opens Slack's "Create app" with the manifest for
 * this Ziffr (null without an https ZIFFR_SITE_URL), and when Slack last reached the events address signed with the
 * signing secret in effect. */
export type SlackSetupView = { createAppLink: string | null; eventsCheckedAt: string | null };

/** Everything the Installation Settings page shows, for an Installation Admin. */
export type InstallationSettingsView = { sections: SectionView[]; canSeal: boolean; siteUrl: string | null; slack: SlackSetupView };

// The longest value any setting takes; the table allows 4096 for the sealed form.
const MAX_VALUE = 1000;

/** Test emails one Installation Admin may send in an hour: the page must not become a way to knock on servers. */
export const TEST_EMAILS_PER_HOUR = 10;

/** The fixed answers a failed test email gives. Never the mail server's own code or words: with a host and port of
 * one's choosing, those would tell what listens where in the server's network. */
export const TEST_EMAIL_ERRORS = {
  reach: "Could not reach the mail server.",
  login: "The mail server refused the login.",
  envelope: "The mail server refused the sender or recipient.",
  other: "It did not work.",
} as const;

/** Whether a mail server host is inside the server's own network as written (see mail-hosts.ts). */
export { privateMailHost } from "./mail-hosts";

/** Which of the fixed answers a failed send gets. */
function testEmailError(e: unknown): string {
  const err = e as { code?: string; responseCode?: number; command?: string };
  const code = String(err?.code ?? "");
  const response = Number(err?.responseCode ?? 0);
  if (code === "EAUTH" || response === 530 || response === 534 || response === 535) return TEST_EMAIL_ERRORS.login;
  if (code === "EENVELOPE" || (response >= 550 && response <= 554)) return TEST_EMAIL_ERRORS.envelope;
  if (["ECONNECTION", "ECONNREFUSED", "ETIMEDOUT", "ESOCKET", "EDNS", "ENOTFOUND", "EHOSTUNREACH", "ENETUNREACH", "ETLS", "EBADADDRESS", "EPRIVATEHOST"].includes(code)) return TEST_EMAIL_ERRORS.reach;
  return TEST_EMAIL_ERRORS.other;
}

// The check each setting's value must pass before it is stored; a message for the page when it does not.
const CHECKS: Record<string, (v: string) => string | null> = {
  ZIFFR_SMTP_URL: (v) => {
    let url: URL;
    try { url = new URL(v); } catch { return "The mail server looks like smtps://user:password@smtp.example.com:465."; }
    if (url.protocol !== "smtp:" && url.protocol !== "smtps:") return "The mail server starts with smtps:// or smtp://.";
    if (!url.hostname) return "The mail server needs a host name.";
    // Nodemailer reads options from a query (a logger, a proxy, no TLS checks). The transport is built from the
    // fields alone anyway (smtpOptions); a query is refused so nobody believes it does something.
    if (url.search || url.hash || v.includes("?") || v.includes("#")) return "The mail server takes no ?options: only user, password, host and port.";
    const options = smtpOptions(v);
    if (!options) return "The mail server's user or password is not written correctly: encode / as %2F, @ as %40.";
    // The page must not reach into the server's own network unless the person running it allows that.
    if (privateMailHost(options.host) && !privateMailHostsAllowed()) {
      return "That mail server is inside this server's own network. To use one there, set ZIFFR_ALLOW_PRIVATE_MAIL_HOST=1 on the server.";
    }
    return null;
  },
  ZIFFR_MAIL_FROM: (v) => {
    const address = v.match(/<([^>]+)>\s*$/)?.[1] ?? v.trim();
    if (!isAddress(address)) return "The sender is one email address, with a name if you like: Ziffr <ziffr@example.com>.";
    if (headerSafe(v) !== v.trim()) return "The sender fits on one line.";
    return null;
  },
  ZIFFR_INBOUND_DOMAIN: (v) => (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(v) ? null : "The domain for replies looks like in.ziffr.example.com."),
  ZIFFR_INBOUND_SECRET: (v) => (/^\S{32,200}$/.test(v) ? null : "The signing secret has 32 to 200 characters, without spaces."),
  ZIFFR_TELEGRAM_BOT_TOKEN: (v) => (TELEGRAM_TOKEN.test(v) ? null : "A bot token looks like 1234567890:AA… : the numbers, a colon, and the rest, as @BotFather wrote it."),
  ZIFFR_SLACK_CLIENT_ID: (v) => (/^\d{4,20}\.\d{4,20}$/.test(v) ? null : "The Client ID is two numbers with a dot between them, such as 1234567890.1234567890."),
  ZIFFR_SLACK_CLIENT_SECRET: (v) => (/^[A-Za-z0-9]{32,128}$/.test(v) ? null : "The Client Secret is letters and digits, as Slack shows it under App Credentials."),
  ZIFFR_SLACK_SIGNING_SECRET: (v) => (/^[A-Za-z0-9]{32,128}$/.test(v) ? null : "The Signing Secret is letters and digits, as Slack shows it under App Credentials."),
  ZIFFR_DEFAULT_METRICS_LIMIT: (v) => problemOf(() => limitNumber(v)),
  ZIFFR_DEFAULT_LIMIT_LABEL: (v) => problemOf(() => limitLabel(v)),
  ZIFFR_TURNSTILE_SITE_KEY: (v) => (/^[A-Za-z0-9_-]{10,100}$/.test(v) ? null : "The site key is letters, digits, - and _, as Cloudflare shows it, such as 0x4AAAAAAA…."),
  ZIFFR_TURNSTILE_SECRET: (v) => (/^[A-Za-z0-9_-]{10,200}$/.test(v) ? null : "The secret key is letters, digits, - and _, as Cloudflare shows it."),
  ZIFFR_TRIAL_DAYS: (v) => (/^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 30 ? null : "A trial lasts 1 to 30 days."),
  ZIFFR_TRIAL_MAX: (v) => (/^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 1_000_000 ? null : "Trials at once is a whole number from 1."),
  ZIFFR_DEMO: (v) => (v === "1" || v === "0" ? null : "Pick whether the demo is offered."),
  ZIFFR_INBOUND_AUTHSERV_ID: (v) => (/^[a-z0-9.-]{1,200}$/i.test(v) ? null : "The provider's name looks like mx.example.com."),
};

/** Why Telegram cannot send people's answers to this Ziffr, or null when it can (or polling fetches them, or Telegram
 * could not be asked: then the bot's own answer decides). Asked fresh each time, so Check Telegram shows at once. */
async function telegramCannotReach(settings: Record<string, string | undefined>): Promise<string | null> {
  if (telegramPolling(settings)) return null;
  const url = telegramWebhookUrl(settings);
  if (!url) return `answers cannot arrive: ${TELEGRAM_NEEDS_HTTPS}`;
  try {
    const info = await callTelegram<{ url?: string }>("getWebhookInfo", {}, 0, telegramToken(settings)!);
    return info?.url === url ? null : "Telegram does not send answers to this Ziffr. Choose Check Telegram to tell it.";
  } catch {
    return null;
  }
}

/** Asks Cloudflare whether it knows a Turnstile secret key, before it is saved: a siteverify call with an answer no
 * widget gave tells a known secret ("invalid-input-response") from an unknown one ("invalid-input-secret"). Only
 * Cloudflare's own address is called. Replaced in tests. */
export const turnstileVerifier = {
  /** Cloudflare's error codes for the secret with an answer no widget gave. */
  ask: async (secret: string): Promise<string[]> => {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST", body: new URLSearchParams({ secret, response: "ziffr-settings-check" }), signal: AbortSignal.timeout(5000), cache: "no-store",
    });
    const data = (await res.json()) as { "error-codes"?: unknown };
    return Array.isArray(data["error-codes"]) ? data["error-codes"].map(String) : [];
  },
};

/** The message a check throws, or null when the value passes. */
function problemOf(check: () => unknown): string | null {
  try { check(); return null; } catch (e) { return (e as Error).message; }
}

/** Whether a section works with these settings, for the dot next to its title. */
async function sectionWorks(id: SettingsSectionId, settings: Record<string, string | undefined>): Promise<{ working: boolean; detail: string | null }> {
  if (id === "mail") return { working: mailEnabled(settings), detail: null };
  if (id === "replies") {
    if (inboundEnabled(settings)) {
      return { working: true, detail: settings.ZIFFR_INBOUND_AUTHSERV_ID ? null : "Without the provider that vouches for senders, replies are checked by their address alone, and Approvals are never taken by email." };
    }
    const some = ["ZIFFR_INBOUND_DOMAIN", "ZIFFR_INBOUND_SECRET"].some((n) => settings[n]);
    if (!some) return { working: false, detail: null };
    return { working: false, detail: mailEnabled(settings) ? "Needs both the domain for replies and the signing secret." : "Needs Mail first: replies answer emails Ziffr sent." };
  }
  if (id === "telegram") {
    if (!telegramEnabled(settings)) return { working: false, detail: telegramToken(settings) ? "Needs ZIFFR_SECRETS_KEY on the server." : null };
    const bot = await telegramBot();
    if (!bot) return { working: false, detail: "Telegram does not accept this token, or cannot be reached." };
    const unreachable = await telegramCannotReach(settings);
    return unreachable ? { working: false, detail: `Bot @${bot.username} answers, but ${unreachable}` } : { working: true, detail: `Bot @${bot.username}` };
  }
  if (id === "slack") {
    if (slackEnabled(settings)) return { working: true, detail: null };
    const some = ["ZIFFR_SLACK_CLIENT_ID", "ZIFFR_SLACK_CLIENT_SECRET", "ZIFFR_SLACK_SIGNING_SECRET"].some((n) => settings[n]);
    if (!some) return { working: false, detail: null };
    if (!secretsKey(settings)) return { working: false, detail: "Needs ZIFFR_SECRETS_KEY on the server, which seals the Slack workspaces' bot tokens." };
    if (!/^https?:\/\/[^\s/]+/.test(settings.ZIFFR_SITE_URL ?? "")) return { working: false, detail: "Needs ZIFFR_SITE_URL on the server." };
    return { working: false, detail: "Needs all three values from Slack." };
  }
  if (id === "bots") {
    const site = settings.ZIFFR_TURNSTILE_SITE_KEY;
    const secret = settings.ZIFFR_TURNSTILE_SECRET;
    if (site && secret) return { working: true, detail: "The sign-in form shows the check, and Ziffr sends no link without a passed one." };
    return { working: false, detail: site || secret ? "Needs both the site key and the secret key." : null };
  }
  if (id === "trials") {
    try {
      const t = trialSettings(settings);
      return t ? { working: true, detail: `Trials of ${t.days} day${t.days === 1 ? "" : "s"}, at most ${t.max.toLocaleString("en-US")} at once. Every Workspace made here is one.` } : { working: false, detail: null };
    } catch (e) {
      return { working: false, detail: (e as Error).message };
    }
  }
  if (id === "demo") {
    if (settings.ZIFFR_DEMO_ONLY === "1") return { working: true, detail: "This Ziffr is a public demo and nothing else (ZIFFR_DEMO_ONLY on the server): nobody signs in here." };
    return settings.ZIFFR_DEMO !== "0" ? { working: true, detail: "The login page offers Try the demo." } : { working: false, detail: "The login page does not offer the demo." };
  }
  if (id === "limits") {
    const d = defaultLimitFrom(settings);
    if (d.problem) return { working: false, detail: d.problem };
    return d.metrics === null
      ? { working: false, detail: "No default: a Workspace has no limit unless it has one of its own below." }
      : { working: true, detail: `A Workspace without a limit of its own may hold ${d.metrics.toLocaleString("en-US")} Metrics${d.label ? ` (${d.label})` : ""}.` };
  }
  return { working: false, detail: null };
}

/** The Installation Settings page's view: each section with its settings, where each value comes from, and no
 * secret value. Installation Admins only. */
export async function installationSettingsView(actor: InstallationActor): Promise<InstallationSettingsView> {
  await assertInstallationAdmin(actor);
  const [sources, stored, settings] = await Promise.all([settingSources(), storedSettings(), settingsInEffect()]);
  const view = (s: SettingDefinition): SettingView => {
    const source = sources[s.name];
    const raw = source === "page" ? stored.values.get(s.name) ?? null : source === "none" ? null : settings[s.name] ?? null;
    // A secret is never sent back; one saved here shows its last four characters, so its owner can tell which it is.
    const hint = s.secret && source === "page" && raw && raw.length >= 12 ? raw.slice(-4) : null;
    return { ...s, source, value: s.secret ? null : raw, hint, unreadable: stored.unreadable.has(s.name) };
  };
  return {
    sections: await Promise.all(SETTINGS_SECTIONS.map(async (sec) => ({ ...sec, ...(await sectionWorks(sec.id, settings)), settings: INSTALLATION_SETTINGS.filter((s) => s.section === sec.id).map(view) }))),
    canSeal: secretsKey() !== null,
    siteUrl: process.env.ZIFFR_SITE_URL ?? null,
    slack: { createAppLink: slackCreateAppLink(process.env.ZIFFR_SITE_URL), eventsCheckedAt: await slackEventsCheckedAt(settings) },
  };
}

/** Saves settings of one section: a text sets one, null removes it, a name left out stays as it is. Refuses names of
 * other sections, settings the server sets, values that fail their check, and a secret without ZIFFR_SECRETS_KEY.
 * Nothing is stored unless every value passes. Installation Admins only. */
export async function saveInstallationSettings(actor: InstallationActor, section: string, input: Record<string, string | null>): Promise<SaveOutcome> {
  await assertInstallationAdmin(actor);
  const sec = SETTINGS_SECTIONS.find((s) => s.id === section);
  if (!sec?.ready) throw new Error("This section cannot be set up here yet.");
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Nothing to save.");
  const sources = await settingSources();
  const changes: { def: SettingDefinition; value: string | null }[] = [];
  for (const [name, raw] of Object.entries(input).slice(0, 20)) {
    const def = settingNamed(name);
    if (!def || def.section !== sec.id) throw new Error("That is not a setting of this section.");
    if (sources[name] === "server") throw new Error(`${def.label} is set on the server; change it there.`);
    if (raw === null) { changes.push({ def, value: null }); continue; }
    if (typeof raw !== "string") throw new Error(`${def.label}: enter a value.`);
    const value = raw.trim();
    if (!value) throw new Error(`${def.label}: enter a value, or remove it.`);
    if (value.length > MAX_VALUE) throw new Error(`${def.label} is too long.`);
    const problem = CHECKS[name]?.(value);
    if (problem) throw new Error(problem);
    if (def.secret && !secretsKey()) throw new Error("Secret settings are sealed with ZIFFR_SECRETS_KEY, which this server does not have. Set it on the server first.");
    // The name as written passed; every address it resolves to must too. Sends check again and connect only to the
    // address they checked (mail.ts), so a name that changes its answer later reaches nothing new.
    if (name === "ZIFFR_SMTP_URL") {
      try {
        await checkedMailHost(smtpOptions(value)!.host);
      } catch (e) {
        if (e instanceof MailHostError && e.code === "EPRIVATEHOST") throw new Error("That mail server is inside this server's own network. To use one there, set ZIFFR_ALLOW_PRIVATE_MAIL_HOST=1 on the server.");
        throw new Error("That mail server's name could not be found. Check its spelling.");
      }
    }
    changes.push({ def, value });
  }
  // Turnstile: a new secret is asked of Cloudflare before it is stored, so a wrong one never shuts everyone out of signing in.
  const turnstile = changes.find((c) => c.def.name === "ZIFFR_TURNSTILE_SECRET");
  if (turnstile?.value) {
    let codes: string[];
    try { codes = await turnstileVerifier.ask(turnstile.value); } catch { throw new Error("Cloudflare could not be reached to check the secret key. Try again in a moment."); }
    if (codes.includes("invalid-input-secret")) throw new Error("Cloudflare does not know this secret key. Copy it again from the widget in the Cloudflare dashboard.");
  }
  // Telegram: a new token is asked of Telegram before it is stored, so a wrong one never replaces a working one.
  const telegram = changes.find((c) => c.def.name === "ZIFFR_TELEGRAM_BOT_TOKEN");
  let username: string | null = null;
  if (telegram?.value) {
    try {
      username = await botUsername(telegram.value);
    } catch (e) {
      throw new Error(e instanceof TelegramError && /^error_40[14]$/.test(e.code) ? "Telegram does not accept this token. Copy it again from @BotFather." : "Telegram could not be reached. Try again in a moment.");
    }
    if (!username) throw new Error("Telegram does not accept this token as a bot's. Copy it again from @BotFather.");
  }
  // The bot saved before, if any: let go of its webhook, so it stops sending here once it is replaced or removed.
  // Read fresh, not from the few seconds' cache: a save a moment ago may have replaced it.
  if (telegram) forgetStoredSettings();
  const before = telegram ? (await storedSettings()).values.get("ZIFFR_TELEGRAM_BOT_TOKEN") ?? null : null;
  for (const { def, value } of changes) {
    if (value === null) {
      const { error } = await db().from("installation_settings").delete().eq("name", def.name);
      if (error) throw new Error("The settings could not be saved. Try again.");
    } else {
      // Sealed for its own name: the stored text is useless without the key, and in any other row.
      const stored = def.secret ? sealSecret(value, settingContext(def.name)) : value;
      const { error } = await db().from("installation_settings").upsert({ name: def.name, value: stored, sealed: def.secret, updated_by: actor.personId, updated_at: new Date().toISOString() });
      if (error) throw new Error("The settings could not be saved. Try again.");
    }
  }
  forgetStoredSettings();
  // The default limit takes effect in the database at once, not with the next new Metric.
  if (sec.id === "limits") await syncDefaultLimit(true);
  for (const { def, value } of changes) await recordInstallationEvent(actor.personId, value === null ? "setting.removed" : "setting.set", def.name);
  if (sec.id === "slack") return slackSaved(changes.some((c) => c.def.name === "ZIFFR_SLACK_SIGNING_SECRET" && c.value !== null));
  if (!telegram) return { notice: null, warning: null };
  forgetTelegramBot();
  let warning: string | null = null;
  if (before && before !== telegram.value) {
    try {
      await callTelegram("deleteWebhook", { drop_pending_updates: false }, 0, before);
    } catch {
      warning = "The bot saved before could not be told to stop sending here. Its messages will be refused.";
    }
  }
  if (!telegram.value) {
    // A default token (ZIFFR_TELEGRAM_BOT_TOKEN_DEFAULT) takes over: Telegram must learn to send its answers here.
    const left = await settingsInEffect();
    if (!telegramToken(left)) return { notice: "Telegram removed. Workspaces no longer reach anyone by Telegram.", warning };
    try {
      await registerTelegramWebhook(left);
      return { notice: "Removed from the page. The Installation's default bot is used again.", warning };
    } catch {
      return { notice: "Removed from the page. The Installation's default bot is used again.", warning: "Telegram was not told to send the default bot's answers here. Try Check Telegram." };
    }
  }
  try {
    const how = await registerTelegramWebhook(await settingsInEffect());
    return {
      notice: how === "polling" ? `Saved: @${username}. Answers are fetched by polling (ZIFFR_TELEGRAM_POLLING).` : `Saved: @${username}. Telegram now sends answers to this Ziffr.`,
      warning,
    };
  } catch (e) {
    const why = e instanceof TelegramError ? "Telegram refused to send answers here. Try Check Telegram in a moment." : e instanceof Error ? e.message : "It did not work.";
    return { notice: `Saved: @${username}.`, warning: `Telegram was not told where to send answers. ${why}` };
  }
}

/** What saving Slack's values says next: Slack checks the events address once asked again (it tried when the app was
 * made, before Ziffr knew the signing secret), and the client id and secret are first used when a Workspace connects. */
async function slackSaved(newSigningSecret: boolean): Promise<SaveOutcome> {
  const settings = await settingsInEffect();
  if (!slackEnabled(settings)) return { notice: "Saved. Slack works once all three values are set.", warning: null };
  const verify = newSigningSecret ? " In Slack, open the app's App Manifest page and choose Verify next to the events address; this page then says Slack reached it." : "";
  return { notice: `Saved.${verify} Then an Owner or Admin of a Workspace chooses Add to Slack on its Connectors page.`, warning: null };
}

/** Asks Telegram about the bot in effect, registers the webhook again, and says how it stands, for an Installation
 * Admin: the bot's name, where Telegram sends answers, and Telegram's last delivery error, if any. */
export async function checkTelegram(actor: InstallationActor): Promise<{ message: string; ok: boolean }> {
  await assertInstallationAdmin(actor);
  const settings = await settingsInEffect();
  const token = telegramToken(settings);
  if (!token) return { ok: false, message: "No bot token is set." };
  if (!telegramEnabled(settings)) return { ok: false, message: "Telegram needs ZIFFR_SECRETS_KEY on the server." };
  forgetTelegramBot();
  let name: string | null;
  try { name = await botUsername(token); } catch { return { ok: false, message: "Telegram could not be reached, or does not accept the token." }; }
  if (!name) return { ok: false, message: "Telegram does not accept the token as a bot's." };
  try {
    if ((await registerTelegramWebhook(settings)) === "polling" || telegramPolling(settings)) return { ok: true, message: `@${name} answers. Updates are fetched by polling.` };
  } catch (e) {
    return { ok: false, message: `@${name} answers, but Telegram was not told where to send answers. ${e instanceof TelegramError ? "Try again in a moment." : e instanceof Error ? e.message : ""}`.trim() };
  }
  try {
    const info = await callTelegram<{ url?: string; pending_update_count?: number; last_error_date?: number; last_error_message?: string }>("getWebhookInfo", {}, 0, token);
    // Telegram's own words about reaching this Ziffr, on one line; they name our address at most, never the token.
    const last = info?.last_error_date && Date.now() / 1000 - info.last_error_date < 3600 && info.last_error_message ? ` Telegram's last error: ${String(info.last_error_message).replace(/\s+/g, " ").slice(0, 160)}.` : "";
    return { ok: !last, message: `@${name} answers, and Telegram sends answers to this Ziffr.${last}` };
  } catch {
    return { ok: true, message: `@${name} answers, and Telegram was told where to send answers.` };
  }
}

/** Sends a test email to the acting Installation Admin's own address with the mail settings in effect, and answers
 * where it went. Never to another address, at most TEST_EMAILS_PER_HOUR an hour each. A failure gives one of the
 * TEST_EMAIL_ERRORS, never the server's own code or words. */
export async function sendTestEmail(actor: InstallationActor, transport?: MailTransport): Promise<{ to: string }> {
  await assertInstallationAdmin(actor);
  const settings = await settingsInEffect();
  if (!settings.ZIFFR_SMTP_URL) throw new Error("Set the mail server first.");
  if (!mailEnabled(settings)) throw new Error("Set a sender that is one email address (and ZIFFR_SITE_URL on the server) first.");
  const { data: me } = await db().from("profiles").select("email, name").eq("id", actor.personId).maybeSingle();
  const to = (me?.email as string | null) ?? null;
  if (!isAddress(to)) throw new Error("Your account has no proven email address to send the test to.");
  // Counted and recorded in one locked step in the Installation's audit. Any failure there is a refusal: the limit
  // never opens because the database did not answer.
  const { data: claimed, error } = await db().rpc("claim_installation_test_email", { p_person: actor.personId, p_actor_name: String(me?.name ?? "Someone"), p_limit: TEST_EMAILS_PER_HOUR });
  if (error || claimed !== true) throw new Error(`At most ${TEST_EMAILS_PER_HOUR} test emails an hour. Try again later.`);
  try {
    await (transport ?? smtpTransportWith(settings))({
      to, subject: "Ziffr: test email",
      text: `This is a test email from Ziffr at ${settings.ZIFFR_SITE_URL}.\n\nIf you can read it, Ziffr can send email.`,
    });
  } catch (e) {
    throw new Error(testEmailError(e));
  }
  return { to };
}

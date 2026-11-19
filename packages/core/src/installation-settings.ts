// Installation Settings on the page (spec 0025, ticket #197; GLOSSARY: Installation Settings, Installation Admin):
// what an Installation Admin sees of each setting and how they change one. Only Installation Admins, never with a
// key. A secret value is sealed before it is stored and never comes back: the page learns that it is set and at
// most its last four characters. A value set on the server wins and cannot be changed here. Every change is in the
// Installation's audit by the setting's name, never its value.
import { assertInstallationAdmin, recordInstallationEvent, type InstallationActor } from "./installation-admins";
import { INSTALLATION_SETTINGS, SETTINGS_SECTIONS, settingNamed, type SettingDefinition, type SettingsSectionId } from "./installation-catalogue";
import { db } from "./db";
import { headerSafe, isAddress, mailEnabled, smtpTransportWith, type MailTransport } from "./mail";
import { secretsKey, sealSecret } from "./secrets";
import { forgetStoredSettings, settingContext, settingSources, settingsInEffect, storedSettings, type SettingSource } from "./settings-in-effect";

/** One setting as the page shows it. `value` only for a setting that is not secret; `hint` (the last four
 * characters) only for a secret saved on the page. Only what the page needs goes to the browser. */
export type SettingView = SettingDefinition & { source: SettingSource; value: string | null; hint: string | null; unreadable: boolean };

/** One section with its settings and whether it works with the settings in effect. */
export type SectionView = { id: SettingsSectionId; title: string; purpose: string; ready: boolean; working: boolean; settings: SettingView[] };

/** Everything the Installation Settings page shows, for an Installation Admin. */
export type InstallationSettingsView = { sections: SectionView[]; canSeal: boolean; siteUrl: string | null };

// The longest value any setting takes; the table allows 4096 for the sealed form.
const MAX_VALUE = 1000;

// The check each setting's value must pass before it is stored; a message for the page when it does not.
const CHECKS: Record<string, (v: string) => string | null> = {
  ZIFFR_SMTP_URL: (v) => {
    let url: URL;
    try { url = new URL(v); } catch { return "The mail server looks like smtps://user:password@smtp.example.com:465."; }
    if (url.protocol !== "smtp:" && url.protocol !== "smtps:") return "The mail server starts with smtps:// or smtp://.";
    if (!url.hostname) return "The mail server needs a host name.";
    // Nodemailer reads options from the query (a logger, a proxy, no TLS checks): from the page, only the server.
    if (url.search || url.hash || v.includes("?") || v.includes("#")) return "The mail server takes no ?options: only user, password, host and port.";
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
  ZIFFR_INBOUND_AUTHSERV_ID: (v) => (/^[a-z0-9.-]{1,200}$/i.test(v) ? null : "The provider's name looks like mx.example.com."),
};

/** Whether a section works with these settings, for the dot next to its title. */
function sectionWorks(id: SettingsSectionId, settings: Record<string, string | undefined>): boolean {
  if (id === "mail") return mailEnabled(settings);
  return false;
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
    sections: SETTINGS_SECTIONS.map((sec) => ({ ...sec, working: sectionWorks(sec.id, settings), settings: INSTALLATION_SETTINGS.filter((s) => s.section === sec.id).map(view) })),
    canSeal: secretsKey() !== null,
    siteUrl: process.env.ZIFFR_SITE_URL ?? null,
  };
}

/** Saves settings of one section: a text sets one, null removes it, a name left out stays as it is. Refuses names of
 * other sections, settings the server sets, values that fail their check, and a secret without ZIFFR_SECRETS_KEY.
 * Nothing is stored unless every value passes. Installation Admins only. */
export async function saveInstallationSettings(actor: InstallationActor, section: string, input: Record<string, string | null>): Promise<void> {
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
    changes.push({ def, value });
  }
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
  for (const { def, value } of changes) await recordInstallationEvent(actor.personId, value === null ? "setting.removed" : "setting.set", def.name);
}

/** Sends a test email to the acting Installation Admin's own address with the mail settings in effect, and answers
 * where it went. Never to another address. A failure says only the kind of error, never the server's own words,
 * which may repeat the settings. */
export async function sendTestEmail(actor: InstallationActor, transport?: MailTransport): Promise<{ to: string }> {
  await assertInstallationAdmin(actor);
  const settings = await settingsInEffect();
  if (!settings.ZIFFR_SMTP_URL) throw new Error("Set the mail server first.");
  if (!mailEnabled(settings)) throw new Error("Set a sender that is one email address (and ZIFFR_SITE_URL on the server) first.");
  const { data: me } = await db().from("profiles").select("email").eq("id", actor.personId).maybeSingle();
  const to = (me?.email as string | null) ?? null;
  if (!isAddress(to)) throw new Error("Your account has no proven email address to send the test to.");
  try {
    await (transport ?? smtpTransportWith(settings))({
      to, subject: "Ziffr: test email",
      text: `This is a test email from Ziffr at ${settings.ZIFFR_SITE_URL}.\n\nIf you can read it, Ziffr can send email.`,
    });
  } catch (e) {
    const err = e as { code?: string; responseCode?: number };
    throw new Error(`The mail server did not take it (${String(err.code ?? "error").replace(/[^A-Z0-9_]/gi, "").slice(0, 30)}${err.responseCode ? ` ${Number(err.responseCode)}` : ""}). Check the server, its port and the password.`);
  }
  await recordInstallationEvent(actor.personId, "setting.test_email", "ZIFFR_SMTP_URL");
  return { to };
}

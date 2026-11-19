// Installation Settings against the real database and the local Mailpit (spec 0025, ticket #197): who may read and
// change them, sealing (no secret readable in the table or returned to the page), precedence (environment, then the
// page, then the default), and that mail saved on the page is what the queue and "What works here" then use.
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { deliverPrompt } from "./deliveries";
import { claimInstallation, prepareSetupCode } from "./installation-admins";
import { installationSettingsView, saveInstallationSettings, sendTestEmail } from "./installation-settings";
import { inboundOn, mailOn } from "./mail";
import { openSecret } from "./secrets";
import { forgetStoredSettings, settingContext, settingSources, settingsInEffect } from "./settings-in-effect";
import { workspace } from "./test/db-fixtures";
import { whatThisZiffrOffers, whatWorksHere } from "./what-works-here";

const SMTP = process.env.TEST_SMTP_URL ?? "smtp://127.0.0.1:55425";
const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:55424";
const KEYS = ["ZIFFR_SMTP_URL", "ZIFFR_SMTP_URL_DEFAULT", "ZIFFR_MAIL_FROM", "ZIFFR_MAIL_FROM_DEFAULT", "ZIFFR_SITE_URL", "ZIFFR_INBOUND_DOMAIN", "ZIFFR_INBOUND_SECRET", "ZIFFR_SECRETS_KEY", "ZIFFR_INSTALLATION_ADMINS", "ZIFFR_TRIAL_DAYS"];
const savedEnv: Record<string, string | undefined> = {};
let savedAdmins: Record<string, unknown>[] = [];
let savedSettings: Record<string, unknown>[] = [];
const cleanups: (() => Promise<void>)[] = [];

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
  for (const k of KEYS) { savedEnv[k] = process.env[k]; delete process.env[k]; }
  process.env.ZIFFR_SITE_URL = "https://ziffr.example.test";
  // A fixed test key: 32 bytes, base64.
  process.env.ZIFFR_SECRETS_KEY = Buffer.alloc(32, 7).toString("base64");
  await db().from("installation_admins").delete().neq("person_id", "");
  await db().from("installation_settings").delete().neq("name", "");
  forgetStoredSettings();
});
afterEach(async () => {
  for (const k of KEYS) if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k];
  for (const c of cleanups.splice(0)) await c();
  forgetStoredSettings();
});

/** A signed-in person with an address of their own, removed after the test. */
async function person() {
  const id = `t-${randomUUID()}`;
  const email = `admin-${id.slice(2, 10)}@example.test`;
  const { data } = await db().auth.admin.createUser({ email, email_confirm: true });
  const { error } = await db().from("profiles").insert({ id, name: `Admin ${id.slice(2, 6)}`, role: "", color: "#000", email, auth_user_id: data.user!.id });
  if (error) throw error;
  cleanups.push(async () => {
    await db().from("installation_admins").delete().eq("person_id", id);
    await db().from("profiles").delete().eq("id", id);
    await db().auth.admin.deleteUser(data.user!.id).catch(() => {});
  });
  return { personId: id, email };
}

/** The Installation claimed by a new person, who is then its Installation Admin. */
async function admin() {
  let code = "";
  await prepareSetupCode({ fresh: true }, (c) => { code = c; });
  const a = await person();
  await claimInstallation(a, code);
  return a;
}

const PASSWORD = "pa55word-that-is-secret";

describe("who may see and change Installation Settings", () => {
  it("only an Installation Admin, never an Owner of a Workspace for being one", async () => {
    const a = await admin();
    const w = await workspace();
    cleanups.push(w.cleanup);
    const owner = w.actor(await w.person("owner"));
    await expect(installationSettingsView(owner)).rejects.toThrow(/Only Installation Admins/);
    await expect(saveInstallationSettings(owner, "mail", { ZIFFR_MAIL_FROM: "Ziffr <z@example.test>" })).rejects.toThrow(/Only Installation Admins/);
    await expect(sendTestEmail(owner)).rejects.toThrow(/Only Installation Admins/);
    expect((await installationSettingsView(a)).sections.map((s) => s.id)).toEqual(["mail", "replies", "telegram", "slack", "bots", "trials", "demo"]);
  });

  it("refuses names of other sections, unknown names, bad values and sections that are not ready", async () => {
    const a = await admin();
    await expect(saveInstallationSettings(a, "mail", { ZIFFR_INBOUND_DOMAIN: "in.example.test" })).rejects.toThrow(/not a setting of this section/);
    await expect(saveInstallationSettings(a, "mail", { ZIFFR_DB_PASSWORD: "x" })).rejects.toThrow(/not a setting of this section/);
    await expect(saveInstallationSettings(a, "mail", { ZIFFR_SMTP_URL: "http://example.test" })).rejects.toThrow(/smtps:\/\//);
    // Options in the query would let the page switch on logging of every email, or a proxy.
    await expect(saveInstallationSettings(a, "mail", { ZIFFR_SMTP_URL: "smtp://smtp.example.test:587?logger=true&debug=true" })).rejects.toThrow(/no \?options/);
    await expect(saveInstallationSettings(a, "mail", { ZIFFR_MAIL_FROM: "two@example.test, three@example.test" })).rejects.toThrow(/one email address/);
    await expect(saveInstallationSettings(a, "mail", { ZIFFR_MAIL_FROM: "x".repeat(2000) })).rejects.toThrow(/too long/);
    await expect(saveInstallationSettings(a, "replies", { ZIFFR_INBOUND_DOMAIN: "in.example.test" })).rejects.toThrow(/cannot be set up here yet/);
    // One bad value: nothing of the batch is stored.
    await expect(saveInstallationSettings(a, "mail", { ZIFFR_MAIL_FROM: "Ziffr <z@example.test>", ZIFFR_SMTP_URL: "ftp://x" })).rejects.toThrow();
    expect((await db().from("installation_settings").select("name")).data).toEqual([]);
  });

  it("refuses a secret without ZIFFR_SECRETS_KEY", async () => {
    const a = await admin();
    delete process.env.ZIFFR_SECRETS_KEY;
    await expect(saveInstallationSettings(a, "mail", { ZIFFR_SMTP_URL: SMTP })).rejects.toThrow(/ZIFFR_SECRETS_KEY/);
    expect((await installationSettingsView(a)).canSeal).toBe(false);
  });
});

describe("sealing", () => {
  it("keeps secrets sealed in the table, bound to their name, and never returns them", async () => {
    const a = await admin();
    const url = `smtps://ziffr:${PASSWORD}@smtp.example.test:465`;
    await saveInstallationSettings(a, "mail", { ZIFFR_SMTP_URL: url, ZIFFR_MAIL_FROM: "Ziffr <ziffr@example.test>" });
    const { data: rows } = await db().from("installation_settings").select("name, value, sealed, updated_by");
    const smtp = rows!.find((r) => r.name === "ZIFFR_SMTP_URL")!;
    expect(smtp.sealed).toBe(true);
    expect(smtp.value).not.toContain(PASSWORD);
    expect(smtp.updated_by).toBe(a.personId);
    expect(openSecret(smtp.value, settingContext("ZIFFR_SMTP_URL"))).toBe(url);
    // Moved to another setting's row, it does not open.
    expect(openSecret(smtp.value, settingContext("ZIFFR_INBOUND_SECRET"))).toBeNull();
    // Not secret: stored as it is.
    expect(rows!.find((r) => r.name === "ZIFFR_MAIL_FROM")).toMatchObject({ value: "Ziffr <ziffr@example.test>", sealed: false });
    const view = await installationSettingsView(a);
    expect(JSON.stringify(view)).not.toContain(PASSWORD);
    const shown = view.sections[0].settings.find((s) => s.name === "ZIFFR_SMTP_URL")!;
    expect(shown).toMatchObject({ source: "page", value: null, hint: ":465" });
    // The audit names the setting, never its value.
    const { data: events } = await db().from("installation_audit_events").select("kind, subject").eq("actor_id", a.personId);
    expect(events).toEqual(expect.arrayContaining([{ kind: "setting.set", subject: "ZIFFR_SMTP_URL" }]));
    expect(JSON.stringify(events)).not.toContain(PASSWORD);
  });

  it("treats a secret sealed with another key as not set, and says so", async () => {
    const a = await admin();
    await saveInstallationSettings(a, "mail", { ZIFFR_SMTP_URL: SMTP, ZIFFR_MAIL_FROM: "Ziffr <ziffr@example.test>" });
    process.env.ZIFFR_SECRETS_KEY = Buffer.alloc(32, 9).toString("base64");
    forgetStoredSettings();
    expect((await settingsInEffect()).ZIFFR_SMTP_URL).toBeUndefined();
    expect(await mailOn()).toBe(false);
    expect((await installationSettingsView(a)).sections[0].settings.find((s) => s.name === "ZIFFR_SMTP_URL")!.unreadable).toBe(true);
  });
});

describe("precedence: the environment, then the page, then the default", () => {
  it("takes the page's value, lets the server's win, and falls back to the default", async () => {
    const a = await admin();
    process.env.ZIFFR_MAIL_FROM_DEFAULT = "Ziffr <default@example.test>";
    expect((await settingsInEffect()).ZIFFR_MAIL_FROM).toBe("Ziffr <default@example.test>");
    expect((await settingSources()).ZIFFR_MAIL_FROM).toBe("default");
    await saveInstallationSettings(a, "mail", { ZIFFR_MAIL_FROM: "Ziffr <page@example.test>" });
    // At once after a save, without a restart.
    expect((await settingsInEffect()).ZIFFR_MAIL_FROM).toBe("Ziffr <page@example.test>");
    process.env.ZIFFR_MAIL_FROM = "Ziffr <server@example.test>";
    expect((await settingsInEffect()).ZIFFR_MAIL_FROM).toBe("Ziffr <server@example.test>");
    expect((await settingSources()).ZIFFR_MAIL_FROM).toBe("server");
    await expect(saveInstallationSettings(a, "mail", { ZIFFR_MAIL_FROM: "Ziffr <again@example.test>" })).rejects.toThrow(/set on the server/);
    const shown = (await installationSettingsView(a)).sections[0].settings.find((s) => s.name === "ZIFFR_MAIL_FROM")!;
    expect(shown).toMatchObject({ source: "server", value: "Ziffr <server@example.test>" });
    // Removed from the page: the default again.
    delete process.env.ZIFFR_MAIL_FROM;
    await saveInstallationSettings(a, "mail", { ZIFFR_MAIL_FROM: null });
    expect((await settingsInEffect()).ZIFFR_MAIL_FROM).toBe("Ziffr <default@example.test>");
    // Only settings the page knows are read from the table.
    await db().from("installation_settings").insert({ name: "ZIFFR_JOB_SECRET", value: "from-the-table" });
    forgetStoredSettings();
    expect((await settingsInEffect()).ZIFFR_JOB_SECRET).toBeUndefined();
  });

  it("makes mail saved on the page real for the queue and for What works here", async () => {
    const a = await admin();
    const w = await workspace();
    cleanups.push(w.cleanup);
    const owner = await w.person("owner", { email: `o-${randomUUID().slice(0, 8)}@example.test` });
    const m = await w.metric(owner, { sources: ["web_form", "mail"] });
    await w.token(m.id, owner);
    expect((await whatWorksHere(w.actor(owner))).find((x) => x.way === "email")!.state).toBe("simulated");
    await saveInstallationSettings(a, "mail", { ZIFFR_SMTP_URL: SMTP, ZIFFR_MAIL_FROM: "Ziffr <ziffr@example.test>" });
    expect(await mailOn()).toBe(true);
    expect(await inboundOn()).toBe(false);
    expect((await whatWorksHere(w.actor(owner))).find((x) => x.way === "email")!.state).toBe("real");
    process.env.ZIFFR_TRIAL_DAYS = "7";
    expect((await whatThisZiffrOffers())!.trial!.ways.find((x) => x.way === "email")!.state).toBe("real");
    await deliverPrompt({ metricId: m.id, submitterId: owner, via: "email" });
    const { data } = await db().from("deliveries").select("mail_state").eq("workspace_id", w.id).eq("connector", "email").order("id", { ascending: false }).limit(1).single();
    expect(data!.mail_state).toBe("sent");
  });
});

describe("the test email", () => {
  it("goes to the Installation Admin's own address through the mail server in effect", async () => {
    const a = await admin();
    await expect(sendTestEmail(a)).rejects.toThrow(/mail server first/);
    await saveInstallationSettings(a, "mail", { ZIFFR_SMTP_URL: SMTP, ZIFFR_MAIL_FROM: "Ziffr <ziffr@example.test>" });
    expect(await sendTestEmail(a)).toEqual({ to: a.email });
    const { messages } = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${a.email}"`)}`)).json() as { messages: { Subject: string }[] };
    expect(messages.map((x) => x.Subject)).toEqual(["Ziffr: test email"]);
  });

  it("says only the kind of failure, never the server's words", async () => {
    const a = await admin();
    await saveInstallationSettings(a, "mail", { ZIFFR_SMTP_URL: `smtp://u:${PASSWORD}@127.0.0.1:1`, ZIFFR_MAIL_FROM: "Ziffr <ziffr@example.test>" });
    const err = await sendTestEmail(a).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/did not take it \(E[A-Z]+/);
    expect((err as Error).message).not.toContain(PASSWORD);
  });
});

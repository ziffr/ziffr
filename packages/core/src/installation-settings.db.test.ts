// Installation Settings against the real database and the local Mailpit (spec 0025, ticket #197): who may read and
// change them, sealing (no secret readable in the table or returned to the page), precedence (environment, then the
// page, then the default), and that mail saved on the page is what the queue and "What works here" then use.
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "./db";
import { deliverPrompt } from "./deliveries";
import { claimInstallation, prepareSetupCode } from "./installation-admins";
import { installationSettingsView, privateMailHost, saveInstallationSettings, sendTestEmail, TEST_EMAIL_ERRORS, TEST_EMAILS_PER_HOUR, turnstileVerifier } from "./installation-settings";
import { sendingLimit } from "./sending-limit";
import { trialWebhooksOn } from "./webhook-trial";
import { trialSettingsInEffect, trialsOffered, trialsOpen } from "./trials";
import { demoReadOnlyWords } from "./demo";
import { DEMO_READ_ONLY, DEMO_READ_ONLY_TRIAL } from "./demo-words";
import { inboundOn, mailOn, smtpOptions, smtpTransportWith } from "./mail";
import { mailHostResolver } from "./mail-hosts";
import { openSecret } from "./secrets";
import { forgetStoredSettings, settingContext, settingSources, settingsInEffect } from "./settings-in-effect";
import { workspace } from "./test/db-fixtures";
import { setCloudTrialLimits } from "./cloud-api";
import { TRIAL_LIMITS } from "./trial-limits";
import { forgetTrialLimitsSync, syncTrialLimits } from "./trial-limits-in-effect";
import { whatThisZiffrOffers, whatWorksHere } from "./what-works-here";
import { inboundMx, makeInboundSecret, replyTestStatus, REPLY_TESTS_PER_HOUR, startReplyTest } from "./installation-replies";
import { receiveEmail, type InboundEmail } from "./inbound-email";
import type { OutgoingMail } from "./mail";

const SMTP = process.env.TEST_SMTP_URL ?? "smtp://127.0.0.1:55425";
const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:55424";
const KEYS = ["ZIFFR_CLOUD_KEY", "ZIFFR_TURNSTILE_SITE_KEY", "ZIFFR_TURNSTILE_SECRET", "ZIFFR_TRIAL_MAX", "ZIFFR_DEMO", "ZIFFR_DEMO_DEFAULT", "ZIFFR_DEMO_ONLY", "ZIFFR_SMTP_URL", "ZIFFR_SMTP_URL_DEFAULT", "ZIFFR_MAIL_FROM", "ZIFFR_MAIL_FROM_DEFAULT", "ZIFFR_SITE_URL", "ZIFFR_INBOUND_DOMAIN", "ZIFFR_INBOUND_SECRET", "ZIFFR_SECRETS_KEY", "ZIFFR_INSTALLATION_ADMINS", "ZIFFR_TRIAL_DAYS", "ZIFFR_TRIAL_WEBHOOKS", "ZIFFR_ALLOW_PRIVATE_MAIL_HOST"];
const savedEnv: Record<string, string | undefined> = {};
let savedAdmins: Record<string, unknown>[] = [];
let savedSettings: Record<string, unknown>[] = [];
const cleanups: (() => Promise<void>)[] = [];
const realLookup = mailHostResolver.lookup;
/** Answers the tests give for names: *.example.test is a public address unless a test says otherwise, and any other
 * name is not found. No test asks the machine's own DNS. */
let answers: Record<string, string[]> = {};

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
  answers = {};
  mailHostResolver.lookup = async (host) => {
    const given = answers[host] ?? (host.endsWith(".example.test") ? ["93.184.216.34"] : []);
    if (!given.length) throw Object.assign(new Error("not found"), { code: "ENOTFOUND" });
    return given.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));
  };
  for (const k of KEYS) { savedEnv[k] = process.env[k]; delete process.env[k]; }
  process.env.ZIFFR_SITE_URL = "https://ziffr.example.test";
  // A fixed test key: 32 bytes, base64.
  process.env.ZIFFR_SECRETS_KEY = Buffer.alloc(32, 7).toString("base64");
  // The local Mailpit is on 127.0.0.1, which the page refuses without this.
  process.env.ZIFFR_ALLOW_PRIVATE_MAIL_HOST = "1";
  await db().from("installation_admins").delete().neq("person_id", "");
  await db().from("installation_settings").delete().neq("name", "");
  forgetStoredSettings();
});
afterEach(async () => {
  mailHostResolver.lookup = realLookup;
  vi.restoreAllMocks();
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
    expect((await installationSettingsView(a)).sections.map((s) => s.id)).toEqual(["mail", "replies", "telegram", "slack", "limits", "sending", "keep", "marketplace", "bots", "usage", "feedback", "demo"]);
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
    await expect(saveInstallationSettings(a, "nonsense", { ZIFFR_INBOUND_DOMAIN: "in.example.test" })).rejects.toThrow(/cannot be set up here yet/);
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
    process.env.ZIFFR_CLOUD_KEY = "k".repeat(32);
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

  it("answers one of a few fixed messages, never the server's code or words", async () => {
    const a = await admin();
    await saveInstallationSettings(a, "mail", { ZIFFR_SMTP_URL: `smtp://u:${PASSWORD}@127.0.0.1:1`, ZIFFR_MAIL_FROM: "Ziffr <ziffr@example.test>" });
    await expect(sendTestEmail(a)).rejects.toThrow(TEST_EMAIL_ERRORS.reach);
    const failing = (e: object) => async () => { throw Object.assign(new Error(`535 ${PASSWORD} rejected at 10.0.0.7`), e); };
    const message = async (e: object) => ((await sendTestEmail(a, failing(e)).catch((x: Error) => x)) as Error).message;
    expect(await message({ code: "EAUTH", responseCode: 535 })).toBe(TEST_EMAIL_ERRORS.login);
    expect(await message({ code: "EENVELOPE", responseCode: 553 })).toBe(TEST_EMAIL_ERRORS.envelope);
    expect(await message({ code: "EPROTOCOL", responseCode: 421 })).toBe(TEST_EMAIL_ERRORS.other);
    for (const m of Object.values(TEST_EMAIL_ERRORS)) expect(m).not.toMatch(/E[A-Z]{3,}|\d{3}/);
  });

  it("sends at most ten an hour per Installation Admin", async () => {
    const a = await admin();
    await saveInstallationSettings(a, "mail", { ZIFFR_SMTP_URL: SMTP, ZIFFR_MAIL_FROM: "Ziffr <ziffr@example.test>" });
    const sent: string[] = [];
    for (let i = 0; i < TEST_EMAILS_PER_HOUR; i++) await sendTestEmail(a, async (m) => { sent.push(m.to); return { messageId: "x" }; });
    await expect(sendTestEmail(a, async () => ({ messageId: "x" }))).rejects.toThrow(/At most 10 test emails an hour/);
    expect(sent).toHaveLength(TEST_EMAILS_PER_HOUR);
    // Another Installation Admin has their own ten.
    const b = await person();
    await db().from("installation_admins").insert({ person_id: b.personId, added_by: a.personId });
    await expect(sendTestEmail(b, async () => ({ messageId: "x" }))).resolves.toEqual({ to: b.email });
  });
});

describe("the test email's limit, in one locked step", () => {
  it("lets exactly ten of many parallel test emails through", async () => {
    const a = await admin();
    await saveInstallationSettings(a, "mail", { ZIFFR_SMTP_URL: SMTP, ZIFFR_MAIL_FROM: "Ziffr <ziffr@example.test>" });
    const results = await Promise.allSettled(Array.from({ length: 15 }, () => sendTestEmail(a, async () => ({ messageId: "x" }))));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(TEST_EMAILS_PER_HOUR);
    const { count } = await db().from("installation_audit_events").select("id", { count: "exact", head: true }).eq("actor_id", a.personId).eq("kind", "setting.test_email");
    expect(count).toBe(TEST_EMAILS_PER_HOUR);
  });

  it("refuses when the count cannot be taken", async () => {
    const a = await admin();
    await saveInstallationSettings(a, "mail", { ZIFFR_SMTP_URL: SMTP, ZIFFR_MAIL_FROM: "Ziffr <ziffr@example.test>" });
    const sent: string[] = [];
    vi.spyOn(db(), "rpc").mockResolvedValueOnce({ data: null, error: { message: "down", code: "57P01" } } as never);
    await expect(sendTestEmail(a, async (m) => { sent.push(m.to); return { messageId: "x" }; })).rejects.toThrow(/At most/);
    expect(sent).toEqual([]);
    // The public roles cannot call it.
    const { createClient } = await import("@supabase/supabase-js");
    if (process.env.SUPABASE_ANON_KEY) {
      const { error } = await createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } })
        .rpc("claim_installation_test_email", { p_person: a.personId, p_actor_name: "x", p_limit: 100 });
      expect(error).not.toBeNull();
    }
  });
});

describe("a mail server saved on the page, resolved", () => {
  it("is refused on save when any address of its name is private, or it has none", async () => {
    const a = await admin();
    delete process.env.ZIFFR_ALLOW_PRIVATE_MAIL_HOST;
    answers["inside.example.test"] = ["10.0.0.8"];
    answers["split.example.test"] = ["93.184.216.34", "fd00::25"];
    answers["mapped.example.test"] = ["::ffff:127.0.0.1"];
    answers["meta.example.test"] = ["169.254.169.254"];
    answers["gone.example.test"] = [];
    for (const host of ["inside", "split", "mapped", "meta"]) {
      await expect(saveInstallationSettings(a, "mail", { ZIFFR_SMTP_URL: `smtp://${host}.example.test` }), host).rejects.toThrow(/ZIFFR_ALLOW_PRIVATE_MAIL_HOST/);
    }
    await expect(saveInstallationSettings(a, "mail", { ZIFFR_SMTP_URL: "smtp://gone.example.test" })).rejects.toThrow(/could not be found/);
    await saveInstallationSettings(a, "mail", { ZIFFR_SMTP_URL: "smtps://smtp.example.test:465" });
    expect((await db().from("installation_settings").select("name")).data).toEqual([{ name: "ZIFFR_SMTP_URL" }]);
  });

  it("connects to the address it checked at send time, and refuses one that has turned private", async () => {
    const a = await admin();
    // A name nothing but this test knows, pointing at the local Mailpit: if the email arrives, the connection went to
    // the checked address, not to a lookup of its own.
    const port = new URL(SMTP).port;
    answers["mailpit.example.test"] = ["127.0.0.1"];
    await saveInstallationSettings(a, "mail", { ZIFFR_SMTP_URL: `smtp://mailpit.example.test:${port}`, ZIFFR_MAIL_FROM: "Ziffr <ziffr@example.test>" });
    expect(await sendTestEmail(a)).toEqual({ to: a.email });
    const { messages } = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${a.email}"`)}`)).json() as { messages: unknown[] };
    expect(messages).toHaveLength(1);
    // The same name, now answering a private address, without the server's permission: refused, nothing sent.
    delete process.env.ZIFFR_ALLOW_PRIVATE_MAIL_HOST;
    await expect(sendTestEmail(a)).rejects.toThrow(TEST_EMAIL_ERRORS.reach);
    const again = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${a.email}"`)}`)).json() as { messages: unknown[] };
    expect(again.messages).toHaveLength(1);
  });

  it("checks every mail server the environment did not set, whatever the table says", async () => {
    delete process.env.ZIFFR_ALLOW_PRIVATE_MAIL_HOST;
    const mail = { to: "x@example.test", subject: "s", text: "t" };
    const from = { ZIFFR_MAIL_FROM: "Ziffr <ziffr@example.test>" };
    // Nothing stored and nothing in the environment: a private address handed in is refused, not trusted.
    await expect(smtpTransportWith({ ZIFFR_SMTP_URL: SMTP, ...from })(mail)).rejects.toMatchObject({ code: "EPRIVATEHOST" });
    // The environment names another server: the one handed in is still checked.
    process.env.ZIFFR_SMTP_URL = "smtp://smtp.example.test:587";
    await expect(smtpTransportWith({ ZIFFR_SMTP_URL: SMTP, ...from })(mail)).rejects.toMatchObject({ code: "EPRIVATEHOST" });
    // Reading the table fails: still checked.
    delete process.env.ZIFFR_SMTP_URL;
    vi.spyOn(db(), "from").mockImplementation(() => { throw new Error("down"); });
    forgetStoredSettings();
    await expect(smtpTransportWith({ ZIFFR_SMTP_URL: SMTP, ...from })(mail)).rejects.toMatchObject({ code: "EPRIVATEHOST" });
    vi.restoreAllMocks();
    // Docker's Mailpit default is the environment's own: used without a lookup.
    let asked = false;
    mailHostResolver.lookup = async () => { asked = true; return []; };
    process.env.ZIFFR_SMTP_URL_DEFAULT = SMTP;
    await smtpTransportWith({ ZIFFR_SMTP_URL: SMTP, ...from })(mail);
    expect(asked).toBe(false);
  });

  it("tells Workspace members a plain error, never the Installation's host checks", async () => {
    const a = await admin();
    const w = await workspace();
    cleanups.push(w.cleanup);
    const owner = await w.person("owner", { email: `o-${randomUUID().slice(0, 8)}@example.test` });
    const m = await w.metric(owner, { sources: ["web_form", "mail"] });
    await w.token(m.id, owner);
    await saveInstallationSettings(a, "mail", { ZIFFR_SMTP_URL: SMTP, ZIFFR_MAIL_FROM: "Ziffr <ziffr@example.test>" });
    delete process.env.ZIFFR_ALLOW_PRIVATE_MAIL_HOST;
    await deliverPrompt({ metricId: m.id, submitterId: owner, via: "email" });
    const { data } = await db().from("deliveries").select("mail_state, last_error").eq("workspace_id", w.id).eq("connector", "email").order("id", { ascending: false }).limit(1).single();
    expect(data).toEqual({ mail_state: "queued", last_error: "The mail server refused it (error)." });
  });

  it("leaves a mail server from the environment as it is", async () => {
    delete process.env.ZIFFR_ALLOW_PRIVATE_MAIL_HOST;
    const a = await admin();
    process.env.ZIFFR_SMTP_URL = SMTP;
    process.env.ZIFFR_MAIL_FROM = "Ziffr <ziffr@example.test>";
    let asked = false;
    mailHostResolver.lookup = async () => { asked = true; return []; };
    expect(await sendTestEmail(a)).toEqual({ to: a.email });
    expect(asked).toBe(false);
  });
});

describe("the mail server's address", () => {
  it("becomes a connection of host, port, TLS and login only, from the page or the environment", () => {
    expect(smtpOptions("smtps://user:p%2Fw%40x@smtp.example.test:465")).toEqual({ host: "smtp.example.test", port: 465, secure: true, auth: { user: "user", pass: "p/w@x" } });
    expect(smtpOptions("smtp://smtp.example.test")).toEqual({ host: "smtp.example.test", port: 587, secure: false });
    // A query in the environment's value is ignored: it never becomes an option.
    expect(smtpOptions("smtp://smtp.example.test:25?logger=true&tls.rejectUnauthorized=false&proxy=http://x")).toEqual({ host: "smtp.example.test", port: 25, secure: false });
    expect(smtpOptions("http://smtp.example.test")).toBeNull();
    expect(smtpOptions("smtps://u:%E0%A4%A@smtp.example.test")).toBeNull();
  });

  it("is refused on the page with options, or inside the server's network unless the server allows it", async () => {
    const a = await admin();
    await expect(saveInstallationSettings(a, "mail", { ZIFFR_SMTP_URL: "smtp://smtp.example.test:587?logger=true" })).rejects.toThrow(/no \?options/);
    await expect(saveInstallationSettings(a, "mail", { ZIFFR_SMTP_URL: "smtp://smtp.example.test:587#x" })).rejects.toThrow(/no \?options/);
    await saveInstallationSettings(a, "mail", { ZIFFR_SMTP_URL: "smtps://user:p%2Fw@smtp.example.test:465" });
    delete process.env.ZIFFR_ALLOW_PRIVATE_MAIL_HOST;
    for (const host of ["127.0.0.1", "localhost", "mail:1025", "10.0.0.5", "172.20.1.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "[::1]", "[fd00::1]", "[fe80::1]", "[::ffff:127.0.0.1]", "relay.localhost"]) {
      await expect(saveInstallationSettings(a, "mail", { ZIFFR_SMTP_URL: `smtp://${host}` }), host).rejects.toThrow(/ZIFFR_ALLOW_PRIVATE_MAIL_HOST/);
    }
    for (const host of ["smtp.example.test", "8.8.8.8", "172.32.0.1", "[2606:4700:4700::1111]"]) expect(privateMailHost(host.replace(/^\[|\]$/g, "")), host).toBe(false);
    process.env.ZIFFR_ALLOW_PRIVATE_MAIL_HOST = "1";
    // A Docker service on the stack's own network, as a mail relay there would be.
    answers["mail"] = ["172.18.0.5"];
    await saveInstallationSettings(a, "mail", { ZIFFR_SMTP_URL: "smtp://mail:1025" });
    expect((await settingsInEffect()).ZIFFR_SMTP_URL).toBe("smtp://mail:1025");
  });
});

describe("replies by email on the page (#198)", () => {
  /** An admin with mail and replies saved on the page, and the secret Ziffr made for them. */
  async function repliesSet() {
    const a = await admin();
    await saveInstallationSettings(a, "mail", { ZIFFR_SMTP_URL: SMTP, ZIFFR_MAIL_FROM: "Ziffr <ziffr@example.test>" });
    await saveInstallationSettings(a, "replies", { ZIFFR_INBOUND_DOMAIN: "in.example.test" });
    const { secret } = await makeInboundSecret(a);
    return { a, secret };
  }
  /** A forwarded reply to a test's address, as the inbound route hands it on after its signature check. */
  const reply = (token: string, over: Partial<InboundEmail> = {}): InboundEmail => ({ tokens: [token], from: null, text: "test", messageId: `<${randomUUID()}@example.test>`, automatic: false, verified: false, ...over });
  /** The reply token in a test email's reply address. */
  const tokenOf = (m: OutgoingMail) => /^reply\+([A-Za-z0-9_-]{32})@in\.example\.test$/.exec(m.replyTo ?? "")![1];

  it("makes a signing secret, sealed, shown once, and never for one the server sets", async () => {
    const { a, secret } = await repliesSet();
    expect(secret).toMatch(/^[0-9a-f]{64}$/);
    const { data } = await db().from("installation_settings").select("value, sealed").eq("name", "ZIFFR_INBOUND_SECRET").single();
    expect(data!.sealed).toBe(true);
    expect(data!.value).not.toContain(secret);
    expect(openSecret(data!.value as string, settingContext("ZIFFR_INBOUND_SECRET"))).toBe(secret);
    expect(JSON.stringify(await installationSettingsView(a))).not.toContain(secret);
    expect(await inboundOn()).toBe(true);
    const replies = (await installationSettingsView(a)).sections.find((x) => x.id === "replies")!;
    expect(replies.working).toBe(true);
    // A new one replaces it at once.
    const { secret: next } = await makeInboundSecret(a);
    expect(next).not.toBe(secret);
    expect((await settingsInEffect()).ZIFFR_INBOUND_SECRET).toBe(next);
    process.env.ZIFFR_INBOUND_SECRET = "s".repeat(40);
    await expect(makeInboundSecret(a)).rejects.toThrow(/set on the server/);
    const w = await workspace();
    cleanups.push(w.cleanup);
    await expect(makeInboundSecret(w.actor(await w.person("owner")))).rejects.toThrow(/Only Installation Admins/);
  });

  it("shows the domain's MX records, or why there are none", async () => {
    const { a } = await repliesSet();
    expect(await inboundMx(a, async () => [{ exchange: "route2.mx.example.net", priority: 20 }, { exchange: "route1.mx.example.net", priority: 10 }]))
      .toEqual({ domain: "in.example.test", records: ["10 route1.mx.example.net", "20 route2.mx.example.net"], problem: null });
    expect(await inboundMx(a, async () => { throw Object.assign(new Error("x"), { code: "ENOTFOUND" }); })).toMatchObject({ records: [], problem: "in.example.test has no MX record yet." });
    expect(await inboundMx(a, async () => { throw Object.assign(new Error("x"), { code: "ESERVFAIL" }); })).toMatchObject({ problem: /could not be read/ });
  });

  it("tests the way back: the admin's reply, from their address, vouched for or not, once", async () => {
    const { a } = await repliesSet();
    const before = (await db().from("inbound_emails").select("id", { count: "exact", head: true })).count;
    expect(await replyTestStatus(a)).toEqual({ state: "none", at: null });
    const sent: OutgoingMail[] = [];
    expect(await startReplyTest(a, async (m) => { sent.push(m); return { messageId: "x" }; })).toEqual({ to: a.email });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(a.email);
    const token = tokenOf(sent[0]);
    expect((await replyTestStatus(a)).state).toBe("waiting");
    // Someone else's reply to the same address is noted as not from the admin; the test is used up by it.
    expect(await receiveEmail(reply(token, { from: "someone@example.test", verified: true }))).toBe("test");
    expect(await replyTestStatus(a)).toMatchObject({ state: "received", fromAdmin: false, vouched: true, vouchingAsked: false });
    expect(await receiveEmail(reply(token, { from: a.email }))).toBe("unknown_token");
    // A new test: the admin's own reply, not vouched for.
    await startReplyTest(a, async (m) => { sent.push(m); return { messageId: "x" }; });
    expect(await receiveEmail(reply(tokenOf(sent[1]), { from: a.email }))).toBe("test");
    expect(await replyTestStatus(a)).toMatchObject({ state: "received", fromAdmin: true, vouched: false });
    // Nothing of it reaches a Workspace: no reply was recorded against any Delivery.
    expect((await db().from("inbound_emails").select("id", { count: "exact", head: true })).count).toBe(before);
  });

  it("ends a test that was not answered in thirty minutes, and one started after it", async () => {
    const { a } = await repliesSet();
    const sent: OutgoingMail[] = [];
    await startReplyTest(a, async (m) => { sent.push(m); return { messageId: "x" }; });
    await startReplyTest(a, async (m) => { sent.push(m); return { messageId: "x" }; });
    // The first one stopped working when the second began.
    expect(await receiveEmail(reply(tokenOf(sent[0]), { from: a.email }))).toBe("unknown_token");
    await db().from("installation_reply_tests").update({ created_at: new Date(Date.now() - 31 * 60_000).toISOString() }).eq("person_id", a.personId);
    expect((await replyTestStatus(a)).state).toBe("expired");
    expect(await receiveEmail(reply(tokenOf(sent[1]), { from: a.email }))).toBe("unknown_token");
  });

  it("starts at most five tests an hour, only once replies are set up, and sends the real email to Mailpit", async () => {
    const a = await admin();
    await expect(startReplyTest(a)).rejects.toThrow(/Set up mail, the domain for replies and the signing secret first/);
    await saveInstallationSettings(a, "mail", { ZIFFR_SMTP_URL: SMTP, ZIFFR_MAIL_FROM: "Ziffr <ziffr@example.test>" });
    await saveInstallationSettings(a, "replies", { ZIFFR_INBOUND_DOMAIN: "in.example.test" });
    await makeInboundSecret(a);
    await startReplyTest(a);
    const { messages } = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${a.email}"`)}`)).json() as { messages: { Subject: string; ReplyTo: { Address: string }[] }[] };
    expect(messages.map((x) => x.Subject)).toEqual(["Ziffr: test of replies by email"]);
    expect(messages[0].ReplyTo[0].Address).toMatch(/^reply\+[A-Za-z0-9_-]{32}@in\.example\.test$/);
    for (let i = 1; i < REPLY_TESTS_PER_HOUR; i++) await startReplyTest(a, async () => ({ messageId: "x" }));
    await expect(startReplyTest(a, async () => ({ messageId: "x" }))).rejects.toThrow(/At most 5 reply tests an hour/);
  });
});

describe("the check against bots, trials and the demo on the page (#201)", () => {
  const realAsk = turnstileVerifier.ask;
  afterEach(() => { turnstileVerifier.ask = realAsk; });

  it("saves Turnstile's keys only once Cloudflare knows the secret, and the sign-in form uses them", async () => {
    const a = await admin();
    turnstileVerifier.ask = async (secret) => (secret === "0x4AAAAAAAknownsecret" ? ["invalid-input-response"] : ["invalid-input-secret"]);
    await expect(saveInstallationSettings(a, "bots", { ZIFFR_TURNSTILE_SECRET: "0x4AAAAAAAwrongsecret" })).rejects.toThrow(/does not know this secret key/);
    turnstileVerifier.ask = async () => { throw new Error("offline"); };
    await expect(saveInstallationSettings(a, "bots", { ZIFFR_TURNSTILE_SECRET: "0x4AAAAAAAknownsecret" })).rejects.toThrow(/could not be reached/);
    await expect(saveInstallationSettings(a, "bots", { ZIFFR_TURNSTILE_SITE_KEY: "not a key!" })).rejects.toThrow(/site key/);
    expect((await installationSettingsView(a)).sections.find((x) => x.id === "bots")!.working).toBe(false);
    turnstileVerifier.ask = async () => ["invalid-input-response"];
    await saveInstallationSettings(a, "bots", { ZIFFR_TURNSTILE_SITE_KEY: "0x4AAAAAAAsitekey", ZIFFR_TURNSTILE_SECRET: "0x4AAAAAAAknownsecret" });
    const s = await settingsInEffect();
    expect([s.ZIFFR_TURNSTILE_SITE_KEY, s.ZIFFR_TURNSTILE_SECRET]).toEqual(["0x4AAAAAAAsitekey", "0x4AAAAAAAknownsecret"]);
    const bots = (await installationSettingsView(a)).sections.find((x) => x.id === "bots")!;
    expect(bots.working).toBe(true);
    // The secret is sealed and never sent back.
    expect(JSON.stringify(bots)).not.toContain("knownsecret");
    const { data } = await db().from("installation_settings").select("sealed").eq("name", "ZIFFR_TURNSTILE_SECRET").single();
    expect(data!.sealed).toBe(true);
  });

  it("has no trials without a Ziffr Cloud key: no section, nothing saved or read, whatever the server or the page says (spec 0040)", async () => {
    const a = await admin();
    expect(await trialSettingsInEffect()).toBeNull();
    expect((await installationSettingsView(a)).sections.some((x) => x.id === "trials" || x.id === "trial_limits")).toBe(false);
    expect((await installationSettingsView(a)).sections.flatMap((x) => x.settings).some((x) => x.name.startsWith("ZIFFR_TRIAL_"))).toBe(false);
    await expect(saveInstallationSettings(a, "trials", { ZIFFR_TRIAL_WEBHOOKS: "true" })).rejects.toThrow(/only on hosted Ziffr/);
    await expect(saveInstallationSettings(a, "trial_limits", { ZIFFR_TRIAL_DAYS: "14" })).rejects.toThrow(/only on hosted Ziffr/);
    // A row an older version saved, and the server's own value, count for nothing.
    await db().from("installation_settings").upsert({ name: "ZIFFR_TRIAL_DAYS", value: "14", sealed: false }).throwOnError();
    await db().from("installation_settings").upsert({ name: "ZIFFR_TRIAL_MAX", value: "5", sealed: false }).throwOnError();
    await db().from("installation_settings").upsert({ name: "ZIFFR_TRIAL_WEBHOOKS", value: "false", sealed: false }).throwOnError();
    forgetStoredSettings();
    try {
      // The stored row alone, with nothing in the environment, also stops sign-ins from getting ordinary Workspaces.
      await expect(trialSettingsInEffect()).rejects.toThrow(/cannot be made here/);
      process.env.ZIFFR_TRIAL_DAYS = "7";
      const s = await settingsInEffect();
      expect(s.ZIFFR_TRIAL_DAYS).toBe("7");
      expect(s.ZIFFR_TRIAL_MAX).toBeUndefined();
      // What only governs trials that exist already is still read, so a stored "false" is not forgotten.
      expect(s.ZIFFR_TRIAL_WEBHOOKS).toBe("false");
      await expect(trialSettingsInEffect()).rejects.toThrow(/cannot be made here/);
      expect(trialsOffered(s)).toBe(false);
      expect(await trialsOpen()).toBe(false);
      expect((await whatThisZiffrOffers()).trial).toBeNull();
      expect(demoReadOnlyWords()).toBe(DEMO_READ_ONLY);
      // A key too short to count is no key.
      process.env.ZIFFR_CLOUD_KEY = "short";
      await expect(trialSettingsInEffect()).rejects.toThrow(/cannot be made here/);
    } finally {
      await db().from("installation_settings").delete().in("name", ["ZIFFR_TRIAL_DAYS", "ZIFFR_TRIAL_MAX", "ZIFFR_TRIAL_WEBHOOKS"]);
      forgetStoredSettings();
    }
  });

  it("offers trials on hosted Ziffr from the server's days, which win over the page, and every place that asks sees it", async () => {
    const a = await admin();
    process.env.ZIFFR_CLOUD_KEY = "k".repeat(32);
    expect(await trialSettingsInEffect()).toBeNull();
    process.env.ZIFFR_TRIAL_DAYS = "14";
    expect(await trialSettingsInEffect()).toEqual({ days: 14, max: 500 });
    expect(trialsOffered(await settingsInEffect())).toBe(true);
    expect((await whatThisZiffrOffers()).trial?.days).toBe(14);
    expect(demoReadOnlyWords()).toBe(DEMO_READ_ONLY_TRIAL);
    const view = await installationSettingsView(a);
    expect(view.sections.find((x) => x.id === "trial_limits")).toMatchObject({ working: true, detail: expect.stringContaining("Trials of 14 days") });
    await expect(saveInstallationSettings(a, "trial_limits", { ZIFFR_TRIAL_DAYS: "3" })).rejects.toThrow(/set on the server/);
    expect((await trialSettingsInEffect())?.days).toBe(14);
    process.env.ZIFFR_TRIAL_DAYS = "45";
    expect(trialsOffered(await settingsInEffect())).toBe(false);
  });

  it("lists the Trial Limits on hosted Ziffr, saves them within their ranges into the database, and shows what Ziffr Cloud set as read-only (spec 0040)", async () => {
    const a = await admin();
    process.env.ZIFFR_CLOUD_KEY = "k".repeat(32);
    try {
      const section = (await installationSettingsView(a)).sections.find((x) => x.id === "trial_limits")!;
      expect(section.settings.map((x) => x.name)).toEqual(TRIAL_LIMITS.map((l) => l.name));
      // Each number's range, at both edges and outside, by the page's own check.
      for (const l of TRIAL_LIMITS) {
        await expect(saveInstallationSettings(a, "trial_limits", { [l.name]: String(l.min - 1) }), l.name).rejects.toThrow(/whole number|must be from/);
        await expect(saveInstallationSettings(a, "trial_limits", { [l.name]: String(l.max + 1) }), l.name).rejects.toThrow(/whole number|must be from/);
        await expect(saveInstallationSettings(a, "trial_limits", { [l.name]: "1.5" }), l.name).rejects.toThrow();
      }
      await saveInstallationSettings(a, "trial_limits", { ZIFFR_TRIAL_LIMIT_METRICS: "30" });
      expect((await db().from("trial_limits").select("metrics").single()).data!.metrics).toBe(30);
      const byName = async () => Object.fromEntries((await installationSettingsView(a)).sections.flatMap((x) => x.settings).map((x) => [x.name, x]));
      expect((await byName()).ZIFFR_TRIAL_LIMIT_METRICS).toMatchObject({ source: "page", value: "30" });
      // What Ziffr Cloud sets is shown as its own and cannot be changed or removed here.
      await setCloudTrialLimits({ cloud: true }, { keys: 3 });
      expect((await byName()).ZIFFR_TRIAL_LIMIT_KEYS).toMatchObject({ source: "cloud", value: "3" });
      expect((await byName()).ZIFFR_TRIAL_LIMIT_METRICS).toMatchObject({ source: "none" });
      await expect(saveInstallationSettings(a, "trial_limits", { ZIFFR_TRIAL_LIMIT_KEYS: "4" })).rejects.toThrow(/set by Ziffr Cloud/);
      await expect(saveInstallationSettings(a, "trial_limits", { ZIFFR_TRIAL_LIMIT_KEYS: null })).rejects.toThrow(/set by Ziffr Cloud/);
      // The server's own value wins over both.
      process.env.ZIFFR_TRIAL_LIMIT_FEEDS = "3";
      await expect(saveInstallationSettings(a, "trial_limits", { ZIFFR_TRIAL_LIMIT_FEEDS: "4" })).rejects.toThrow(/set on the server/);
      // Once Ziffr Cloud lets go, the page may set it, and the row is the page's again.
      await setCloudTrialLimits({ cloud: true }, {});
      await saveInstallationSettings(a, "trial_limits", { ZIFFR_TRIAL_LIMIT_KEYS: "4" });
      expect((await db().from("installation_settings").select("set_by").eq("name", "ZIFFR_TRIAL_LIMIT_KEYS").single()).data!.set_by).toBeNull();
      expect((await db().from("trial_limits").select("keys").single()).data!.keys).toBe(4);
      // Another Ziffr's page can neither set a limit nor see the section; only the Installation Admin of hosted Ziffr does.
      const w = await workspace();
      cleanups.push(w.cleanup);
      await expect(saveInstallationSettings(w.actor(await w.person("owner")), "trial_limits", { ZIFFR_TRIAL_LIMIT_KEYS: "5" })).rejects.toThrow(/Only Installation Admins/);
    } finally {
      delete process.env.ZIFFR_TRIAL_LIMIT_FEEDS;
      await db().from("installation_settings").delete().like("name", "ZIFFR_TRIAL_%");
      forgetStoredSettings();
      forgetTrialLimitsSync();
      await syncTrialLimits(true);
    }
  });

  it("switches Webhooks in trials off on the page of hosted Ziffr, and the server's value wins (spec 0037)", async () => {
    const a = await admin();
    process.env.ZIFFR_CLOUD_KEY = "k".repeat(32);
    expect(trialWebhooksOn(await settingsInEffect())).toBe(true);
    await expect(saveInstallationSettings(a, "trials", { ZIFFR_TRIAL_WEBHOOKS: "maybe" })).rejects.toThrow(/Pick whether trials may have Webhooks/);
    await saveInstallationSettings(a, "trials", { ZIFFR_TRIAL_WEBHOOKS: "false" });
    expect(trialWebhooksOn(await settingsInEffect())).toBe(false);
    await saveInstallationSettings(a, "trials", { ZIFFR_TRIAL_WEBHOOKS: "true" });
    expect(trialWebhooksOn(await settingsInEffect())).toBe(true);
    process.env.ZIFFR_TRIAL_WEBHOOKS = "false";
    await expect(saveInstallationSettings(a, "trials", { ZIFFR_TRIAL_WEBHOOKS: "true" })).rejects.toThrow(/set on the server/);
    expect(trialWebhooksOn(await settingsInEffect())).toBe(false);
  });

  it("offers the demo or not, over Docker's default, and never against the server", async () => {
    const a = await admin();
    process.env.ZIFFR_DEMO_DEFAULT = "0";
    expect((await whatThisZiffrOffers()).demo).toBe(false);
    await expect(saveInstallationSettings(a, "demo", { ZIFFR_DEMO: "maybe" })).rejects.toThrow(/Pick whether/);
    await saveInstallationSettings(a, "demo", { ZIFFR_DEMO: "1" });
    expect((await whatThisZiffrOffers()).demo).toBe(true);
    expect((await installationSettingsView(a)).sections.find((x) => x.id === "demo")!.working).toBe(true);
    await saveInstallationSettings(a, "demo", { ZIFFR_DEMO: "0" });
    expect((await whatThisZiffrOffers()).demo).toBe(false);
    process.env.ZIFFR_DEMO = "1";
    await expect(saveInstallationSettings(a, "demo", { ZIFFR_DEMO: "0" })).rejects.toThrow(/set on the server/);
    expect((await whatThisZiffrOffers()).demo).toBe(true);
  });

  it("saves a sending limit within its range, refuses one outside it, and the code reads the value in effect", async () => {
    const a = await admin();
    const name = "ZIFFR_LIMIT_CALLS_PER_KEY_PER_MINUTE";
    delete process.env[name];
    expect(await sendingLimit("callsPerKey")).toBe(60);
    for (const bad of ["0", "29", "6001", "-5", "1e3", "sixty", "60.5"]) {
      await expect(saveInstallationSettings(a, "sending", { [name]: bad })).rejects.toThrow(/Calls per API key per minute/);
    }
    await expect(saveInstallationSettings(a, "sending", { [name]: "0" })).rejects.toThrow(/cannot be switched off/);
    const sending = async () => (await installationSettingsView(a)).sections.find((x) => x.id === "sending")!;
    expect(await sending()).toMatchObject({ working: true, detail: "All at their normal values." });
    await saveInstallationSettings(a, "sending", { [name]: "120" });
    expect(await sending()).toMatchObject({ working: true, detail: "1 of 17 moved from their normal value." });
    expect((await sending()).settings.find((x) => x.name === name)).toMatchObject({ value: "120", source: "page" });
    expect(await sendingLimit("callsPerKey")).toBe(120);
    expect((await settingSources())[name]).toBe("page");
    // The server's value wins, and the page cannot change it.
    process.env[name] = "90";
    expect(await sendingLimit("callsPerKey")).toBe(90);
    await expect(saveInstallationSettings(a, "sending", { [name]: "100" })).rejects.toThrow(/set on the server/);
    // A mistyped one on the server never switches the safeguard off: the default holds.
    process.env[name] = "0";
    expect(await sendingLimit("callsPerKey")).toBe(60);
    delete process.env[name];
    await saveInstallationSettings(a, "sending", { [name]: null });
    expect(await sendingLimit("callsPerKey")).toBe(60);
  });
});

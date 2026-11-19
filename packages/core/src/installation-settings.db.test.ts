// Installation Settings against the real database and the local Mailpit (spec 0025, ticket #197): who may read and
// change them, sealing (no secret readable in the table or returned to the page), precedence (environment, then the
// page, then the default), and that mail saved on the page is what the queue and "What works here" then use.
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "./db";
import { deliverPrompt } from "./deliveries";
import { claimInstallation, prepareSetupCode } from "./installation-admins";
import { installationSettingsView, privateMailHost, saveInstallationSettings, sendTestEmail, TEST_EMAIL_ERRORS, TEST_EMAILS_PER_HOUR } from "./installation-settings";
import { inboundOn, mailOn, smtpOptions, smtpTransportWith } from "./mail";
import { mailHostResolver } from "./mail-hosts";
import { openSecret } from "./secrets";
import { forgetStoredSettings, settingContext, settingSources, settingsInEffect } from "./settings-in-effect";
import { workspace } from "./test/db-fixtures";
import { whatThisZiffrOffers, whatWorksHere } from "./what-works-here";

const SMTP = process.env.TEST_SMTP_URL ?? "smtp://127.0.0.1:55425";
const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:55424";
const KEYS = ["ZIFFR_SMTP_URL", "ZIFFR_SMTP_URL_DEFAULT", "ZIFFR_MAIL_FROM", "ZIFFR_MAIL_FROM_DEFAULT", "ZIFFR_SITE_URL", "ZIFFR_INBOUND_DOMAIN", "ZIFFR_INBOUND_SECRET", "ZIFFR_SECRETS_KEY", "ZIFFR_INSTALLATION_ADMINS", "ZIFFR_TRIAL_DAYS", "ZIFFR_ALLOW_PRIVATE_MAIL_HOST"];
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

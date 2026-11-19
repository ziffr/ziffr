// Slack on the Installation Settings page against the real database and a fake Slack (spec 0025, ticket #200): only an
// Installation Admin sets the app's client id, client secret and signing secret; the secrets are sealed and never come
// back; the values in effect are what "Add to Slack", signed requests and "What works here" then use; the environment
// still wins; Slack's signed url_verification is noted for the page only with the signing secret in effect; the
// manifest link carries this Ziffr's addresses. No real Slack values: every value here is made up.
import { createHmac, randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { claimInstallation, prepareSetupCode } from "./installation-admins";
import { installationSettingsView, saveInstallationSettings } from "./installation-settings";
import { forgetStoredSettings, settingSources } from "./settings-in-effect";
import { slackOn, slackSigningSecretNow } from "./slack-api";
import { startSlackInstall } from "./slack-connection";
import { receiveSlackEvent, slackSigned } from "./slack-inbound";
import { slackCreateAppLink, slackEventsCheckedAt, slackManifest } from "./slack-setup";
import { fakeSlack } from "./test/fake-slack";
import { workspace } from "./test/db-fixtures";
import { whatWorksHere } from "./what-works-here";
import { settingsInEffect } from "./settings-in-effect";

// Made up for these tests; shaped like Slack's.
const CLIENT_ID = "1111111111.2222222222";
const CLIENT_SECRET = "c0ffee".repeat(5) + "ab";
const SIGNING = "5161e".repeat(6) + "aa";
const OTHER_SIGNING = "0ther".repeat(6) + "bb";
const SLACK_NAMES = ["ZIFFR_SLACK_CLIENT_ID", "ZIFFR_SLACK_CLIENT_SECRET", "ZIFFR_SLACK_SIGNING_SECRET"];

let savedAdmins: Record<string, unknown>[] = [];
let savedSettings: Record<string, unknown>[] = [];
let savedChecks: Record<string, unknown>[] = [];
const cleanups: (() => Promise<void>)[] = [];
let slack: Awaited<ReturnType<typeof fakeSlack>>;

beforeAll(async () => {
  savedAdmins = (await db().from("installation_admins").select("*")).data ?? [];
  savedSettings = (await db().from("installation_settings").select("*")).data ?? [];
  savedChecks = (await db().from("installation_checks").select("*")).data ?? [];
});
afterAll(async () => {
  await db().from("installation_admins").delete().neq("person_id", "");
  if (savedAdmins.length) await db().from("installation_admins").insert(savedAdmins);
  await db().from("installation_settings").delete().neq("name", "");
  if (savedSettings.length) await db().from("installation_settings").insert(savedSettings);
  await db().from("installation_checks").delete().neq("name", "");
  if (savedChecks.length) await db().from("installation_checks").insert(savedChecks);
  forgetStoredSettings();
});
beforeEach(async () => {
  await db().from("installation_admins").delete().neq("person_id", "");
  await db().from("installation_settings").delete().neq("name", "");
  await db().from("installation_checks").delete().neq("name", "");
  // The fake sets the key, the address and the API; the page, not the environment, holds the app's values here.
  slack = await fakeSlack();
  for (const n of SLACK_NAMES) delete process.env[n];
  delete process.env.ZIFFR_INSTALLATION_ADMINS;
  forgetStoredSettings();
});
afterEach(async () => {
  await slack.stop();
  for (const c of cleanups.splice(0)) await c();
  forgetStoredSettings();
});

/** The Installation claimed by a new signed-in person, who is then its Installation Admin. */
async function admin() {
  let code = "";
  await prepareSetupCode({ fresh: true }, (c) => { code = c; });
  const id = `t-${randomUUID()}`;
  const email = `sl-${id.slice(2, 10)}@example.test`;
  const { data } = await db().auth.admin.createUser({ email, email_confirm: true });
  const { error } = await db().from("profiles").insert({ id, name: `Admin ${id.slice(2, 6)}`, role: "", color: "#000", email, auth_user_id: data.user!.id });
  if (error) throw error;
  cleanups.push(async () => {
    await db().from("installation_admins").delete().eq("person_id", id);
    await db().from("profiles").delete().eq("id", id);
    await db().auth.admin.deleteUser(data.user!.id).catch(() => {});
  });
  await claimInstallation({ personId: id }, code);
  return { personId: id };
}

const slackOf = async (a: { personId: string }) => (await installationSettingsView(a)).sections.find((s) => s.id === "slack")!;
const all = { ZIFFR_SLACK_CLIENT_ID: CLIENT_ID, ZIFFR_SLACK_CLIENT_SECRET: CLIENT_SECRET, ZIFFR_SLACK_SIGNING_SECRET: SIGNING };

/** Slack's url_verification as Slack sends it, signed with a secret. */
function verification(secret: string) {
  const body = JSON.stringify({ type: "url_verification", token: "x", challenge: "abc123" });
  const ts = String(Math.floor(Date.now() / 1000));
  return { body, ts, sig: `v0=${createHmac("sha256", secret).update(`v0:${ts}:${body}`).digest("hex")}` };
}

describe("setting the Slack app on the page", () => {
  it("only an Installation Admin, never an Owner of a Workspace", async () => {
    await admin();
    const w = await workspace();
    cleanups.push(w.cleanup);
    const owner = w.actor(await w.person("owner"));
    await expect(saveInstallationSettings(owner, "slack", all)).rejects.toThrow(/Only Installation Admins/);
    await expect(installationSettingsView(owner)).rejects.toThrow(/Only Installation Admins/);
    expect((await db().from("installation_settings").select("name")).data).toEqual([]);
  });

  it("seals the two secrets, never shows them, and turns Slack on for Add to Slack and What works here", async () => {
    const a = await admin();
    const w = await workspace();
    cleanups.push(w.cleanup);
    const owner = w.actor(await w.person("owner"));
    expect(await slackOn()).toBe(false);
    expect((await whatWorksHere(owner)).find((x) => x.way === "slack")!.reason).toMatch(/no Slack app.*Installation settings page/);

    const r = await saveInstallationSettings(a, "slack", all);
    expect(r.notice).toMatch(/App Manifest.*Verify/);
    expect(r.notice).toMatch(/Add to Slack/);
    const { data: rows } = await db().from("installation_settings").select("name, value, sealed").in("name", SLACK_NAMES);
    const row = (n: string) => rows!.find((x) => x.name === n)!;
    expect(row("ZIFFR_SLACK_CLIENT_ID")).toMatchObject({ value: CLIENT_ID, sealed: false });
    for (const [n, v] of [["ZIFFR_SLACK_CLIENT_SECRET", CLIENT_SECRET], ["ZIFFR_SLACK_SIGNING_SECRET", SIGNING]]) {
      expect(row(n).sealed).toBe(true);
      expect(row(n).value).not.toContain(v.slice(4, 20));
    }
    const view = await slackOf(a);
    expect(view.working).toBe(true);
    const secrets = view.settings.filter((s) => s.secret);
    expect(secrets.map((s) => [s.value, s.hint])).toEqual([[null, CLIENT_SECRET.slice(-4)], [null, SIGNING.slice(-4)]]);
    expect(JSON.stringify(await installationSettingsView(a))).not.toContain(CLIENT_SECRET);
    expect(JSON.stringify(await installationSettingsView(a))).not.toContain(SIGNING);

    expect(await slackOn()).toBe(true);
    expect((await whatWorksHere(owner)).find((x) => x.way === "slack")!.state).toBe("off");
    const url = new URL(await startSlackInstall(owner));
    expect(url.searchParams.get("client_id")).toBe(CLIENT_ID);
    expect(await slackSigningSecretNow()).toBe(SIGNING);
  });

  it("refuses values that are not shaped like Slack's, and stores none of them", async () => {
    const a = await admin();
    await expect(saveInstallationSettings(a, "slack", { ...all, ZIFFR_SLACK_CLIENT_ID: "not-an-id" })).rejects.toThrow(/Client ID/);
    await expect(saveInstallationSettings(a, "slack", { ...all, ZIFFR_SLACK_SIGNING_SECRET: "short" })).rejects.toThrow(/Signing Secret/);
    await expect(saveInstallationSettings(a, "slack", { ZIFFR_TELEGRAM_BOT_TOKEN: "1:x" })).rejects.toThrow(/not a setting of this section/);
    expect((await db().from("installation_settings").select("name")).data).toEqual([]);
  });

  it("says what is missing until all three are there", async () => {
    const a = await admin();
    const r = await saveInstallationSettings(a, "slack", { ZIFFR_SLACK_CLIENT_ID: CLIENT_ID });
    expect(r.notice).toMatch(/all three/);
    expect(await slackOn()).toBe(false);
    expect(await slackOf(a)).toMatchObject({ working: false, detail: "Needs all three values from Slack." });
  });

  it("leaves values set on the server alone, and the server's win", async () => {
    const a = await admin();
    await saveInstallationSettings(a, "slack", all);
    process.env.ZIFFR_SLACK_SIGNING_SECRET = OTHER_SIGNING;
    expect((await settingSources()).ZIFFR_SLACK_SIGNING_SECRET).toBe("server");
    expect(await slackSigningSecretNow()).toBe(OTHER_SIGNING);
    await expect(saveInstallationSettings(a, "slack", { ZIFFR_SLACK_SIGNING_SECRET: SIGNING })).rejects.toThrow(/set on the server/);
    await expect(saveInstallationSettings(a, "slack", { ZIFFR_SLACK_SIGNING_SECRET: null })).rejects.toThrow(/set on the server/);
    expect((await slackOf(a)).settings.find((s) => s.name === "ZIFFR_SLACK_SIGNING_SECRET")).toMatchObject({ source: "server", value: null, hint: null });
  });
});

describe("Slack's check of the events address", () => {
  it("is noted only when it came signed with the signing secret in effect, and stops counting when that is replaced", async () => {
    const a = await admin();
    await saveInstallationSettings(a, "slack", all);
    expect((await installationSettingsView(a)).slack.eventsCheckedAt).toBeNull();

    // What the events route does: check the signature with the secret in effect, then take the request.
    const wrong = verification(OTHER_SIGNING);
    expect(slackSigned(wrong.ts, wrong.sig, wrong.body, await slackSigningSecretNow())).toBe(false);
    const right = verification(SIGNING);
    expect(slackSigned(right.ts, right.sig, right.body, await slackSigningSecretNow())).toBe(true);
    expect(await receiveSlackEvent(JSON.parse(right.body), { signedWith: SIGNING })).toEqual({ challenge: "abc123", outcome: "ignored" });
    const at = (await installationSettingsView(a)).slack.eventsCheckedAt;
    expect(at).not.toBeNull();
    expect(Date.now() - new Date(at!).getTime()).toBeLessThan(60_000);

    // A hash of the secret is kept, never the secret.
    const { data: check } = await db().from("installation_checks").select("fingerprint").eq("name", "slack.events").single();
    expect(check!.fingerprint).not.toContain(SIGNING);

    await saveInstallationSettings(a, "slack", { ZIFFR_SLACK_SIGNING_SECRET: OTHER_SIGNING });
    expect((await installationSettingsView(a)).slack.eventsCheckedAt).toBeNull();
    expect(await slackEventsCheckedAt(await settingsInEffect())).toBeNull();
  });

  it("is noted with a signing secret alone, before the rest of the app is set up", async () => {
    const a = await admin();
    await saveInstallationSettings(a, "slack", { ZIFFR_SLACK_SIGNING_SECRET: SIGNING });
    expect(await slackOn()).toBe(false);
    expect(await slackSigningSecretNow()).toBe(SIGNING);
    // A request whose signature was checked with no secret notes nothing.
    await receiveSlackEvent({ type: "url_verification", challenge: "abc" });
    expect((await installationSettingsView(a)).slack.eventsCheckedAt).toBeNull();
    // One checked with a secret replaced since is not credited to the one in effect.
    await receiveSlackEvent({ type: "url_verification", challenge: "abc" }, { signedWith: OTHER_SIGNING });
    expect((await installationSettingsView(a)).slack.eventsCheckedAt).toBeNull();
    await receiveSlackEvent({ type: "url_verification", challenge: "abc" }, { signedWith: SIGNING });
    expect((await installationSettingsView(a)).slack.eventsCheckedAt).not.toBeNull();
    // Nothing else is taken until Slack is set up in full.
    expect(await receiveSlackEvent({ type: "event_callback", event_id: "Ev123", team_id: "T123" })).toEqual({ outcome: "ignored" });
  });
});

describe("the manifest link", () => {
  it("opens Slack's Create app with the manifest for this Ziffr's https address", () => {
    const link = slackCreateAppLink("https://ziffr.example.test/");
    expect(link).toMatch(/^https:\/\/api\.slack\.com\/apps\?new_app=1&manifest_json=/);
    const manifest = JSON.parse(new URL(link!).searchParams.get("manifest_json")!);
    expect(manifest).toEqual(slackManifest("https://ziffr.example.test"));
    expect(manifest.oauth_config.redirect_urls).toEqual(["https://ziffr.example.test/api/slack/oauth"]);
    expect(manifest.settings.event_subscriptions.request_url).toBe("https://ziffr.example.test/api/slack/events");
    expect(manifest.settings.interactivity.request_url).toBe("https://ziffr.example.test/api/slack/interactions");
    expect(manifest.oauth_config.scopes.bot).toEqual(["chat:write", "im:write", "im:history", "users:read", "users:read.email"]);
    expect(manifest.settings.token_rotation_enabled).toBe(false);
  });

  it("is not offered without an https address, or with anything after the host", () => {
    expect(slackCreateAppLink("http://localhost:3000")).toBeNull();
    expect(slackCreateAppLink(undefined)).toBeNull();
    expect(slackCreateAppLink("https://ziffr.example.test/path?x=1")).toBeNull();
    expect(slackCreateAppLink("https://ziffr.example.test\"},{\"x")).toBeNull();
  });

  it("is on the page for an Installation Admin", async () => {
    const a = await admin();
    expect((await installationSettingsView(a)).slack.createAppLink).toBe(slackCreateAppLink(process.env.ZIFFR_SITE_URL));
  });
});

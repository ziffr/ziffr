// How long logs are kept, trial days, the unused Workspace wait and Ziffr Cloud's pins against the real database
// (ticket #517; GLOSSARY: Installation Settings, Audit Log): that each job removes by the days in effect and never
// by a value outside its range, that the Audit Log is never kept for fewer days than a Retention or an Approval refers
// to, and that on a Ziffr Cloud deployment the pinned settings cannot be changed on the page.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "./db";
import { actorForKey, createAccessKey } from "./access-keys";
import { recordCall } from "./access-log";
import { auditKeepDays, auditKeepRefusal, referencedAuditAgeDays, forgetAuditReference } from "./audit-retention";
import { claimInstallation, prepareSetupCode } from "./installation-admins";
import { DAYS_SETTINGS, daysProblem } from "./installation-days";
import { installationSettingsView, saveInstallationSettings } from "./installation-settings";
import { isTrialSetting, settingNamed } from "./installation-catalogue";
import { forgetStoredSettings, settingsInEffect } from "./settings-in-effect";
import { closeEndedTrials, deleteExpiredTrials, remindEndingTrials } from "./trial-end";
import { pruneViewCounts } from "./usage";
import { setWorkspaceLimit } from "./workspace-limits-admin";
import { changeRows, workspace } from "./test/db-fixtures";
import { randomUUID } from "node:crypto";

vi.setConfig({ testTimeout: 120_000, hookTimeout: 60_000 });
const DAY = 86_400_000;
const ago = (n: number) => new Date(Date.now() - n * DAY);
const NAMES = Object.keys(DAYS_SETTINGS);
const cleanups: (() => Promise<void>)[] = [];
const envKeys = [...NAMES, "ZIFFR_CLOUD_KEY", "ZIFFR_TRIAL_DAYS", "ZIFFR_TRIAL_THEN", "ZIFFR_DELETE_UNUSED_AFTER_DAYS", "ZIFFR_DEFAULT_METRICS_LIMIT"];
const savedEnv: Record<string, string | undefined> = {};
let savedSettings: Record<string, unknown>[] = [];
let savedAdmins: Record<string, unknown>[] = [];

beforeEach(async () => {
  for (const k of envKeys) { savedEnv[k] = process.env[k]; delete process.env[k]; }
  savedSettings = (await db().from("installation_settings").select("*")).data ?? [];
  savedAdmins = (await db().from("installation_admins").select("*")).data ?? [];
  await db().from("installation_settings").delete().neq("name", "");
  forgetStoredSettings(); forgetAuditReference();
});
afterEach(async () => {
  vi.useRealTimers();
  for (const k of envKeys) if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k];
  for (const c of cleanups.splice(0)) await c();
  await db().from("installation_settings").delete().neq("name", "");
  if (savedSettings.length) await db().from("installation_settings").insert(savedSettings);
  await db().from("installation_admins").delete().neq("person_id", "");
  if (savedAdmins.length) await db().from("installation_admins").insert(savedAdmins);
  forgetStoredSettings(); forgetAuditReference();
});
async function ws() { const w = await workspace(); cleanups.push(w.cleanup); return w; }

async function admin() {
  let code = "";
  await prepareSetupCode({ fresh: true }, (c) => { code = c; });
  const id = `t-${randomUUID()}`;
  const email = `admin-${id.slice(2, 10)}@example.test`;
  const { data } = await db().auth.admin.createUser({ email, email_confirm: true });
  const { error } = await db().from("profiles").insert({ id, name: `Admin ${id.slice(2, 6)}`, role: "", color: "#000", email, auth_user_id: data.user!.id });
  if (error) throw error;
  cleanups.push(async () => { await db().from("installation_admins").delete().eq("person_id", id); await db().from("profiles").delete().eq("id", id); await db().auth.admin.deleteUser(data.user!.id).catch(() => {}); });
  const a = { personId: id, email };
  await claimInstallation(a, code);
  return a;
}

describe("the ranges on the page", () => {
  it("accept the edges of every day setting and refuse one past them, storing nothing", async () => {
    const a = await admin();
    process.env.ZIFFR_SECRETS_KEY ??= Buffer.alloc(32, 7).toString("base64");
    for (const [name, d] of Object.entries(DAYS_SETTINGS)) {
      // Trial settings are hosted Ziffr's and Ziffr Cloud pins this one: the page does not save it (spec 0040).
      if (isTrialSetting(name)) { expect(daysProblem(name, String(d.min - 1))).not.toBeNull(); expect(daysProblem(name, String(d.max))).toBeNull(); continue; }
      const section = settingNamed(name)!.section;
      for (const bad of [String(d.min - 1), String(d.max + 1), "abc", "1.5"]) {
        await expect(saveInstallationSettings(a, section, { [name]: bad }), `${name}=${bad}`).rejects.toThrow(/Write a whole number of (days|values) from/);
      }
      expect((await db().from("installation_settings").select("name").eq("name", name)).data).toEqual([]);
      for (const ok of [d.min, d.max]) {
        await saveInstallationSettings(a, section, { [name]: String(ok) });
        forgetStoredSettings();
        expect((await settingsInEffect())[name]).toBe(String(ok));
      }
    }
  });

  it("show the keep section after the limits, with a plain warning below two years and the words of the Audit Log's page", async () => {
    const a = await admin();
    const outcome = await saveInstallationSettings(a, "keep", { ZIFFR_KEEP_AUDIT_DAYS: "400" });
    expect(outcome.warning).toMatch(/less than two years/);
    expect((await saveInstallationSettings(a, "keep", { ZIFFR_KEEP_AUDIT_DAYS: "730" })).warning).toBeNull();
    const view = await installationSettingsView(a);
    const keep = view.sections.find((s) => s.id === "keep")!;
    expect(keep.title).toBe("How long logs are kept");
    expect(keep.settings.map((s) => s.name)).toEqual(["ZIFFR_KEEP_AUDIT_DAYS", "ZIFFR_KEEP_ACCESS_LOG_DAYS", "ZIFFR_KEEP_WEBHOOK_LOG_DAYS", "ZIFFR_KEEP_VIEW_COUNT_DAYS", "ZIFFR_RETENTION_VALUES_PER_RUN"]);
    await saveInstallationSettings(a, "keep", { ZIFFR_KEEP_AUDIT_DAYS: "400" });
    expect((await installationSettingsView(a)).sections.find((s) => s.id === "keep")!.detail).toMatch(/less than two years/);
  });

  it("say when the server's environment holds a value outside its range, and use the usual value", async () => {
    const a = await admin();
    process.env.ZIFFR_KEEP_AUDIT_DAYS = "5";
    const keep = (await installationSettingsView(a)).sections.find((s) => s.id === "keep")!;
    expect(keep.detail).toMatch(/ZIFFR_KEEP_AUDIT_DAYS is outside the range/);
    expect(await auditKeepDays()).toBeGreaterThanOrEqual(730);
  });
});

describe("the Audit Log is never kept for fewer days than a Retention or an Approval refers to", () => {
  /** A Metric with a Retention and an event of its Retention in its Workspace's Audit Log. */
  async function retained(kind = "retention.run") {
    const w = await ws(); const sara = await w.person("owner");
    const m = await w.metric(sara);
    await changeRows("metrics", { id: m.id }, { retention: { keep_months: 25, then: "delete" } });
    await db().from("audit_events").insert({ workspace_id: w.id, actor_name: "Ziffr", kind, object_type: "metric", object_id: String(m.id), object_name: "M", details: {} });
    return { w, m };
  }
  const later = (n: number) => new Date(Date.now() + n * DAY);

  it("refuses a lower setting than the age of the event a Retention still refers to, in plain words", async () => {
    await retained();
    expect(await referencedAuditAgeDays(later(800))).toBeGreaterThanOrEqual(800);
    const refusal = await auditKeepRefusal(400, later(800));
    expect(refusal).toMatch(/cannot be kept for only 400 days: a Retention or an Approval still refers to an event 80\d days old\. Keep it at least 80\d days/);
    expect(await auditKeepRefusal(900, later(800))).toBeNull();
  });

  it("refuses the save on the page, and allows it again once the Retention is cancelled", async () => {
    const a = await admin();
    const { m } = await retained();
    vi.useFakeTimers({ toFake: ["Date"], now: later(800) });
    await expect(saveInstallationSettings(a, "keep", { ZIFFR_KEEP_AUDIT_DAYS: "400" })).rejects.toThrow(/Keep it at least 80\d days/);
    expect((await db().from("installation_settings").select("name").eq("name", "ZIFFR_KEEP_AUDIT_DAYS")).data).toEqual([]);
    vi.useRealTimers();
    await changeRows("metrics", { id: m.id }, { retention: null });
    vi.useFakeTimers({ toFake: ["Date"], now: later(800) });
    forgetAuditReference();
    await saveInstallationSettings(a, "keep", { ZIFFR_KEEP_AUDIT_DAYS: "400" });
    expect((await db().from("installation_settings").select("value").eq("name", "ZIFFR_KEEP_AUDIT_DAYS").single()).data!.value).toBe("400");
  });

  it("counts the events of a Metric whose Approval is open, and what removes events keeps them even when the setting is lower", async () => {
    const w = await ws(); const sara = await w.person("owner");
    const m = await w.metric(sara);
    await db().from("period_states").insert({ metric_id: m.id, period_start: "2026-10-01", state: "approval" });
    await db().from("audit_events").insert({ workspace_id: w.id, actor_name: "Ben", kind: "approval.sent_back", object_type: "metric", object_id: String(m.id), details: {} });
    expect(await referencedAuditAgeDays(later(1000))).toBeGreaterThanOrEqual(1000);
    process.env.ZIFFR_KEEP_AUDIT_DAYS = "365";
    expect(await auditKeepDays(later(1000))).toBeGreaterThanOrEqual(1000);
    // Decided: it no longer refers to anything.
    await changeRows("period_states", { metric_id: m.id }, { state: "published" });
    forgetAuditReference();
    expect(await referencedAuditAgeDays(later(1000))).toBeLessThan(1000);
    expect(await auditKeepDays(later(1000))).toBe(365);
  });

  it("is not moved by events of other kinds or of a Metric with neither", async () => {
    const w = await ws(); const sara = await w.person("owner");
    const m = await w.metric(sara);
    await db().from("audit_events").insert({ workspace_id: w.id, actor_name: "Ben", kind: "metric.created", object_type: "metric", object_id: String(m.id), details: {} });
    await db().from("audit_events").insert({ workspace_id: w.id, actor_name: "Ben", kind: "retention.run", object_type: "metric", object_id: String(m.id), details: {} });
    expect(await referencedAuditAgeDays(later(900))).toBeLessThan(900);
  });

  it("holds the database's own floor: nothing under a year old can be removed, whatever the core asks", async () => {
    const w = await ws(); const sara = await w.person("owner");
    await db().from("audit_events").insert({ workspace_id: w.id, actor_name: "Ben", kind: "group.created", details: {} });
    const { error } = await db().from("audit_events").delete().eq("workspace_id", w.id).lt("at", new Date(Date.now() + DAY).toISOString());
    expect(error?.message).toMatch(/add-only/);
    expect(sara).toBeTruthy();
  });
});

describe("what the jobs remove, by the days in effect", () => {
  async function keyFor() {
    const w = await ws(); const ben = await w.person("member");
    const { id, secret } = await createAccessKey(w.actor(ben, "member"), { name: "Script", scopes: ["metrics:read"], expiresOn: new Date(Date.now() + 30 * DAY).toISOString().slice(0, 10) });
    return { id, key: (await actorForKey(secret))! };
  }
  const call = (keyId: number, at: Date) => db().from("access_log").insert({ key_id: keyId, method: "GET", route: "/api/v1/metrics", status: 200, at: at.toISOString() });
  const left = async (keyId: number) => (await db().from("access_log").select("at").eq("key_id", keyId)).data?.length ?? 0;

  it("forget calls of a key after the days set, never fewer than the lowest allowed", async () => {
    const { id, key } = await keyFor();
    await call(id, ago(100)); await call(id, ago(20)); await call(id, ago(5));
    await recordCall(key, { method: "GET", path: "/api/v1/metrics", status: 200 });
    expect(await left(id)).toBe(3);
    process.env.ZIFFR_KEEP_ACCESS_LOG_DAYS = "7";
    await recordCall(key, { method: "GET", path: "/api/v1/metrics", status: 200 });
    expect(await left(id)).toBe(3);
    // A value below the range is not used: the usual 90 days apply, so nothing of 20 days is lost.
    await call(id, ago(20));
    process.env.ZIFFR_KEEP_ACCESS_LOG_DAYS = "1";
    await recordCall(key, { method: "GET", path: "/api/v1/metrics", status: 200 });
    expect(await left(id)).toBe(5);
  });

  it("forget nothing when the settings cannot be read", async () => {
    const { id, key } = await keyFor();
    await call(id, ago(100));
    const from = db().from.bind(db());
    const spy = vi.spyOn(db(), "from").mockImplementation(((table: string) => table === "installation_settings" ? { select: () => ({ in: async () => ({ data: null, error: { code: "XX000" } }) }) } : from(table)) as never);
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    forgetStoredSettings();
    await recordCall(key, { method: "GET", path: "/api/v1/metrics", status: 200 });
    spy.mockRestore(); quiet.mockRestore();
    expect(await left(id)).toBe(2);
  });

  const viewRow = (workspaceId: string, daysAgo: number, id: number) => db().from("view_counts").insert({ workspace_id: workspaceId, day: ago(daysAgo).toISOString().slice(0, 10), subject_kind: "metric", subject_id: id, n_app: 1 });
  const views = async (workspaceId: string) => (await db().from("view_counts").select("subject_id").eq("workspace_id", workspaceId)).data?.map((r) => Number(r.subject_id)).sort((x, y) => x - y) ?? [];

  it("forget View Counts after the days set, never fewer than 90", async () => {
    const w = await ws();
    await viewRow(w.id, 500, 1); await viewRow(w.id, 300, 2); await viewRow(w.id, 100, 3); await viewRow(w.id, 80, 4);
    await pruneViewCounts();
    expect(await views(w.id)).toEqual([2, 3, 4]);
    process.env.ZIFFR_KEEP_VIEW_COUNT_DAYS = "90";
    await pruneViewCounts();
    expect(await views(w.id)).toEqual([4]);
    // The database holds its own lower bound: a call for 1 day keeps what is 80 days old.
    const { error } = await db().rpc("prune_view_counts", { p_days: 1 });
    expect(error).toBeNull();
    expect(await views(w.id)).toEqual([4]);
  });

  it("delete an ended trial after the grace days set, not before", async () => {
    process.env.ZIFFR_TRIAL_THEN = "delete";
    const t = await ws();
    await db().from("workspaces").update({ trial_ends_at: ago(3).toISOString() }).eq("id", t.id);
    await deleteExpiredTrials();
    expect((await db().from("workspaces").select("id").eq("id", t.id).maybeSingle()).data).not.toBeNull();
    process.env.ZIFFR_TRIAL_GRACE_DAYS = "2";
    await deleteExpiredTrials();
    expect((await db().from("workspaces").select("id").eq("id", t.id).maybeSingle()).data).toBeNull();
  });

  it("keep a trial's grace days from when it closed: a lower setting later never deletes it sooner", async () => {
    process.env.ZIFFR_TRIAL_THEN = "delete";
    const t = await ws();
    await db().from("workspaces").update({ trial_ends_at: ago(3).toISOString() }).eq("id", t.id);
    await closeEndedTrials();
    expect((await db().from("workspaces").select("trial_grace_days").eq("id", t.id).single()).data!.trial_grace_days).toBe(7);
    process.env.ZIFFR_TRIAL_GRACE_DAYS = "1";
    await deleteExpiredTrials();
    expect((await db().from("workspaces").select("id").eq("id", t.id).maybeSingle()).data).not.toBeNull();
    // A trial closed before the days were kept has the usual 7.
    await db().from("workspaces").update({ trial_grace_days: null, trial_ends_at: ago(8).toISOString() }).eq("id", t.id);
    await deleteExpiredTrials();
    expect((await db().from("workspaces").select("id").eq("id", t.id).maybeSingle()).data).toBeNull();
  });

  it("keep the days its reminder promised for a trial that ended and is not closed yet", async () => {
    process.env.ZIFFR_TRIAL_THEN = "delete";
    const t = await ws();
    await db().from("workspaces").update({ trial_ends_at: new Date(Date.now() + 3_600_000).toISOString() }).eq("id", t.id);
    await remindEndingTrials();
    expect((await db().from("workspaces").select("trial_grace_days").eq("id", t.id).single()).data!.trial_grace_days).toBe(7);
    await db().from("workspaces").update({ trial_ends_at: ago(3).toISOString() }).eq("id", t.id);
    process.env.ZIFFR_TRIAL_GRACE_DAYS = "1";
    await deleteExpiredTrials();
    expect((await db().from("workspaces").select("id").eq("id", t.id).maybeSingle()).data).not.toBeNull();
    await db().from("workspaces").update({ trial_ends_at: ago(8).toISOString() }).eq("id", t.id);
    await deleteExpiredTrials();
    expect((await db().from("workspaces").select("id").eq("id", t.id).maybeSingle()).data).toBeNull();
  });

  it("keep the wait a warning promised, whatever the setting says later", async () => {
    const w = await ws(); const sara = await w.person("owner");
    await db().from("workspaces").update({ last_used_at: ago(200) }).eq("id", w.id);
    const claimed = await db().rpc("claim_unused_warning", { p_workspace: w.id, p_days: 90, p_wait: 30 });
    expect(claimed.data).toBe(true);
    expect((await db().from("workspaces").select("unused_wait_days").eq("id", w.id).single()).data!.unused_wait_days).toBe(30);
    await db().from("deliveries").insert({ connector: "email", recipient_id: sara, sender_id: null, kind: "notice", workspace_id: w.id, subject: "Your Ziffr Workspace will be deleted", body: "test", mail_state: "sent", created_at: ago(40) });
    const deletable = async () => (await db().rpc("deletable_as_unused", { p_workspace: w.id, p_days: 90 })).data;
    // Warned 20 days ago, promised 30: not yet, though the usual 14 have passed.
    await db().from("workspaces").update({ unused_warned_at: ago(20) }).eq("id", w.id);
    expect(await deletable()).toBe(false);
    await db().from("workspaces").update({ unused_warned_at: ago(31) }).eq("id", w.id);
    await db().from("deliveries").update({ created_at: ago(31).toISOString() }).eq("workspace_id", w.id);
    expect(await deletable()).toBe(true);
    // Stale after the wait and a week.
    await db().from("workspaces").update({ unused_warned_at: ago(38) }).eq("id", w.id);
    expect(await deletable()).toBe(false);
  });

  it("record the wait within 7 to 90 days, whatever is asked", async () => {
    for (const [asked, kept] of [[1, 7], [7, 7], [90, 90], [500, 90]] as const) {
      const w = await ws();
      await db().from("workspaces").update({ last_used_at: ago(200) }).eq("id", w.id);
      await db().rpc("claim_unused_warning", { p_workspace: w.id, p_days: 90, p_wait: asked });
      expect((await db().from("workspaces").select("unused_wait_days").eq("id", w.id).single()).data!.unused_wait_days).toBe(kept);
    }
  });
});

describe("Ziffr Cloud pins what it keeps fixed", () => {
  const PINNED = ["ZIFFR_DEFAULT_METRICS_LIMIT", "ZIFFR_DEFAULT_LIMIT_LABEL", "ZIFFR_LIMIT_GRACE_DAYS", "ZIFFR_LIMIT_GRACE_EVERY_DAYS", "ZIFFR_TRIAL_DAYS", "ZIFFR_TRIAL_GRACE_DAYS", "ZIFFR_DELETE_UNUSED_AFTER_DAYS", "ZIFFR_UNUSED_WAIT_DAYS"];

  it("shows them as set by Ziffr Cloud, refuses to change them, and ignores a value saved on the page before", async () => {
    const a = await admin();
    // A row an older version saved before this Installation was hosted by Ziffr Cloud.
    await db().from("installation_settings").upsert({ name: "ZIFFR_TRIAL_GRACE_DAYS", value: "30", sealed: false }).throwOnError();
    process.env.ZIFFR_CLOUD_KEY = "k".repeat(32);
    forgetStoredSettings();
    const view = await installationSettingsView(a);
    const byName = Object.fromEntries(view.sections.flatMap((s) => s.settings).map((s) => [s.name, s]));
    for (const name of PINNED) expect(byName[name].source, name).toBe("cloud");
    expect(byName.ZIFFR_KEEP_AUDIT_DAYS.source).toBe("none");
    expect(byName.ZIFFR_TRIAL_MAX.source).toBe("none");
    // The page's own value of before is not in effect: the built-in 7 days.
    expect((await settingsInEffect()).ZIFFR_TRIAL_GRACE_DAYS).toBeUndefined();
    for (const name of PINNED) {
      const section = settingNamed(name)!.section;
      const value = DAYS_SETTINGS[name] ? String(DAYS_SETTINGS[name].default) : name === "ZIFFR_DEFAULT_LIMIT_LABEL" ? "Free" : name === "ZIFFR_DELETE_UNUSED_AFTER_DAYS" ? "90" : "50";
      await expect(saveInstallationSettings(a, section, { [name]: value }), name).rejects.toThrow(/set by Ziffr Cloud/);
      await expect(saveInstallationSettings(a, section, { [name]: null }), name).rejects.toThrow(/set by Ziffr Cloud/);
    }
    // What stays the Operator's still saves.
    await saveInstallationSettings(a, "keep", { ZIFFR_KEEP_ACCESS_LOG_DAYS: "30" });
    // The server's own value is what a pinned setting has, shown as Ziffr Cloud's.
    process.env.ZIFFR_TRIAL_GRACE_DAYS = "10";
    expect((await settingsInEffect()).ZIFFR_TRIAL_GRACE_DAYS).toBe("10");
    expect(Object.fromEntries((await installationSettingsView(a)).sections.flatMap((s) => s.settings).map((s) => [s.name, s])).ZIFFR_TRIAL_GRACE_DAYS).toMatchObject({ source: "cloud", value: "10" });
  });

  it("refuses an Installation Admin's limit for a Workspace, which only Ziffr Cloud sets there", async () => {
    const a = await admin();
    const w = await ws();
    process.env.ZIFFR_CLOUD_KEY = "k".repeat(32);
    await expect(setWorkspaceLimit(a, w.id, { metrics: "50", label: "Small" })).rejects.toThrow(/set by Ziffr Cloud/);
    expect((await db().from("workspace_limits").select("workspace_id").eq("workspace_id", w.id)).data).toEqual([]);
    delete process.env.ZIFFR_CLOUD_KEY;
    await setWorkspaceLimit(a, w.id, { metrics: "50", label: "Small" });
    expect((await db().from("workspace_limits").select("metrics").eq("workspace_id", w.id).single()).data!.metrics).toBe(50);
  });

  it("pins nothing without a ZIFFR_CLOUD_KEY of 32 bytes", async () => {
    const a = await admin();
    process.env.ZIFFR_CLOUD_KEY = "short";
    expect((await installationSettingsView(a)).sections.flatMap((s) => s.settings).some((s) => s.source === "cloud")).toBe(false);
  });
});

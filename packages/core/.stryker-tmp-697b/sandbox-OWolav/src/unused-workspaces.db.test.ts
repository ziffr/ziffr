// @ts-nocheck
// Unused Workspaces against the real database (spec 0029, ticket #269): last use is kept by a sign-in and by a value;
// the warning goes once, after the days, to Owners only; the deletion waits 14 days and destroys the key first; a
// sign-in or a value in between stops it; a Workspace with a limit of its own, a trial and the demo are never touched.
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { recordSignIn } from "./audit-log";
import { db } from "./db";
import { forgetStoredSettings } from "./settings-in-effect";
import { DEMO_WORKSPACE_ID } from "./team";
import { workspace } from "./test/db-fixtures";
import { runUnusedWorkspaces, unusedAfterDays, unusedWorkspacesJob, workspaceValuesCsv } from "./unused-workspaces";
import { ensureWorkspaceKey } from "./workspace-keys";
import { syncDefaultLimit } from "./workspace-limits";

const DAY = 86_400_000;
const MAIL = { ZIFFR_SMTP_URL: "smtp://127.0.0.1:1", ZIFFR_MAIL_FROM: "ziffr@example.test", ZIFFR_SITE_URL: "https://ziffr.example.test" };
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const n of ["ZIFFR_DELETE_UNUSED_AFTER_DAYS", "ZIFFR_DEFAULT_METRICS_LIMIT", ...Object.keys(MAIL)]) delete process.env[n];
  forgetStoredSettings(); await syncDefaultLimit(true);
  for (const c of cleanups.splice(0)) await c().catch(() => {});
});
const state = async (id: string) => (await db().from("workspaces").select("last_used_at, unused_warned_at").eq("id", id).maybeSingle()).data;
const notices = async (id: string) => ((await db().from("deliveries").select("recipient_id").eq("workspace_id", id).eq("kind", "notice")).data ?? []).map((d) => d.recipient_id as string);

/** A Workspace with an Owner (with a sign-in, whose only Workspace it is), an Admin, a Metric and a Contact, unused
 * for `days`. */
async function unused(days: number) {
  const w = await workspace("Quiet"); cleanups.push(w.cleanup);
  const sara = await w.person("owner"); const adam = await w.person("admin");
  const { data: auth } = await db().auth.admin.createUser({ email: `quiet-${randomUUID().slice(0, 8)}@example.test`, email_confirm: true });
  await db().from("profiles").update({ auth_user_id: auth.user!.id }).eq("id", sara);
  cleanups.push(async () => { await db().auth.admin.deleteUser(auth.user!.id).catch(() => {}); });
  const m = await w.metric(sara);
  const cleo = await w.contact({ email: "cleo@quiet.test" });
  await ensureWorkspaceKey(w.id);
  await db().from("workspaces").update({ last_used_at: ago(days) }).eq("id", w.id);
  return { w, sara, adam, m, cleo, authId: auth.user!.id };
}

describe("the setting", () => {
  it("is on only with a whole number from 30 to 3650 and a default limit", () => {
    expect(unusedAfterDays({})).toBeNull();
    expect(unusedAfterDays({ ZIFFR_DELETE_UNUSED_AFTER_DAYS: "90" })).toBeNull();
    expect(unusedAfterDays({ ZIFFR_DELETE_UNUSED_AFTER_DAYS: "90", ZIFFR_DEFAULT_METRICS_LIMIT: "10", ...MAIL })).toBe(90);
    // The warning must reach the Owners by email: without mail, nothing is warned or deleted.
    expect(unusedAfterDays({ ZIFFR_DELETE_UNUSED_AFTER_DAYS: "90", ZIFFR_DEFAULT_METRICS_LIMIT: "10" })).toBeNull();
    for (const bad of ["7", "90d", "4000", "-90"]) expect(unusedAfterDays({ ZIFFR_DELETE_UNUSED_AFTER_DAYS: bad, ZIFFR_DEFAULT_METRICS_LIMIT: "10", ...MAIL })).toBeNull();
  });
});

describe("last use", () => {
  it("is kept by a sign-in and by a value, and either clears the warning", async () => {
    const { w, sara, m } = await unused(100);
    await db().from("workspaces").update({ unused_warned_at: ago(1) }).eq("id", w.id);
    await recordSignIn(sara);
    expect(await state(w.id)).toMatchObject({ unused_warned_at: null });
    expect(new Date((await state(w.id))!.last_used_at).getTime()).toBeGreaterThan(Date.now() - 60_000);
    await db().from("workspaces").update({ last_used_at: ago(100), unused_warned_at: ago(1) }).eq("id", w.id);
    await w.value(m.id, "2026-10-01", 3);
    expect(await state(w.id)).toMatchObject({ unused_warned_at: null });
  });
});

describe("the warning and the deletion", () => {
  /** The warning sent `daysAgo` days ago, after `unusedFor` days without use before it. */
  /** The warning claimed `daysAgo` days ago after `unusedFor` days without use, and its email sent then. */
  const warnedAgo = async (id: string, daysAgo: number, unusedFor = 100, sent = true) => {
    await db().from("workspaces").update({ unused_warned_at: ago(daysAgo), last_used_at: ago(daysAgo + unusedFor) }).eq("id", id);
    if (!sent) return;
    const { data: owner } = await db().from("memberships").select("user_id").eq("workspace_id", id).eq("role", "owner").limit(1).single();
    await db().from("deliveries").insert({ connector: "email", recipient_id: owner!.user_id, sender_id: null, kind: "notice", workspace_id: id, subject: "Your Ziffr Workspace will be deleted", body: "test", mail_state: "sent", created_at: ago(daysAgo) });
  };
  const run = () => runUnusedWorkspaces(90);

  it("warn the Owners once by email after the days, delete 14 days later with the key first, and take the lone Owner along", async () => {
    const { w, sara, adam, cleo, authId } = await unused(100);
    await run();
    expect(await notices(w.id)).toEqual([sara]);
    const { data: sent } = await db().from("deliveries").select("connector").eq("workspace_id", w.id).eq("kind", "notice");
    expect(sent?.map((d) => d.connector)).toEqual(["email"]);
    await run();
    expect(await notices(w.id)).toEqual([sara]);
    expect(adam).not.toBe(sara);
    // Not before 14 days.
    expect(await state(w.id)).not.toBeNull();
    await warnedAgo(w.id, 15);
    await run();
    expect(await state(w.id)).toBeNull();
    expect((await db().from("workspace_keys").select("workspace_id").eq("workspace_id", w.id)).data).toEqual([]);
    const { data: lines } = await db().from("installation_audit_events").select("kind").eq("subject", w.id).order("id");
    expect(lines?.map((l) => l.kind)).toEqual(["workspace.key_destroyed", "workspace.deleted_unused"]);
    expect((await db().from("profiles").select("id").in("id", [sara, cleo])).data).toEqual([]);
    expect((await db().auth.admin.getUserById(authId)).data.user).toBeNull();
  });

  it("are stopped by use in between, and never touch a limit of its own, a trial, a recent Workspace or the demo (which no write reaches)", async () => {
    const quiet = await unused(100);
    const sized = await unused(100); await sized.w.limit(50, "Small");
    const trial = await unused(100); await db().from("workspaces").update({ trial_ends_at: new Date(Date.now() + 5 * DAY).toISOString() }).eq("id", trial.w.id);
    const recent = await unused(10);
    await run();
    expect((await state(quiet.w.id))!.unused_warned_at).not.toBeNull();
    for (const x of [sized, trial, recent]) expect((await state(x.w.id))!.unused_warned_at).toBeNull();
    expect((await state(DEMO_WORKSPACE_ID))!.unused_warned_at).toBeNull();
    // A sign-in after the warning keeps it, even once the 14 days are over.
    await recordSignIn(quiet.sara);
    await db().from("workspaces").update({ unused_warned_at: ago(15), last_used_at: ago(1) }).eq("id", quiet.w.id);
    await run();
    expect(await state(quiet.w.id)).not.toBeNull();
    // A value that replaces a period's value is use too.
    const v = await quiet.w.value(quiet.m.id, "2026-08-01", 1);
    await warnedAgo(quiet.w.id, 15);
    await db().from("observations").update({ value: 2 }).eq("id", v);
    expect((await state(quiet.w.id))!.unused_warned_at).toBeNull();
    // A Workspace warned but on a limit of its own is not deleted either, and setting a limit ends the warning.
    await warnedAgo(sized.w.id, 15);
    await run();
    expect(await state(sized.w.id)).not.toBeNull();
    await warnedAgo(quiet.w.id, 15);
    await quiet.w.limit(20);
    expect((await state(quiet.w.id))!.unused_warned_at).toBeNull();
  });

  it("never delete when the warning email was not sent", async () => {
    const { w } = await unused(100);
    await warnedAgo(w.id, 15, 100, false);
    await db().from("deliveries").insert({ connector: "email", recipient_id: (await db().from("memberships").select("user_id").eq("workspace_id", w.id).eq("role", "owner").limit(1).single()).data!.user_id, sender_id: null, kind: "notice", workspace_id: w.id, subject: "Your Ziffr Workspace will be deleted", body: "test", mail_state: "outbox", created_at: ago(15) });
    await run();
    expect(await state(w.id)).not.toBeNull();
  });

  it("never delete on a stale warning or one sent before enough days without use", async () => {
    const stale = await unused(400);
    await warnedAgo(stale.w.id, 60, 300);
    const early = await unused(400);
    await warnedAgo(early.w.id, 15, 30);
    await run();
    expect(await state(stale.w.id)).not.toBeNull();
    expect(await state(early.w.id)).not.toBeNull();
    // The stale one is warned afresh instead.
    expect(new Date((await state(stale.w.id))!.unused_warned_at!).getTime()).toBeGreaterThan(Date.now() - 60_000);
  });

  it("keep an Installation Admin whose only Workspace goes", async () => {
    const { w, sara } = await unused(100);
    await db().from("installation_admins").insert({ person_id: sara });
    cleanups.push(async () => { await db().from("installation_admins").delete().eq("person_id", sara); await db().from("profiles").delete().eq("id", sara); });
    await warnedAgo(w.id, 15);
    await run();
    expect(await state(w.id)).toBeNull();
    expect((await db().from("profiles").select("id").eq("id", sara)).data).toEqual([{ id: sara }]);
  });

  it("do nothing where the rule is off", async () => {
    const { w } = await unused(400);
    expect(await unusedWorkspacesJob()).toEqual({ warned: 0, deleted: 0 });
    expect((await state(w.id))!.unused_warned_at).toBeNull();
    process.env.ZIFFR_DELETE_UNUSED_AFTER_DAYS = "90"; process.env.ZIFFR_DEFAULT_METRICS_LIMIT = "10"; Object.assign(process.env, MAIL); forgetStoredSettings();
    expect((await unusedWorkspacesJob()).warned).toBeGreaterThanOrEqual(1);
  });
});

describe("downloading the values first", () => {
  it("gives Owners and Admins the values of the Metrics they see, and nobody else", async () => {
    const { w, sara, adam, m } = await unused(100);
    await w.value(m.id, "2026-09-01", 7);
    const ben = await w.person("member");
    const hidden = await w.metric(ben, { name: "Ben's secret" });
    await w.value(hidden.id, "2026-09-01", 99);
    const csv = await workspaceValuesCsv(w.actor(sara));
    expect(csv).toContain("2026-09-01");
    expect(csv).not.toContain("Ben's secret");
    expect(await workspaceValuesCsv(w.actor(adam, "admin"))).not.toContain(m.slug);
    await expect(workspaceValuesCsv(w.actor(ben, "member"))).rejects.toThrow("Only Owners and Admins");
  });
});

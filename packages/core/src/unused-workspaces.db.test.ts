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
import { deleteUnusedWorkspaces, unusedAfterDays, unusedWorkspacesJob, warnUnusedWorkspaces, workspaceValuesCsv } from "./unused-workspaces";
import { ensureWorkspaceKey } from "./workspace-keys";
import { syncDefaultLimit } from "./workspace-limits";

const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const n of ["ZIFFR_DELETE_UNUSED_AFTER_DAYS", "ZIFFR_DEFAULT_METRICS_LIMIT"]) delete process.env[n];
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
    expect(unusedAfterDays({ ZIFFR_DELETE_UNUSED_AFTER_DAYS: "90", ZIFFR_DEFAULT_METRICS_LIMIT: "10" })).toBe(90);
    for (const bad of ["7", "90d", "4000", "-90"]) expect(unusedAfterDays({ ZIFFR_DELETE_UNUSED_AFTER_DAYS: bad, ZIFFR_DEFAULT_METRICS_LIMIT: "10" })).toBeNull();
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
  it("warn the Owners once after the days, delete 14 days later with the key first, and take the lone Owner along", async () => {
    const { w, sara, adam, cleo, authId } = await unused(100);
    expect(await warnUnusedWorkspaces(90)).toBeGreaterThanOrEqual(1);
    expect(await notices(w.id)).toEqual([sara]);
    expect(await warnUnusedWorkspaces(90)).toBe(0);
    expect(await notices(w.id)).toEqual([sara]);
    expect(adam).not.toBe(sara);
    // Not before 14 days.
    expect(await deleteUnusedWorkspaces()).toBe(0);
    expect(await state(w.id)).not.toBeNull();
    await db().from("workspaces").update({ unused_warned_at: ago(15) }).eq("id", w.id);
    expect(await deleteUnusedWorkspaces()).toBeGreaterThanOrEqual(1);
    expect(await state(w.id)).toBeNull();
    expect((await db().from("workspace_keys").select("workspace_id").eq("workspace_id", w.id)).data).toEqual([]);
    const { data: lines } = await db().from("installation_audit_events").select("kind").eq("subject", w.id).order("id");
    expect(lines?.map((l) => l.kind)).toEqual(["workspace.key_destroyed", "workspace.deleted_unused"]);
    expect((await db().from("profiles").select("id").in("id", [sara, cleo])).data).toEqual([]);
    expect((await db().auth.admin.getUserById(authId)).data.user).toBeNull();
  });

  it("are stopped by a sign-in in between, and never touch a limit of its own, a trial, a recent Workspace or the demo (which no write reaches)", async () => {
    const quiet = await unused(100);
    const sized = await unused(100); await sized.w.limit(50, "Small");
    const trial = await unused(100); await db().from("workspaces").update({ trial_ends_at: new Date(Date.now() + 5 * DAY).toISOString() }).eq("id", trial.w.id);
    const recent = await unused(10);
    await warnUnusedWorkspaces(90);
    expect((await state(quiet.w.id))!.unused_warned_at).not.toBeNull();
    for (const x of [sized, trial, recent]) expect((await state(x.w.id))!.unused_warned_at).toBeNull();
    expect((await state(DEMO_WORKSPACE_ID))!.unused_warned_at).toBeNull();
    // A sign-in after the warning keeps it, even once the 14 days are over.
    await recordSignIn(quiet.sara);
    await db().from("workspaces").update({ unused_warned_at: ago(15), last_used_at: ago(1) }).eq("id", quiet.w.id);
    expect(await deleteUnusedWorkspaces()).toBe(0);
    expect(await state(quiet.w.id)).not.toBeNull();
    // A Workspace marked as warned by hand but on a limit of its own is not deleted either.
    await db().from("workspaces").update({ unused_warned_at: ago(30), last_used_at: ago(200) }).eq("id", sized.w.id);
    expect(await deleteUnusedWorkspaces()).toBe(0);
  });

  it("do nothing where the rule is off", async () => {
    const { w } = await unused(400);
    expect(await unusedWorkspacesJob()).toEqual({ warned: 0, deleted: 0 });
    expect((await state(w.id))!.unused_warned_at).toBeNull();
    process.env.ZIFFR_DELETE_UNUSED_AFTER_DAYS = "90"; process.env.ZIFFR_DEFAULT_METRICS_LIMIT = "10"; forgetStoredSettings();
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

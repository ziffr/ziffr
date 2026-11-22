// How a trial ends on hosted Ziffr, against the real database (spec 0040, #679): it closes and is deleted, never made
// Free. Ziffr Cloud's endTrial (an Owner subscribed) keeps the Workspace with its keys and View Links on the dates they
// were made for, and its cancel closes a subscribed Workspace like an ended trial. One default Workspace per person.
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { createAccessKey } from "./access-keys";
import { cancelCloudWorkspace, CloudConflict, CloudNotFound, cloudWorkspace, reopenCloudWorkspace, setCloudLimit } from "./cloud-api";
import { db } from "./db";
import { createWorkspace } from "./page-data";
import { forgetStoredSettings } from "./settings-in-effect";
import { closeCancelledWorkspace, closeEndedTrials, deleteExpiredTrials, trialStatus } from "./trial-end";
import { keepTrial as keepTrialNow, trialHoldsBack } from "./trials";
import { opened, workspace } from "./test/db-fixtures";
import { DefaultWorkspaceTaken, syncDefaultLimit } from "./workspace-limits";

const HOUR = 3_600_000;
const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const name of ["ZIFFR_DEFAULT_METRICS_LIMIT", "ZIFFR_DEFAULT_LIMIT_LABEL", "ZIFFR_ONE_DEFAULT_PER_PERSON"]) delete process.env[name];
  forgetStoredSettings(); await syncDefaultLimit(true);
  for (const c of cleanups.splice(0)) await c().catch(() => {});
});

/** A Trial Workspace ending `hours` from now, with an Owner, a Contact, three Metrics and a key asking for 90 days. */
async function trial(hours: number) {
  const w = await workspace("Trial");
  cleanups.push(async () => { await db().from("access_keys").delete().eq("workspace_id", w.id); await w.cleanup(); });
  const owner = await w.person("owner"); const ben = await w.contact({ email: `ben-${randomUUID().slice(0, 8)}@example.test` });
  for (let i = 0; i < 3; i++) await w.metric(owner, { name: `M${i}` });
  await db().from("workspaces").update({ trial_ends_at: new Date(Date.now() + 2 * HOUR).toISOString() }).eq("id", w.id);
  const { id: keyId } = await createAccessKey(w.actor(owner), { name: "Script", scopes: ["metrics:read"], expiresOn: day(90) });
  await db().from("workspaces").update({ trial_ends_at: new Date(Date.now() + hours * HOUR).toISOString() }).eq("id", w.id);
  return { w, owner, ben, keyId };
}
const row = async (id: string) => (await db().from("workspaces").select("trial_ends_at, trial_ended_at, trial_kept_at, trial_closed_at, over_limit_since").eq("id", id).single()).data!;
const keyEnds = async (id: number) => (await db().from("access_keys").select("expires_on, revoked_at").eq("id", id).single()).data!;

describe("an ended trial", () => {
  it("closes at its end: keys revoked, never turned into a Free Workspace", async () => {
    const { w, ben, keyId } = await trial(1);
    await db().from("workspaces").update({ trial_ends_at: new Date(Date.now() - HOUR).toISOString() }).eq("id", w.id);
    expect(await closeEndedTrials()).toBeGreaterThanOrEqual(1);
    const r = await row(w.id);
    expect(r.trial_closed_at).not.toBeNull();
    expect(r).toMatchObject({ trial_kept_at: null });
    expect((await keyEnds(keyId)).revoked_at).not.toBeNull();
    expect(await trialHoldsBack(w.id, ben)).not.toBeNull();
    expect(await trialStatus(w.id)).toMatchObject({ ended: true, cancelled: false });
  });

  it("is closed the first time something asks only by the hourly job, and stays a trial until then", async () => {
    const { w } = await trial(-1);
    expect(await trialStatus(w.id)).toMatchObject({ ended: true });
    expect((await row(w.id)).trial_kept_at).toBeNull();
  });
});

describe("Ziffr Cloud's endTrial", () => {
  it("turns a running trial into an ordinary Workspace with the limit it sets, with its keys and View Links on the dates they were made for", async () => {
    const { w, owner, keyId } = await trial(48);
    const { data: board } = await db().from("dashboards").insert({ name: "Board", owner_id: owner, workspace_id: w.id }).select("id").single();
    const link = async (expires: string) => (await db().from("view_links").insert({ token: randomUUID(), object_type: "dashboard", object_id: board!.id, created_by: owner, label: "", expires_at: expires, workspace_id: w.id }).select("id").single()).data!.id as number;
    const late = await link(day(60));
    const early = await link(day(1));
    const ends = async (id: number) => (await db().from("view_links").select("expires_at").eq("id", id).single()).data!.expires_at;
    expect(await ends(late)).toBe(day(2));
    expect(await ends(early)).toBe(day(1));
    const after = await setCloudLimit({ cloud: true }, w.id, { metrics: 50, label: "Small", endTrial: true });
    expect(after).toMatchObject({ trial_ends_at: null, limit: 50, label: "Small", set_by: "cloud" });
    expect((await row(w.id)).trial_kept_at).not.toBeNull();
    expect(await ends(late)).toBe(day(60));
    expect(await ends(early)).toBe(day(1));
    expect((await keyEnds(keyId)).expires_on).toBe(day(90));
    expect((await cloudWorkspace({ cloud: true }, w.id)).over_limit_since).toBeNull();
    await db().from("installation_audit_events").delete().eq("subject", w.id);
  });
});

describe("Ziffr Cloud's cancel", () => {
  it("closes a subscribed Workspace like an ended trial, tells its Owner first, and deletes it after the grace days", async () => {
    const { w, owner, keyId } = await trial(48);
    await setCloudLimit({ cloud: true }, w.id, { metrics: 50, label: "Small", endTrial: true });
    expect(await trialStatus(w.id)).toBeNull();
    const after = await cancelCloudWorkspace({ cloud: true }, w.id);
    expect(after.trial_ends_at).not.toBeNull();
    const r = await db().from("workspaces").select("trial_ends_at, trial_kept_at, trial_closed_at, closed_because").eq("id", w.id).single();
    expect(r.data).toMatchObject({ trial_kept_at: null, closed_because: "cancelled" });
    expect(r.data!.trial_closed_at).not.toBeNull();
    expect((await keyEnds(keyId)).revoked_at).not.toBeNull();
    expect(await trialStatus(w.id, "owner")).toMatchObject({ ended: true, cancelled: true });
    // Told first: the notice left before the Workspace closed, with the day and the export.
    const notices = await opened("deliveries", w.id, (await db().from("deliveries").select("id, subject, body, last_error").eq("workspace_id", w.id).eq("kind", "notice").eq("recipient_id", owner)).data);
    expect(notices).toHaveLength(1);
    expect(notices[0].subject).toBe("Your Ziffr Size was cancelled");
    expect(notices[0].body).toContain("Workspace Export");
    expect(notices[0].body).toContain("/settings/export");
    // Not held back by the closing that follows it.
    expect(String(notices[0].last_error ?? "")).not.toMatch(/ended/);
    // The same call twice closes it once.
    await cancelCloudWorkspace({ cloud: true }, w.id);
    expect((await opened("deliveries", w.id, (await db().from("deliveries").select("id, body").eq("workspace_id", w.id).eq("kind", "notice")).data))).toHaveLength(1);
    // Not yet deleted inside its grace days; deleted after them.
    expect(await deleteExpiredTrials(new Date(Date.now() + 2 * 86_400_000))).toBeGreaterThanOrEqual(0);
    expect((await db().from("workspaces").select("id").eq("id", w.id).maybeSingle()).data).not.toBeNull();
    await deleteExpiredTrials(new Date(Date.now() + 9 * 86_400_000));
    expect((await db().from("workspaces").select("id").eq("id", w.id).maybeSingle()).data).toBeNull();
    await db().from("installation_audit_events").delete().eq("subject", w.id);
  });

  it("tells the people who would lose their account, and no one else, with no names for a Guest", async () => {
    const { w, owner } = await trial(48);
    const lone = await w.person("member");
    const guest = await w.person("guest");
    const elsewhere = await w.person("member");
    const other = await workspace("Other");
    cleanups.push(other.cleanup);
    await db().from("memberships").insert({ workspace_id: other.id, user_id: elsewhere, role: "member" }).throwOnError();
    await setCloudLimit({ cloud: true }, w.id, { metrics: 50, label: "Small", endTrial: true });
    await cancelCloudWorkspace({ cloud: true }, w.id);
    const to = async (id: string) => await opened("deliveries", w.id, (await db().from("deliveries").select("id, subject, body").eq("workspace_id", w.id).eq("kind", "notice").eq("recipient_id", id)).data);
    const [forLone, forGuest, forElsewhere, forOwner] = [await to(lone), await to(guest), await to(elsewhere), await to(owner)];
    expect(forLone).toHaveLength(1);
    expect(forLone[0].body).toContain("account with it");
    expect(forLone[0].body).toMatch(/deleted with everything in it/);
    expect(forGuest).toHaveLength(1);
    expect(forGuest[0].body).toContain("whoever invited you");
    expect(forElsewhere).toHaveLength(0);
    expect(forOwner).toHaveLength(1);
    await db().from("installation_audit_events").delete().eq("subject", w.id);
  });

  it("emails once when two calls arrive together", async () => {
    const { w, owner } = await trial(48);
    await setCloudLimit({ cloud: true }, w.id, { metrics: 50, label: "Small", endTrial: true });
    await Promise.all([cancelCloudWorkspace({ cloud: true }, w.id), cancelCloudWorkspace({ cloud: true }, w.id)]);
    expect(await opened("deliveries", w.id, (await db().from("deliveries").select("id, body").eq("workspace_id", w.id).eq("kind", "notice").eq("recipient_id", owner)).data)).toHaveLength(1);
    expect((await row(w.id)).trial_closed_at).not.toBeNull();
    await db().from("installation_audit_events").delete().eq("subject", w.id);
  });

  it("refuses a trial, a Workspace Ziffr Cloud sold no Size of, and the demo; answers 404 for one that does not exist", async () => {
    const { w } = await trial(48);
    await expect(cancelCloudWorkspace({ cloud: true }, w.id)).rejects.toBeInstanceOf(CloudConflict);
    expect((await row(w.id)).trial_closed_at).toBeNull();
    expect(await trialStatus(w.id)).toMatchObject({ ended: false, cancelled: false });
    // Subscribed by an Installation Admin's limit, not Ziffr Cloud's: refused too.
    await keepTrialNow(w.id);
    await db().from("workspace_limits").upsert({ workspace_id: w.id, metrics: 50, set_by: "installation_admin" }).throwOnError();
    await expect(cancelCloudWorkspace({ cloud: true }, w.id)).rejects.toBeInstanceOf(CloudConflict);
    expect(await closeCancelledWorkspace(w.id)).toBe("refused");
    await expect(cancelCloudWorkspace({ cloud: true }, randomUUID())).rejects.toBeInstanceOf(CloudNotFound);
    await expect(cancelCloudWorkspace({ cloud: true }, "d3e00000-0000-4000-8000-000000000001")).rejects.toBeInstanceOf(CloudNotFound);
    expect(await closeCancelledWorkspace("d3e00000-0000-4000-8000-000000000001")).toBe("refused");
  });

  it("can be undone during the grace days, keeps its data, leaves keys revoked, and refuses what was not cancelled", async () => {
    const { w, owner, keyId } = await trial(48);
    const m = await w.metric(owner, { name: "Kept" });
    await setCloudLimit({ cloud: true }, w.id, { metrics: 50, label: "Small", endTrial: true });
    await expect(reopenCloudWorkspace({ cloud: true }, w.id)).rejects.toBeInstanceOf(CloudConflict);
    await cancelCloudWorkspace({ cloud: true }, w.id);
    expect((await keyEnds(keyId)).revoked_at).not.toBeNull();
    const after = await reopenCloudWorkspace({ cloud: true }, w.id);
    expect(after.trial_ends_at).toBeNull();
    expect(await trialStatus(w.id)).toBeNull();
    expect((await row(w.id)).trial_closed_at).toBeNull();
    expect((await keyEnds(keyId)).revoked_at).not.toBeNull();
    expect((await db().from("metrics").select("id").eq("id", m.id).maybeSingle()).data).not.toBeNull();
    // Reopened: the hourly deletion never takes it, even long after the grace days.
    await deleteExpiredTrials(new Date(Date.now() + 30 * 86_400_000));
    expect((await db().from("workspaces").select("id").eq("id", w.id).maybeSingle()).data).not.toBeNull();
    await expect(reopenCloudWorkspace({ cloud: true }, w.id)).rejects.toBeInstanceOf(CloudConflict);
    // After the deletion there is nothing to reopen.
    const gone = await trial(48);
    await setCloudLimit({ cloud: true }, gone.w.id, { metrics: 50, label: "Small", endTrial: true });
    await cancelCloudWorkspace({ cloud: true }, gone.w.id);
    await deleteExpiredTrials(new Date(Date.now() + 9 * 86_400_000));
    await expect(reopenCloudWorkspace({ cloud: true }, gone.w.id)).rejects.toBeInstanceOf(CloudNotFound);
    await db().from("installation_audit_events").delete().in("subject", [w.id, gone.w.id]);
  });
});

describe("one default Workspace per person", () => {
  it("refuses a second Workspace on the default limit where the rule is on, never where it is off", async () => {
    const w = await workspace(); cleanups.push(w.cleanup);
    const sara = await w.person("owner");
    const made: string[] = [];
    cleanups.push(async () => { for (const id of made) await db().from("workspaces").delete().eq("id", id); });
    made.push(await createWorkspace(sara, `Second ${randomUUID().slice(0, 4)}`));
    process.env.ZIFFR_ONE_DEFAULT_PER_PERSON = "1";
    // Without a default limit there is no "free" Workspace to count.
    made.push(await createWorkspace(sara, "Third"));
    process.env.ZIFFR_DEFAULT_METRICS_LIMIT = "10"; forgetStoredSettings(); await syncDefaultLimit(true);
    await expect(createWorkspace(sara, "Fourth")).rejects.toBeInstanceOf(DefaultWorkspaceTaken);
    // A Workspace with a limit of its own (a Size) does not count.
    for (const id of [w.id, ...made]) await db().from("workspace_limits").insert({ workspace_id: id, metrics: 50, set_by: "cloud" });
    made.push(await createWorkspace(sara, "Fifth"));
  });
});

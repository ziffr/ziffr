// Trials kept as ordinary Workspaces, against the real database (spec 0029, ticket #268): with ZIFFR_TRIAL_THEN=keep a
// trial at its end becomes an ordinary Workspace on the default limit; invitations open, Connectors reach everyone,
// keys keep their own end dates, and the grace starts when it holds more than the limit. With the default (delete),
// spec 0021's end is unchanged. Ziffr Cloud's endTrial ends a trial at once. One default Workspace per person.
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { createAccessKey } from "./access-keys";
import { cloudWorkspace, setCloudLimit } from "./cloud-api";
import { db } from "./db";
import { createWorkspace } from "./page-data";
import { forgetStoredSettings } from "./settings-in-effect";
import { closeEndedTrials, keptWords, remindEndingTrials, trialStatus } from "./trial-end";
import { assertNotTrial, trialHoldsBack } from "./trials";
import { opened, workspace } from "./test/db-fixtures";
import { DefaultWorkspaceTaken, syncDefaultLimit } from "./workspace-limits";

const HOUR = 3_600_000;
const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const name of ["ZIFFR_TRIAL_THEN", "ZIFFR_DEFAULT_METRICS_LIMIT", "ZIFFR_DEFAULT_LIMIT_LABEL", "ZIFFR_ONE_DEFAULT_PER_PERSON"]) delete process.env[name];
  forgetStoredSettings(); await syncDefaultLimit(true);
  for (const c of cleanups.splice(0)) await c().catch(() => {});
});
/** Trials kept, on a default of 2 Metrics called Free. */
async function keepOnFree() {
  process.env.ZIFFR_TRIAL_THEN = "keep"; process.env.ZIFFR_DEFAULT_METRICS_LIMIT = "2"; process.env.ZIFFR_DEFAULT_LIMIT_LABEL = "Free";
  forgetStoredSettings(); await syncDefaultLimit(true);
}

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

describe("a trial kept as an ordinary Workspace", () => {
  it("says in the bar and the reminder what it then stays on", async () => {
    await keepOnFree();
    const { w } = await trial(12);
    const status = await trialStatus(w.id);
    expect(status?.keptAs).toEqual({ label: "Free", metrics: 2 });
    expect(keptWords("2026-12-03T10:00:00Z", status!.keptAs!)).toBe("Your trial ends on 3 December. Your Workspace then stays, on Free: up to 2 Metrics.");
    expect(await remindEndingTrials()).toBe(1);
    const data = await opened("deliveries", w.id, (await db().from("deliveries").select("id, body").eq("workspace_id", w.id).eq("kind", "notice")).data);
    expect(data[0].body).toContain("Your Workspace then stays, on Free: up to 2 Metrics.");
  });

  it("becomes ordinary at its end: invitations open, everyone is reached, keys keep their dates, the grace starts", async () => {
    await keepOnFree();
    const { w, ben, keyId } = await trial(1);
    expect((await keyEnds(keyId)).expires_on).not.toBe(day(90));
    await expect(assertNotTrial(w.id, "Inviting people")).rejects.toThrow();
    expect(await trialHoldsBack(w.id, ben)).not.toBeNull();
    await db().from("workspaces").update({ trial_ends_at: new Date(Date.now() - HOUR).toISOString() }).eq("id", w.id);
    expect(await closeEndedTrials()).toBe(1);
    const r = await row(w.id);
    expect(r).toMatchObject({ trial_ends_at: null, trial_closed_at: null });
    expect(r.trial_kept_at).not.toBeNull();
    expect(r.trial_ended_at).not.toBeNull();
    // Three Metrics on a default of two: over the limit, the 14 days start.
    expect(r.over_limit_since).not.toBeNull();
    expect(await keyEnds(keyId)).toEqual({ expires_on: day(90), revoked_at: null });
    await expect(assertNotTrial(w.id, "Inviting people")).resolves.toBeUndefined();
    expect(await trialHoldsBack(w.id, ben)).toBeNull();
    expect(await trialStatus(w.id)).toBeNull();
    expect(await closeEndedTrials()).toBe(0);
  });

  it("becomes ordinary the first time anything asks after its end, before the hourly job", async () => {
    await keepOnFree();
    const { w } = await trial(-1);
    expect(await trialStatus(w.id)).toBeNull();
    expect((await row(w.id)).trial_kept_at).not.toBeNull();
  });

  it("with the default (delete), closes as spec 0021 says", async () => {
    const { w, keyId } = await trial(-1);
    expect(await closeEndedTrials()).toBeGreaterThanOrEqual(1);
    expect((await row(w.id)).trial_closed_at).not.toBeNull();
    expect((await keyEnds(keyId)).revoked_at).not.toBeNull();
  });
});

describe("Ziffr Cloud's endTrial", () => {
  it("turns a running trial into an ordinary Workspace with the limit it sets, whatever ZIFFR_TRIAL_THEN says", async () => {
    const { w } = await trial(48);
    const after = await setCloudLimit({ cloud: true }, w.id, { metrics: 50, label: "Small", endTrial: true });
    expect(after).toMatchObject({ trial_ends_at: null, limit: 50, label: "Small", set_by: "cloud" });
    expect((await row(w.id)).trial_kept_at).not.toBeNull();
    expect((await cloudWorkspace({ cloud: true }, w.id)).over_limit_since).toBeNull();
    await db().from("installation_audit_events").delete().eq("subject", w.id);
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

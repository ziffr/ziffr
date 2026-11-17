// Automatic Snapshots (spec 0013, ticket #176; spec 0020), against the database: who sets them, when the daily run takes them
// (on Lock or after the wait), once per period, never again after a deletion, and the owner told.
import { afterEach, describe, expect, it } from "vitest";
import { Forbidden } from "./actor";
import { db } from "./db";
import { createDashboard, placeWidget } from "./dashboards";
import { share } from "./sharing";
import { setAutoSnapshots, takeDueSnapshots, type AutoSnapshotEffects } from "./auto-snapshots";
import { deleteSnapshot, listSnapshots } from "./snapshots";
import { removeMember } from "./handover";
import { workspace } from "./test/db-fixtures";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws(name?: string) { const w = await workspace(name); cleanups.push(w.cleanup); return w; }
const forbidden = expect.any(Forbidden);

/** Notices kept instead of sent. */
function fakeNotices() {
  const sent: { ws: string; recipientId: string; subject: string; link: string }[] = [];
  const effects: AutoSnapshotEffects = { notify: async (ws, n) => { sent.push({ ws, recipientId: n.recipientId, subject: n.subject, link: n.link }); } };
  return { sent, effects };
}

/** A dashboard with one monthly Metric, its owner and an Editor. */
async function setup() {
  const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member");
  const rev = await w.metric(sara, { name: "Revenue" });
  await w.value(rev.id, "2026-10-01", 100);
  const dash = await createDashboard(w.actor(sara), "Monthly");
  await placeWidget(w.actor(sara), dash, { type: "metric", id: rev.id });
  await share(w.actor(sara), "dashboard", dash, ben, "editor");
  return { w, owner: w.actor(sara), ben: w.actor(ben, "member"), rev, dash };
}

describe("automatic Snapshots", () => {
  it("are set by the dashboard's owner only, to week, month, quarter, half-year, year or none, with a wait within bounds", async () => {
    const { owner, ben, dash } = await setup();
    await setAutoSnapshots(owner, dash, { every: "month", waitDays: 3 });
    expect((await db().from("dashboards").select("snapshot_every, snapshot_wait_days").eq("id", dash).single()).data).toEqual({ snapshot_every: "month", snapshot_wait_days: 3 });
    await expect(setAutoSnapshots(ben, dash, { every: "week", waitDays: 3 })).rejects.toEqual(forbidden);
    await expect(setAutoSnapshots(owner, dash, { every: "day", waitDays: 3 })).rejects.toThrow(/week, month, quarter, half-year or year/);
    for (const every of ["half", "year"]) {
      await setAutoSnapshots(owner, dash, { every, waitDays: 30 });
      expect((await db().from("dashboards").select("snapshot_every").eq("id", dash).single()).data?.snapshot_every).toBe(every);
    }
    await expect(setAutoSnapshots(owner, dash, { every: "month", waitDays: 61 })).rejects.toThrow(/between 0 and 60/);
    await setAutoSnapshots(owner, dash, { every: null, waitDays: 5 });
    expect((await db().from("dashboards").select("snapshot_every").eq("id", dash).single()).data?.snapshot_every).toBeNull();
  });

  it("wait for the Locks or the set days after the period, then take it once, as the owner's draft, and tell the owner", async () => {
    const { w, owner, rev, dash } = await setup();
    await setAutoSnapshots(owner, dash, { every: "month", waitDays: 5 });
    const { sent, effects } = fakeNotices();
    // 2 Nov: October is complete but not Locked, and five days have not passed.
    expect(await takeDueSnapshots(w.id, "2026-11-02", effects)).toEqual({ taken: 0, failed: 0 });
    // Locked: taken at once, before the wait is over.
    await w.lock(rev.id, "2026-10-01");
    expect(await takeDueSnapshots(w.id, "2026-11-03", effects)).toEqual({ taken: 1, failed: 0 });
    const [s] = await listSnapshots(owner, dash);
    expect(s).toMatchObject({ label: "October 2026", automatic: true, takenBy: owner.personId, shownAt: null });
    expect(sent).toEqual([{ ws: w.id, recipientId: owner.personId, subject: "Snapshot of October 2026 ready to write up", link: `/dashboards/${dash}/snapshots/${s.id}` }]);
    // Once per period, also after it is deleted.
    expect(await takeDueSnapshots(w.id, "2026-11-20", effects)).toEqual({ taken: 0, failed: 0 });
    await deleteSnapshot(owner, s.id);
    expect(await takeDueSnapshots(w.id, "2026-11-21", effects)).toEqual({ taken: 0, failed: 0 });
  });

  it("take it after the wait without Locks, and a quarter only once its every month is Locked", async () => {
    const { w, owner, rev, dash } = await setup();
    await setAutoSnapshots(owner, dash, { every: "month", waitDays: 5 });
    const { effects } = fakeNotices();
    // October ends on the 31st: five days later is 5 November.
    expect(await takeDueSnapshots(w.id, "2026-11-04", effects)).toEqual({ taken: 0, failed: 0 });
    expect(await takeDueSnapshots(w.id, "2026-11-05", effects)).toEqual({ taken: 1, failed: 0 });
    const q = await createDashboard(owner, "Quarterly");
    await placeWidget(owner, q, { type: "metric", id: rev.id });
    await setAutoSnapshots(owner, q, { every: "quarter", waitDays: 30 });
    await w.lock(rev.id, "2026-07-01");
    await w.lock(rev.id, "2026-08-01");
    expect(await takeDueSnapshots(w.id, "2026-10-02", effects)).toEqual({ taken: 0, failed: 0 });
    await w.lock(rev.id, "2026-09-01");
    // September Locked completes Q3, and the monthly dashboard's September too.
    expect(await takeDueSnapshots(w.id, "2026-10-02", effects)).toEqual({ taken: 2, failed: 0 });
    expect((await listSnapshots(owner, q)).map((s) => s.label)).toEqual(["Q3 2026"]);
    expect((await listSnapshots(owner, dash)).map((s) => s.label)).toEqual(["October 2026", "September 2026"]);
  });

  it("take a year once its every month is Locked and not before, once only (spec 0020)", async () => {
    const { w, owner, rev, dash } = await setup();
    await setAutoSnapshots(owner, dash, { every: "year", waitDays: 30 });
    const { sent, effects } = fakeNotices();
    // On 31 December the last complete year is 2025, long past its wait: that one is taken, not 2026.
    for (let m = 1; m <= 11; m++) await w.lock(rev.id, `2026-${String(m).padStart(2, "0")}-01`);
    expect(await takeDueSnapshots(w.id, "2026-12-31", effects)).toEqual({ taken: 1, failed: 0 });
    expect((await listSnapshots(owner, dash)).map((s) => s.label)).toEqual(["2025"]);
    // Over, with eleven of twelve months Locked: it waits.
    expect(await takeDueSnapshots(w.id, "2027-01-02", effects)).toEqual({ taken: 0, failed: 0 });
    await w.lock(rev.id, "2026-12-01");
    expect(await takeDueSnapshots(w.id, "2027-01-03", effects)).toEqual({ taken: 1, failed: 0 });
    const [s] = await listSnapshots(owner, dash);
    expect(s).toMatchObject({ kind: "year", label: "2026", start: "2026-01-01", end: "2026-12-31", automatic: true });
    expect(sent.map((n) => n.subject)).toEqual(["Snapshot of 2025 ready to write up", "Snapshot of 2026 ready to write up"]);
    expect(await takeDueSnapshots(w.id, "2027-02-15", effects)).toEqual({ taken: 0, failed: 0 });
    expect(await listSnapshots(owner, dash)).toHaveLength(2);
  });

  it("take a half-year once its six months are Locked, or after the wait, once only (spec 0020)", async () => {
    const { w, owner, rev, dash } = await setup();
    await setAutoSnapshots(owner, dash, { every: "half", waitDays: 10 });
    const { effects } = fakeNotices();
    for (const m of ["07", "08", "09", "10", "11"]) await w.lock(rev.id, `2026-${m}-01`);
    expect(await takeDueSnapshots(w.id, "2027-01-05", effects)).toEqual({ taken: 0, failed: 0 });
    await w.lock(rev.id, "2026-12-01");
    expect(await takeDueSnapshots(w.id, "2027-01-06", effects)).toEqual({ taken: 1, failed: 0 });
    expect((await listSnapshots(owner, dash)).map((s) => s.label)).toEqual(["H2 2026"]);
    expect(await takeDueSnapshots(w.id, "2027-01-07", effects)).toEqual({ taken: 0, failed: 0 });
    // Without Locks, the first half of 2027 is taken ten days after it ends: 10 July.
    expect(await takeDueSnapshots(w.id, "2027-07-09", effects)).toEqual({ taken: 0, failed: 0 });
    expect(await takeDueSnapshots(w.id, "2027-07-10", effects)).toEqual({ taken: 1, failed: 0 });
    expect((await listSnapshots(owner, dash)).map((s) => s.label)).toEqual(["H1 2027", "H2 2026"]);
  });

  it("take a year of daily Metrics once every day is Locked, past a thousand Locks", async () => {
    const { w, owner, dash } = await setup();
    const days: string[] = [];
    for (let d = new Date(Date.UTC(2028, 0, 1)); d.getUTCFullYear() === 2028; d.setUTCDate(d.getUTCDate() + 1)) days.push(d.toISOString().slice(0, 10));
    expect(days).toHaveLength(366);
    const daily = [];
    for (const name of ["Orders", "Visits", "Returns"]) {
      const m = await w.metric(owner.personId, { name, period: "day" });
      await placeWidget(owner, dash, { type: "metric", id: m.id });
      daily.push(m);
    }
    const y = await createDashboard(owner, "Daily year");
    for (const m of daily) await placeWidget(owner, y, { type: "metric", id: m.id });
    await setAutoSnapshots(owner, y, { every: "year", waitDays: 60 });
    const rows = daily.flatMap((m) => days.map((p) => ({ metric_id: m.id, period_start: p, state: "locked", workspace_id: w.id })));
    // All but the last day of the last Metric: 1,097 Locks, more than one request returns.
    expect((await db().from("period_states").insert(rows.slice(0, -1))).error).toBeNull();
    const { effects } = fakeNotices();
    expect(await takeDueSnapshots(w.id, "2029-01-02", effects)).toEqual({ taken: 0, failed: 0 });
    expect((await db().from("period_states").insert(rows.slice(-1))).error).toBeNull();
    expect(await takeDueSnapshots(w.id, "2029-01-02", effects)).toEqual({ taken: 1, failed: 0 });
    expect((await listSnapshots(owner, y)).map((s) => s.label)).toEqual(["2028"]);
  });

  it("stop when the dashboard is handed over, and never run in the demo (second security review)", async () => {
    const { w, owner, ben, dash } = await setup();
    await setAutoSnapshots(owner, dash, { every: "month", waitDays: 0 });
    // Sara owns a dashboard set to Snapshots; Ann takes it over when Sara leaves, and has not chosen them.
    const ann = await w.person("owner");
    await removeMember(w.actor(ann), owner.personId, ben.personId);
    expect((await db().from("dashboards").select("owner_id, snapshot_every").eq("id", dash).single()).data).toEqual({ owner_id: ben.personId, snapshot_every: null });
    const { effects } = fakeNotices();
    expect(await takeDueSnapshots(w.id, "2026-11-01", effects)).toEqual({ taken: 0, failed: 0 });
    expect(await takeDueSnapshots("d3e00000-0000-4000-8000-000000000001", "2026-11-01", effects)).toEqual({ taken: 0, failed: 0 });
  });

  it("count it as failed, and go on with the others, when the owner may not take it", async () => {
    const { w, owner, ben, dash } = await setup();
    // Ben places his own Metric, which Sara does not see: her automatic Snapshot cannot vouch for it.
    const payroll = await w.metric(ben.personId, { name: "Payroll" });
    await placeWidget(ben, dash, { type: "metric", id: payroll.id });
    await setAutoSnapshots(owner, dash, { every: "month", waitDays: 0 });
    const other = await createDashboard(owner, "Other");
    await setAutoSnapshots(owner, other, { every: "month", waitDays: 0 });
    const { effects } = fakeNotices();
    expect(await takeDueSnapshots(w.id, "2026-11-01", effects)).toEqual({ taken: 1, failed: 1 });
    expect(await listSnapshots(owner, dash)).toEqual([]);
  });
});

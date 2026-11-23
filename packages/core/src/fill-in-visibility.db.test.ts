// Who learns that a value was entered for its submitter (spec 0046, ticket #802; GLOSSARY: Filled-in Value, Guest, View
// Link, Snapshot, Usage): the API's read field and the Metric's history for a member and for a Guest, the View Links
// (with and without Show names, frozen or to a Snapshot) and the Snapshot itself, which carry no `entered_by` at all, and
// the Usage page's count of values entered by others.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { KeyActor } from "./actor";
import { actorForKey, createAccessKey } from "./access-keys";
import { listObservations } from "./api";
import { db } from "./db";
import { createDashboard, metricHistory, placeWidget } from "./dashboards";
import { openSnapshot, showSnapshot, takeSnapshot } from "./snapshots";
import { workspaceUsage } from "./usage-report";
import { createViewLink, openViewLink } from "./view-links";
import { workspace } from "./test/db-fixtures";

vi.setConfig({ testTimeout: 120_000, hookTimeout: 60_000 });
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const PERIOD = "2026-10-01";

/** Sara owns a Metric Ben submits; Mia, a member, entered October for him. A member and a Guest both see the Metric. */
async function setup() {
  const w = await workspace(); cleanups.push(w.cleanup);
  const sara = await w.person("owner"); const ben = await w.person("member"); const mia = await w.person("member"); const viewer = await w.person("member"); const gus = await w.person("guest");
  const m = await w.metric(sara, { name: "Cost" });
  for (const p of [ben, mia, viewer, gus]) await w.share(m.id, p);
  const id = await w.value(m.id, PERIOD, 42, ben);
  await db().from("observations").update({ entered_by: mia }).eq("id", id);
  const name = async (p: string) => String((await db().from("profiles").select("name").eq("id", p).single()).data?.name);
  const keyFor = async (person: string, role: "member" | "guest") => {
    const { secret } = await createAccessKey(w.actor(person, role), { name: "Reader", scopes: ["metrics:read"], expiresOn: inDays(30) });
    return (await actorForKey(secret)) as KeyActor;
  };
  return { w, sara, ben, mia, viewer, gus, m, name, keyFor };
}

describe("the API's read field", () => {
  it("names who entered a value to a member's key, and nothing to a Guest's", async () => {
    const { mia, viewer, gus, m, name, keyFor } = await setup();
    const member = await listObservations(await keyFor(viewer, "member"), m.slug, { limit: 10 });
    expect(member.items[0]).toMatchObject({ value: 42, entered_by: mia, entered_by_name: await name(mia) });
    const guest = await listObservations(await keyFor(gus, "guest"), m.slug, { limit: 10 });
    expect(guest.items[0]).toMatchObject({ value: 42, entered_by: null, entered_by_name: null });
    expect(JSON.stringify(guest)).not.toContain(mia);
  });

  it("is null when the submitter entered the value", async () => {
    const { w, viewer, m, keyFor } = await setup();
    await w.value(m.id, "2026-09-01", 7, viewer);
    const rows = (await listObservations(await keyFor(viewer, "member"), m.slug, { limit: 10 })).items;
    expect(rows.find((r) => r.period === "2026-09-01")).toMatchObject({ entered_by: null, entered_by_name: null });
  });
});

describe("the Metric's history", () => {
  it("carries who entered a value for a member, and neither it nor the submitter for a Guest", async () => {
    const { w, ben, mia, viewer, gus, m } = await setup();
    const seen = await metricHistory(w.actor(viewer, "member"), m.id);
    expect(seen.observations[0]).toMatchObject({ submitter_id: ben, entered_by: mia });
    const guest = await metricHistory(w.actor(gus, "guest"), m.id);
    expect(JSON.stringify(guest)).not.toMatch(/entered_by|submitter_id/);
    expect(JSON.stringify(guest)).not.toContain(mia);
  });
});

describe("View Links and Snapshots", () => {
  it("carry no entered_by: a link with and without Show names, a frozen link, a Snapshot and its link", async () => {
    const { w, sara, m } = await setup();
    const owner = w.actor(sara);
    const dash = await createDashboard(owner, "Monthly");
    await placeWidget(owner, dash, { type: "spec", template: "table", metricIds: [m.id], settings: {} });
    const snap = await takeSnapshot(owner, dash, { kind: "month", start: PERIOD });
    await showSnapshot(owner, snap);
    const links = [
      await createViewLink(owner, "dashboard", dash, { label: "", expires: inDays(30), frozen: false, showNames: false }),
      await createViewLink(owner, "dashboard", dash, { label: "", expires: inDays(30), frozen: false, showNames: true }),
      await createViewLink(owner, "dashboard", dash, { label: "", expires: inDays(30), frozen: true, showNames: true }),
      await createViewLink(owner, "dashboard", dash, { label: "", expires: inDays(30), frozen: false, snapshotId: snap, showNames: true }),
    ];
    const seen = [...(await Promise.all(links.map((l) => openViewLink(l)))), await openSnapshot(owner, snap)];
    for (const view of seen) {
      expect(view).not.toBeNull();
      const text = JSON.stringify(view);
      // No such key, and no value row at all that names a submitter (the payload's `submitters` is empty, as for any link).
      expect(text).not.toMatch(/entered_by/);
      expect(text).not.toMatch(/submitter_id/);
    }
  });
});

describe("the Usage page", () => {
  it("counts a Filled-in Value for the submitter and says how many were entered by others", async () => {
    const { w, sara, ben, m } = await setup();
    await w.value(m.id, "2026-09-01", 40, ben); // Ben's own
    const usage = await workspaceUsage(w.actor(sara));
    expect(usage.filledInFor).toEqual([expect.objectContaining({ id: ben, values: 2, enteredByOthers: 1 })]);
    // Not an idle submitter either way: his values count as his.
    expect(usage.submitters.map((s) => s.id)).not.toContain(ben);
  });
});

// What the form link's page adds for its own signed-in person, against the real database (ticket #1134; GLOSSARY:
// Token, Submitter, Schedule): only the Token's own person gets anything, only for Metrics they may see and record, and
// a period from the address counts only when Record a value offers it.
import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "./db";
import { formLinkExtras } from "./form-link-extras";
import { JANUARY, periodStart, shiftPeriod } from "./periods";
import { RECORDABLE_PERIODS } from "./record-own-value";
import { workspace } from "./test/db-fixtures";

vi.setConfig({ testTimeout: 120_000, hookTimeout: 60_000 });
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws() { const w = await workspace(); cleanups.push(w.cleanup); return w; }
const thisMonth = () => periodStart(new Date(), "month", JANUARY);
const ago = (n: number) => shiftPeriod(thisMonth(), "month", -n);
const LONG_AGO = "2026-01-01T00:00:00Z";

/** A Workspace whose Metrics are on a monthly Workflow due the day the month ends, so earlier months are overdue
 * whatever day the test runs. */
async function monthly() {
  const w = await ws(); const sara = await w.person("owner");
  const { data } = await db().from("workflows").insert({ owner_id: sara, name: "Monthly", config: { dueWorkingDays: 0, steps: [] }, workspace_id: w.id }).select("id").single();
  const metric = (name: string, over: Record<string, unknown> = {}) => w.metric(sara, { name, created_at: LONG_AGO, workflow_id: data!.id, ...over });
  return { w, sara, metric };
}

/** Ann submits a Metric with a value two months ago, and owes values for it and for another. */
async function setup() {
  const { w, sara, metric } = await monthly(); const ann = await w.person("member");
  const asked = await metric("Signups"); const other = await metric("Visits");
  const code = await w.token(asked.id, ann, { created_at: LONG_AGO });
  await w.token(other.id, ann, { created_at: LONG_AGO });
  await w.value(asked.id, ago(2), 7, ann);
  return { w, sara, ann, asked, code };
}

describe("the extras of a form link", () => {
  it("gives the Token's own person the earlier values and the next value due, with no code in it", async () => {
    const { w, ann, asked, code } = await setup();
    const extras = await formLinkExtras(w.actor(ann, "member"), code);
    expect(extras).toMatchObject({ metricId: asked.id, named: null, running: false, recent: [{ start: ago(2), value: "7" }] });
    expect(["Signups", "Visits"]).toContain(extras!.next!.name);
    expect(extras!.next!.period < thisMonth()).toBe(true);
    expect(Object.keys(extras!.next!).sort()).toEqual(["name", "period", "periodLabel", "slug"]);
  });

  it("gives nothing to anyone else: another person who sees the Metric, a key, another Workspace, an unknown code", async () => {
    const { w, sara, ann, code } = await setup(); const elsewhere = await ws(); const bob = await elsewhere.person("owner");
    expect(await formLinkExtras(w.actor(sara, "owner"), code)).toBeNull();
    expect(await formLinkExtras({ ...w.actor(ann, "member"), key: { id: 1, scopes: ["write"] } } as never, code)).toBeNull();
    expect(await formLinkExtras(elsewhere.actor(bob, "owner"), code)).toBeNull();
    expect(await formLinkExtras(elsewhere.actor(ann, "member"), code)).toBeNull();
    expect(await formLinkExtras(w.actor(ann, "member"), "tk-unknown")).toBeNull();
    expect(await formLinkExtras(w.actor(ann, "member"), { code })).toBeNull();
  });

  it("takes a period from the address only when the form offers it", async () => {
    const { w, ann, code } = await setup();
    const actor = w.actor(ann, "member");
    expect((await formLinkExtras(actor, code, ago(2)))!.named).toMatchObject({ start: ago(2), has: "7" });
    expect((await formLinkExtras(actor, code, ago(1)))!.named).toMatchObject({ start: ago(1), has: null });
    // The running period is no named one, but the page hears that the address asks for it.
    expect(await formLinkExtras(actor, code, thisMonth())).toMatchObject({ named: null, running: true });
    // Too old, to come and nonsense are ignored.
    for (const p of [ago(RECORDABLE_PERIODS), shiftPeriod(thisMonth(), "month", 1), "2026-11-15", "x", ["2026-10-01"]]) expect(await formLinkExtras(actor, code, p)).toMatchObject({ named: null, running: false });
  });

  it("relies on one Token per person and Metric: a Stand-in for one person cannot get a second for another", async () => {
    const { w, metric } = await monthly(); const ann = await w.person("member"); const ben = await w.person("member"); const cleo = await w.person("member");
    const m = await metric("Signups");
    await w.token(m.id, cleo, { stands_in_for: ann });
    await expect(w.token(m.id, cleo, { stands_in_for: ben })).rejects.toThrow("23505");
  });

  it("offers a Guest only their own web form values, and gives nothing for a Metric closed to the web form", async () => {
    const { w, metric } = await monthly(); const guest = await w.person("guest"); const ben = await w.person("member");
    const mine = await metric("Mine"); const theirs = await metric("Theirs"); const slackOnly = await metric("Slack only", { sources: ["slack"] });
    const code = await w.token(mine.id, guest, { created_at: LONG_AGO });
    await w.token(theirs.id, ben, { created_at: LONG_AGO });
    const closed = await w.token(slackOnly.id, guest, { created_at: LONG_AGO });
    // "Slack only" is due too; a colleague's value is never offered.
    expect((await formLinkExtras(w.actor(guest, "guest"), code))!.next).toMatchObject({ name: "Mine" });
    expect(await formLinkExtras(w.actor(guest, "guest"), closed)).toBeNull();
  });
});

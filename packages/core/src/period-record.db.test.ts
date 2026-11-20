// A Period Record against the real database (ticket #411; GLOSSARY: Period Record, Thread, Correction, Lock, Share,
// Group, Guest): the steps of a period's value in order, Threads only where the viewer may read them, a Guest, another
// Workspace, and a Corrected and Locked value.
import { afterEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { recordAudit } from "./audit-log";
import { insertSealed } from "./sealed-columns";
import { periodRecord } from "./period-record";
import { workspace } from "./test/db-fixtures";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
const P = "2026-03-01";
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

/** A workspace with an Owner (Sara), a Submitter (Ann) and a Metric Sara owns. */
async function setup() {
  const w = await workspace();
  cleanups.push(w.cleanup);
  const sara = await w.person("owner"); const ann = await w.person("member");
  const m = await w.metric(sara, { name: "Churn rate" });
  return { w, sara, ann, m };
}
const share = (w: { id: string }, metricId: number, person: string) => db().from("shares").insert({ workspace_id: w.id, object_type: "metric", object_id: metricId, user_id: person, role: "viewer" });
const say = (ws: string, action: number, author: string, body: string, at: string, correction?: { value: number; status: string }) =>
  insertSealed("thread_messages", ws, [{ action_id: action, author_id: author, body, created_at: at, correction_value: correction?.value ?? null, correction_status: correction?.status ?? null }]);

describe("the Period Record of a Corrected and Locked value", () => {
  it("lists every step in order with person, channel and date, the replaced value struck, and the Thread opened", async () => {
    const { w, sara, ann, m } = await setup();
    // Lena's 3.4 came by mail; a Correction to 3.1 was accepted; Sara approved and the period was locked.
    await db().from("observations").insert({ metric_id: m.id, period_start: P, value: 3.4, submitter_id: ann, source: "mail", workspace_id: w.id, created_at: daysAgo(9) });
    await db().from("observations").update({ value: 3.1, original_value: 3.4 }).eq("metric_id", m.id).eq("period_start", P);
    const action = await w.action({ metric_id: m.id, period_start: P, asker_id: sara, assignee_id: ann, question: "Is 3.4 right?" });
    await say(w.id, action, ann, "No, one churn was counted twice.", daysAgo(8), { value: 3.1, status: "accepted" });
    await say(w.id, action, sara, "Thanks, accepted.", daysAgo(7));
    await recordAudit(w.id, sara, { kind: "correction.accepted", object: { type: "metric", id: m.id, name: "Churn rate" }, details: { period: P, proposed_by: ann, action_id: action } });
    await recordAudit(w.id, sara, { kind: "approval.given", object: { type: "metric", id: m.id, name: "Churn rate" }, details: { period: P } });
    await recordAudit(w.id, sara, { kind: "period.locked", object: { type: "metric", id: m.id, name: "Churn rate" }, details: { period: P } });
    // An event of another period of the same Metric is not this one's.
    await recordAudit(w.id, sara, { kind: "period.locked", object: { type: "metric", id: m.id, name: "Churn rate" }, details: { period: "2026-02-01" } });
    await w.lock(m.id, P);

    const r = await periodRecord(w.actor(sara), m.slug, P);
    expect(r).toMatchObject({ value: 3.1, originalValue: 3.4, state: "locked" });
    expect(r!.steps.map((s) => s.kind)).toEqual(["submitted", "correction_proposed", "correction_accepted", "approved", "locked"]);
    expect(r!.steps[0]).toMatchObject({ person: expect.stringContaining("member"), channel: "Mail", value: 3.4, superseded: true });
    expect(r!.steps[1]).toMatchObject({ value: 3.1, superseded: false });
    expect(r!.steps[2]).toMatchObject({ value: 3.1, person: expect.stringContaining("owner") });
    expect(r!.steps.every((s) => s.at)).toBe(true);
    // The Thread: its first words opened, and how many replies follow.
    expect(r!.threads).toEqual([expect.objectContaining({ id: action, first: expect.objectContaining({ body: "No, one churn was counted twice." }), replies: 1 })]);
  });

  it("puts a replaced value, an unlock with its reason, and a sent-back value in order", async () => {
    const { w, sara, ann, m } = await setup();
    await db().from("observations").insert({ metric_id: m.id, period_start: P, value: 5, submitter_id: ann, source: "slack", workspace_id: w.id, created_at: daysAgo(9) });
    await db().from("observations").insert({ metric_id: m.id, period_start: P, value: 6, submitter_id: ann, source: "web_form", workspace_id: w.id, created_at: daysAgo(8) });
    const metric = { type: "metric" as const, id: m.id, name: "Churn rate" };
    await recordAudit(w.id, sara, { kind: "approval.sent_back", object: metric, details: { period: P } });
    await recordAudit(w.id, sara, { kind: "period.locked", object: metric, details: { period: P } });
    await recordAudit(w.id, sara, { kind: "period.unlocked", object: metric, details: { period: P } });
    await db().from("period_states").insert({ metric_id: m.id, period_start: P, state: "published", note: "Unlocked by someone on 1 Mar 2026: a late invoice", workspace_id: w.id });
    const r = await periodRecord(w.actor(sara), m.slug, P);
    expect(r!.steps.map((s) => [s.kind, s.value, s.superseded])).toEqual([["submitted", 5, true], ["replaced", 6, false], ["sent_back", null, false], ["locked", null, false], ["unlocked", null, false], ["published", null, false]]);
    expect(r!.steps.find((s) => s.kind === "unlocked")!.reason).toBe("a late invoice");
    expect(r!.value).toBe(6);
  });
});

describe("what a viewer may see", () => {
  it("leaves out a Thread they may not read, with the Corrections proposed in it", async () => {
    const { w, sara, ann, m } = await setup();
    const carla = await w.person("member");
    await share(w, m.id, carla);
    await db().from("observations").insert({ metric_id: m.id, period_start: P, value: 3.4, submitter_id: ann, source: "mail", workspace_id: w.id });
    const { data: g } = await db().from("groups").insert({ workspace_id: w.id, name: "Board" }).select("id").single();
    const open = await w.action({ metric_id: m.id, period_start: P, asker_id: sara, assignee_id: sara, question: "Open to all" });
    const secret = await w.action({ metric_id: m.id, period_start: P, asker_id: sara, assignee_id: sara, question: "Board only", read_group_id: g!.id });
    await say(w.id, open, sara, "Visible words.", daysAgo(2));
    await say(w.id, secret, sara, "Secret words.", daysAgo(2), { value: 9, status: "proposed" });

    const theirs = await periodRecord(w.actor(carla, "member"), m.slug, P);
    expect(theirs!.threads.map((t) => t.id)).toEqual([open]);
    expect(theirs!.steps.some((s) => s.kind === "correction_proposed")).toBe(false);
    expect(JSON.stringify(theirs)).not.toContain("Secret words");
    const mine = await periodRecord(w.actor(sara), m.slug, P);
    expect(mine!.threads.map((t) => t.id).sort()).toEqual([open, secret].sort());
    expect(mine!.steps.some((s) => s.kind === "correction_proposed")).toBe(true);
  });

  it("is nothing for a member who does not see the Metric, and the whole page for a Guest it is shared with", async () => {
    const { w, ann, m } = await setup();
    const stranger = await w.person("member"); const gus = await w.person("guest"); const gwen = await w.person("guest");
    await db().from("observations").insert({ metric_id: m.id, period_start: P, value: 3.4, submitter_id: ann, source: "mail", workspace_id: w.id });
    await share(w, m.id, gus);
    expect(await periodRecord(w.actor(stranger, "member"), m.slug, P)).toBeNull();
    expect(await periodRecord(w.actor(gwen, "guest"), m.slug, P)).toBeNull();
    expect(await periodRecord(w.actor(gus, "guest"), m.slug, P)).toMatchObject({ value: 3.4 });
  });

  it("never shows a Metric of another Workspace, nor its Threads", async () => {
    const a = await setup(); const b = await setup();
    await db().from("observations").insert({ metric_id: a.m.id, period_start: P, value: 3.4, submitter_id: a.ann, source: "mail", workspace_id: a.w.id });
    // Sara of B asks for A's Metric by its slug, and A's Sara asks through B's workspace: neither is found.
    expect(await periodRecord(b.w.actor(b.sara), a.m.slug, P)).toBeNull();
    expect(await periodRecord({ personId: a.sara, workspaceId: b.w.id, role: "owner" }, a.m.slug, P)).toBeNull();
    expect(await periodRecord(a.w.actor(a.sara), a.m.slug, P)).not.toBeNull();
  });

  it("is nothing for a date that is not one of the Metric's periods, or a Metric that is not there", async () => {
    const { w, sara, m } = await setup();
    expect(await periodRecord(w.actor(sara), m.slug, "2026-03-15")).toBeNull();
    expect(await periodRecord(w.actor(sara), m.slug, "march")).toBeNull();
    expect(await periodRecord(w.actor(sara), "no-such-metric", P)).toBeNull();
    // A period without a value is still a page: there is nothing to show yet.
    expect(await periodRecord(w.actor(sara), m.slug, P)).toMatchObject({ value: null, steps: [], threads: [] });
  });

  it("names only people in the Workspace now: a former member is \"A former member\", in the steps and the Thread", async () => {
    const { w, sara, ann, m } = await setup();
    const gone = await w.person("member");
    await db().from("observations").insert({ metric_id: m.id, period_start: P, value: 3.4, submitter_id: gone, source: "mail", workspace_id: w.id, created_at: daysAgo(9) });
    const action = await w.action({ metric_id: m.id, period_start: P, asker_id: sara, assignee_id: ann, question: "Is 3.4 right?" });
    await say(w.id, action, gone, "It is right.", daysAgo(8));
    await recordAudit(w.id, gone, { kind: "approval.given", object: { type: "metric", id: m.id, name: "Churn rate" }, details: { period: P } });
    const before = await periodRecord(w.actor(sara), m.slug, P);
    expect(before!.steps[0].person).toContain("member");
    // They leave the Workspace: their profile stays (they may be in others), their name does not.
    await db().from("memberships").delete().eq("workspace_id", w.id).eq("user_id", gone);
    const after = await periodRecord(w.actor(sara), m.slug, P);
    expect(after!.steps.map((s) => s.person)).toEqual(["A former member", "A former member"]);
    expect(after!.threads[0].first!.person).toBe("A former member");
    expect(JSON.stringify(after)).not.toContain(before!.steps[0].person!);
  });
});

// The demo shows what the landing page promises (ticket #419; GLOSSARY: Demo Mode, Period Timeline, Period Record,
// Thread, Correction, Lock): three examples that work exactly as shown, through the same core functions the app and
// MCP use, as the demo's Owner. The demo is reset first, so this also tests that the nightly reset makes them.
import { beforeAll, describe, expect, it } from "vitest";
import { getMetric, getThreads, listObservations } from "./api";
import { db } from "./db";
import { DemoReadOnly } from "./demo";
import { seedDemoSnapshots } from "./demo-snapshots";
import { periodRecord } from "./period-record";
import { periodTimeline } from "./period-timeline";
import { search } from "./search";
import { DEMO_WORKSPACE_ID } from "./team";
import type { Actor } from "./actor";

const sara: Actor = { personId: "sara", workspaceId: DEMO_WORKSPACE_ID, role: "owner" };

beforeAll(async () => {
  const { error } = await db().rpc("demo_reset", { min_gap: "0 seconds" });
  expect(error).toBeNull();
  await seedDemoSnapshots();
}, 120_000);

describe("example 1: the gross margin in October, and why it dropped (MCP)", () => {
  it("is a monthly Metric with a target of 40 %", async () => {
    expect(await getMetric(sara, "gross-margin")).toMatchObject({ name: "Gross margin", period: "month", format: "percent", unit: "%", decimals: 1, target_min: 40 });
  });

  it("was 38.2 % in October, 2.1 points below September's 40.3 %, sent by Mia on 3 November, and has a Thread", async () => {
    const { items } = await listObservations(sara, "gross-margin", { from: "2026-09-01", to: "2026-10-01", limit: 10 });
    expect(items.map((i) => [i.period, i.value, i.has_thread])).toEqual([["2026-09-01", 40.3, false], ["2026-10-01", 38.2, true]]);
    expect(Math.round((items[0].value - items[1].value) * 10) / 10).toBe(2.1);
    expect(items[1]).toMatchObject({ submitter: "mia", submitter_name: "Mia Hartmann", submitted_at: "2026-11-03T10:15:00+00:00", source: "web_form" });
  });

  it("has Mia's Alert on it, below 95 % of the target, armed (firing is not seeded)", async () => {
    const { data } = await db().from("alerts").select("person_id, kind, level, state").eq("workspace_id", DEMO_WORKSPACE_ID).single();
    expect(data).toEqual({ person_id: "mia", kind: "share_of_target", level: "95", state: "armed" });
  });

  it("has Mia's words about shipping costs in the Thread on that value", async () => {
    const { threads } = await getThreads(sara, "gross-margin", "2026-10-01");
    expect(threads).toHaveLength(1);
    expect(threads[0].messages).toEqual([expect.objectContaining({ author: "mia", author_name: "Mia Hartmann", words: "Shipping costs went up after we changed carriers.", correction: null })]);
  });
});

describe("example 2: Weekly numbers, week 47", () => {
  let workflow: number;
  beforeAll(async () => {
    workflow = (await db().from("workflows").select("id").eq("workspace_id", DEMO_WORKSPACE_ID).eq("name", "Weekly numbers").single().throwOnError()).data!.id;
  });

  it("is a Workflow of six weekly Metrics, six people, all in and all locked", async () => {
    const t = await periodTimeline(sara, workflow, "2026-11-16");
    expect(t).toMatchObject({ workflow: { name: "Weekly numbers" }, period: "2026-11-16", in: 6, of: 6, published: 6, locked: 6 });
  });

  it("tells the week in order, at the times it happened", async () => {
    const t = await periodTimeline(sara, workflow, "2026-11-16");
    const shown = t.events.map((e) => [e.day, e.time, e.kind, e.text]);
    expect(shown.slice(0, -1)).toEqual([
      ["2026-11-16", "08:00", "asked", "Asked 6 people by Email, Slack and Telegram"],
      ["2026-11-16", "14:10", "in", "5 values came in (5 of 6 in)"],
      ["2026-11-17", "09:00", "reminded", "Reminded 1 person by Email"],
      ["2026-11-17", "11:22", "in", "Support tickets came in: 311 (6 of 6 in)"],
      ["2026-11-17", "11:25", "approval_asked", "Mia Hartmann was asked to approve Support tickets"],
      ["2026-11-17", "11:40", "note", "Mia Hartmann left a note on Support tickets"],
      ["2026-11-17", "11:41", "approved", "Mia Hartmann approved Support tickets"],
      ["2026-11-18", "10:00", "locked", "6 values locked"],
    ]);
    // Its Snapshot was ready then, too (made by the core; the day it was taken is the reset's).
    expect(shown.at(-1)).toEqual(["2026-11-18", "10:00", "snapshot", "Snapshot Week of 16 Nov 2026 of Weekly numbers is ready"]);
  });

  it("names who was asked and reminded, and the Unusual Value that was approved", async () => {
    const { events } = await periodTimeline(sara, workflow, "2026-11-16");
    const by = (kind: string) => events.find((e) => e.kind === kind)!;
    expect(by("asked").items).toEqual(["Jonas Brandt: Support tickets", "Mia Hartmann: Refunds", "Anna Weber: New leads", "Lena Petrov: Cancellations", "Tom Eriksen: Trial sign-ups", "Ben Okafor: Orders shipped"]);
    expect(by("reminded").items).toEqual(["Jonas Brandt: Support tickets"]);
    expect(by("approval_asked").items).toEqual(["311, up 48 % on the period before"]);
    expect(by("note").items[0]).toMatch(/^The newsletter went out on Monday/);
  });

  it("has the 48 % in the numbers: 311 tickets against 210 the week before", async () => {
    const { items } = await listObservations(sara, "support-tickets-weekly", { from: "2026-11-09", to: "2026-11-16", limit: 10 });
    expect(items.map((i) => [i.period, i.value, i.state])).toEqual([["2026-11-09", 210, "locked"], ["2026-11-16", 311, "locked"]]);
    expect(Math.round((311 / 210 - 1) * 100)).toBe(48);
  });
});

describe("example 3: Churn rate, March 2026", () => {
  it("is found by searching \"churn march 2026\", and leads to that period", async () => {
    const results = await search(sara, "churn march 2026");
    expect(results[0]).toEqual({ kind: "period", slug: "churn-rate", name: "Churn rate", archived: false, period: "2026-03-01", label: "March 2026" });
  });

  it("is 3.1 % and locked, submitted as 3.4 % by Lena, corrected, accepted by Tom and locked on 7 April", async () => {
    const r = (await periodRecord(sara, "churn-rate", "2026-03-01"))!;
    expect(r).toMatchObject({ metric: { name: "Churn rate" }, value: 3.1, originalValue: 3.4, state: "locked" });
    expect(r.steps.map((s) => [s.kind, s.at?.slice(0, 16), s.person, s.channel, s.value, s.superseded])).toEqual([
      ["submitted", "2026-04-02T10:32", "Lena Petrov", "Mail", 3.4, true],
      ["correction_proposed", "2026-04-03T09:12", "Lena Petrov", null, 3.1, false],
      ["correction_accepted", "2026-04-03T10:04", "Tom Eriksen", null, 3.1, false],
      ["locked", "2026-04-07T09:00", null, null, null, false],
    ]);
  });

  it("has a Thread of two replies that begins with why", async () => {
    const r = (await periodRecord(sara, "churn-rate", "2026-03-01"))!;
    expect(r.threads).toHaveLength(1);
    expect(r.threads[0]).toMatchObject({ replies: 2, first: { person: "Lena Petrov", body: "Leaves out the two pilot customers. They were never billed." } });
  });
});

describe("the demo around them", () => {
  it("stays read-only: the new rows refuse every write, and the seed's audit events keep the time they were given", async () => {
    await expect(db().from("observations").update({ value: 1 }).eq("workspace_id", DEMO_WORKSPACE_ID).throwOnError()).rejects.toBeInstanceOf(DemoReadOnly);
    await expect(db().from("audit_events").insert({ workspace_id: DEMO_WORKSPACE_ID, actor_name: "Someone", kind: "group.created" }).throwOnError()).rejects.toBeInstanceOf(DemoReadOnly);
    const { data } = await db().from("audit_events").select("at, actor_name").eq("workspace_id", DEMO_WORKSPACE_ID).eq("kind", "correction.accepted").eq("object_name", "Churn rate").single();
    expect(data).toMatchObject({ actor_name: "Tom Eriksen", at: "2026-04-03T10:04:00+00:00" });
  });

  it("can be reset again, and the examples are the same", async () => {
    const { error } = await db().rpc("demo_reset", { min_gap: "0 seconds" });
    expect(error).toBeNull();
    expect((await periodRecord(sara, "churn-rate", "2026-03-01"))!.threads[0].replies).toBe(2);
    expect((await listObservations(sara, "gross-margin", { from: "2026-10-01", to: "2026-10-01", limit: 1 })).items[0].value).toBe(38.2);
  });

  it("has no event at midnight and no lock of a past period stamped later than now", async () => {
    const stamps = async (table: "observations" | "actions" | "thread_messages" | "period_states", column: string) => {
      const q = db().from(table).select(column).eq("workspace_id", DEMO_WORKSPACE_ID);
      return (((table === "period_states" ? await q.in("state", ["published", "locked"]) : await q).data ?? []) as unknown as Record<string, string>[]).map((r) => r[column]);
    };
    const midnight = (ts: string[]) => ts.filter((t) => /T00:00:00/.test(t)).length;
    const [obs, actions, messages, states] = await Promise.all([stamps("observations", "created_at"), stamps("actions", "created_at"), stamps("thread_messages", "created_at"), stamps("period_states", "updated_at")]);
    expect([midnight(obs), midnight(actions), midnight(messages), midnight(states)]).toEqual([0, 0, 0, 0]);
    expect(states.filter((t) => Date.parse(t) > Date.now())).toEqual([]);
  });
});

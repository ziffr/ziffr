// Paste values against the real database (spec 0026, Testing Decisions; GLOSSARY: Token, Submission Rule, Lock,
// Unusual Value, Approval, Import, Stand-in): the preview writes nothing and gives the outcome the recording gets;
// only Metrics the person submits for are recorded, one they cannot see is never named; Record as history is an
// Import only for the Metric Owner or an Owner or Admin who submits for it, and only for empty past periods.
import fc from "fast-check";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Forbidden, type Actor } from "./actor";
import { db } from "./db";
import { PASTED_VALUES_PER_DAY, PASTED_VALUES_PER_DAY_IN_DEMO, pastedValueIds, pasteMetrics, previewValues, recordPastedValues, type PasteReport, type PasteRow } from "./paste-values";
import { sourcesView } from "./page-data";
import { JANUARY, periodStart, shiftPeriod } from "./periods";
import { submissionEffects, type SubmissionEffects } from "./submissions";
import { valuesOf, workspace, opened } from "./test/db-fixtures";
import { DEMO_WORKSPACE_ID } from "./team";
import { saveWorkflow, setMetricWorkflow } from "./workflows";
import type { WorkflowStep } from "./types";

// A paste records value after value through the Workflow: more than the default minute on a busy machine.
vi.setConfig({ testTimeout: 240_000, hookTimeout: 120_000 });
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); vi.restoreAllMocks(); });
async function ws() { const w = await workspace(); cleanups.push(w.cleanup); return w; }
/** Effects that send nothing but run the Workflow, so checks and Approvals happen for real. */
const quiet = (): SubmissionEffects => ({ notifyCorrection: vi.fn(async () => {}), afterValue: submissionEffects.afterValue });
const thisMonth = () => periodStart(new Date(), "month", JANUARY);
const ago = (n: number) => shiftPeriod(thisMonth(), "month", -n);
/** A month as a spreadsheet's ISO month cell: "2026-10". */
const cell = (period: string) => period.slice(0, 7);

function ok(r: Awaited<ReturnType<typeof previewValues>>): PasteReport {
  if (!r.ok) throw new Error(`refused: ${r.reason}: ${r.detail}`);
  return r;
}
const brief = (rows: PasteRow[]) => rows.map((r) => [r.place, r.outcome, r.approval ? "approval" : null]);

/** Rows of what the database holds that a preview must not change. */
async function written(wsId: string) {
  const count = async (table: string) => (await db().from(table).select("id", { count: "exact", head: true }).eq("workspace_id", wsId)).count;
  return Promise.all(["observations", "intake_log", "actions", "period_states", "thread_messages"].map(count));
}

/** A Workflow that checks for a change of more than 50 % and asks `approver` to approve Unusual Values. */
async function checked(w: Awaited<ReturnType<typeof ws>>, owner: string, approver: string, metricId: number, values: "unusual" | "every" = "unusual") {
  const steps: WorkflowStep[] = [{ type: "check", changePct: 50, outsideTarget: false }, { type: "approve", approvers: [approver], values }, { type: "publish", lock: false }];
  const id = await saveWorkflow(w.actor(owner), null, "Close", { dueWorkingDays: 2, steps });
  await setMetricWorkflow(w.actor(owner), metricId, id);
}

describe("whose Metrics", () => {
  it("records only Metrics the person submits for, refuses one they only see, and never names one they cannot see", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ann = await w.person("member");
    const mine = await w.metric(sara, { name: "Signups" }); await w.token(mine.id, ann);
    const seen = await w.metric(sara, { name: "Revenue" });
    await db().from("shares").insert({ workspace_id: w.id, object_type: "metric", object_id: seen.id, user_id: ann, role: "viewer" });
    await w.metric(sara, { name: "Secret margin" });
    const text = `\t${cell(ago(2))}\t${cell(ago(1))}\nSignups\t10\t12\nRevenue\t100\t110\nSecret margin\t1\t2`;
    const preview = ok(await previewValues(w.actor(ann, "member"), { text }));
    expect(brief(preview.rows)).toEqual([["B2", "recorded", null], ["C2", "recorded", null], ["B3", "refused", null], ["C3", "refused", null], ["B4", "refused", null], ["C4", "refused", null]]);
    expect(preview.rows[2]).toMatchObject({ metric: { name: "Revenue" }, detail: "Revenue is not a Metric you submit for." });
    expect(preview.rows[4]).toMatchObject({ metric: null, detail: "“Secret margin” is not a Metric you can see here." });
    expect(preview.counts).toMatchObject({ recorded: 2, refused: 4 });
    // The unseen Metric's slug and id appear nowhere in what goes back.
    const unseen = (await db().from("metrics").select("id, slug").eq("workspace_id", w.id).eq("name", "Secret margin").single()).data!;
    expect(JSON.stringify(preview)).not.toContain(unseen.slug);
    expect(JSON.stringify(preview)).not.toMatch(new RegExp(`"id":${unseen.id}\\b`));
    const done = ok(await recordPastedValues(w.actor(ann, "member"), { text }, quiet()));
    expect(brief(done.rows)).toEqual(brief(preview.rows));
    expect((await valuesOf(mine.id)).map((v) => [v.value, v.submitter_id, v.source])).toEqual([[10, ann, "web_form"], [12, ann, "web_form"]]);
    expect(await valuesOf(seen.id)).toEqual([]);
  });

  it("marks each pasted value in the intake log with the cell's text, the sender and the value it became", async () => {
    const w = await ws(); const sara = await w.person("owner");
    const m = await w.metric(sara, { name: "Revenue", unit: "€", format: "currency" }); await w.token(m.id, sara);
    ok(await recordPastedValues(w.actor(sara), { text: `Revenue\t${cell(ago(1))}\t€1,200.50` }, quiet()));
    const log = await opened("intake_log", w.id, (await db().from("intake_log").select("id, source, sender_id, raw, marks, outcome, observation_id").eq("workspace_id", w.id)).data, { dropId: true });
    const [obs] = (await db().from("observations").select("id").eq("metric_id", m.id)).data!;
    expect(log).toEqual([{ source: "web_form", sender_id: sara, raw: "€1,200.50", marks: ["paste"], outcome: "recorded", observation_id: obs.id }]);
  });

  it("lets a Guest paste for the Metrics they submit for", async () => {
    const w = await ws(); const sara = await w.person("owner"); const gus = await w.person("guest");
    const m = await w.metric(sara, { name: "Visits" }); await w.token(m.id, gus);
    const r = ok(await recordPastedValues(w.actor(gus, "guest"), { text: `Visits\t${cell(ago(1))}\t7\nRevenue\t${cell(ago(1))}\t9` }, quiet()));
    expect(brief(r.rows)).toEqual([["C1", "recorded", null], ["C2", "refused", null]]);
    expect(r.rows[1].detail).toBe("“Revenue” is not a Metric you can see here.");
  });

  it("records through a Stand-in's Token while they stand in, and not after", async () => {
    const w = await ws(); const sara = await w.person("owner"); const cleo = await w.person("member"); const ben = await w.person("member");
    const m = await w.metric(sara, { name: "Visits" });
    await db().from("tokens").insert({ code: `tk-test-${m.id}-cleo`, metric_id: m.id, submitter_id: cleo, stand_in_id: ben });
    await db().from("tokens").insert({ code: `tk-test-${m.id}-ben`, metric_id: m.id, submitter_id: ben, stands_in_for: cleo });
    const text = `Visits\t${cell(ago(1))}\t7`;
    // Spec 0046: a Stand-in's value is the submitter's and counts only for a period Ziffr asked them about, while she is Away.
    expect(brief(ok(await recordPastedValues(w.actor(ben, "member"), { text }, quiet())).rows)).toEqual([["C1", "refused", null]]);
    const today = new Date().toISOString().slice(0, 10);
    await db().from("away").insert({ user_id: cleo, starts: today, ends: today, set_by: cleo });
    await db().from("prompts").insert({ workspace_id: w.id, metric_id: m.id, submitter_id: ben, source: "web_form", text: "What?", period_start: ago(1), stands_in_for: cleo });
    expect(brief(ok(await recordPastedValues(w.actor(ben, "member"), { text }, quiet())).rows)).toEqual([["C1", "recorded", null]]);
    expect((await valuesOf(m.id)).map((v) => v.submitter_id)).toEqual([cleo]);
    await db().from("tokens").update({ stand_in_id: null }).eq("code", `tk-test-${m.id}-cleo`);
    const after = ok(await previewValues(w.actor(ben, "member"), { text: `Visits\t${cell(ago(2))}\t7` }));
    expect(after.rows[0]).toMatchObject({ outcome: "refused", metric: null });
  });

  it("offers for a two-column paste only the Metrics the person submits for on the web form", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ann = await w.person("member");
    const visits = await w.metric(sara, { name: "Visits" }); await w.token(visits.id, ann);
    const calls = await w.metric(sara, { name: "Calls", sources: ["slack"] }); await w.token(calls.id, ann);
    await w.metric(sara, { name: "Revenue" });
    expect(await pasteMetrics(w.actor(ann, "member"))).toEqual([{ id: visits.id, slug: visits.slug, name: "Visits" }]);
  });

  it("refuses an Access Key, and anything a browser sends in another shape", async () => {
    const w = await ws(); const sara = await w.person("owner");
    const key = { ...w.actor(sara), key: { id: "1", scopes: ["values:submit"] } } as unknown as Actor;
    await expect(previewValues(key, { text: "a\tb" })).rejects.toBeInstanceOf(Forbidden);
    await expect(recordPastedValues(key, { text: "a\tb" })).rejects.toBeInstanceOf(Forbidden);
    const bad = [{ text: 5 }, { text: "a\tb", leaveOut: ["c1; drop"] }, { text: "a\tb", asHistory: ["1"] }, { text: "a\tb", layout: "diagonal" }, { text: "a\tb", metricId: "x" }, { text: "a\tb", expected: { C1: "maybe" } }, { text: "a\tb", leaveOut: "C1" }];
    for (const input of bad) await expect(previewValues(w.actor(sara), input as never), JSON.stringify(input)).rejects.toThrow();
  });
});

describe("the Metric's rules", () => {
  it("writes nothing in the preview", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ada = await w.person("admin");
    const m = await w.metric(sara, { name: "Revenue" }); await w.token(m.id, sara); await checked(w, sara, ada, m.id);
    await w.value(m.id, ago(3), 100); await w.lock(m.id, ago(3));
    const before = await written(w.id);
    const r = ok(await previewValues(w.actor(sara), { text: `Revenue\t${cell(ago(3))}\t1\nRevenue\t${cell(ago(2))}\t500\nRevenue\t${cell(ago(1))}\t510` }));
    expect(brief(r.rows)).toEqual([["C1", "locked", null], ["C2", "recorded", "approval"], ["C3", "recorded", null]]);
    expect(await written(w.id)).toEqual(before);
  });

  it("gives each Submission Rule's outcome, with the value there, and records it so", async () => {
    const w = await ws(); const sara = await w.person("owner");
    const rules = ["reject", "overwrite", "add", "keep_both"] as const;
    const ms = await Promise.all(rules.map((rule) => w.metric(sara, { name: `M ${rule}`, submission_rule: rule })));
    for (const m of ms) { await w.token(m.id, sara); await w.value(m.id, ago(1), 10); }
    const text = ms.map((m) => `${m.slug}\t${cell(ago(1))}\t5`).join("\n");
    const preview = ok(await previewValues(w.actor(sara), { text }));
    expect(preview.rows.map((r) => [r.outcome, r.before, r.detail])).toEqual([
      ["duplicate", "10", expect.stringContaining("already has 10")],
      ["replaces", "10", "Replaces 10."],
      ["adds_up", "10", "Adds up: 10 + 5 = 15."],
      ["kept_beside", "10", "Kept beside 10."],
    ]);
    const done = ok(await recordPastedValues(w.actor(sara), { text }, quiet()));
    expect(done.rows.map((r) => r.outcome)).toEqual(preview.rows.map((r) => r.outcome));
    expect(await Promise.all(ms.map(async (m) => (await valuesOf(m.id)).map((v) => v.value)))).toEqual([[10], [5], [15], [10, 5]]);
  });

  it("turns a value for a Locked period into a proposed Correction to the Metric Owner", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ann = await w.person("member");
    const m = await w.metric(sara, { name: "Revenue" }); await w.token(m.id, ann); await w.value(m.id, ago(1), 100); await w.lock(m.id, ago(1));
    const fx = quiet();
    const r = ok(await recordPastedValues(w.actor(ann, "member"), { text: `Revenue\t${cell(ago(1))}\t120`, asHistory: [m.id] }, fx));
    expect(r.rows[0].outcome).toBe("locked");
    expect(fx.notifyCorrection).toHaveBeenCalledWith(expect.objectContaining({ ownerId: sara, value: 120 }));
    expect((await valuesOf(m.id)).map((v) => v.value)).toEqual([100]);
  });

  it("asks for Approval of an Unusual Value against the month before as the paste leaves it, and says who is asked", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ada = await w.person("admin"); const ann = await w.person("member");
    const m = await w.metric(sara, { name: "Revenue" }); await w.token(m.id, ann); await checked(w, sara, ada, m.id);
    await w.value(m.id, ago(4), 100);
    // 3 months ago doubles on 4 months ago; 2 months ago stays near it; 1 month ago halves.
    const text = `\t${cell(ago(3))}\t${cell(ago(2))}\t${cell(ago(1))}\nRevenue\t200\t210\t100`;
    const preview = ok(await previewValues(w.actor(ann, "member"), { text }));
    expect(brief(preview.rows)).toEqual([["B2", "recorded", "approval"], ["C2", "recorded", null], ["D2", "recorded", "approval"]]);
    expect(preview.rows[0].approval).toEqual({ reasons: [expect.stringMatching(/^up 100(\.0)? % on/)], approver: ada });
    expect(preview.approvals).toEqual([{ approver: ada, name: expect.any(String), count: 2 }]);
    const done = ok(await recordPastedValues(w.actor(ann, "member"), { text }, quiet()));
    expect(brief(done.rows)).toEqual(brief(preview.rows));
    expect(done.rows[0].approval).toEqual(preview.rows[0].approval);
  });

  it("refuses both of two values for the same period, and records neither", async () => {
    const w = await ws(); const sara = await w.person("owner");
    const m = await w.metric(sara, { name: "Revenue" }); await w.token(m.id, sara);
    const r = ok(await recordPastedValues(w.actor(sara), { text: `Revenue\t${cell(ago(1))}\t1\nRevenue\t${ago(1)}\t2\nRevenue\t${cell(ago(2))}\t3` }, quiet()));
    expect(brief(r.rows)).toEqual([["C1", "duplicate", null], ["C2", "duplicate", null], ["C3", "recorded", null]]);
    expect((await valuesOf(m.id)).map((v) => v.value)).toEqual([3]);
  });

  it("gives a value recorded by someone else after the preview its outcome at recording, and says it changed", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ann = await w.person("member");
    const m = await w.metric(sara, { name: "Revenue", submission_rule: "overwrite" }); await w.token(m.id, ann);
    const text = `Revenue\t${cell(ago(1))}\t50\nRevenue\t${cell(ago(2))}\t60`;
    const preview = ok(await previewValues(w.actor(ann, "member"), { text }));
    expect(preview.rows.map((r) => r.outcome)).toEqual(["recorded", "recorded"]);
    await w.value(m.id, ago(1), 40, sara);
    const expected = Object.fromEntries(preview.rows.map((r) => [r.place, r.outcome]));
    const done = ok(await recordPastedValues(w.actor(ann, "member"), { text, expected }, quiet()));
    expect(done.rows.map((r) => [r.outcome, r.before, r.changed ?? false])).toEqual([["replaces", "40", true], ["recorded", null, false]]);
  });

  it("refuses a Metric that has turned the web form off, and a Derived Metric", async () => {
    const w = await ws(); const sara = await w.person("owner");
    const slack = await w.metric(sara, { name: "Calls", sources: ["slack"] }); await w.token(slack.id, sara);
    const derived = await w.metric(sara, { name: "Ratio", formula: "{a} / {b}", sources: [] }); await w.token(derived.id, sara);
    const r = ok(await recordPastedValues(w.actor(sara), { text: `Calls\t${cell(ago(1))}\t1\nRatio\t${cell(ago(1))}\t2` }, quiet()));
    expect(r.rows.map((x) => [x.outcome, x.detail])).toEqual([
      ["refused", "Calls does not take values from the web form, so it takes no pasted values."],
      ["refused", "Ratio is a Derived Metric: it is computed, never submitted."],
    ]);
    expect(await valuesOf(slack.id)).toEqual([]);
  });

  it("leaves out the places asked, in the preview's counts and in the recording", async () => {
    const w = await ws(); const sara = await w.person("owner");
    const m = await w.metric(sara, { name: "Revenue" }); await w.token(m.id, sara);
    const text = `Revenue\t${cell(ago(1))}\t1\nRevenue\t${cell(ago(2))}\t2`;
    const preview = ok(await previewValues(w.actor(sara), { text, leaveOut: ["C2"] }));
    expect(preview.rows.map((r) => [r.place, r.leftOut])).toEqual([["C1", false], ["C2", true]]);
    expect(preview.counts.recorded).toBe(1);
    ok(await recordPastedValues(w.actor(sara), { text, leaveOut: ["C2"] }, quiet()));
    expect((await valuesOf(m.id)).map((v) => v.value)).toEqual([1]);
  });
});

describe("how pasted values show", () => {
  it("names the pasted values among a Metric's, only for someone who sees it, and marks them in the intake log", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ann = await w.person("member"); const eve = await w.person("member");
    const m = await w.metric(sara, { name: "Revenue" }); await w.token(m.id, sara);
    const typed = await w.value(m.id, ago(3), 5, sara);
    ok(await recordPastedValues(w.actor(sara), { text: `Revenue\t${cell(ago(2))}\t1\nRevenue\t${cell(ago(1))}\t2`, asHistory: [m.id] }, quiet()));
    const all = (await db().from("observations").select("id, period_start").eq("metric_id", m.id).order("period_start")).data!;
    expect(all).toHaveLength(3);
    expect((await pastedValueIds(w.actor(sara), m.id, all.map((o) => o.id))).sort()).toEqual(all.filter((o) => o.id !== typed).map((o) => o.id).sort());
    await expect(pastedValueIds(w.actor(eve, "member"), m.id, all.map((o) => o.id))).rejects.toThrow();
    await db().from("shares").insert({ workspace_id: w.id, object_type: "metric", object_id: m.id, user_id: ann, role: "viewer" });
    expect(await pastedValueIds(w.actor(ann, "member"), m.id, [typed])).toEqual([]);
    // The person's own intake log carries the marks; someone else's does not show theirs.
    const mine = (await sourcesView(w.actor(sara))).log.filter((l) => l.source === "web_form");
    expect(mine.map((l) => [l.raw, l.marks])).toEqual([["1", ["paste", "import"]], ["2", ["paste", "import"]]]);
    expect((await sourcesView(w.actor(ann, "member"))).log).toEqual([]);
  });
});

describe("limits", () => {
  it("refuses a paste of more than 2,000 values whole", async () => {
    const w = await ws(); const sara = await w.person("owner");
    const m = await w.metric(sara, { name: "Revenue" }); await w.token(m.id, sara);
    const text = Array.from({ length: 2001 }, (_, i) => `Revenue\t${cell(ago(1 + (i % 12)))}\t${i}`).join("\n");
    expect(await recordPastedValues(w.actor(sara), { text }, quiet())).toMatchObject({ ok: false, reason: "too_many_values" });
    expect(await valuesOf(m.id)).toEqual([]);
  });

  it("refuses a paste that would cross the day's 10,000 values whole, with the number left", async () => {
    const w = await ws(); const sara = await w.person("owner");
    const m = await w.metric(sara, { name: "Revenue" }); await w.token(m.id, sara);
    // Earlier pastes, in this Workspace or another: the limit is the person's.
    await db().from("paste_claims").insert([{ person_id: sara, value_count: 6000 }, { person_id: sara, value_count: PASTED_VALUES_PER_DAY - 6001 }]);
    // Yesterday's pastes no longer count.
    await db().from("paste_claims").insert({ person_id: sara, value_count: 5000, at: new Date(Date.now() - 90_000_000).toISOString() });
    const text = `Revenue\t${cell(ago(1))}\t1\nRevenue\t${cell(ago(2))}\t2`;
    expect(ok(await previewValues(w.actor(sara), { text })).leftToday).toBe(1);
    const r = await recordPastedValues(w.actor(sara), { text }, quiet());
    expect(r).toEqual({ ok: false, reason: "daily_limit", detail: "You may paste 10,000 values a day; 1 are left today, and this paste holds 2. Nothing was recorded." });
    expect(await valuesOf(m.id)).toEqual([]);
    expect(ok(await recordPastedValues(w.actor(sara), { text: `Revenue\t${cell(ago(1))}\t1` }, quiet())).leftToday).toBe(0);
  });

  it("gives the demo's shared made-up people a smaller day, and previews a paste there", async () => {
    const { data: who } = await db().from("memberships").select("user_id, role").eq("workspace_id", DEMO_WORKSPACE_ID).limit(1).maybeSingle();
    // The demo is seeded by supabase/seed.sql; without it there is nothing to try.
    if (!who) return;
    const actor = { personId: String(who.user_id), workspaceId: DEMO_WORKSPACE_ID, role: who.role } as Actor;
    const { data: before } = await db().from("paste_claims").select("value_count").eq("person_id", actor.personId).gt("at", new Date(Date.now() - 86_400_000).toISOString());
    const used = (before ?? []).reduce((a, c) => a + Number(c.value_count), 0);
    const r = ok(await previewValues(actor, { text: `Nothing here\t${cell(ago(1))}\t1` }));
    expect(r.leftToday).toBe(Math.max(0, PASTED_VALUES_PER_DAY_IN_DEMO - used));
    expect(r.rows[0]).toMatchObject({ outcome: "refused", metric: null });
  });

  it("lets only one of two pastes at once take the last values of the day", async () => {
    const w = await ws(); const sara = await w.person("owner");
    const m = await w.metric(sara, { name: "Revenue", submission_rule: "keep_both" }); await w.token(m.id, sara);
    await db().from("paste_claims").insert({ person_id: sara, value_count: PASTED_VALUES_PER_DAY - 2 });
    const text = `Revenue\t${cell(ago(1))}\t1\nRevenue\t${cell(ago(2))}\t2`;
    const both = await Promise.all([recordPastedValues(w.actor(sara), { text }, quiet()), recordPastedValues(w.actor(sara), { text }, quiet())]);
    expect(both.map((r) => r.ok).sort()).toEqual([false, true]);
    expect(await valuesOf(m.id)).toHaveLength(2);
  });
});

describe("Record as history", () => {
  it("is offered to the Metric Owner and to an Owner or Admin who submits for it, and to nobody else", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ada = await w.person("admin"); const ann = await w.person("member"); const mo = await w.person("member");
    const own = await w.metric(mo, { name: "Own" }); await w.token(own.id, mo);
    const theirs = await w.metric(sara, { name: "Theirs" }); for (const p of [ada, ann]) await w.token(theirs.id, p);
    const seen = await w.metric(mo, { name: "Seen" });
    await db().from("shares").insert({ workspace_id: w.id, object_type: "metric", object_id: seen.id, user_id: ada, role: "editor" });
    const text = `Own\t${cell(ago(1))}\t1\nTheirs\t${cell(ago(1))}\t2\nSeen\t${cell(ago(1))}\t3`;
    const offered = async (who: string, role: Actor["role"]) => ok(await previewValues(w.actor(who, role), { text })).historyMetrics.map((x) => x.name);
    expect(await offered(mo, "member")).toEqual(["Own"]);
    expect(await offered(ada, "admin")).toEqual(["Theirs"]);
    expect(await offered(ann, "member")).toEqual([]);
  });

  it("records empty past periods as an Import, without the Unusual Value check, marked as imported", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ada = await w.person("admin");
    const m = await w.metric(sara, { name: "Revenue", submission_rule: "overwrite" }); await w.token(m.id, sara); await checked(w, sara, ada, m.id);
    await w.value(m.id, ago(4), 100); await w.value(m.id, ago(2), 100);
    // 3 months ago would be unusual; 2 months ago has a value and is checked as usual; this month is never history.
    const text = `\t${cell(ago(3))}\t${cell(ago(2))}\t${cell(thisMonth())}\nRevenue\t900\t2000\t1100`;
    const preview = ok(await previewValues(w.actor(sara), { text, asHistory: [m.id] }));
    expect(brief(preview.rows)).toEqual([["B2", "history", null], ["C2", "replaces", "approval"], ["D2", "recorded", null]]);
    expect(preview.counts).toMatchObject({ history: 1, replaces: 1, recorded: 1 });
    const done = ok(await recordPastedValues(w.actor(sara), { text, asHistory: [m.id] }, quiet()));
    expect(brief(done.rows)).toEqual(brief(preview.rows));
    const { data: obs } = await db().from("observations").select("id, period_start, value, value_sealed, imported").eq("metric_id", m.id).order("period_start");
    expect((await opened("observations", w.id, obs)).map((o) => [o.period_start, Number(o.value), o.imported])).toEqual([[ago(4), 100, false], [ago(3), 900, true], [ago(2), 2000, false], [thisMonth(), 1100, false]]);
    const log = await opened("intake_log", w.id, (await db().from("intake_log").select("id, marks").eq("workspace_id", w.id).order("id")).data, { dropId: true });
    expect(log!.map((l) => l.marks)).toEqual([["paste", "import"], ["paste"], ["paste"]]);
  });

  it("is refused to anyone else even when the request asks for it: the values are checked", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ada = await w.person("admin"); const ann = await w.person("member");
    const m = await w.metric(sara, { name: "Revenue" }); await w.token(m.id, ann); await checked(w, sara, ada, m.id);
    await w.value(m.id, ago(2), 100);
    const text = `Revenue\t${cell(ago(1))}\t900`;
    expect(brief(ok(await previewValues(w.actor(ann, "member"), { text, asHistory: [m.id] })).rows)).toEqual([["C1", "recorded", "approval"]]);
    const done = ok(await recordPastedValues(w.actor(ann, "member"), { text, asHistory: [m.id] }, quiet()));
    expect(brief(done.rows)).toEqual([["C1", "recorded", "approval"]]);
    const { data: obs } = await db().from("observations").select("imported").eq("metric_id", m.id).eq("period_start", ago(1));
    expect(obs).toEqual([{ imported: false }]);
  });
});

describe("the preview and the recording agree", () => {
  it("gives every value the outcome the preview gave when nothing changed in between", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom("reject", "overwrite", "add", "keep_both"),
        fc.array(fc.option(fc.integer({ min: 0, max: 400 }), { nil: null }), { minLength: 6, maxLength: 6 }),
        fc.array(fc.option(fc.integer({ min: 1, max: 400 }), { nil: null }), { minLength: 6, maxLength: 6 }),
        fc.boolean(),
        fc.integer({ min: 0, max: 5 }),
        async (rule, before, pasted, history, lockedAt) => {
          const w = await workspace();
          try {
            const sara = await w.person("owner"); const ada = await w.person("admin");
            const m = await w.metric(sara, { name: "Revenue", submission_rule: rule }); await w.token(m.id, sara); await checked(w, sara, ada, m.id);
            for (const [i, v] of before.entries()) if (v !== null) await w.value(m.id, ago(6 - i), v);
            if (before[lockedAt] !== null) await w.lock(m.id, ago(6 - lockedAt));
            const text = `\t${pasted.map((_, i) => cell(ago(6 - i))).join("\t")}\nRevenue\t${pasted.map((v) => v ?? "").join("\t")}`;
            const input = { text, asHistory: history ? [m.id] : [] };
            const preview = ok(await previewValues(w.actor(sara), input));
            const done = ok(await recordPastedValues(w.actor(sara), input, quiet()));
            expect(brief(done.rows)).toEqual(brief(preview.rows));
          } finally {
            await w.cleanup();
          }
        },
      ),
      { numRuns: 6 },
    );
  }, 900_000);
});

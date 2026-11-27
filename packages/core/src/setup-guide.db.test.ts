// The Setup Guide against the real database (spec 0052, spec 0067; GLOSSARY: Setup Guide, Business Function): each tick
// from real rows, who has a guide (a Member only), the first Metric an Owner picks, the tables being the core's alone,
// a person's rows going with their membership, and the move of the Trial Guide's columns into the new tables.
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { Forbidden } from "./actor";
import { db } from "./db";
import { setPreference } from "./questions";
import { DEMO_WORKSPACE_ID } from "./team";
import {
  hideSetupGuide, markSetupGuideSeen, reopenSetupGuide, seenFirstMetric, setSetupFirstMetric, setupGuide, setupGuidePending,
  setupLine, skipSetupStep, startSetupGuide,
} from "./setup-guide";
import { workspace } from "./test/db-fixtures";

const MAIL = { ZIFFR_SMTP_URL: process.env.TEST_SMTP_URL ?? "smtp://127.0.0.1:55425", ZIFFR_MAIL_FROM: "Ziffr <ziffr@example.test>", ZIFFR_SITE_URL: "https://ziffr.example.test" };
const made: Awaited<ReturnType<typeof workspace>>[] = [];
afterEach(async () => {
  for (const k of Object.keys(MAIL)) delete process.env[k];
  for (const w of made.splice(0)) {
    await db().from("deliveries").delete().eq("workspace_id", w.id);
    await w.cleanup();
  }
});
async function fresh() {
  const w = await workspace("Guide Co");
  made.push(w);
  const owner = await w.person("owner", { email: `o-${randomUUID().slice(0, 8)}@example.test` });
  return { w, owner, o: w.actor(owner, "owner") };
}
const ids = async (a: Parameters<typeof setupGuide>[0]) => (await setupGuide(a))!.steps.filter((s) => s.ticked).map((s) => s.id);
async function withMember() {
  const f = await fresh();
  const person = await f.w.person("member");
  return { ...f, person, member: f.w.actor(person, "member") };
}
const firstMetricId = async (ws: string) => (await db().from("setup_guides").select("first_metric_id").eq("workspace_id", ws).single()).data!.first_metric_id as number | null;

describe("who has a guide", () => {
  it("is a Member's only: no Owner, Admin or Guest has one, and never the demo", async () => {
    const { w, o, member } = await withMember();
    await startSetupGuide(o);
    expect((await setupGuide(member))!.steps.map((s) => s.id)).toEqual(["about", "ways"]);
    for (const a of [o, w.actor(await w.person("admin"), "admin"), w.actor(await w.person("guest"), "guest")]) {
      expect(await setupGuide(a)).toBeNull();
      expect(await setupGuidePending(a)).toBe(false);
      expect(await setupLine(a)).toEqual({ applies: false, shown: false, done: 0, total: 0, next: null });
      await expect(skipSetupStep(a, "about")).rejects.toBeInstanceOf(Forbidden);
      await expect(hideSetupGuide(a)).rejects.toBeInstanceOf(Forbidden);
      await expect(reopenSetupGuide(a)).rejects.toBeInstanceOf(Forbidden);
      await expect(markSetupGuideSeen(a)).rejects.toBeInstanceOf(Forbidden);
    }
    const demo = { personId: o.personId, workspaceId: DEMO_WORKSPACE_ID, role: "member" as const };
    expect(await setupGuide(demo)).toBeNull();
    expect(await setupGuidePending(demo)).toBe(false);
    // The demo shows none of it: no line, and every write is refused (spec 0052, ticket 12).
    expect(await setupLine(demo)).toEqual({ applies: false, shown: false, done: 0, total: 0, next: null });
    await expect(setSetupFirstMetric({ ...demo, role: "owner" }, null)).rejects.toBeInstanceOf(Forbidden);
    await expect(skipSetupStep(demo, "about")).rejects.toBeInstanceOf(Forbidden);
    // The demo guard refuses the row even to the service role.
    await expect(startSetupGuide({ ...demo, role: "owner" })).resolves.toBeUndefined();
    expect((await db().from("setup_guides").select("workspace_id").eq("workspace_id", DEMO_WORKSPACE_ID)).data).toEqual([]);
    await expect((async () => { await db().from("setup_guides").insert({ workspace_id: DEMO_WORKSPACE_ID }); })()).rejects.toThrow(/demo/i);
    await expect((async () => { await db().from("business_functions").insert({ workspace_id: DEMO_WORKSPACE_ID, person_id: o.personId, function: "sales" }); })()).rejects.toThrow(/demo/i);
    await expect((async () => { await db().from("setup_guide_people").insert({ workspace_id: DEMO_WORKSPACE_ID, person_id: o.personId }); })()).rejects.toThrow(/demo/i);
  });
});

describe("the ticks from real rows", () => {
  it("About you: the Member's own function", async () => {
    const { w, owner, person, member } = await withMember();
    await db().from("business_functions").insert({ workspace_id: w.id, person_id: owner, function: "finance" });
    expect(await ids(member)).toEqual([]);
    await db().from("business_functions").insert({ workspace_id: w.id, person_id: person, function: "sales" });
    expect(await ids(member)).toEqual(["about"]);
  });

  it("Ways in and out: a Delivery Preference whose first way is real here, the Member's own only", async () => {
    const { o, person, member } = await withMember();
    Object.assign(process.env, MAIL);
    await setPreference(o, o.personId, "reminder", "email");
    expect(await ids(member)).toEqual([]);
    await setPreference(member, person, "reminder", "email");
    expect(await ids(member)).toEqual(["ways"]);
    // No mail server: email is only simulated, so it does not count.
    for (const k of Object.keys(MAIL)) delete process.env[k];
    expect(await ids(member)).toEqual([]);
  });
});

describe("the first Metric", () => {
  it("is picked by an Owner or Admin, and only a Metric they see in the Workspace is accepted", async () => {
    const { w, owner, o, member } = await withMember();
    const m = await w.metric(owner);
    await setSetupFirstMetric(o, m.id);
    expect(await firstMetricId(w.id)).toBe(m.id);
    // A Metric of another Workspace, a made-up id, a bad value and a Member are refused.
    const x = await fresh();
    const foreign = await x.w.metric(x.owner);
    await expect(setSetupFirstMetric(o, foreign.id)).rejects.toBeInstanceOf(Forbidden);
    await expect(setSetupFirstMetric(o, 1.5)).rejects.toBeInstanceOf(Forbidden);
    await expect(setSetupFirstMetric(member, m.id)).rejects.toBeInstanceOf(Forbidden);
    await setSetupFirstMetric(o, null);
    expect(await firstMetricId(w.id)).toBeNull();
  });

  it("is not named to a viewer who may not see it", async () => {
    const { w, owner, o, member } = await withMember();
    const m = await w.metric(owner);
    expect(await seenFirstMetric(member, m.id)).toBeNull();
    expect((await seenFirstMetric(o, m.id))?.name).toBe("Field visits");
  });
});

describe("skips, hiding and opening", () => {
  it("a Member skips only the guide's two steps, on their own row", async () => {
    const { w, member } = await withMember();
    const other = w.actor(await w.person("member"), "member");
    await skipSetupStep(member, "about");
    await skipSetupStep(member, "about");
    await expect(skipSetupStep(member, "team")).rejects.toBeInstanceOf(Forbidden);
    await expect(skipSetupStep(member, "nowhere")).rejects.toBeInstanceOf(Forbidden);
    expect((await setupGuide(member))!.steps.map((s) => s.skipped)).toEqual([true, false]);
    expect((await setupGuide(other))!.steps.map((s) => s.skipped)).toEqual([false, false]);
    expect((await db().from("setup_guides").select("skipped").eq("workspace_id", w.id)).data ?? []).toEqual([]);
    // Step names only: no person, address or Metric (details may be sealed where the Workspace has a key).
    const { data: log } = await db().from("audit_events").select("details").eq("workspace_id", w.id).eq("kind", "setup.step_skipped");
    expect(log).toHaveLength(1);
    expect(JSON.stringify(log).includes("@")).toBe(false);
  });

  it("a guide finished before stays quiet", async () => {
    const { w, o, member } = await withMember();
    await startSetupGuide(o);
    expect((await setupGuide(member))!.lineShown).toBe(true);
    await db().from("setup_guides").update({ finished_at: new Date().toISOString() }).eq("workspace_id", w.id);
    expect((await setupGuide(member))!.lineShown).toBe(false);
  });

  it("hides and reopens for the person only; a Workspace without a row shows no line", async () => {
    const { w, o, member } = await withMember();
    const other = w.actor(await w.person("member"), "member");
    expect((await setupGuide(member))!.lineShown).toBe(false);
    expect(await setupGuidePending(member)).toBe(false);
    await startSetupGuide(o);
    await hideSetupGuide(member);
    expect((await setupGuide(member))!).toMatchObject({ hidden: true, lineShown: false });
    expect((await setupGuide(other))!).toMatchObject({ hidden: false, lineShown: true });
    await reopenSetupGuide(member);
    expect((await setupGuide(member))!).toMatchObject({ hidden: false, lineShown: true });
  });

  it("opens by itself once per person", async () => {
    const { w, o, person, member } = await withMember();
    expect(await setupGuidePending(member)).toBe(false);
    await startSetupGuide(o);
    await startSetupGuide(o);
    const other = w.actor(await w.person("member"), "member");
    expect(await setupGuidePending(member)).toBe(true);
    await markSetupGuideSeen(member);
    await markSetupGuideSeen(member);
    expect(await setupGuidePending(member)).toBe(false);
    expect(await setupGuidePending(other)).toBe(true);
    expect((await setupGuide(member))!.seen).toBe(true);
    expect((await db().from("setup_guide_people").select("first_seen_at").eq("person_id", person)).data).toHaveLength(1);
  });
});

describe("the tables are the core's alone", () => {
  it("cannot be read or written by the public roles, nor their functions", async () => {
    const { w, owner, o, member } = await withMember();
    await startSetupGuide(o);
    await markSetupGuideSeen(member);
    await db().from("business_functions").insert({ workspace_id: w.id, person_id: owner, function: "finance" });
    const { createClient } = await import("@supabase/supabase-js");
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
    const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? "anon", { auth: { persistSession: false } });
    for (const table of ["setup_guides", "setup_guide_people", "business_functions"]) {
      const read = await anon.from(table).select("*");
      expect(read.data ?? []).toEqual([]);
      expect((await anon.from(table).insert({ workspace_id: w.id })).error).not.toBeNull();
      expect((await anon.from(table).delete().eq("workspace_id", w.id)).data ?? []).toEqual([]);
    }
    expect((await anon.rpc("setup_guide_skip", { p_workspace: w.id, p_step: "about" })).error).not.toBeNull();
    expect((await anon.rpc("setup_guide_person_skip", { p_workspace: w.id, p_person: owner, p_step: "about" })).error).not.toBeNull();
    expect((await anon.rpc("setup_guide_contact_submits", { p_workspace: w.id })).error).not.toBeNull();
    expect((await anon.rpc("setup_guide_move_trial_state")).error).not.toBeNull();
    // Still all there for the core.
    expect((await db().from("business_functions").select("function").eq("person_id", owner)).data).toEqual([{ function: "finance" }]);
  });

  it("only takes the fixed lists", async () => {
    const { w, owner } = await fresh();
    expect((await db().from("business_functions").insert({ workspace_id: w.id, person_id: owner, function: "wizard" })).error).not.toBeNull();
    await startSetupGuide(w.actor(owner, "owner"));
    expect((await db().from("setup_guides").update({ skipped: ["nowhere"] }).eq("workspace_id", w.id)).error).not.toBeNull();
    expect((await db().from("setup_guides").update({ starting_point: "magic" }).eq("workspace_id", w.id)).error).not.toBeNull();
    expect((await db().from("setup_guide_people").insert({ workspace_id: w.id, person_id: owner, skipped: ["team"] })).error).not.toBeNull();
  });

  it("a person's rows go with their membership, and no one else's", async () => {
    const { w, owner } = await fresh();
    const m = await w.person("member");
    for (const p of [owner, m]) {
      await db().from("business_functions").insert({ workspace_id: w.id, person_id: p, function: "sales" });
      await db().from("setup_guide_people").insert({ workspace_id: w.id, person_id: p, first_seen_at: new Date().toISOString() });
    }
    await w.dropMember(m);
    expect((await db().from("business_functions").select("person_id").eq("workspace_id", w.id)).data).toEqual([{ person_id: owner }]);
    expect((await db().from("setup_guide_people").select("person_id").eq("workspace_id", w.id)).data).toEqual([{ person_id: owner }]);
  });
});

describe("the move of the Trial Guide's state", () => {
  async function trialWith(over: Record<string, unknown>) {
    const { w, owner } = await fresh();
    const m = await w.metric(owner, { name: "Cups of coffee" });
    await db().from("workspaces").update({ trial_test_metric_id: m.id, ...over }).eq("id", w.id);
    return { w, owner, m };
  }

  it("gives every guide a row: the Test Metric is the First Metric, finished stays finished, Done counts as finished", async () => {
    const open = await trialWith({ trial_guide_step: "connect" });
    const skipped = await trialWith({ trial_guide_step: "where", trial_guide_finished_at: "2027-01-02T10:00:00Z" });
    const done = await trialWith({ trial_guide_step: "done" });
    const never = await fresh();
    await db().rpc("setup_guide_move_trial_state");
    const row = async (id: string) => (await db().from("setup_guides").select("*").eq("workspace_id", id).maybeSingle()).data;
    expect(await row(open.w.id)).toMatchObject({ first_metric_id: open.m.id, finished_at: null, starting_point: "scratch" });
    expect(await row(skipped.w.id)).toMatchObject({ finished_at: "2027-01-02T10:00:00+00:00" });
    expect((await row(done.w.id))!.finished_at).not.toBeNull();
    // A Workspace that never had the guide gets none, and the demo none.
    expect(await row(never.w.id)).toBeNull();
    expect(await row(DEMO_WORKSPACE_ID)).toBeNull();
    // The Owner has seen it, so it does not open again by itself; the old columns are as they were.
    expect(await setupGuidePending(open.w.actor(open.owner, "owner"))).toBe(false);
    expect((await db().from("workspaces").select("trial_guide_step").eq("id", open.w.id).single()).data).toEqual({ trial_guide_step: "connect" });
    // Running it again changes nothing.
    await db().from("setup_guides").update({ skipped: ["team"] }).eq("workspace_id", open.w.id);
    await db().rpc("setup_guide_move_trial_state");
    expect((await row(open.w.id))!.skipped).toEqual(["team"]);
  });

  it("keeps the trial's Test Metric as the first Metric the Owner sees", async () => {
    const t = await trialWith({ trial_guide_step: "ask" });
    await db().rpc("setup_guide_move_trial_state");
    const owner = t.w.actor(t.owner, "owner");
    expect(await seenFirstMetric(owner, await firstMetricId(t.w.id))).toEqual({ id: t.m.id, name: "Cups of coffee" });
  });

  it("hiding is per Workspace: the same person hides one Workspace's line and still sees the other's", async () => {
    const first = await withMember();
    const second = await workspace("Second Guide Co");
    made.push(second);
    await db().from("memberships").insert({ workspace_id: second.id, user_id: first.person, role: "member" });
    const a = first.member;
    await startSetupGuide(first.o);
    await hideSetupGuide(a);
    expect(await setupLine(a)).toMatchObject({ shown: false });
    // The other Workspace has its own row for the same person: nothing was hidden there.
    const b = { ...a, workspaceId: second.id };
    await startSetupGuide({ ...b, role: "owner" });
    expect(await setupLine(b)).toMatchObject({ shown: true, total: 2 });
  });
});

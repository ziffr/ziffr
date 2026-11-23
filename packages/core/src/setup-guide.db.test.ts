// The Setup Guide against the real database (spec 0052, ticket 1; GLOSSARY: Setup Guide, Business Function): each tick
// from real rows, skips that cannot lose each other, who has a guide, the tables being the core's alone, a person's
// rows going with their membership, and the move of the Trial Guide's columns into the new tables.
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { Forbidden } from "./actor";
import { db } from "./db";
import { setPreference } from "./questions";
import { DEMO_WORKSPACE_ID } from "./team";
import { setWorkspaceClock } from "./workspace-clock";
import { setWorkspaceProfile } from "./workspace-settings";
import {
  chooseExploreOnMyOwn, hideSetupGuide, markSetupGuideSeen, reopenSetupGuide, setSetupFirstMetric, setupGuide, setupGuidePending,
  skipSetupStep, startSetupGuide,
} from "./setup-guide";
import { SETUP_STEPS } from "./setup-steps";
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

describe("who has a guide", () => {
  it("is for Owners, Admins and Members, never a Guest, and never the demo", async () => {
    const { w, o } = await fresh();
    const admin = w.actor(await w.person("admin"), "admin");
    const member = w.actor(await w.person("member"), "member");
    const guest = w.actor(await w.person("guest"), "guest");
    expect((await setupGuide(o))!.steps.map((s) => s.id)).toEqual([...SETUP_STEPS]);
    expect((await setupGuide(admin))!.steps).toHaveLength(5);
    expect((await setupGuide(member))!.steps.map((s) => s.id)).toEqual(["about", "ways"]);
    expect(await setupGuide(guest)).toBeNull();
    expect(await setupGuidePending(guest)).toBe(false);
    await expect(skipSetupStep(guest, "about")).rejects.toBeInstanceOf(Forbidden);
    await expect(hideSetupGuide(guest)).rejects.toBeInstanceOf(Forbidden);
    const demo = { personId: o.personId, workspaceId: DEMO_WORKSPACE_ID, role: "owner" as const };
    expect(await setupGuide(demo)).toBeNull();
    expect(await setupGuidePending(demo)).toBe(false);
    await expect(skipSetupStep(demo, "about")).rejects.toBeInstanceOf(Forbidden);
    // The demo guard refuses the row even to the service role.
    await expect(startSetupGuide(DEMO_WORKSPACE_ID)).resolves.toBeUndefined();
    expect((await db().from("setup_guides").select("workspace_id").eq("workspace_id", DEMO_WORKSPACE_ID)).data).toEqual([]);
    await expect((async () => { await db().from("setup_guides").insert({ workspace_id: DEMO_WORKSPACE_ID }); })()).rejects.toThrow(/demo/i);
    await expect((async () => { await db().from("business_functions").insert({ workspace_id: DEMO_WORKSPACE_ID, person_id: o.personId, function: "sales" }); })()).rejects.toThrow(/demo/i);
    await expect((async () => { await db().from("setup_guide_people").insert({ workspace_id: DEMO_WORKSPACE_ID, person_id: o.personId }); })()).rejects.toThrow(/demo/i);
  });
});

describe("the ticks from real rows", () => {
  it("About you: the profile and a saved clock, a UTC Workspace ticks by saving", async () => {
    const { o } = await fresh();
    expect(await ids(o)).toEqual([]);
    await setWorkspaceProfile(o, { industry: "saas", country: "DE" });
    expect(await ids(o)).toEqual([]);
    // Saved as it already is (UTC): still a save.
    await setWorkspaceClock(o, { timeZone: "UTC", runHour: 8 });
    expect(await ids(o)).toEqual(["about"]);
  });

  it("Starting point: exploring alone, a Metric or a Pack", async () => {
    const a = await fresh();
    await chooseExploreOnMyOwn(a.o);
    expect(await ids(a.o)).toEqual(["start"]);
    expect((await setupGuide(a.o))!.startingPoint).toBe("scratch");
    const b = await fresh();
    await b.w.metric(b.owner);
    expect(await ids(b.o)).toEqual(["start"]);
  });

  it("Ways in and out: a Delivery Preference whose first way is real here, a Member's own only", async () => {
    const { w, o } = await fresh();
    await setPreference(o, o.personId, "reminder", "email");
    // No mail server: email is only simulated, so it does not count.
    expect(await ids(o)).toEqual([]);
    Object.assign(process.env, MAIL);
    expect(await ids(o)).toEqual(["ways"]);
    // A Member's own preference counts, not the Owner's.
    const member = w.actor(await w.person("member"), "member");
    expect(await ids(member)).toEqual([]);
  });

  it("Team: another member, an invitation waiting, Domain Joining, or a Contact who submits", async () => {
    const a = await fresh();
    expect(await ids(a.o)).toEqual([]);
    await a.w.person("member");
    expect(await ids(a.o)).toEqual(["team"]);
    const b = await fresh();
    await db().from("invitations").insert({ workspace_id: b.w.id, token: randomUUID(), role: "member", created_by: b.owner, expires_at: new Date(Date.now() - 1000).toISOString() });
    expect(await ids(b.o)).toEqual([]);
    await db().from("invitations").insert({ workspace_id: b.w.id, token: randomUUID(), role: "member", created_by: b.owner, expires_at: new Date(Date.now() + 86_400_000).toISOString(), revoked_at: new Date().toISOString() });
    expect(await ids(b.o)).toEqual([]);
    await db().from("invitations").insert({ workspace_id: b.w.id, token: randomUUID(), role: "member", created_by: b.owner, expires_at: new Date(Date.now() + 86_400_000).toISOString() });
    expect(await ids(b.o)).toEqual(["team"]);
    const c = await fresh();
    await db().from("workspaces").update({ join_domain: "guide-co.test" }).eq("id", c.w.id);
    expect(await ids(c.o)).toEqual(["team"]);
    const d = await fresh();
    const contact = await d.w.contact({ email: "field@contact.test" });
    expect(await ids(d.o)).toEqual([]);
    const m = await d.w.metric(d.owner);
    await d.w.token(m.id, contact);
    expect(await ids(d.o)).toEqual(["start", "team"]);
  });

  it("First Metric: a Prompt out and a value in, by the viewer, for the guide's Metric; ticks for any Admin who did both", async () => {
    const { w, owner, o } = await fresh();
    const m = await w.metric(owner);
    await startSetupGuide(w.id);
    await setSetupFirstMetric(o, m.id);
    expect((await setupGuide(o))!.firstMetric).toEqual({ id: m.id, name: "Field visits" });
    expect(await ids(o)).toEqual(["start"]);
    const { data: p } = await db().from("prompts").insert({ metric_id: m.id, submitter_id: owner, source: "email", text: "Field visits?", period_start: "2027-01-01", workspace_id: w.id }).select("id").single();
    const delivery = { workspace_id: w.id, connector: "email", recipient_id: owner, kind: "prompt", subject: "Field visits?", body: "x", prompt_id: p!.id };
    await db().from("deliveries").insert({ ...delivery, mail_state: "outbox" });
    expect(await ids(o)).toEqual(["start"]);
    // Held by Quiet Hours counts as asked; sent counts too.
    await db().from("deliveries").insert({ ...delivery, mail_state: "queued", not_before: new Date(Date.now() + 3_600_000).toISOString() });
    await w.value(m.id, "2027-01-01", 5, owner);
    expect(await ids(o)).toEqual(["start", "first_metric"]);
    // Someone else's value does not count for another viewer, but the Admin who did both ticks it for the Workspace's guide.
    const admin = await w.person("admin");
    expect(await ids(w.actor(admin, "admin"))).toEqual(["start", "team"]);
  });

  it("First Metric: a value from before the guide, or by another person, does not count; only a seen Metric is accepted", async () => {
    const { w, owner, o } = await fresh();
    const m = await w.metric(owner);
    const other = await w.person("member");
    await w.value(m.id, "2026-12-01", 3, owner);
    await startSetupGuide(w.id);
    await setSetupFirstMetric(o, m.id);
    await w.value(m.id, "2027-01-01", 9, other);
    const { data: p } = await db().from("prompts").insert({ metric_id: m.id, submitter_id: owner, source: "email", text: "?", period_start: "2027-01-01", workspace_id: w.id }).select("id").single();
    await db().from("deliveries").insert({ workspace_id: w.id, connector: "email", recipient_id: owner, kind: "prompt", subject: "s", body: "b", prompt_id: p!.id, mail_state: "sent" });
    expect(await ids(o)).not.toContain("first_metric");
    // A Metric of another Workspace, a made-up id and a bad value are refused.
    const x = await fresh();
    const foreign = await x.w.metric(x.owner);
    await expect(setSetupFirstMetric(o, foreign.id)).rejects.toBeInstanceOf(Forbidden);
    await expect(setSetupFirstMetric(o, 1.5)).rejects.toBeInstanceOf(Forbidden);
    await expect(setSetupFirstMetric(w.actor(other, "member"), m.id)).rejects.toBeInstanceOf(Forbidden);
    await setSetupFirstMetric(o, null);
    expect((await setupGuide(o))!.firstMetric).toBeNull();
  });

  it("the guide's Metric is not named to a viewer who may not see it", async () => {
    const { w, owner, o } = await fresh();
    const m = await w.metric(owner);
    await startSetupGuide(w.id);
    await setSetupFirstMetric(o, m.id);
    const member = await w.person("member");
    await db().from("setup_guides").update({ first_metric_id: m.id }).eq("workspace_id", w.id);
    // A Member has no First Metric step, and a Member who cannot see the Metric is never told its name.
    expect((await setupGuide(w.actor(member, "member")))!.firstMetric).toBeNull();
    expect((await setupGuide(o))!.firstMetric?.name).toBe("Field visits");
  });
});

describe("skips, hiding and finishing", () => {
  it("two Admins skipping at once lose neither, and the same skip is written once", async () => {
    const { w, o } = await fresh();
    await startSetupGuide(w.id);
    const admin = w.actor(await w.person("admin"), "admin");
    await Promise.all([skipSetupStep(o, "about"), skipSetupStep(admin, "ways"), skipSetupStep(o, "team"), skipSetupStep(admin, "team")]);
    const { data } = await db().from("setup_guides").select("skipped").eq("workspace_id", w.id).single();
    expect([...(data!.skipped as string[])].sort()).toEqual(["about", "team", "ways"]);
    const { data: log } = await db().from("audit_events").select("details").eq("workspace_id", w.id).eq("kind", "setup.step_skipped");
    expect(log).toHaveLength(3);
    expect(log!.every((r) => Object.keys(r.details as object).join() === "step")).toBe(true);
    // Skipped for the Workspace: the other Admin sees it too, and it is not a tick.
    const g = (await setupGuide(admin))!;
    expect(g.steps.find((s) => s.id === "about")).toMatchObject({ skipped: true, ticked: false });
  });

  it("a Member skips only their own two steps, on their own row", async () => {
    const { w, o } = await fresh();
    const m = await w.person("member");
    const member = w.actor(m, "member");
    await skipSetupStep(member, "about");
    await expect(skipSetupStep(member, "team")).rejects.toBeInstanceOf(Forbidden);
    await expect(skipSetupStep(member, "nowhere")).rejects.toBeInstanceOf(Forbidden);
    await expect(skipSetupStep(o, "nowhere")).rejects.toBeInstanceOf(Forbidden);
    expect((await setupGuide(member))!.steps.map((s) => s.skipped)).toEqual([true, false]);
    // Not the Owner's: an Owner's skips are the Workspace's.
    expect((await setupGuide(o))!.steps.find((s) => s.id === "about")!.skipped).toBe(false);
    expect((await db().from("setup_guides").select("skipped").eq("workspace_id", w.id)).data ?? []).toEqual([]);
    await expect(chooseExploreOnMyOwn(member)).rejects.toBeInstanceOf(Forbidden);
  });

  it("finishes once, when every step an Owner sees is done, and the line goes for everyone", async () => {
    const { w, o } = await fresh();
    await startSetupGuide(w.id);
    const member = w.actor(await w.person("member"), "member");
    expect((await setupGuide(member))!.lineShown).toBe(true);
    for (const s of SETUP_STEPS) await skipSetupStep(o, s);
    // (The Member just added ticks Team; the other four were skipped.)
    const g = (await setupGuide(o))!;
    expect(g).toMatchObject({ finished: true, workspaceFinished: true, lineShown: false, ticked: 1 });
    await setupGuide(o);
    expect((await db().from("audit_events").select("id").eq("workspace_id", w.id).eq("kind", "setup.finished")).data).toHaveLength(1);
    expect((await setupGuide(member))!.lineShown).toBe(false);
    // Unticking later does not reopen it, and the true state is still shown.
    expect((await db().from("setup_guides").select("finished_at").eq("workspace_id", w.id).single()).data!.finished_at).not.toBeNull();
  });

  it("hides and reopens for the person only; a Workspace without a row gets one when it is reopened", async () => {
    const { w, o } = await fresh();
    const admin = w.actor(await w.person("admin"), "admin");
    expect((await setupGuide(o))!.started).toBe(false);
    expect((await setupGuide(o))!.lineShown).toBe(false);
    expect(await setupGuidePending(o)).toBe(false);
    await reopenSetupGuide(o);
    expect((await setupGuide(o))!).toMatchObject({ started: true, lineShown: true, hidden: false });
    await hideSetupGuide(o);
    expect((await setupGuide(o))!).toMatchObject({ hidden: true, lineShown: false });
    expect((await setupGuide(admin))!).toMatchObject({ hidden: false, lineShown: true });
    await reopenSetupGuide(o);
    expect((await setupGuide(o))!.hidden).toBe(false);
  });

  it("opens by itself once per person, and not for a Workspace made before the guide", async () => {
    const { w, owner, o } = await fresh();
    expect(await setupGuidePending(o)).toBe(false);
    await startSetupGuide(w.id);
    await startSetupGuide(w.id);
    expect(await setupGuidePending(o)).toBe(true);
    const member = w.actor(await w.person("member"), "member");
    expect(await setupGuidePending(member)).toBe(true);
    await markSetupGuideSeen(o);
    await markSetupGuideSeen(o);
    expect(await setupGuidePending(o)).toBe(false);
    expect(await setupGuidePending(member)).toBe(true);
    expect((await setupGuide(o))!.seen).toBe(true);
    expect((await db().from("setup_guide_people").select("first_seen_at").eq("person_id", owner)).data).toHaveLength(1);
  });
});

describe("the tables are the core's alone", () => {
  it("cannot be read or written by the public roles, nor their functions", async () => {
    const { w, owner, o } = await fresh();
    await startSetupGuide(w.id);
    await markSetupGuideSeen(o);
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
    await startSetupGuide(w.id);
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

  it("makes the trial's Test Metric the First Metric the Owner sees, with the start ticked", async () => {
    const t = await trialWith({ trial_guide_step: "ask" });
    await db().rpc("setup_guide_move_trial_state");
    const g = (await setupGuide(t.w.actor(t.owner, "owner")))!;
    expect(g.firstMetric).toEqual({ id: t.m.id, name: "Cups of coffee" });
    expect(g.steps.find((s) => s.id === "start")!.ticked).toBe(true);
  });
});

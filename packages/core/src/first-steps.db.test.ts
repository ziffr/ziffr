// First Steps against the real database (spec 0067, ticket 1; GLOSSARY: First Steps): refused answers make nothing,
// the rules for trials and Workspaces hold, only the Owner may read or save, where the Owner resumes, and that Start
// over changes the Workspace's answers and deletes nothing.
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { Forbidden, type Actor } from "./actor";
import { myBusinessFunction } from "./business-function";
import { createDashboard } from "./dashboards";
import { db } from "./db";
import { AnswerRefused, createFirstStepsWorkspace, firstStepsState, saveFirstStepsAnswers } from "./first-steps";
import { NO_ANSWERS } from "./first-steps-screens";
import { createWorkspace } from "./page-data";
import { setupGuidePending } from "./setup-guide";
import { DEMO_WORKSPACE_ID } from "./team";
import { workspace } from "./test/db-fixtures";
import { TrialRefused, trialEndsAt } from "./trials";
import { workspaceClock } from "./workspace-clock";
import { DefaultWorkspaceTaken } from "./workspace-limits";
import { setWorkspaceProfile, workspaceName, workspaceProfile } from "./workspace-settings";

const ENV = ["ZIFFR_TRIAL_DAYS", "ZIFFR_TRIAL_MAX", "ZIFFR_CLOUD_KEY", "ZIFFR_ONE_DEFAULT_PER_PERSON", "ZIFFR_DEFAULT_METRICS_LIMIT"] as const;
const people: string[] = [];
const others: Awaited<ReturnType<typeof workspace>>[] = [];
const owned = async (personId: string) => (await db().from("memberships").select("workspace_id").eq("user_id", personId)).data!.map((m) => m.workspace_id as string);
afterEach(async () => {
  for (const k of ENV) delete process.env[k];
  for (const w of others.splice(0)) await w.cleanup();
  for (const person of people.splice(0)) {
    for (const ws of await owned(person)) {
      await db().from("observations").delete().eq("workspace_id", ws);
      const gone = await db().from("workspaces").delete().eq("id", ws);
      if (gone.error) console.error(`Test cleanup: Workspace ${ws} was not deleted: ${gone.error.message}`);
    }
    await db().from("profiles").delete().eq("id", person);
  }
});

/** A person who just signed in for the first time: in no Workspace. */
async function newcomer() {
  const id = `t-${randomUUID()}`;
  people.push(id);
  const { error } = await db().from("profiles").insert({ id, name: "New person", role: "", color: "#000", email: null });
  if (error) throw error;
  return id;
}

const TEAM = { ...NO_ANSWERS, who: "team", role: "sales", industry: "saas", segment: "b2b", name: "  Nord   Co ", country: "DE", currency: "EUR", timeZone: "Europe/Berlin", weekStart: 1 };
const ME = { ...NO_ANSWERS, who: "me", topic: "health", name: "My numbers", timeZone: "America/New_York", weekStart: 0 };

async function made(input: unknown = TEAM) {
  const person = await newcomer();
  const { workspaceId, saved } = await createFirstStepsWorkspace(person, input);
  expect(saved).toBe(true);
  const owner: Actor = { personId: person, workspaceId, role: "owner" };
  return { person, workspaceId, owner };
}
async function metric(ws: string, owner: string, over: Record<string, unknown> = {}) {
  const { data, error } = await db().from("metrics").insert({
    slug: `m-${randomUUID().slice(0, 8)}`, name: "Signups", owner_id: owner, workspace_id: ws, unit: "", format: "number", decimals: 0, period: "month",
    submission_rule: "overwrite", polarity: "higher", sources: ["web_form"], ...over,
  }).select("id").single();
  if (error) throw error;
  return data.id as number;
}
async function value(ws: string, metricId: number, submitter: string, imported = false) {
  const { error } = await db().from("observations").insert({ workspace_id: ws, metric_id: metricId, period_start: "2026-01-01", value: 1, submitter_id: submitter, source: "api", imported });
  if (error) throw error;
}

describe("creating from the answers", () => {
  it("makes one Workspace with every answer saved, and Home does not lead its Owner to the Setup Guide", async () => {
    const { person, workspaceId, owner } = await made();
    expect(await owned(person)).toEqual([workspaceId]);
    expect(await workspaceName(owner)).toBe("Nord Co");
    expect(await workspaceProfile(owner)).toMatchObject({ industry: "saas", segment: "b2b", country: "DE", currency: "EUR" });
    expect(await workspaceClock(owner)).toMatchObject({ timeZone: "Europe/Berlin", weekStart: 1 });
    expect(await myBusinessFunction(owner)).toBe("sales");
    expect((await db().from("workspaces").select("used_by").eq("id", workspaceId).single()).data).toEqual({ used_by: "team" });
    expect((await db().from("setup_guides").select("first_steps_at").eq("workspace_id", workspaceId).single()).data!.first_steps_at).toBeTruthy();
    expect(await setupGuidePending(owner)).toBe(false);
    expect(await firstStepsState(owner)).toEqual({ resume: "start", answers: { ...TEAM, name: "Nord Co", topic: null } });
  });

  it("saves Just me without a role, an industry or a segment; the topic is not stored", async () => {
    const { workspaceId, owner } = await made(ME);
    expect((await db().from("workspaces").select("used_by, industry, segment").eq("id", workspaceId).single()).data).toEqual({ used_by: "me", industry: null, segment: null });
    expect(await myBusinessFunction(owner)).toBeNull();
    expect((await firstStepsState(owner))!.answers).toMatchObject({ who: "me", topic: null, timeZone: "America/New_York", weekStart: 0 });
  });

  it("creates nothing for answers that are not on the lists, too long, or not answers at all", async () => {
    const person = await newcomer();
    const bad: unknown[] = [
      null, "team", [], {}, { ...TEAM, who: "everyone" }, { ...TEAM, who: null }, { ...TEAM, role: "boss" }, { ...TEAM, industry: "mining'; drop" },
      { ...TEAM, segment: 3 }, { ...TEAM, country: "XX" }, { ...TEAM, currency: "ZZZ" }, { ...TEAM, timeZone: "Mars/Olympus" }, { ...TEAM, timeZone: "A".repeat(10_000) },
      { ...TEAM, weekStart: 2 }, { ...TEAM, weekStart: "1" }, { ...TEAM, name: "" }, { ...TEAM, name: "   " }, { ...TEAM, name: "x".repeat(81) },
      { ...TEAM, name: "x".repeat(1_000_000) }, { ...TEAM, name: "Nord\u202eCo" }, { ...TEAM, name: 7 }, { ...TEAM, ownerId: "someone" },
      { ...TEAM, topic: "money" }, { ...ME, industry: "saas" }, { ...ME, topic: "crypto" }, JSON.parse('{"who":"team","name":"x","__proto__":{"a":1}}'),
    ];
    for (const input of bad) await expect(createFirstStepsWorkspace(person, input), JSON.stringify(input)?.slice(0, 80)).rejects.toBeInstanceOf(AnswerRefused);
    expect(await owned(person)).toEqual([]);
  });

  it("keeps one trial per person and sets its end", async () => {
    process.env.ZIFFR_CLOUD_KEY = "k".repeat(32);
    process.env.ZIFFR_TRIAL_DAYS = "7";
    process.env.ZIFFR_TRIAL_MAX = "100000";
    const { person, workspaceId, owner } = await made();
    expect(await trialEndsAt(workspaceId)).not.toBeNull();
    expect((await firstStepsState(owner))!.resume).toBe("start");
    await expect(createFirstStepsWorkspace(person, TEAM)).rejects.toBeInstanceOf(TrialRefused);
    expect(await owned(person)).toEqual([workspaceId]);
  });

  it("keeps the limit of one Workspace per person on the default limit", async () => {
    process.env.ZIFFR_DEFAULT_METRICS_LIMIT = "5";
    process.env.ZIFFR_ONE_DEFAULT_PER_PERSON = "1";
    const { person, workspaceId } = await made();
    await expect(createFirstStepsWorkspace(person, TEAM)).rejects.toBeInstanceOf(DefaultWorkspaceTaken);
    expect(await owned(person)).toEqual([workspaceId]);
  });

  it("takes up the Workspace an attempt made without starting First Steps for it", async () => {
    process.env.ZIFFR_CLOUD_KEY = "k".repeat(32);
    process.env.ZIFFR_TRIAL_DAYS = "7";
    process.env.ZIFFR_TRIAL_MAX = "100000";
    const person = await newcomer();
    // What a failed first attempt leaves: the trial, and no mark.
    const left = await createWorkspace(person, "Nord Co");
    const { workspaceId } = await createFirstStepsWorkspace(person, TEAM);
    expect(workspaceId).toBe(left);
    expect((await firstStepsState({ personId: person, workspaceId, role: "owner" }))!.resume).toBe("start");
    expect(await owned(person)).toEqual([left]);
  });

  it("leaves a Workspace of the same name that already holds a Metric", async () => {
    const person = await newcomer();
    const used = await createWorkspace(person, "Nord Co");
    await metric(used, person);
    const { workspaceId } = await createFirstStepsWorkspace(person, TEAM);
    expect(workspaceId).not.toBe(used);
  });

  it.each<[string, (owner: Actor) => PromiseLike<unknown>]>([
    ["a dashboard", (owner) => createDashboard(owner, "Mine")],
    ["a Contact", async (owner) => {
      const person = await newcomer();
      const { error } = await db().from("contacts").insert({ workspace_id: owner.workspaceId, person_id: person, email: `${person}@example.test` });
      if (error) throw error;
    }],
    ["an invitation", async (owner) => {
      const { error } = await db().from("invitations").insert({ workspace_id: owner.workspaceId, token: randomUUID(), role: "member", created_by: owner.personId, expires_at: new Date(Date.now() + 86_400_000).toISOString() });
      if (error) throw error;
    }],
    ["a saved Workspace Profile", (owner) => setWorkspaceProfile(owner, { country: "DE" })],
  ])("leaves a Workspace of the same name that already holds %s", async (_, use) => {
    const person = await newcomer();
    const used = await createWorkspace(person, "Nord Co");
    await use({ personId: person, workspaceId: used, role: "owner" });
    const { workspaceId } = await createFirstStepsWorkspace(person, TEAM);
    expect(workspaceId).not.toBe(used);
  });

  it("is refused to one of the demo's people", async () => {
    const { data } = await db().from("memberships").select("user_id").eq("workspace_id", DEMO_WORKSPACE_ID).limit(1).single();
    const before = await owned(data!.user_id as string);
    await expect(createFirstStepsWorkspace(data!.user_id as string, TEAM)).rejects.toBeInstanceOf(Forbidden);
    expect(await owned(data!.user_id as string)).toEqual(before);
  });
});

describe("who may read and save", () => {
  it("refuses Admins, Members, Guests, Access Keys, outsiders and the demo", async () => {
    const { workspaceId, owner } = await made();
    const refused: Actor[] = [];
    for (const role of ["admin", "member", "guest"] as const) {
      const personId = await newcomer();
      await db().from("memberships").insert({ workspace_id: workspaceId, user_id: personId, role });
      // Also one that claims to be the Owner: the role is checked against the database.
      refused.push({ personId, workspaceId, role }, { personId, workspaceId, role: "owner" });
    }
    refused.push({ ...owner, key: { id: 1, scopes: ["metrics:read"] } } as unknown as Actor);
    refused.push({ personId: await newcomer(), workspaceId, role: "owner" });
    refused.push({ personId: owner.personId, workspaceId: DEMO_WORKSPACE_ID, role: "owner" });
    for (const actor of refused) {
      await expect(firstStepsState(actor)).rejects.toBeInstanceOf(Forbidden);
      await expect(saveFirstStepsAnswers(actor, { ...TEAM, name: "Taken over" })).rejects.toBeInstanceOf(Forbidden);
    }
    expect(await workspaceName(owner)).toBe("Nord Co");
    // The cleanup deletes the Workspace with its Owner; the others only lose their person.
    await db().from("memberships").delete().eq("workspace_id", workspaceId).neq("user_id", owner.personId);
  });

  it("has nothing for a Workspace First Steps did not make, and changes none", async () => {
    const person = await newcomer();
    const workspaceId = await createWorkspace(person, "Made elsewhere");
    const owner: Actor = { personId: person, workspaceId, role: "owner" };
    expect(await firstStepsState(owner)).toBeNull();
    await expect(saveFirstStepsAnswers(owner, TEAM)).rejects.toBeInstanceOf(Forbidden);
    expect(await workspaceName(owner)).toBe("Made elsewhere");
  });
});

describe("where the Owner resumes", () => {
  it("starts without a Metric, then asks for a value, then for who sends them", async () => {
    const { workspaceId, owner } = await made();
    const resume = async () => (await firstStepsState(owner))!.resume;
    const archived = await metric(workspaceId, owner.personId, { archived_at: new Date().toISOString() });
    expect(await resume()).toBe("start");
    const m = await metric(workspaceId, owner.personId);
    expect(await resume()).toBe("value");
    // An imported value and another person's are not the Owner's own.
    await value(workspaceId, m, owner.personId, true);
    const other = await newcomer();
    await db().from("memberships").insert({ workspace_id: workspaceId, user_id: other, role: "member" });
    await value(workspaceId, m, other);
    expect(await resume()).toBe("value");
    await value(workspaceId, m, owner.personId);
    expect(await resume()).toBe("sender");
    await db().from("setup_guides").update({ providers_chosen_at: new Date().toISOString() }).eq("workspace_id", workspaceId);
    expect(await resume()).toBe("finished");
    expect(archived).toBeGreaterThan(0);
    await db().from("memberships").delete().eq("workspace_id", workspaceId).eq("user_id", other);
  });

  it("is done and open when someone was chosen and the Owner has sent nothing", async () => {
    const { workspaceId, owner } = await made();
    await metric(workspaceId, owner.personId);
    await db().from("setup_guides").update({ providers_chosen_at: new Date().toISOString() }).eq("workspace_id", workspaceId);
    expect((await firstStepsState(owner))!.resume).toBe("done");
  });
});

describe("Start over", () => {
  it("changes the Workspace's answers, makes no second Workspace and deletes nothing", async () => {
    const { person, workspaceId, owner } = await made();
    const m = await metric(workspaceId, owner.personId);
    await value(workspaceId, m, owner.personId);
    await db().from("workspaces").update({ employee_band: null }).eq("id", workspaceId);
    await saveFirstStepsAnswers(owner, { ...ME, name: "Only mine" });
    expect(await owned(person)).toEqual([workspaceId]);
    expect(await workspaceName(owner)).toBe("Only mine");
    expect(await workspaceProfile(owner)).toMatchObject({ industry: null, segment: null, country: null, currency: null });
    expect(await myBusinessFunction(owner)).toBeNull();
    expect((await firstStepsState(owner))!).toMatchObject({ resume: "sender", answers: { who: "me" } });
    expect((await db().from("metrics").select("id").eq("workspace_id", workspaceId)).data).toEqual([{ id: m }]);
    expect((await db().from("observations").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId)).count).toBe(1);
    // A refused answer changes nothing.
    await expect(saveFirstStepsAnswers(owner, { ...TEAM, name: "New", industry: "nope" })).rejects.toBeInstanceOf(AnswerRefused);
    expect(await workspaceName(owner)).toBe("Only mine");
  });
});

describe("the catalog's suggestions for a clean slate", () => {
  it("has the Personal and club entries, each name once", async () => {
    const names = ["Running distance", "Body weight", "Hours of sleep", "Money saved", "Spending", "Account balance", "Cups of coffee", "Pages read", "Screen time", "Club members", "Training attendance", "Fees received"];
    const { data } = await db().from("catalog_metrics").select("name").is("workspace_id", null).in("name", names);
    expect(data!.map((r) => r.name).sort()).toEqual([...names].sort());
  });
});

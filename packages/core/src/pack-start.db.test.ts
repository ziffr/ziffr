// The guided Pack set-up against the real database (spec 0068, #1343; GLOSSARY: Pack, Position, Repeat, Contact,
// Submitter, Approver, Target Series, Deck, Trial Workspace, Practice Workspace): every Pack Ziffr ships set up whole,
// in an ordinary Workspace and in a trial where it fits; nobody invited and nothing sent; a second press and a press
// after a stop making nothing twice; who is refused; and no role for a Contact.
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Forbidden, type Actor } from "./actor";
import { visibleMetricIds } from "./access";
import { db } from "./db";
import { createFilledDeck, deckTemplateSeed, importSeedOf } from "./deck-templates";
import { bundledPacks, installIncludedPack } from "./included-packs";
import { addSubmitters } from "./metrics";
import { checkStart, startDrawing, startOptions, startPackStep, type PackStartRef, type PackStartResult } from "./pack-start";
import { defaultChoices, startSelection, startSteps, type StartChoices, type StartPerson } from "./pack-start-steps";
import { periodStart } from "./periods";
import { DEMO_WORKSPACE_ID } from "./team";
import { workspace } from "./test/db-fixtures";
import type { WorkflowConfig } from "./types";
import { openWorkflowRows } from "./workflow-rows";
import { getMetrics } from "./workspace-data";

vi.mock("./metrics", async (original) => {
  const real = await original<typeof import("./metrics")>();
  return { ...real, addSubmitters: vi.fn(real.addSubmitters) };
});
vi.mock("./deck-templates", async (original) => {
  const real = await original<typeof import("./deck-templates")>();
  return { ...real, createFilledDeck: vi.fn(real.createFilledDeck) };
});
vi.setConfig({ testTimeout: 180_000, hookTimeout: 180_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });

const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const address = (who = "p") => `${who}-${randomUUID().slice(0, 8)}@example.test`;
const someone = (name: string, email = address()): StartPerson => ({ who: "new", name, email });
const confirmed = { confirmed: { assistantTexts: true } };

async function space(options: { trial?: boolean } = {}) {
  const w = await workspace("Start");
  cleanups.push(w.cleanup);
  if (options.trial) await w.trial(inDays(10));
  const owner = await w.person("owner", { email: address("owner") });
  return { ...w, owner, by: w.actor(owner) };
}
type Space = Awaited<ReturnType<typeof space>>;

const rows = async (table: string, ws: string, columns = "*") => ((await db().from(table).select(columns).eq("workspace_id", ws)).data ?? []) as unknown as Record<string, unknown>[];
const count = async (table: string, ws: string) => (await db().from(table).select("*", { count: "exact", head: true }).eq("workspace_id", ws)).count ?? 0;

/** What a set-up may make, counted: the same after a second press. */
async function counts(ws: string) {
  const tables = ["metrics", "dashboards", "widgets", "decks", "workflows", "tokens", "contacts", "memberships", "shares", "pack_installs", "pack_setups", "pack_setup_items", "pack_setup_lines", "pack_setup_people"];
  return Object.fromEntries(await Promise.all(tables.map(async (t) => [t, await count(t, ws)] as const)));
}

/** Nothing was sent and nobody was invited. */
async function nothingSent(ws: string) {
  expect({ deliveries: await count("deliveries", ws), prompts: await count("prompts", ws), invitations: await count("invitations", ws) }).toEqual({ deliveries: 0, prompts: 0, invitations: 0 });
}

/** Presses until it is done. */
async function setUp(by: Actor, ref: PackStartRef, choices: StartChoices): Promise<PackStartResult> {
  let step = await startPackStep(by, ref, choices);
  for (let i = 0; !step.done && i < 20; i++) step = await startPackStep(by, ref, choices, step.run);
  if (!step.done) throw new Error("The set-up did not finish.");
  return step.result;
}

/** The preselected answers, with one line of each Repeat for the person setting up. */
async function preselected(by: Actor, packId: string): Promise<StartChoices> {
  const options = await startOptions(by, { included: packId });
  const steps = startSteps(options.declarations, options.room);
  const lines = steps.flatMap((s) => (s.step === "lines" ? [{ repeat: s.repeat, person: { who: "me" as const } }] : []));
  return { ...defaultChoices(steps), lines, ...confirmed };
}

const PACKS = [...bundledPacks().keys()];

describe.each(["an ordinary Workspace", "a trial"])("every Pack Ziffr ships, in %s", (where) => {
  const inTrial = where === "a trial";
  it.each(PACKS)("%s is made as declared, once, and nothing is sent", async (packId) => {
    const t = await space({ trial: inTrial });
    const options = await startOptions(t.by, { included: packId });
    const declared = options.declarations;
    if (inTrial && declared.metrics.length > 25) {
      expect(options.blocked).toContain("A trial holds at most 25 Metrics");
      await expect(startPackStep(t.by, { included: packId }, { providers: [], ...confirmed })).rejects.toThrow(/A trial holds at most 25 Metrics/);
      expect(await count("pack_installs", t.id)).toBe(0);
      return;
    }
    expect(options.blocked).toBeNull();
    const choices = await preselected(t.by, packId);
    const result = await setUp(t.by, { included: packId }, choices);
    const selected = startSelection(declared);

    expect(result.metrics).toHaveLength(declared.metrics.length);
    expect(result.dashboards).toHaveLength(selected.dashboards.length);
    expect(result.workflows).toHaveLength(selected.workflows.length);
    expect(result.decks).toHaveLength(selected.decks.length);
    expect(result.leftOut).toEqual([]);
    expect(result.invite).toEqual([]);
    await nothingSent(t.id);

    // Each deck holds its template and Metrics the person sees, so that it shows filled slides however it is opened.
    const decks = await rows("decks", t.id, "id, owner_id, document");
    expect(decks).toHaveLength(selected.decks.length);
    for (const deck of decks) {
      const waiting = importSeedOf(deck.document)!;
      const seed = await deckTemplateSeed(t.by, waiting.template, waiting.fills);
      expect(seed?.slides.length).toBeGreaterThan(0);
      expect(seed!.fills.every((slot) => slot.length > 0)).toBe(true);
      expect(deck.owner_id).toBe(t.owner);
    }

    // Whoever provides a number can send it, and a Workflow asks them from its next run.
    const metrics = await rows("metrics", t.id, "id, workflow_id, sources, formula, total");
    const tokens = await rows("tokens", t.id, "metric_id, submitter_id");
    for (const m of metrics.filter((x) => tokens.some((k) => k.metric_id === x.id))) {
      expect(m.workflow_id).not.toBeNull();
      expect(m.sources).toContain("web_form");
    }
    for (const m of metrics.filter((x) => !tokens.some((k) => k.metric_id === x.id))) expect(m.workflow_id).toBeNull();
    if (choices.providers?.length) expect(result.asked.map((a) => a.id)).toEqual([t.owner]);

    // A second press answers the same and makes nothing.
    const before = await counts(t.id);
    const again = await startPackStep(t.by, { included: packId }, choices);
    expect(again.done && again.result.metrics.map((m) => m.id).sort()).toEqual(result.metrics.map((m) => m.id).sort());
    expect(await counts(t.id)).toEqual(before);
    // Other answers do not set it up a second time.
    await expect(startPackStep(t.by, { included: packId }, { ...choices, shares: ["other"] })).rejects.toThrow(/set up here already/);
    expect(await counts(t.id)).toEqual(before);
    await nothingSent(t.id);
  });
});

const FORECAST = { included: "ziffr/sales-forecast" } as const;
const forecast = (lead: StartPerson, ...sellers: StartPerson[]): StartChoices => ({ who: [{ position: "sales-lead", person: lead }], lines: sellers.map((person) => ({ repeat: "rep", person })), source: "typed", ...confirmed });

describe("First Steps", () => {
  const chosen = async (ws: string) => (await db().from("setup_guides").select("providers_chosen_at").eq("workspace_id", ws).maybeSingle()).data?.providers_chosen_at ?? null;
  it("notes that providers were chosen when the Owner finishes a set-up in a Workspace it made", async () => {
    const t = await space();
    await db().from("setup_guides").upsert({ workspace_id: t.id, first_steps_at: new Date().toISOString() }, { onConflict: "workspace_id" });
    await setUp(t.by, { included: "ziffr/sales" }, await preselected(t.by, "ziffr/sales"));
    expect(await chosen(t.id)).not.toBeNull();
  });
  it("notes nothing for an Admin, or in a Workspace First Steps did not make", async () => {
    const made = await space();
    await db().from("setup_guides").upsert({ workspace_id: made.id, first_steps_at: new Date().toISOString() }, { onConflict: "workspace_id" });
    const admin = made.actor(await made.person("admin", { email: address("admin") }));
    await setUp(admin, { included: "ziffr/sales" }, await preselected(admin, "ziffr/sales"));
    expect(await chosen(made.id)).toBeNull();
    const other = await space();
    await setUp(other.by, { included: "ziffr/sales" }, await preselected(other.by, "ziffr/sales"));
    expect(await chosen(other.id)).toBeNull();
  });
});

describe("people", () => {
  it("adds new people as Contacts, gives a Contact no role, and keeps the lead's place until they joined", async () => {
    const t = await space();
    const [sam, lea] = [address("sam"), address("lea")];
    const result = await setUp(t.by, FORECAST, forecast(someone("Lea Lead", lea), someone("Sam Seller", sam)));
    const contacts = await rows("contacts", t.id, "person_id");
    expect(contacts).toHaveLength(2);
    expect(await count("memberships", t.id)).toBe(1);
    expect(await count("shares", t.id)).toBe(0);
    const ids = new Set(contacts.map((c) => c.person_id));
    const flows = await openWorkflowRows(t.id, (await db().from("workflows").select("id, config").eq("workspace_id", t.id)).data);
    const config = JSON.stringify(flows.map((f) => f.config as WorkflowConfig));
    expect([...ids].filter((id) => config.includes(String(id)))).toEqual([]);
    const approvers = (flows[0].config as WorkflowConfig).steps.flatMap((s) => (s.type === "approve" ? s.approvers : []));
    expect(approvers).toEqual([t.owner]);
    expect(result.invite.map((i) => [i.name, i.role])).toEqual([["Lea Lead", "member"]]);
    expect(result.held.map((h) => [h.position, h.for.name, h.approves])).toEqual([["sales-lead", "Lea Lead", true]]);
    expect(result.asked.map((a) => a.name)).toContain("Sam Seller");
    expect(result.metrics.filter((m) => m.line === "Sam Seller")).toHaveLength(4);
    const held = await rows("pack_setup_people", t.id, "position_key, person_id, held_for");
    expect(held.find((h) => h.position_key === "sales-lead")).toMatchObject({ person_id: t.owner });
    expect(ids.has(held.find((h) => h.position_key === "sales-lead")!.held_for as string)).toBe(true);
    await nothingSent(t.id);
  });

  it("uses someone already here, found by their address, and shares only what is ticked", async () => {
    const t = await space();
    const email = address("mia");
    const mia = await t.person("member", { email });
    const choices = forecast(someone("typed name", email.toUpperCase()), someone("Sam", address("sam")));
    const result = await setUp(t.by, FORECAST, choices);
    expect(result.held).toEqual([]);
    expect(await count("contacts", t.id)).toBe(1);
    expect(await count("shares", t.id)).toBe(0);
    const flow = (await openWorkflowRows(t.id, (await db().from("workflows").select("id, config").eq("workspace_id", t.id)).data))[0].config as WorkflowConfig;
    expect(flow.steps.flatMap((s) => (s.type === "approve" ? s.approvers : []))).toEqual([mia]);
    // Nothing was shared with her: as Approver and Stand-in she sees a Metric only once she is asked about it.
    expect((await visibleMetricIds(t.id, mia, await getMetrics(t.id))).size).toBe(0);

    const u = await space();
    const lead = await u.person("member");
    const dashboard = JSON.stringify(["dashboard", "forecast-weekly", "", lead, "viewer"]);
    await setUp(u.by, FORECAST, { ...forecast({ who: "here", id: lead }, { who: "me" }), shares: [dashboard, JSON.stringify(["metric", "quota", "", "made-up", "viewer"])] });
    expect((await rows("shares", u.id, "object_type, user_id"))).toEqual([{ object_type: "dashboard", user_id: lead }]);
  });

  it("takes Contacts and Guests as providers, and says nothing to anyone", async () => {
    const t = await space();
    const guest = await t.person("guest");
    const contact = await t.contact({ email: address("c") });
    const result = await setUp(t.by, { included: "ziffr/sports-club" }, { providers: [{ who: "here", id: guest }, { who: "here", id: contact }, someone("Nia")], ...confirmed });
    expect(result.asked.map((a) => a.id)).toHaveLength(3);
    expect(result.asked.some((a) => a.you)).toBe(false);
    await nothingSent(t.id);
  });

  it("asks nobody for now: no Submitter, and no Workflow takes the numbers, so none is told of them", async () => {
    const t = await space();
    const result = await setUp(t.by, { included: "ziffr/finance" }, { providers: [], ...confirmed });
    expect(result.asked).toEqual([]);
    expect(result.unasked.length).toBeGreaterThan(0);
    expect(await count("tokens", t.id)).toBe(0);
    expect((await rows("metrics", t.id, "workflow_id")).filter((m) => m.workflow_id !== null)).toEqual([]);
    await nothingSent(t.id);
  });

  it("puts numbers of a Pack without a Workflow into one for their period when people are named", async () => {
    const t = await space();
    const result = await setUp(t.by, { included: "ziffr/workspace-usage" }, { providers: [{ who: "me" }], source: "typed", ...confirmed });
    const flows = await rows("workflows", t.id, "name");
    expect(flows).toEqual([{ name: "Ask every day" }]);
    expect(result.asked[0].from).not.toBeNull();
    await nothingSent(t.id);
  });

  it("adds nobody to a Practice Workspace", async () => {
    const w = await workspace("Practice", { practice: true });
    cleanups.push(w.cleanup);
    const owner = await w.person("owner", { id: w.practiceFor! });
    const member = await w.madeUp("member");
    const by = w.actor(owner);
    await expect(startPackStep(by, FORECAST, forecast({ who: "me" }, someone("Sam")))).rejects.toThrow(/takes no new people/);
    expect(await count("pack_installs", w.id)).toBe(0);
    await setUp(by, FORECAST, forecast({ who: "me" }, { who: "here", id: member }));
    expect(await count("contacts", w.id)).toBe(0);
    await nothingSent(w.id);
  });
});

describe("the check screen and the preview", () => {
  it("says what would be made with the people found, and writes nothing", async () => {
    const t = await space();
    const email = address("mia");
    const mia = await t.person("member", { email });
    const before = await counts(t.id);
    const plan = await checkStart(t.by, FORECAST, forecast(someone("typed", email), someone("Sam"), { who: "me" }));
    expect(plan.problems).toEqual([]);
    expect(plan.held).toEqual([]);
    expect(plan.fills).toEqual([{ position: "sales-lead", people: [mia] }]);
    expect(plan.contacts).toHaveLength(1);
    expect(plan.workflows.map((w) => w.approvers)).toEqual([[mia]]);
    const contact = await t.contact({ email: address("c") });
    expect((await checkStart(t.by, FORECAST, forecast({ who: "here", id: contact }, { who: "me" }))).problems[0]).toContain("A Contact cannot");
    expect(await counts(t.id)).toEqual({ ...before, contacts: before.contacts + 1 });
  });

  it("draws the first dashboard, or the first slides of a Pack without one, from the file or the install", async () => {
    const t = await space();
    const forecastDrawing = await startDrawing(t.by, FORECAST);
    expect(forecastDrawing.dashboard?.body.widgets.length).toBeGreaterThan(0);
    expect(forecastDrawing.deck).toBeNull();
    expect(forecastDrawing.sample.metrics.find((m) => m.key === "commit")).toMatchObject({ repeat: "Salesperson", total: null });
    const board = { included: "ziffr/board-meeting" };
    const fromFile = await startDrawing(t.by, board);
    expect(fromFile.dashboard).toBeNull();
    expect(fromFile.deck!.slides.length).toBeGreaterThan(0);
    expect(fromFile.deck!.slides.length).toBeLessThanOrEqual(3);
    expect(await count("pack_installs", t.id)).toBe(0);
    const install = await installIncludedPack(t.by, board.included, { assistantTexts: true });
    expect(await startDrawing(t.by, { install })).toEqual(fromFile);
    const member = await t.person("member");
    await expect(startDrawing(t.actor(member, "member"), board)).rejects.toBeInstanceOf(Forbidden);
    await expect(checkStart(t.actor(member, "member"), board, { providers: [] })).rejects.toBeInstanceOf(Forbidden);
  });
});

describe("numbers asked at set-up", () => {
  it("are written unchanged as the target of every period of the span", async () => {
    const t = await space();
    const ref = FORECAST;
    const choices: StartChoices = { ...forecast({ who: "me" }, { who: "me" }, someone("Sam")), numbers: [{ metric: "commit", line: 1, value: 120000 }] };
    const result = await setUp(t.by, ref, choices);
    expect(result.targets).toBe(1);
    const sam = result.metrics.find((m) => m.key === "commit" && m.line === "Sam")!;
    const series = ((await db().from("series_values").select("metric_id, period_start").eq("kind", "target")).data ?? []).filter((s) => result.metrics.some((m) => m.id === s.metric_id));
    expect(new Set(series.map((s) => s.metric_id))).toEqual(new Set([sam.id]));
    expect(series.length).toBeGreaterThanOrEqual(13);
    expect(series.map((s) => s.period_start)).toContain(periodStart(new Date(), "week", 1));
    await setUp(t.by, ref, choices);
    expect(((await db().from("series_values").select("id").eq("metric_id", sam.id).eq("kind", "target")).data ?? []).length).toBe(series.length);
  });
});

describe("a set-up that stops half way", () => {
  it("keeps what was made, says so, and makes only what is missing on Try again", async () => {
    const t = await space();
    const choices = forecast(someone("Lea", address("lea")), someone("Sam", address("sam")), { who: "me" });
    const real = vi.mocked(addSubmitters).getMockImplementation()!;
    let calls = 0;
    vi.mocked(addSubmitters).mockImplementation((...args) => { if (++calls === 3) throw new Error("The Submitters could not be added."); return real(...args); });
    await expect(startPackStep(t.by, FORECAST, choices)).rejects.toThrow(/The Submitters could not be added\. Made before it stopped: .*Added as Contacts: /);
    vi.mocked(addSubmitters).mockImplementation(real);
    expect(await count("metrics", t.id)).toBeGreaterThan(0);
    const options = await startOptions(t.by, FORECAST);
    expect(options.blocked).toBeNull();
    expect(options.unfinished!.made.length).toBeGreaterThan(0);

    const result = await setUp(t.by, FORECAST, choices);
    expect(result.metrics).toHaveLength(4 * 2 + 8);
    expect(await count("metrics", t.id)).toBe(16);
    expect(await count("contacts", t.id)).toBe(2);
    expect(await count("workflows", t.id)).toBe(1);
    expect(await count("dashboards", t.id)).toBe(1);
    expect(await count("decks", t.id)).toBe(1);
    expect(await count("pack_setups", t.id)).toBe(1);
    // Every figure of every line has its Submitter, also those made before the stop.
    expect(await count("tokens", t.id)).toBe(8);
    await nothingSent(t.id);
  });

  it("goes on only with the people it started with, in any order and with other answers", async () => {
    const t = await space();
    const sam = someone("Sam", address("sam"));
    vi.mocked(createFilledDeck).mockImplementationOnce(async () => { throw new Error("The deck could not be created."); });
    await expect(startPackStep(t.by, FORECAST, forecast({ who: "me" }, sam, { who: "me" }))).rejects.toThrow(/The deck could not be created/);
    const before = await counts(t.id);
    for (const others of [forecast({ who: "me" }, sam), forecast({ who: "me" }, sam, someone("Kim"))]) {
      await expect(startPackStep(t.by, FORECAST, others)).rejects.toThrow(/other people/);
      expect((await checkStart(t.by, FORECAST, others)).problems[0]).toContain("other people");
    }
    expect(await counts(t.id)).toEqual(before);
    const finished: StartChoices = { ...forecast({ who: "me" }, { who: "me" }, sam), source: "system" };
    await setUp(t.by, FORECAST, finished);
    expect(await count("decks", t.id)).toBe(1);
    expect(await count("metrics", t.id)).toBe(before.metrics);
    // Pressed again, it answers the same.
    expect((await startPackStep(t.by, FORECAST, finished)).done).toBe(true);
  });

  it("makes a deck once when it stops at the decks", async () => {
    const t = await space();
    const choices = await preselected(t.by, "ziffr/saas-metrics");
    vi.mocked(createFilledDeck).mockImplementationOnce(async () => { throw new Error("The deck could not be created."); });
    await expect(startPackStep(t.by, { included: "ziffr/saas-metrics" }, choices)).rejects.toThrow(/The deck could not be created/);
    const before = await counts(t.id);
    expect(before.decks).toBe(0);
    await setUp(t.by, { included: "ziffr/saas-metrics" }, choices);
    const after = await counts(t.id);
    expect({ ...after, decks: 0, pack_setup_items: 0 }).toEqual({ ...before, pack_setup_items: 0 });
    expect(after.decks).toBe(2);
  });

  it("makes nothing twice when pressed twice at once", async () => {
    const t = await space();
    await installIncludedPack(t.by, "ziffr/sports-club", { assistantTexts: true });
    const choices = { providers: [{ who: "me" as const }], ...confirmed };
    const both = await Promise.allSettled([1, 2].map(() => startPackStep(t.by, { included: "ziffr/sports-club" }, choices)));
    expect(both.some((r) => r.status === "fulfilled")).toBe(true);
    expect(await count("metrics", t.id)).toBe(6);
    expect(await count("dashboards", t.id)).toBe(1);
    expect(await count("pack_setups", t.id)).toBe(1);
  });

  it("is finished only by the person who started it", async () => {
    const t = await space();
    const admin = await t.person("admin");
    const choices = await preselected(t.by, "ziffr/saas-metrics");
    vi.mocked(createFilledDeck).mockImplementationOnce(async () => { throw new Error("The deck could not be created."); });
    await expect(startPackStep(t.by, { included: "ziffr/saas-metrics" }, choices)).rejects.toThrow();
    await expect(startPackStep(t.actor(admin, "admin"), { included: "ziffr/saas-metrics" }, choices)).rejects.toThrow(/Someone else started/);
    expect(await count("decks", t.id)).toBe(0);
  });
});

describe("who is refused", () => {
  const CLUB = { included: "ziffr/sports-club" } as const;
  const nobody = async (t: Space, by: Actor) => {
    await expect(startOptions(by, CLUB)).rejects.toBeInstanceOf(Forbidden);
    await expect(startPackStep(by, CLUB, { providers: [], ...confirmed })).rejects.toBeInstanceOf(Forbidden);
    expect(await count("pack_installs", t.id)).toBe(0);
  };

  it("refuses a Member, a Guest, a key and the demo", async () => {
    const t = await space();
    const [member, guest] = [await t.person("member"), await t.person("guest")];
    await nobody(t, t.actor(member, "member"));
    await nobody(t, t.actor(guest, "guest"));
    await nobody(t, { ...t.by, key: { id: 1 } } as unknown as Actor);
    await expect(startOptions({ ...t.by, workspaceId: DEMO_WORKSPACE_ID }, CLUB)).rejects.toThrow();
    await expect(startPackStep({ ...t.by, workspaceId: DEMO_WORKSPACE_ID }, CLUB, { providers: [] })).rejects.toThrow();
  });

  it("refuses another Workspace's install and people, and answers only with this one's", async () => {
    const [t, u] = [await space(), await space()];
    const theirs = await u.person("member", { email: address("their") });
    const install = await installIncludedPack(u.by, CLUB.included, { assistantTexts: true });
    await expect(startOptions(t.by, { install })).rejects.toBeInstanceOf(Forbidden);
    await expect(startPackStep(t.by, { install }, { providers: [] })).rejects.toBeInstanceOf(Forbidden);
    await expect(startOptions(t.by, { included: "ziffr/nothing" })).rejects.toBeInstanceOf(Forbidden);
    await expect(startPackStep(t.by, CLUB, { providers: [{ who: "here", id: theirs }], ...confirmed })).rejects.toThrow(/Pick someone who is in this Workspace/);
    expect(await count("pack_installs", t.id)).toBe(0);
    const email = address("own");
    await t.person("member", { email });
    const options = await startOptions(t.by, CLUB);
    expect(JSON.stringify(options)).not.toContain("@example.test");
    expect(options.people.map((p) => p.id)).not.toContain(theirs);
  });

  it("refuses long and malformed input and two lines with one address before anything is written", async () => {
    const t = await space();
    const refused = async (choices: unknown, words: RegExp, ref: PackStartRef = FORECAST) => {
      await expect(startPackStep(t.by, ref, choices as StartChoices)).rejects.toThrow(words);
    };
    await refused(null, /Answer the questions again/);
    await refused({ providers: "me" }, /Answer the questions again/);
    await refused({ providers: Array.from({ length: 50 }, () => ({ who: "me" })) }, /Answer the questions again/);
    await refused(forecast({ who: "me" }, someone("x".repeat(5000))), /Answer the questions again/);
    await refused(forecast({ who: "me" }, someone("x".repeat(100))), /80 characters/);
    await refused(forecast({ who: "me" }, { who: "here", id: "x".repeat(65) }), /Answer the questions again/);
    const same = address("same");
    await refused(forecast({ who: "me" }, someone("A", same), someone("B", same)), /each line is another person/);
    // Only the quota of a listed line is asked: no other number, no Total, no line that is not there.
    for (const wrong of [{ metric: "best-case", line: 0 }, { metric: "team-commit" }, { metric: "commit" }, { metric: "commit", line: 1 }]) {
      await refused({ ...forecast({ who: "me" }, { who: "me" }), numbers: [{ ...wrong, value: 1 }] }, /does not ask/);
    }
    await refused({ ...forecast({ who: "me" }, { who: "me" }), numbers: [{ metric: "commit", line: 0, value: 1e20 }] }, /Enter a number/);
    await refused({ ...forecast({ who: "me" }, { who: "me" }), numbers: [{ metric: "commit", line: 0, value: "1" }] }, /Answer the questions again/);
    expect(await counts(t.id)).toMatchObject({ pack_installs: 0, contacts: 0, metrics: 0, pack_setups: 0 });
  });

  it("holds a trial to its limits", async () => {
    const t = await space({ trial: true });
    const sellers = (n: number) => Array.from({ length: n }, (_, i) => someone(`Seller ${i}`));
    await expect(startPackStep(t.by, FORECAST, forecast({ who: "me" }, ...sellers(5)))).rejects.toThrow(/room for 4/);
    expect(await count("contacts", t.id)).toBe(0);
    const result = await setUp(t.by, FORECAST, forecast(someone("Lead"), ...sellers(4)));
    expect(result.metrics).toHaveLength(24);
    expect(result.needsFirstValue).toBe(true);
    expect(result.invite.filter((i) => i.role === "guest")).toHaveLength(4);
    expect(result.notes.join(" ")).toContain("places");
    await nothingSent(t.id);
  });
});

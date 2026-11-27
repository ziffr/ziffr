// After a guided Pack set-up against the real database (spec 0068, #1345; GLOSSARY: Pack, Invitation, Contact,
// Submitter, Approver, Target Series, Trial Workspace, Practice Workspace): the first number that opens a trial's
// invitations, invitations by their own button, providers chosen later, the asked numbers for a new period, who
// approves, and who is refused.
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Forbidden, type Actor } from "./actor";
import { db } from "./db";
import { installIncludedPack } from "./included-packs";
import { packAfter } from "./pack-after";
import { packCards } from "./pack-after-card";
import { changePackHolder, packHolderPlan, packHolders } from "./pack-after-holder";
import { invitePackPeople, packInvite, sendFirstPackNumber } from "./pack-after-invite";
import { packNumbers, setPackNumbers } from "./pack-after-numbers";
import { packProviders, setPackProviders } from "./pack-after-providers";
import { claimGuidedRecord, setupStates } from "./pack-setup-record";
import { startPackStep, type PackStartRef, type PackStartResult } from "./pack-start";
import type { StartChoices, StartPerson } from "./pack-start-steps";
import { periodEnd, periodStart, shiftPeriod } from "./periods";
import { DEMO_WORKSPACE_ID } from "./team";
import { workspace } from "./test/db-fixtures";
import type { WorkflowConfig } from "./types";
import { openWorkflowRows } from "./workflow-rows";

vi.setConfig({ testTimeout: 180_000, hookTimeout: 180_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { vi.restoreAllMocks(); for (const c of cleanups.splice(0)) await c(); });

const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const address = (who = "p") => `${who}-${randomUUID().slice(0, 8)}@example.test`;
const someone = (name: string, email = address()): StartPerson => ({ who: "new", name, email });
const confirmed = { confirmed: { assistantTexts: true } };
const FORECAST = { included: "ziffr/sales-forecast" } as const;
const forecast = (lead: StartPerson, ...sellers: StartPerson[]): StartChoices => ({ who: [{ position: "sales-lead", person: lead }], lines: sellers.map((person) => ({ repeat: "rep", person })), source: "typed", ...confirmed });
/** No email leaves a test. */
const mail = async () => ({ messageId: "test" });

async function space(options: { trial?: boolean; practice?: boolean } = {}) {
  const w = await workspace("After", { practice: options.practice });
  cleanups.push(w.cleanup);
  if (options.trial) await w.trial(inDays(10));
  const owner = await w.person("owner", options.practice ? { id: w.practiceFor! } : { email: address("owner") });
  return { ...w, owner, by: w.actor(owner) };
}

const rows = async (table: string, ws: string, columns = "*") => ((await db().from(table).select(columns).eq("workspace_id", ws)).data ?? []) as unknown as Record<string, unknown>[];
const count = async (table: string, ws: string) => (await db().from(table).select("*", { count: "exact", head: true }).eq("workspace_id", ws)).count ?? 0;
const sent = async (ws: string) => ({ deliveries: await count("deliveries", ws), prompts: await count("prompts", ws) });
const NOTHING = { deliveries: 0, prompts: 0 };
const flows = async (ws: string) => openWorkflowRows(ws, (await db().from("workflows").select("id, name, config").eq("workspace_id", ws).order("id")).data);

async function setUp(by: Actor, ref: PackStartRef, choices: StartChoices): Promise<PackStartResult> {
  let step = await startPackStep(by, ref, choices);
  for (let i = 0; !step.done && i < 20; i++) step = await startPackStep(by, ref, choices, step.run);
  if (!step.done) throw new Error("The set-up did not finish.");
  return step.result;
}

describe("a trial after the set-up", () => {
  it("opens invitations only with the Owner's own number, which makes them no Submitter and sends nothing", async () => {
    const t = await space({ trial: true });
    const result = await setUp(t.by, FORECAST, forecast(someone("Lea Lead"), someone("Sam Seller"), someone("Kim Seller")));
    const id = result.pack.installId;
    const before = await packInvite(t.by, id);
    expect(before.first?.you).toBe(true);
    expect(before.first!.numbers.length).toBeGreaterThan(0);
    expect(before.people.map((p) => [p.name, p.role, p.state])).toEqual([["Lea Lead", "member", "open"], ["Kim Seller", "guest", "open"], ["Sam Seller", "guest", "open"]]);
    const ids = before.people.map((p) => p.id);

    // Locked: the database refuses each one, said beside the person.
    const locked = await invitePackPeople(t.by, id, ids, mail);
    expect(locked.map((r) => r.state)).toEqual(["refused", "refused", "refused"]);
    expect(await count("invitations", t.id)).toBe(0);
    // A value that did not come from an Owner opens nothing.
    const number = before.first!.numbers[0];
    await t.value(number.id, periodStart(new Date(), "week", 1), 1, ids[1]);
    expect((await packInvite(t.by, id)).first).not.toBeNull();

    const tokens = await count("tokens", t.id);
    await expect(sendFirstPackNumber(t.by, id, 999_999_999, "5")).rejects.toBeInstanceOf(Forbidden);
    await expect(sendFirstPackNumber(t.by, id, number.id, "x".repeat(41))).rejects.toThrow(/Type a number/);
    expect((await sendFirstPackNumber(t.by, id, number.id, "not a number")).ok).toBe(false);
    expect(await count("tokens", t.id)).toBe(tokens);
    // A second number: the first period holds the contact's value above.
    const own = before.first!.numbers[1];
    expect((await sendFirstPackNumber(t.by, id, own.id, "1200")).ok).toBe(true);
    expect(await count("tokens", t.id)).toBe(tokens);
    expect(await sent(t.id)).toEqual(NOTHING);

    const open = await packInvite(t.by, id);
    expect(open.first).toBeNull();
    const done = await invitePackPeople(t.by, id, ids, mail);
    expect(done.map((r) => r.state)).not.toContain("refused");
    const invitations = await rows("invitations", t.id, "role, contact_person_id");
    expect(invitations.map((i) => i.role).sort()).toEqual(["guest", "guest", "member"]);
    expect(new Set(invitations.map((i) => i.contact_person_id))).toEqual(new Set(ids));
    // Pressed again, nobody is invited twice.
    expect((await invitePackPeople(t.by, id, ids, mail)).map((r) => r.state)).toEqual(["already", "already", "already"]);
    expect(await count("invitations", t.id)).toBe(3);
  });

  it("holds to the trial's places for people, saying it beside whoever is left", async () => {
    const t = await space({ trial: true });
    const result = await setUp(t.by, FORECAST, forecast(someone("Lead"), ...[1, 2, 3, 4].map((n) => someone(`Seller ${n}`))));
    const id = result.pack.installId;
    const first = (await packInvite(t.by, id)).first!.numbers[0];
    await sendFirstPackNumber(t.by, id, first.id, "5");
    const view = await packInvite(t.by, id);
    expect(view.people).toHaveLength(5);
    const done = await invitePackPeople(t.by, id, view.people.map((p) => p.id), mail);
    expect(done.filter((r) => r.state === "refused")).toHaveLength(5 - view.places!);
    expect(done[0].state).not.toBe("refused");
    expect(await count("invitations", t.id)).toBe(view.places);
  });

  it("gives an Admin no first number to send", async () => {
    const t = await space({ trial: true });
    const result = await setUp(t.by, FORECAST, forecast({ who: "me" }, { who: "me" }));
    const admin = await t.person("admin");
    const view = await packInvite(t.actor(admin, "admin"), result.pack.installId);
    expect(view.first).toEqual({ you: false, numbers: [] });
    await expect(sendFirstPackNumber(t.actor(admin, "admin"), result.pack.installId, result.metrics[0].id, "5")).rejects.toThrow(/not needed from you/);
  });
});

describe("invitations in an ordinary Workspace", () => {
  it("offers only whoever a Position is held for, and invites only on the button", async () => {
    const t = await space();
    const result = await setUp(t.by, FORECAST, forecast(someone("Lea Lead"), someone("Sam Seller")));
    const view = await packInvite(t.by, result.pack.installId);
    expect(view.first).toBeNull();
    expect(view.people.map((p) => [p.name, p.role])).toEqual([["Lea Lead", "member"]]);
    expect(await count("invitations", t.id)).toBe(0);
    const sam = (await rows("contacts", t.id, "person_id")).map((c) => String(c.person_id)).find((c) => c !== view.people[0].id)!;
    await expect(invitePackPeople(t.by, result.pack.installId, [sam], mail)).rejects.toBeInstanceOf(Forbidden);
    await invitePackPeople(t.by, result.pack.installId, [view.people[0].id], mail);
    expect(await rows("invitations", t.id, "role")).toEqual([{ role: "member" }]);
    expect((await packCards(t.by))[0].invite).toBe(0);
  });
});

describe("choosing who provides the numbers", () => {
  it("puts the Metrics into the Pack's Workflow, opens a way to answer, and sends nothing", async () => {
    const t = await space();
    const result = await setUp(t.by, { included: "ziffr/finance" }, { providers: [], ...confirmed });
    const id = result.pack.installId;
    const view = await packProviders(t.by, id);
    expect(view.numbers).toHaveLength(result.unasked.length);
    expect((await packCards(t.by))[0].providers).toBe(view.numbers.length);
    const [flow] = await flows(t.id);
    expect(view.numbers.every((n) => n.workflow === flow.name)).toBe(true);

    const done = await setPackProviders(t.by, id, [{ who: "me" }, someone("Nia")]);
    expect(done.asked.map((a) => a.you)).toEqual([true, false]);
    expect(done.asked.every((a) => a.from)).toBe(true);
    const metrics = await rows("metrics", t.id, "id, workflow_id, sources");
    for (const n of view.numbers) {
      const m = metrics.find((x) => x.id === n.id)!;
      expect(m.workflow_id).toBe(flow.id);
      expect(m.sources).toContain("web_form");
    }
    expect(await count("tokens", t.id)).toBe(view.numbers.length * 2);
    expect(await count("contacts", t.id)).toBe(1);
    expect(await count("memberships", t.id)).toBe(1);
    expect(await count("invitations", t.id)).toBe(0);
    expect(await sent(t.id)).toEqual(NOTHING);
    await expect(setPackProviders(t.by, id, [{ who: "me" }])).rejects.toThrow(/provides each of these numbers already/);
  });

  it("puts numbers without a Pack Workflow into one for their period", async () => {
    const t = await space();
    const result = await setUp(t.by, { included: "ziffr/workspace-usage" }, { providers: [], source: "system", ...confirmed });
    await setPackProviders(t.by, result.pack.installId, [{ who: "me" }]);
    expect((await flows(t.id)).map((f) => f.name)).toEqual(["Ask every day"]);
    expect((await rows("metrics", t.id, "workflow_id, formula")).filter((m) => !m.formula && m.workflow_id === null)).toEqual([]);
    expect(await sent(t.id)).toEqual(NOTHING);
  });

  it("offers an Admin nothing of a Metric they do not own, and takes only this Workspace's people", async () => {
    const [t, u] = [await space(), await space()];
    const result = await setUp(t.by, { included: "ziffr/finance" }, { providers: [], ...confirmed });
    const admin = t.actor(await t.person("admin"), "admin");
    expect((await packProviders(admin, result.pack.installId)).numbers).toEqual([]);
    await expect(setPackProviders(admin, result.pack.installId, [{ who: "me" }])).rejects.toThrow(/already/);
    await expect(setPackProviders(t.by, result.pack.installId, [{ who: "here", id: u.owner }])).rejects.toThrow(/Pick someone who is in this Workspace/);
    await expect(setPackProviders(t.by, result.pack.installId, Array.from({ length: 9 }, () => ({ who: "me" })))).rejects.toThrow(/Say who provides/);
    await expect(setPackProviders(t.by, result.pack.installId, [])).rejects.toThrow(/Say who provides/);
    expect(await count("tokens", t.id)).toBe(0);
  });

  it("adds nobody to a Practice Workspace, and invites nobody there", async () => {
    const t = await space({ practice: true });
    const result = await setUp(t.by, { included: "ziffr/finance" }, { providers: [], ...confirmed });
    await expect(setPackProviders(t.by, result.pack.installId, [someone("Nia")])).rejects.toThrow(/takes no new people/);
    expect(await count("contacts", t.id)).toBe(0);
    const view = await packInvite(t.by, result.pack.installId);
    expect(view.people).toEqual([]);
    expect(view.closed).toContain("Practice Workspace");
  });
});

describe("the asked numbers for a new period", () => {
  it("writes the next quarter without changing this one, and this one again", async () => {
    const t = await space();
    const result = await setUp(t.by, FORECAST, { ...forecast({ who: "me" }, { who: "me" }, someone("Sam")), numbers: [{ metric: "commit", line: 1, value: 100 }] });
    const id = result.pack.installId;
    const view = await packNumbers(t.by, id);
    expect(view.label).toBe("Set quotas for a new quarter");
    expect(view.asks[0].rows).toHaveLength(2);
    const sam = view.asks[0].rows.find((r) => r.label === "Sam")!;
    const series = async () => new Map(((await db().from("series_values").select("period_start, value, value_sealed").eq("metric_id", sam.id).eq("kind", "target")).data ?? []).map((r) => [String(r.period_start), `${r.value ?? ""}${r.value_sealed ?? ""}`]));
    const before = await series();
    await setPackNumbers(t.by, id, { span: "next", numbers: [{ id: sam.id, value: 200 }] });
    const after = await series();
    for (const [period, value] of before) expect(after.get(period)).toBe(value);
    const quarter = periodStart(new Date(), "quarter", 1);
    const next = shiftPeriod(quarter, "quarter", 1);
    expect([...after.keys()].filter((p) => p > periodEnd(quarter, "quarter") && p <= periodEnd(next, "quarter")).length).toBeGreaterThanOrEqual(12);
    await setPackNumbers(t.by, id, { span: "this", numbers: [{ id: sam.id, value: 300 }] });
    const current = periodStart(new Date(), "week", 1);
    expect((await series()).get(current)).not.toBe(before.get(current));
  });

  it("refuses other Metrics, other Workspaces and other roles", async () => {
    const [t, u] = [await space(), await space()];
    const mine = await setUp(t.by, FORECAST, forecast({ who: "me" }, { who: "me" }));
    const theirs = await setUp(u.by, FORECAST, forecast({ who: "me" }, { who: "me" }));
    const other = theirs.metrics.find((m) => m.key === "commit")!;
    await expect(setPackNumbers(t.by, mine.pack.installId, { span: "this", numbers: [{ id: other.id, value: 1 }] })).rejects.toBeInstanceOf(Forbidden);
    await expect(setPackNumbers(t.by, theirs.pack.installId, { span: "this", numbers: [{ id: other.id, value: 1 }] })).rejects.toBeInstanceOf(Forbidden);
    await expect(setPackNumbers(t.by, mine.pack.installId, { span: "later", numbers: [] })).rejects.toThrow(/Choose which period/);
    const member = await t.person("member");
    const guest = await t.person("guest");
    for (const by of [t.actor(member, "member"), t.actor(guest, "guest"), { ...t.by, key: { id: 1 } } as unknown as Actor, { ...t.by, workspaceId: DEMO_WORKSPACE_ID }]) {
      const id = mine.pack.installId;
      await expect(packAfter(by, id)).rejects.toThrow();
      await expect(packInvite(by, id)).rejects.toThrow();
      await expect(invitePackPeople(by, id, ["x"])).rejects.toThrow();
      await expect(sendFirstPackNumber(by, id, 1, "1")).rejects.toThrow();
      await expect(setPackProviders(by, id, [{ who: "me" }])).rejects.toThrow();
      await expect(setPackNumbers(by, id, { span: "this", numbers: [] })).rejects.toThrow();
      await expect(packHolders(by, id)).rejects.toThrow();
      await expect(changePackHolder(by, id, { position: "sales-lead", line: null, person: member })).rejects.toThrow();
      await expect(packCards(by)).rejects.toThrow();
    }
  });
});

describe("changing who approves", () => {
  it("shows the changes first and then puts a Member into the Position's places", async () => {
    const t = await space();
    const result = await setUp(t.by, FORECAST, forecast(someone("Lea Lead"), someone("Sam Seller")));
    const id = result.pack.installId;
    const ben = await t.person("member");
    const view = await packHolders(t.by, id);
    expect(view.positions).toEqual([{ position: "sales-lead", name: "Sales lead", line: null, holders: ["You"], heldFor: "Lea Lead" }]);
    const pick = { position: "sales-lead", line: null, person: ben };
    const plan = await packHolderPlan(t.by, id, pick);
    expect(plan.problem).toBeNull();
    expect(plan.changes.join(" ")).toContain("Approves in");
    expect(plan.changes.join(" ")).toContain("Snapshot");
    expect(plan.changes.join(" ")).toContain("Stands in");
    expect(plan.shares.length).toBeGreaterThan(0);
    expect(plan.shares.every((s) => s.showsMore && !s.suggested)).toBe(true);
    expect(await count("shares", t.id)).toBe(0);

    await expect(changePackHolder(t.by, id, { ...pick, shares: [], mark: "other" })).rejects.toThrow(/changed since you looked/);
    const ticked = plan.shares.find((s) => s.id.startsWith("dashboard"))!;
    await changePackHolder(t.by, id, { ...pick, shares: [ticked.id, "metric 1 editor"], mark: plan.mark });
    const config = (await flows(t.id))[0].config as WorkflowConfig;
    expect(config.steps.flatMap((s) => (s.type === "approve" ? s.approvers : []))).toEqual([ben]);
    expect(config.steps.flatMap((s) => (s.type === "send_snapshot" ? s.people : []))).toEqual([ben]);
    const stands = (await rows("tokens", t.id, "stand_in_id, stands_in_for")).filter((x) => x.stands_in_for === null && x.stand_in_id !== null);
    expect(new Set(stands.map((x) => x.stand_in_id))).toEqual(new Set([ben]));
    expect(await rows("shares", t.id, "object_type, user_id, role")).toEqual([{ object_type: "dashboard", user_id: ben, role: "viewer" }]);
    expect(await count("memberships", t.id)).toBe(2);
    expect((await packHolders(t.by, id)).positions[0]).toMatchObject({ heldFor: null });
    expect(await sent(t.id)).toEqual(NOTHING);
  });

  it("takes no Guest, Contact or stranger, and offers another Admin nothing of the runner's", async () => {
    const [t, u] = [await space(), await space()];
    const result = await setUp(t.by, FORECAST, forecast({ who: "me" }, someone("Sam")));
    const id = result.pack.installId;
    const guest = await t.person("guest");
    const contact = await t.contact({ email: address("c") });
    for (const person of [guest, contact, u.owner]) {
      await expect(packHolderPlan(t.by, id, { position: "sales-lead", line: null, person })).rejects.toBeInstanceOf(Forbidden);
    }
    await expect(packHolderPlan(t.by, id, { position: "seller", line: "Sam", person: t.owner })).rejects.toBeInstanceOf(Forbidden);
    await expect(packHolders(t.by, await installIncludedPack(u.by, "ziffr/sports-club", { assistantTexts: true }))).rejects.toBeInstanceOf(Forbidden);
    const admin = await t.person("admin");
    expect((await packHolders(t.actor(admin, "admin"), id)).positions).toEqual([]);
    await expect(changePackHolder(t.actor(admin, "admin"), id, { position: "sales-lead", line: null, person: admin })).rejects.toBeInstanceOf(Forbidden);
  });
});

describe("a set-up step that is slow", () => {
  it("keeps its record while it says it is at work, and loses the say once another step took it up", async () => {
    const t = await space();
    const installId = await installIncludedPack(t.by, "ziffr/sports-club", { assistantTexts: true });
    const marks = { open: "a".repeat(64), done: "b".repeat(64) };
    const install = { id: installId, version: "1.0.0" };
    const first = await claimGuidedRecord(t.by, install, marks, null);
    await first.made({ kind: "metric", key: "members", line: null, id: 999_999_999 });
    const since = async () => String((await rows("pack_setups", t.id, "working_since"))[0].working_since);
    const claimed = await since();
    const real = Date.now();
    const now = vi.spyOn(Date, "now").mockReturnValue(real + 60_000);
    await first.beat();
    expect(await since()).not.toBe(claimed);
    // Another step may take it up only once it is quiet for three minutes.
    await expect(claimGuidedRecord(t.by, install, marks, (await setupStates(t.by, installId))[0])).rejects.toThrow(/being set up right now/);
    now.mockReturnValue(real + 10 * 60_000);
    const second = await claimGuidedRecord(t.by, install, marks, (await setupStates(t.by, installId))[0]);
    await expect(first.beat()).rejects.toThrow(/being set up right now/);
    await first.stop();
    // The second step still holds it.
    expect(await since()).not.toBe("null");
    await second.stop();
  });
});

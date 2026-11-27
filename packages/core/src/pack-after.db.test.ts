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
import { confirmPackNumber, invitePackPeople, packInvite, sendFirstPackNumber } from "./pack-after-invite";
import { packNumbers, setPackNumbers } from "./pack-after-numbers";
import { packProviders, setPackProviders } from "./pack-after-providers";
import { packLineStart } from "./pack-setup-adding";
import { claimGuidedRecord, setupStates } from "./pack-setup-record";
import { startPackStep, type PackStartRef, type PackStartResult } from "./pack-start";
import type { StartChoices, StartPerson } from "./pack-start-steps";
import { periodEnd, periodStart, shiftPeriod } from "./periods";
import { DEMO_WORKSPACE_ID } from "./team";
import { workspace } from "./test/db-fixtures";
import type { WorkflowConfig } from "./types";
import { inviteGate } from "./invite-gate";
import { saveWorkflow } from "./workflows";
import { saveSeriesRows } from "./metrics";
import { getSeriesValues } from "./workspace-data";
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
    await expect(sendFirstPackNumber(t.by, id, number.id, "x".repeat(41), number.whose)).rejects.toThrow(/Type a number/);
    expect((await sendFirstPackNumber(t.by, id, number.id, "not a number", number.whose)).ok).toBe(false);
    expect(await count("tokens", t.id)).toBe(tokens);
    // A second number: the first period holds the contact's value above.
    const own = before.first!.numbers[1];
    expect((await sendFirstPackNumber(t.by, id, own.id, "1200", own.whose)).ok).toBe(true);
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
    await sendFirstPackNumber(t.by, id, first.id, "5", first.whose);
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
    expect(view.first).toEqual({ you: false, numbers: [], choose: false });
    await expect(sendFirstPackNumber(t.actor(admin, "admin"), result.pack.installId, result.metrics[0].id, "5")).rejects.toThrow(/not needed from you/);
  });
});

describe("which number is offered first", () => {
  const set = async (trial: boolean, choices: StartChoices, ref: PackStartRef = FORECAST) => {
    const t = await space({ trial });
    return { t, result: await setUp(t.by, ref, choices) };
  };

  it("offers the Owner's own and nobody's, and no colleague's beside them", async () => {
    const { t, result } = await set(true, forecast({ who: "me" }, someone("Sam Seller"), { who: "me" }));
    const numbers = (await packInvite(t.by, result.pack.installId)).first!.numbers;
    const mine = result.metrics.filter((m) => m.line !== null && m.line !== "Sam Seller").map((m) => m.id);
    expect(numbers.every((n) => n.whose === null)).toBe(true);
    expect(mine).toContain(numbers[0].id);
    const sams = result.metrics.filter((m) => m.line === "Sam Seller").map((m) => m.id);
    expect(numbers.filter((n) => sams.includes(n.id))).toEqual([]);
    await expect(sendFirstPackNumber(t.by, result.pack.installId, sams[0], "5")).rejects.toBeInstanceOf(Forbidden);
  });

  it("offers a colleague's only where there is no other, naming whose it becomes", async () => {
    const { t, result } = await set(true, forecast({ who: "me" }, someone("Sam Seller")));
    const numbers = (await packInvite(t.by, result.pack.installId)).first!.numbers;
    expect(numbers.length).toBeGreaterThan(0);
    expect(new Set(numbers.map((n) => n.whose))).toEqual(new Set(["Sam Seller"]));
    // A screen that did not say whose it is, because Sam was chosen since it was read, records nothing.
    await expect(sendFirstPackNumber(t.by, result.pack.installId, numbers[0].id, "5")).rejects.toThrow(/would count as theirs/);
    expect(await count("observations", t.id)).toBe(0);
    expect((await sendFirstPackNumber(t.by, result.pack.installId, numbers[0].id, "5", "Sam Seller")).ok).toBe(true);
  });
});

describe("a first number that waits for the Owner's own check", () => {
  it("keeps its Self-check after the Owner is a Submitter no more, opens invitations while it waits, and is confirmed", async () => {
    const t = await space({ trial: true });
    const result = await setUp(t.by, FORECAST, forecast(someone("Lea Lead"), someone("Sam Seller")));
    const id = result.pack.installId;
    const number = (await packInvite(t.by, id)).first!.numbers[0];
    const tokens = await count("tokens", t.id);
    expect((await sendFirstPackNumber(t.by, id, number.id, "12500", number.whose)).ok).toBe(true);
    expect(await count("tokens", t.id)).toBe(tokens);

    const task = async () => (await rows("actions", t.id, "id, purpose, status, assignee_id, metric_id")).filter((a) => a.purpose === "self_check");
    expect(await task()).toMatchObject([{ status: "open", assignee_id: t.owner, metric_id: number.id }]);
    const state = async () => (await rows("period_states", t.id, "metric_id, state")).find((s) => s.metric_id === number.id)?.state;
    expect(await state()).toBe("approval");
    // The value counts for the gate while it waits: invitations are open.
    expect(await inviteGate(t.by)).toEqual({ state: "open" });
    const view = await packInvite(t.by, id);
    expect(view.first).toBeNull();
    expect(view.checks).toMatchObject([{ metric: number.name }]);
    expect(view.checks[0].value).toContain("12");
    expect((await invitePackPeople(t.by, id, [view.people[0].id], mail))[0].state).not.toBe("refused");

    // Only the person it is for confirms it.
    const admin = await t.person("admin");
    await expect(confirmPackNumber(t.actor(admin, "admin"), id, view.checks[0].actionId)).rejects.toBeInstanceOf(Forbidden);
    await expect(confirmPackNumber(t.by, id, 999_999_999)).rejects.toBeInstanceOf(Forbidden);
    expect((await confirmPackNumber(t.by, id, view.checks[0].actionId)).words).toContain("Confirmed by you");
    expect(await task()).toMatchObject([{ status: "closed" }]);
    expect(await state()).not.toBe("approval");
    expect((await packInvite(t.by, id)).checks).toEqual([]);
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
  // Early in a quarter that starts mid week: the last ended week and the week across the start began in the quarter before.
  it("never writes over a target of a period that began before the span, and writes every period that begins in it", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2027-01-05T12:00:00Z"));
    try {
      const t = await space();
      const result = await setUp(t.by, FORECAST, forecast({ who: "me" }, { who: "me" }));
      const id = result.pack.installId;
      const [row] = (await packNumbers(t.by, id)).asks[0].rows;
      const target = async () => new Map(((await getSeriesValues(t.id, [row.id])).targets[row.id] ?? []).map((p) => [p.period, p.value]));
      // The week of 28 December began in the old quarter (it was set there), 21 December has nothing.
      await saveSeriesRows(t.by, row.id, "target", [{ period: "2026-12-28", value: 111 }, { period: "2027-01-11", value: 111 }, { period: "2027-03-29", value: 222 }], "old");
      await setPackNumbers(t.by, id, { span: "this", numbers: [{ id: row.id, value: 300 }] });
      let now = await target();
      expect(now.get("2026-12-28")).toBe(111);
      expect(now.has("2026-12-21")).toBe(false);
      // Every week that begins in the quarter takes the new number, over what it had.
      expect([now.get("2027-01-04"), now.get("2027-01-11"), now.get("2027-03-29")]).toEqual([300, 300, 300]);
      await setPackNumbers(t.by, id, { span: "next", numbers: [{ id: row.id, value: 400 }] });
      now = await target();
      expect([now.get("2026-12-28"), now.get("2027-01-04"), now.get("2027-03-29")]).toEqual([111, 300, 300]);
      expect([now.get("2027-04-05"), now.get("2027-06-28")]).toEqual([400, 400]);
    } finally {
      vi.useRealTimers();
    }
  });

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
  const snapshotPeople = async (ws: string) => ((await flows(ws))[0].config as WorkflowConfig).steps.flatMap((s) => (s.type === "send_snapshot" ? s.people : []));

  it("gives the Snapshot only to a holder who may open its dashboard, which saving a Workflow alone does not ask", async () => {
    const t = await space();
    const result = await setUp(t.by, FORECAST, forecast({ who: "me" }, someone("Sam Seller")));
    const id = result.pack.installId;
    const ben = await t.person("member");
    const pick = { position: "sales-lead", line: null, person: ben };
    const plan = await packHolderPlan(t.by, id, pick);
    expect(plan.changes.join(" ")).toContain("Only if you tick");
    const done = await changePackHolder(t.by, id, { ...pick, shares: [], mark: plan.mark });
    expect(await snapshotPeople(t.id)).toEqual([t.owner]);
    expect(done.changed.join(" ")).not.toContain("Gets the Snapshot");
    expect(done.byHand.join(" ")).toContain("cannot open the dashboard");

    // Chosen again with the dashboard shared, the step changes and who held it leaves it.
    const again = await packHolderPlan(t.by, id, pick);
    const dashboard = again.shares.find((s) => s.id.startsWith("dashboard"))!;
    const second = await changePackHolder(t.by, id, { ...pick, shares: [dashboard.id], mark: again.mark });
    expect(await snapshotPeople(t.id)).toEqual([ben]);
    expect(second.changed.join(" ")).toContain("Gets the Snapshot");
    expect(second.changed.join(" ")).not.toContain("Only if you tick");

    // saveWorkflow takes any Member as a recipient: who may open the dashboard is asked when it is sent.
    const stranger = await t.person("member");
    const [flow] = await flows(t.id);
    const config = flow.config as WorkflowConfig;
    await saveWorkflow(t.by, Number(flow.id), String(flow.name), { ...config, steps: config.steps.map((s) => (s.type === "send_snapshot" ? { ...s, people: [stranger] } : s)) });
    expect(await snapshotPeople(t.id)).toEqual([stranger]);
  });

  it("names both holders while a Snapshot stays for want of a Share, moves the Approve step again and starts a new line with the latest choice", async () => {
    const t = await space();
    const result = await setUp(t.by, FORECAST, forecast(someone("Lea Lead"), someone("Sam Seller")));
    const id = result.pack.installId;
    const [other, ben, cal] = [await t.person("admin"), await t.person("member"), await t.person("member")];
    // No Share to tick: the dashboard is someone else's now.
    await db().from("dashboards").update({ owner_id: other }).eq("workspace_id", t.id);
    const change = async (person: string) => {
      const pick = { position: "sales-lead", line: null, person };
      const plan = await packHolderPlan(t.by, id, pick);
      return changePackHolder(t.by, id, { ...pick, shares: [], mark: plan.mark });
    };
    expect((await change(ben)).byHand.join(" ")).toContain("cannot open the dashboard");
    expect(await snapshotPeople(t.id)).toEqual([t.owner]);
    expect((await packHolders(t.by, id)).positions[0].holders).toHaveLength(2);
    const approvers = async () => ((await flows(t.id))[0].config as WorkflowConfig).steps.flatMap((s) => (s.type === "approve" ? s.approvers : []));
    const startsWith = async () => (await packLineStart(t.by, id, "rep")).people["sales-lead"];
    expect(await startsWith()).toEqual([ben]);
    await change(cal);
    expect(await approvers()).toEqual([cal]);
    expect(await startsWith()).toEqual([cal]);
    // Someone the record names already becomes the latest choice again.
    await change(ben);
    expect(await approvers()).toEqual([ben]);
    expect(await startsWith()).toEqual([ben]);
    expect((await packHolders(t.by, id)).positions[0].holders).toHaveLength(3);
  });

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
    // The dashboard was ticked, so the Snapshot moves too.
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

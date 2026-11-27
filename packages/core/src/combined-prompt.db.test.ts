// The Combined Prompt against the real database (spec 0064, ticket #1309; GLOSSARY: Combined Prompt, Prompt,
// Delivery): one message per person, way and run, composed from what is still open and allowed, and a run that fails
// half way asks the rest. The switch is turned on here only; the last test keeps it off.
import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "./db";
import { composeAtSend } from "./internal/combined-delivery";
import { deleteMetric } from "./metrics";
import { askForMissingValues } from "./questions";
import { runWorkspaceIfDue } from "./scheduled-runs";
import { changeRows, opened, rowsOf, workspace } from "./test/db-fixtures";
import { saveWorkflow, setMetricWorkflow } from "./workflows";
import type { WorkflowConfig } from "./types";

const state = vi.hoisted(() => ({ on: true, failFor: null as string | null }));
vi.mock("./combined-switch", () => ({ combinedPromptsOn: () => state.on }));
vi.mock("./internal/combined-delivery", async (importOriginal) => {
  const real = await importOriginal<typeof import("./internal/combined-delivery")>();
  const { db: database } = await import("./db");
  return {
    ...real,
    // Stands in for a database that refuses one person's message half way.
    storeCombinedWords: async (...args: Parameters<typeof real.storeCombinedWords>) => {
      const { data } = await database().from("deliveries").select("recipient_id").eq("id", args[1]).single();
      if (state.failFor && data?.recipient_id === state.failFor) throw new Error("refused for the test");
      return real.storeCombinedWords(...args);
    },
  };
});

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { state.on = true; state.failFor = null; for (const c of cleanups.splice(0)) await c(); vi.restoreAllMocks(); });

const STEPS: WorkflowConfig["steps"] = [{ type: "remind", daysBefore: 1 }];

async function setUp() {
  const w = await workspace(); cleanups.push(w.cleanup);
  const sara = await w.person("owner");
  const ann = await w.person("member", { email: `ann-${w.id.slice(0, 8)}@ziffr.invalid` });
  const bob = await w.person("member", { email: `bob-${w.id.slice(0, 8)}@ziffr.invalid` });
  const metric = async (name: string, submitter: string) => {
    const m = await w.metric(sara, { name, period: "month" });
    await w.token(m.id, submitter);
    return m;
  };
  return { w, sara, ann, bob, metric };
}
const sentTo = async (ws: string, person: string) => opened("deliveries", ws, await rowsOf("deliveries", { workspace_id: ws, recipient_id: person }));
const listed = async (deliveryId: unknown) => rowsOf("delivery_prompts", { delivery_id: deliveryId });
const promptsOf = async (ws: string, person: string) => rowsOf("prompts", { workspace_id: ws, submitter_id: person });

describe("a run's Prompts", () => {
  it("go in one message per person and way, each figure a Prompt of its own; one figure goes as it always did", async () => {
    const { w, sara, ann, bob, metric } = await setUp();
    for (const name of ["Revenue", "Costs", "Visits"]) await metric(name, ann);
    await metric("Tickets", bob);
    expect(await askForMissingValues(w.actor(sara))).toBe(4);
    const toAnn = await sentTo(w.id, ann);
    expect(toAnn).toHaveLength(1);
    expect(toAnn[0]).toMatchObject({ combined: true, prompt_id: null, sender_id: sara });
    for (const name of ["Revenue", "Costs", "Visits"]) expect(toAnn[0].body).toContain(name);
    expect(toAnn[0].body).not.toContain("Tickets");
    expect(await promptsOf(w.id, ann)).toHaveLength(3);
    expect((await listed(toAnn[0].id)).map((r) => r.position).sort()).toEqual([1, 2, 3]);
    const toBob = await sentTo(w.id, bob);
    expect(toBob).toHaveLength(1);
    expect(toBob[0]).toMatchObject({ combined: false });
    expect(toBob[0].prompt_id).not.toBeNull();
    // Asked today, so asking again sends nothing.
    expect(await askForMissingValues(w.actor(sara))).toBe(0);
  });

  it("leave out at send what was answered, archived or is no longer asked of the person", async () => {
    const { w, sara, ann, metric } = await setUp();
    const [revenue, costs, visits, leads] = [await metric("Revenue", ann), await metric("Costs", ann), await metric("Visits", ann), await metric("Leads", ann)];
    await askForMissingValues(w.actor(sara));
    const [d] = await sentTo(w.id, ann);
    // As a message still waiting to go: nothing numbered yet.
    await changeRows("delivery_prompts", { delivery_id: d.id }, { position: null });
    await changeRows("prompts", { metric_id: revenue.id }, { answered_at: new Date().toISOString(), answered_source: "web_form" });
    await w.patchMetric(costs.id, { archived_at: new Date().toISOString() });
    await db().from("tokens").delete().eq("metric_id", visits.id);
    expect(await composeAtSend({ id: d.id as number, workspace_id: w.id })).toBeNull();
    const [now] = await sentTo(w.id, ann);
    expect(now.body).toContain("1. Leads");
    for (const name of ["Revenue", "Costs", "Visits"]) expect(`${now.subject} ${now.body}`).not.toContain(name);
    expect((await listed(d.id)).filter((r) => r.position !== null)).toHaveLength(1);
    await changeRows("prompts", { metric_id: leads.id }, { answered_at: new Date().toISOString(), answered_source: "web_form" });
    expect(await composeAtSend({ id: d.id as number, workspace_id: w.id })).toBe("Not sent: nothing in it is still open.");
  });

  it("no longer name a Metric that was deleted, and a message with nothing left goes", async () => {
    const { w, sara, ann, metric } = await setUp();
    const [revenue, costs] = [await metric("Revenue", ann), await metric("Costs", ann)];
    await askForMissingValues(w.actor(sara));
    await deleteMetric(w.actor(sara), revenue.id, "Revenue");
    const [d] = await sentTo(w.id, ann);
    expect(`${d.subject} ${d.body}`).toContain("Costs");
    expect(`${d.subject} ${d.body}`).not.toContain("Revenue");
    await deleteMetric(w.actor(sara), costs.id, "Costs");
    expect(await sentTo(w.id, ann)).toHaveLength(0);
  });

  it("are reminded about in one message per person and run", async () => {
    const { w, sara, ann, metric } = await setUp();
    const flow = await saveWorkflow(w.actor(sara), null, "Close", { dueWorkingDays: 3, steps: STEPS });
    for (const name of ["Revenue", "Costs"]) await setMetricWorkflow(w.actor(sara), (await metric(name, ann)).id, flow);
    const clock = { id: w.id, time_zone: "UTC", run_hour: 8 };
    expect(await runWorkspaceIfDue(clock, new Date("2026-12-01T09:00:00Z"))).toBe("ran");
    expect(await sentTo(w.id, ann)).toHaveLength(1);
    expect(await runWorkspaceIfDue(clock, new Date("2026-12-02T09:00:00Z"))).toBe("ran");
    const all = (await sentTo(w.id, ann)).sort((a, b) => (a.id as number) - (b.id as number));
    expect(all).toHaveLength(2);
    expect(all[1].body).toContain("still missing");
    for (const name of ["Revenue", "Costs"]) expect(all[1].body).toContain(name);
  });

  it("of a run that failed half way are asked by the next one, and nobody twice", async () => {
    const { w, sara, ann, bob, metric } = await setUp();
    for (const name of ["Revenue", "Costs"]) await metric(name, ann);
    for (const name of ["Visits", "Leads"]) await metric(name, bob);
    state.failFor = bob;
    await expect(askForMissingValues(w.actor(sara))).rejects.toThrow("refused for the test");
    expect(await sentTo(w.id, ann)).toHaveLength(1);
    expect(await sentTo(w.id, bob)).toHaveLength(0);
    expect(await promptsOf(w.id, bob)).toHaveLength(0);
    state.failFor = null;
    expect(await askForMissingValues(w.actor(sara))).toBe(2);
    expect(await sentTo(w.id, ann)).toHaveLength(1);
    expect(await sentTo(w.id, bob)).toHaveLength(1);
  });

  it("count as asked only once the person's message exists", async () => {
    const { w, sara, ann, bob, metric } = await setUp();
    // A Due Date far enough off that the next day's run reminds nobody.
    const flow = await saveWorkflow(w.actor(sara), null, "Close", { dueWorkingDays: 10, steps: STEPS });
    const mine: number[] = [];
    const theirs: number[] = [];
    for (const name of ["Revenue", "Costs"]) mine.push((await metric(name, ann)).id);
    for (const name of ["Visits", "Leads"]) theirs.push((await metric(name, bob)).id);
    for (const id of [...mine, ...theirs]) await setMetricWorkflow(w.actor(sara), id, flow);
    const clock = { id: w.id, time_zone: "UTC", run_hour: 8 };
    state.failFor = bob;
    expect(await runWorkspaceIfDue(clock, new Date("2026-12-01T09:00:00Z"))).toBe("failed");
    const asked = (await rowsOf("period_states", { workspace_id: w.id })).map((r) => r.metric_id as number).sort((a, b) => a - b);
    expect(asked).toEqual([...mine].sort((a, b) => a - b));
    state.failFor = null;
    expect(await runWorkspaceIfDue(clock, new Date("2026-12-02T09:00:00Z"))).toBe("ran");
    expect(await sentTo(w.id, ann)).toHaveLength(1);
    expect(await sentTo(w.id, bob)).toHaveLength(1);
  });

  it("go one by one while the switch is off", async () => {
    state.on = false;
    const { w, sara, ann, metric } = await setUp();
    for (const name of ["Revenue", "Costs"]) await metric(name, ann);
    await askForMissingValues(w.actor(sara));
    const toAnn = await sentTo(w.id, ann);
    expect(toAnn).toHaveLength(2);
    expect(toAnn.every((d) => d.combined === false && d.prompt_id !== null)).toBe(true);
  });
});

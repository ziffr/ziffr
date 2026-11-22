// Who sees what of a Checklist Item (spec 0045, ticket #791; AGENTS.md rule 3; GLOSSARY: Checklist Item, Group, Guest):
// a recipient gets the owner's words and nothing of any Metric they may not see; the Workflow page and the Period
// Timeline give each person the words only where they may read them (the owner, those it goes to, everyone but a Guest,
// or one Group's people when the item names one) and the people it names only to its owner.
import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "./db";
import { workflowsView } from "./page-data";
import { periodTimeline } from "./period-timeline";
import { setTellStopped } from "./tell";
import { runWorkflows } from "./workflow-engine";
import { saveWorkflow } from "./workflows";
import { opened, workspace } from "./test/db-fixtures";
import type { ChecklistItem, WorkflowConfig } from "./types";

vi.setConfig({ testTimeout: 180_000, hookTimeout: 60_000 });
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });

const OPEN = "Invoices must be in by Friday.";
const KEPT = "Finance only: the accrual file is on the drive.";

/** Sara owns the Workflow. Item A goes to Ann and the Group Finance (Cora), and Hal, a Guest; item B only to Ann and
 * Hal and is read by Finance. Dan is a Member it does not name; Gus is a Guest it does not name. Ann, Cora and Dan do
 * not see the Metric; Gus and Hal, who are Guests, do (that is how a Guest knows of a Workflow). */
async function setup() {
  const w = await workspace(); cleanups.push(w.cleanup);
  const sara = await w.person("owner"); const ann = await w.person("member"); const cora = await w.person("member"); const dan = await w.person("member");
  const gus = await w.person("guest"); const hal = await w.person("guest");
  const { data: g } = await db().from("groups").insert({ workspace_id: w.id, name: "Finance" }).select("id").single();
  const finance = g!.id as number;
  await db().from("group_members").insert({ workspace_id: w.id, group_id: finance, user_id: cora });
  const a: ChecklistItem = { type: "checklist", id: "item-open-aaaa", kind: "info", text: OPEN, day: 1, people: [ann, hal], groups: [finance] };
  const b: ChecklistItem = { type: "checklist", id: "item-kept-aaaa", kind: "info", text: KEPT, day: 1, people: [ann, hal], groups: [], readGroup: finance };
  const flow = await saveWorkflow(w.actor(sara), null, "Month-end close", { dueWorkingDays: 2, steps: [a, b, { type: "publish", lock: false }] });
  const m = await w.metric(sara, { name: "Secret revenue", workflow_id: flow });
  await w.value(m.id, "2026-03-01", 777_001, sara);
  await w.share(m.id, gus); await w.share(m.id, hal);
  return { w, sara, ann, cora, dan, gus, hal, flow, m, finance };
}
type S = Awaited<ReturnType<typeof setup>>;
const as = (s: S, id: string, role: "owner" | "member" | "guest") => s.w.actor(id, role);

/** The item steps of the Workflow as `workflowsView` shows them to a person: [words of A, words of B, people of A]. */
async function seen(s: S, id: string, role: "owner" | "member" | "guest") {
  const { workflows } = await workflowsView(as(s, id, role));
  const steps = ((workflows.find((x) => x.id === s.flow)?.config as WorkflowConfig | undefined)?.steps ?? []).filter((x): x is ChecklistItem => x.type === "checklist");
  const [a, b] = steps as Extract<ChecklistItem, { kind: "info" }>[];
  return a && b ? [a.text, b.text, [...a.people, ...a.groups.map(String)].length] as const : null;
}

describe("the words of a Checklist Item on the Workflow page", () => {
  it("are given to each person only where they may read them, and the people only to the owner", async () => {
    const s = await setup();
    expect(await seen(s, s.sara, "owner")).toEqual([OPEN, KEPT, 3]);
    // Named by item A and B: Ann reads both, though she is not in Finance; the people they name stay with the owner.
    expect(await seen(s, s.ann, "member")).toEqual([OPEN, KEPT, 0]);
    expect(await seen(s, s.cora, "member")).toEqual([OPEN, KEPT, 0]);
    // A Member it does not name reads item A (everyone does) and not item B (kept to Finance).
    expect(await seen(s, s.dan, "member")).toEqual([OPEN, "", 0]);
    // A Guest reads only what is sent to them.
    expect(await seen(s, s.hal, "guest")).toEqual([OPEN, KEPT, 0]);
    expect(await seen(s, s.gus, "guest")).toEqual(["", "", 0]);
  });
});

describe("what a recipient is sent", () => {
  it("is the owner's words and a link, nothing of a Metric they may not see", async () => {
    const s = await setup();
    await runWorkflows(s.w.id, "2026-04-01", s.sara);
    for (const person of [s.ann, s.cora, s.hal]) {
      const { data } = await db().from("deliveries").select("subject, body, kind").eq("workspace_id", s.w.id).eq("recipient_id", person).eq("kind", "checklist");
      const rows = await opened("deliveries", s.w.id, data);
      expect(rows.length).toBeGreaterThan(0);
      for (const r of rows) {
        expect(`${r.subject} ${r.body}`).not.toMatch(/Secret revenue|777|m-[0-9a-f]{8}/);
        expect(r.body).toMatch(/Invoices must be in by Friday|accrual file/);
      }
    }
    // A Guest's message names no one else: Hal is told by "Someone", whoever the owner is.
    const { data: hal } = await db().from("deliveries").select("body, subject").eq("workspace_id", s.w.id).eq("recipient_id", s.hal).eq("kind", "checklist");
    const ownerName = (await db().from("profiles").select("name").eq("id", s.sara).single()).data!.name as string;
    for (const r of await opened("deliveries", s.w.id, hal)) expect(`${r.subject} ${r.body}`).not.toContain(ownerName);
    // Dan is not named, so is sent nothing; Gus either.
    for (const person of [s.dan, s.gus]) expect((await db().from("deliveries").select("id").eq("workspace_id", s.w.id).eq("recipient_id", person).eq("kind", "checklist")).data).toHaveLength(0);
  });
});

describe("the Period Timeline line of a sent item", () => {
  it("shows the words to those who may read them, the count of people left out only to the owner", async () => {
    const s = await setup();
    await setTellStopped(as(s, s.ann, "member"), s.flow, true);
    await runWorkflows(s.w.id, "2026-04-01", s.sara);
    const lines = async (id: string, role: "owner" | "member" | "guest") => (await periodTimeline(as(s, id, role), s.flow, "2026-03-01")).events.filter((e) => e.kind === "checklist_sent");
    const owner = await lines(s.sara, "owner");
    expect(owner.map((e) => e.text).sort()).toEqual([`Sent “${KEPT}” to 1 person`, `Sent “${OPEN}” to 2 people`]);
    expect(owner.flatMap((e) => e.items).sort()).toEqual(["1 person could not be told", "1 person could not be told"]);
    // Dan reads item A's words only; Gus only that items were sent; neither is told who was left out.
    const dan = await lines(s.dan, "member");
    expect(dan.map((e) => e.text).sort()).toEqual(["A checklist item was sent", `Sent “${OPEN}” to 2 people`]);
    expect(dan.flatMap((e) => e.items)).toEqual([]);
    const gus = await lines(s.gus, "guest");
    expect(gus.map((e) => e.text)).toEqual(["A checklist item was sent", "A checklist item was sent"]);
    expect(gus.flatMap((e) => e.items)).toEqual([]);
    // Nothing of the Metric they may not see reaches Dan's timeline.
    const all = JSON.stringify((await periodTimeline(as(s, s.dan, "member"), s.flow, "2026-03-01")).events);
    expect(all).not.toMatch(/Secret revenue|777/);
  });
});

// Deck Templates and Workflow Templates against the real database (spec 0030, #274): saving a deck or a Workflow as
// one, and starting from one. Who may, which Metrics may fill a Slot, and that a Workflow Template names nobody.
import { afterEach, describe, expect, it } from "vitest";
import { Forbidden } from "./actor";
import { db } from "./db";
import { createDeck, setDeckTheme } from "./decks";
import { share } from "./sharing";
import { saveDeckTemplate, saveWorkflowTemplate } from "./templates";
import { createDeckFromTemplate, deckTemplateChoices, deckTemplateSeed, listDeckTemplates, readFills, writeFills } from "./deck-templates";
import { createWorkflowFromTemplate, listWorkflowTemplates } from "./workflow-templates";
import { saveWorkflow } from "./workflows";
import { workspace } from "./test/db-fixtures";
import type { SlideShape, WorkflowConfig } from "./types";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws(name?: string) { const w = await workspace(name); cleanups.push(w.cleanup); return w; }
const forbidden = expect.any(Forbidden);

const widget = (metricId: number, x = 64): SlideShape => ({ type: "ziffr-widget", x, y: 150, rotation: 0, opacity: 1, props: { template: "line", metricIds: [metricId], settings: JSON.stringify({ window: 6 }), title: "", w: 500, h: 400 } });
/** Writes a deck's document as the editor stores it: one frame per slide, top to bottom, its shapes inside. */
async function stored(deckId: number, slides: SlideShape[][]) {
  const store: Record<string, unknown> = { "page:page": { id: "page:page", typeName: "page", name: "Page 1", index: "a1" } };
  slides.forEach((shapes, i) => {
    const frame = `shape:f${i}`;
    store[frame] = { id: frame, typeName: "shape", type: "frame", parentId: "page:page", index: `a${i + 1}`, x: 0, y: i * 840, rotation: 0, opacity: 1, props: { w: 1280, h: 720, name: `Slide ${i + 1}` } };
    shapes.forEach((sh, k) => { store[`shape:s${i}-${k}`] = { id: `shape:s${i}-${k}`, typeName: "shape", parentId: frame, index: `a${k + 1}`, ...sh }; });
  });
  await db().from("decks").update({ document: { store, schema: {} } }).eq("id", deckId);
}
const words = (text: string): SlideShape => ({ type: "text", x: 64, y: 56, rotation: 0, opacity: 1, props: { richText: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] }, w: 900 } });

describe("Deck Templates", () => {
  it("saves every slide with one Slot per Metric, and a deck made from it lays the slides out with the picked Metrics", async () => {
    const w = await ws(); const sara = await w.person("member"); const ben = await w.person("member");
    const rev = await w.metric(sara, { name: "Revenue" }); const cash = await w.metric(sara, { name: "Cash" });
    const deck = await createDeck(w.actor(sara, "member"), "Board");
    await stored(deck, [[words("Revenue this quarter"), widget(rev.id)], [widget(cash.id), widget(rev.id, 600)]]);
    const t = await saveDeckTemplate(w.actor(sara, "member"), { deckId: deck, name: "Board meeting", description: "Quarterly", labels: ["Revenue", "Cash"], choices: {} });
    const { data: row } = await db().from("team_templates").select("kind, owner_id, slots, body").eq("id", t).single();
    expect(row!.kind).toBe("deck");
    expect(row!.slots).toEqual([{ label: "Revenue", multiple: false, exampleIds: [rev.id] }, { label: "Cash", multiple: false, exampleIds: [cash.id] }]);
    expect(JSON.stringify(row!.body)).not.toContain(`"metricIds":[${rev.id}]`);
    expect(JSON.stringify(row!.body)).toContain("{metric} this quarter");

    // Ben sees neither Metric: the template shows him no suggestion, and he cannot fill it with Sara's.
    const [forBen] = await listDeckTemplates(w.actor(ben, "member"));
    expect(forBen.slots.map((s) => s.exampleIds)).toEqual([[], []]);
    await expect(createDeckFromTemplate(w.actor(ben, "member"), { template: t, name: "x", fills: [[rev.id], [cash.id]] })).rejects.toEqual(forbidden);
    const mine = await w.metric(ben, { name: "Sales" }); const runway = await w.metric(ben, { name: "Runway" });
    const id = await createDeckFromTemplate(w.actor(ben, "member"), { template: t, name: "", fills: [[mine.id], [runway.id]] });
    const { data: d } = await db().from("decks").select("name, owner_id, document").eq("id", id).single();
    expect(d).toMatchObject({ name: "Board meeting", owner_id: ben });
    const seed = await deckTemplateSeed(w.actor(ben, "member"), t, readFills(writeFills([[mine.id], [runway.id]])));
    expect(seed?.slides).toHaveLength(2);
    expect(seed?.fills).toEqual([[mine.id], [runway.id]]);
    await expect(deckTemplateSeed(w.actor(ben, "member"), t, [[rev.id], [cash.id]])).rejects.toEqual(forbidden);
  });

  it("starts a deck with the template's Theme, and only the deck's owner saves it as one, never an Editor", async () => {
    const w = await ws(); const ann = await w.person("owner"); const sara = await w.person("member"); const ben = await w.person("member");
    const m = await w.metric(sara);
    const { data: theme } = await db().from("themes").insert({ owner_id: ann, name: "Board", tokens: {}, slides: {}, workspace_id: w.id }).select("id").single();
    const deck = await createDeck(w.actor(sara, "member"), "Board");
    await setDeckTheme(w.actor(sara, "member"), deck, theme!.id);
    await stored(deck, [[widget(m.id)]]);
    await expect(saveDeckTemplate(w.actor(ben, "member"), { deckId: deck, name: "x", description: "", labels: [], choices: {} })).rejects.toEqual(forbidden);
    await share(w.actor(sara, "member"), "deck", deck, ben, "editor");
    await stored(deck, [[words("Hello")]]);
    await expect(saveDeckTemplate(w.actor(ben, "member"), { deckId: deck, name: "x", description: "", labels: [], choices: {} })).rejects.toEqual(forbidden);
    await stored(deck, [[words("Hello")]]);
    const t = await saveDeckTemplate(w.actor(sara, "member"), { deckId: deck, name: "Plain", description: "", labels: [], choices: {} });
    const id = await createDeckFromTemplate(w.actor(ben, "member"), { template: t, name: "Mine", fills: [] });
    expect((await db().from("decks").select("theme_id").eq("id", id).single()).data!.theme_id).toBe(theme!.id);
  });

  it("keeps to the actor's Workspace, and gives Guests nothing to start from", async () => {
    const a = await ws("A"); const b = await ws("B"); const ann = await a.person("owner"); const zoe = await b.person("owner"); const gus = await a.person("guest");
    const deck = await createDeck(b.actor(zoe), "Theirs");
    await stored(deck, [[words("Hi")]]);
    const t = await saveDeckTemplate(b.actor(zoe), { deckId: deck, name: "Theirs", description: "", labels: [], choices: {} });
    await expect(createDeckFromTemplate(a.actor(ann), { template: t, name: "x", fills: [] })).rejects.toEqual(forbidden);
    expect(await deckTemplateSeed(a.actor(ann), t, [])).toBeNull();
    expect(await listDeckTemplates(a.actor(ann))).toEqual([]);
    const own = await createDeck(a.actor(ann), "Ours");
    await stored(own, [[words("Hi")]]);
    await saveDeckTemplate(a.actor(ann), { deckId: own, name: "Ours", description: "", labels: [], choices: {} });
    expect(await deckTemplateChoices(a.actor(gus, "guest"))).toEqual({ templates: [], metrics: [] });
  });

  it("refuses a slide with a widget of a view that does not exist, or a deck too large", async () => {
    const w = await ws(); const ann = await w.person("owner"); const m = await w.metric(ann);
    const deck = await createDeck(w.actor(ann), "Board");
    const bad: SlideShape = { ...widget(m.id), props: { ...widget(m.id).props, template: "iframe" } };
    await stored(deck, [[bad]]);
    await expect(saveDeckTemplate(w.actor(ann), { deckId: deck, name: "x", description: "", labels: [], choices: {} })).rejects.toEqual(forbidden);
    await stored(deck, Array(41).fill([words("x")]));
    await expect(saveDeckTemplate(w.actor(ann), { deckId: deck, name: "x", description: "", labels: [], choices: {} })).rejects.toThrow("too large");
    await stored(deck, []);
    await expect(saveDeckTemplate(w.actor(ann), { deckId: deck, name: "x", description: "", labels: [], choices: {} })).rejects.toThrow("no slides");
  });
});

describe("what a Deck Template keeps of a slide", () => {
  it("keeps the words but no link, so a template carries no address of whoever made it", async () => {
    const w = await ws(); const ann = await w.person("owner");
    const deck = await createDeck(w.actor(ann), "Board");
    const linked: SlideShape = { type: "geo", x: 0, y: 0, rotation: 0, opacity: 1, props: { geo: "rectangle", w: 100, h: 50, url: "https://evil.example", richText: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Our site", marks: [{ type: "link", attrs: { href: "https://evil.example" } }, { type: "bold" }] }] }] } } };
    await stored(deck, [[linked]]);
    const t = await saveDeckTemplate(w.actor(ann), { deckId: deck, name: "Linked", description: "", labels: [], choices: {} });
    const body = JSON.stringify((await db().from("team_templates").select("body").eq("id", t).single()).data!.body);
    expect(body).toContain("Our site");
    expect(body).toContain("bold");
    expect(body).not.toContain("evil.example");
  });
});

describe("Workflow Templates", () => {
  const config = (approvers: string[]): WorkflowConfig => ({ dueWorkingDays: 3, steps: [{ type: "remind", daysBefore: 2 }, { type: "approve", approvers, values: "every" }, { type: "publish", lock: true }] });

  it("keeps the steps and how many Approvers, never who, and a Workflow made from it has the people picked", async () => {
    const w = await ws(); const ann = await w.person("owner"); const sara = await w.person("member"); const ben = await w.person("member");
    const wf = await saveWorkflow(w.actor(ann), null, "Monthly close", config([sara]));
    const t = await saveWorkflowTemplate(w.actor(ann), { workflowId: wf, name: "Close", description: "Every month" });
    const { data: row } = await db().from("team_templates").select("kind, slots, body").eq("id", t).single();
    expect(row).toEqual({ kind: "workflow", slots: [], body: { dueWorkingDays: 3, steps: [{ type: "remind", daysBefore: 2 }, { type: "approve", approvers: 1, values: "every" }, { type: "publish", lock: true }] } });
    expect(JSON.stringify(await listWorkflowTemplates(w.actor(ben, "member")))).not.toContain(sara);

    const id = await createWorkflowFromTemplate(w.actor(ben, "member"), { template: t, name: "Ben's close", approvers: [ann] });
    const { data: made } = await db().from("workflows").select("name, owner_id, config").eq("id", id).single();
    expect(made).toEqual({ name: "Ben's close", owner_id: ben, config: config([ann]) });
    const { data: versions } = await db().from("versions").select("message").eq("object_type", "workflow").eq("object_id", id);
    expect(versions).toEqual([{ message: "Made from the Workflow Template “Close”" }]);
  });

  it("refuses the wrong number of Approvers, someone outside the Workspace, a Contact, another Workspace's template and Guests", async () => {
    const a = await ws("A"); const b = await ws("B"); const ann = await a.person("owner"); const sara = await a.person("member"); const gus = await a.person("guest");
    const zoe = await b.person("owner");
    const t = await saveWorkflowTemplate(a.actor(ann), { workflowId: await saveWorkflow(a.actor(ann), null, "Close", config([sara])), name: "Close", description: "" });
    await expect(createWorkflowFromTemplate(a.actor(ann), { template: t, name: "x", approvers: [] })).rejects.toThrow("Pick each Approver");
    await expect(createWorkflowFromTemplate(a.actor(ann), { template: t, name: "x", approvers: [sara, ann] })).rejects.toThrow("Pick each Approver");
    await expect(createWorkflowFromTemplate(a.actor(ann), { template: t, name: "x", approvers: [zoe] })).rejects.toEqual(forbidden);
    const carla = await a.contact({ email: "carla@contact.test" });
    await expect(createWorkflowFromTemplate(a.actor(ann), { template: t, name: "x", approvers: [carla] })).rejects.toEqual(forbidden);
    await expect(createWorkflowFromTemplate(b.actor(zoe), { template: t, name: "x", approvers: [zoe] })).rejects.toEqual(forbidden);
    await expect(createWorkflowFromTemplate(a.actor(gus, "guest"), { template: t, name: "x", approvers: [sara] })).rejects.toEqual(forbidden);
    const { data: ours } = await db().from("workflows").select("id").eq("workspace_id", a.id).limit(1).single();
    await expect(saveWorkflowTemplate(b.actor(zoe), { workflowId: ours!.id, name: "x", description: "" })).rejects.toEqual(forbidden);
  });
});

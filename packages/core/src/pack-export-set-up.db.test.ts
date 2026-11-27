// Export as Pack's set-up questions and "Try it" against the real database (spec 0068, #1346; GLOSSARY: Pack, Metric
// Catalog): a file with the questions passes the check, installs and asks them in the guided set-up; an installed Pack's
// questions are offered only to who may export, in their own Workspace; nothing of the Workspace's people goes into a
// file by itself; and a try writes nothing.
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Forbidden } from "./actor";
import { db } from "./db";
import { checkExportSetUp, exportPack, type ExportManifest } from "./pack-export";
import { draftPackGuide } from "./pack-export-guide";
import type { PackSetUpChoice } from "./pack-export-set-up";
import { tryExportedPack } from "./pack-export-try";
import { checkPack } from "./pack";
import { startOptions } from "./pack-start";
import { startSteps } from "./pack-start-steps";
import { installPackFile } from "./packs";
import { createDashboard, placeWidget } from "./dashboards";
import { saveDashboardTemplate } from "./templates";
import { workspace } from "./test/db-fixtures";

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws() { const w = await workspace(); cleanups.push(w.cleanup); return w; }
const MANIFEST: ExportManifest = { id: "northwind/sales", name: "Weekly sales", version: "1.0.0", summary: "A week of sales.", author: "Northwind", license: "CC-BY-4.0" };
const yes = { unsigned: true, assistantTexts: true };

/** A Workspace with a Metric on a dashboard saved as a template, and people with names and addresses. */
async function setUp() {
  const w = await ws(); const ann = await w.person("owner", { email: `ann-${randomUUID().slice(0, 8)}@example.test` }); const actor = w.actor(ann);
  await w.person("member", { email: `mia-${randomUUID().slice(0, 8)}@example.test` });
  await w.contact({ email: `cy-${randomUUID().slice(0, 8)}@example.test` });
  const sales = await w.metric(ann, { name: "Sales", period: "week", aggregation: "sum" });
  const dash = await createDashboard(actor, "Sales board");
  await placeWidget(actor, dash, { type: "metric", id: sales.id });
  await saveDashboardTemplate(actor, { dashboardId: dash, name: "Sales board", description: "", labels: ["Sales"] });
  const templates = ((await db().from("team_templates").select("id").eq("workspace_id", w.id)).data ?? []).map((r) => Number(r.id));
  const choice = { metrics: [sales.id], dashboards: templates };
  const asked: PackSetUpChoice = { line: "Your week of sales.", happens: ["You are asked for the figures"], needs: ["Last quarter's figures"], asks: { [`metric:${sales.id}`]: { question: "What is the target this quarter?", name: "Target", every: "quarter" } } };
  return { w, ann, actor, sales, choice, asked };
}

const TABLES = ["metrics", "catalog_metrics", "team_templates", "dashboards", "decks", "workflows", "tokens", "contacts", "memberships", "shares", "pack_installs", "pack_setups", "deliveries", "prompts", "invitations", "audit_log"];
const counts = async (workspaceId: string) => Object.fromEntries(await Promise.all(TABLES.map(async (t) => [t, (await db().from(t).select("*", { count: "exact", head: true }).eq("workspace_id", workspaceId)).count ?? 0] as const)));

describe("Set-up questions of an exported Pack", () => {
  it("make a /3 file that installs and asks them, and are offered again from the install", async () => {
    const { actor, choice, asked } = await setUp();
    expect(await checkExportSetUp(actor, choice, asked)).toEqual([]);
    const { text } = await exportPack(actor, MANIFEST, choice, { setUp: asked });
    const res = checkPack(text);
    expect(res.ok && [res.pack.format, res.pack.setUp?.line, res.pack.contents.metrics?.[0].ask?.every]).toEqual(["ziffr.pack/3", "Your week of sales.", "quarter"]);

    const other = await ws(); const bea = await other.person("owner"); const there = other.actor(bea);
    const installId = await installPackFile(there, text, yes);
    const options = await startOptions(there, { install: installId });
    const steps = startSteps(options.declarations, options.room);
    expect(steps[0]).toMatchObject({ step: "preview", line: "Your week of sales.", needs: ["Last quarter's figures"] });
    expect(steps.find((s) => s.step === "numbers")).toMatchObject({ asks: [{ question: "What is the target this quarter?", field: "Target", every: "quarter" }] });

    const catalog = ((await db().from("catalog_metrics").select("id").eq("workspace_id", other.id)).data ?? []).map((r) => Number(r.id));
    const draft = await draftPackGuide(there, "northwind/other", { catalog });
    const offered = { line: asked.line, happens: asked.happens, needs: asked.needs, asks: { [`catalog:${catalog[0]}`]: Object.values(asked.asks!)[0] } };
    expect(draft.setUps).toEqual([{ installId, name: MANIFEST.name, version: "1.0.0", setUp: offered }]);
    // Exporting with what was offered gives the same set-up again.
    const again = checkPack((await exportPack(there, MANIFEST, { catalog }, { setUp: offered })).text);
    expect(again.ok && [again.pack.setUp, again.pack.contents.metrics?.[0].ask]).toEqual([res.ok && res.pack.setUp, Object.values(asked.asks!)[0]]);

    // Nobody else is offered them: not who may not export, and not another Workspace naming these ids or this id.
    const gus = await other.person("guest");
    await expect(draftPackGuide(other.actor(gus, "guest"), MANIFEST.id, { catalog })).rejects.toThrow(Forbidden);
    const third = await ws(); const eve = await third.person("owner");
    expect((await draftPackGuide(third.actor(eve), MANIFEST.id, { catalog })).setUps).toBeUndefined();
  });

  it("start empty and put no person into a file", async () => {
    const { w, actor, choice } = await setUp();
    expect((await draftPackGuide(actor, MANIFEST.id, choice)).setUps).toBeUndefined();
    const { text } = await exportPack(actor, MANIFEST, choice, { setUp: {} });
    expect(JSON.parse(text).format).toBe("ziffr.pack/1");
    const people = ((await db().from("memberships").select("user_id").eq("workspace_id", w.id)).data ?? []).map((r) => String(r.user_id));
    const named = (await db().from("profiles").select("id, name").in("id", people)).data ?? [];
    for (const p of named) { expect(text).not.toContain(String(p.id)); expect(text).not.toContain(String(p.name)); }
    expect(text).not.toContain("@example.test");
  });

  it("are refused field by field, and no file is made of them", async () => {
    const { w, actor, choice } = await setUp();
    const bad: PackSetUpChoice = { line: "Write to ana@example.test", happens: ["Fine."] };
    expect((await checkExportSetUp(actor, choice, bad)).map((p) => p.field)).toEqual(["line"]);
    await expect(exportPack(actor, MANIFEST, choice, { setUp: bad })).rejects.toThrow("The Pack cannot be made: setUp.line");
    const gus = await w.person("guest");
    await expect(checkExportSetUp(w.actor(gus, "guest"), choice, bad)).rejects.toThrow(Forbidden);
  });
});

describe("Try it", () => {
  it("reads the file as it would be written and writes nothing", async () => {
    const { w, actor, choice, asked } = await setUp();
    const before = await counts(w.id);
    const tried = await tryExportedPack(actor, MANIFEST, choice, { setUp: asked });
    expect(tried.pack).toEqual({ id: MANIFEST.id, name: MANIFEST.name, version: "1.0.0" });
    expect(tried.declarations.setUp?.line).toBe("Your week of sales.");
    expect(tried.declarations.metrics.map((m) => [m.name, m.ask?.name])).toEqual([["Sales", "Target"]]);
    expect(tried.drawing.dashboard?.name).toBe("Sales board");
    expect(await counts(w.id)).toEqual(before);
    // Only what the file holds comes back: no person of the Workspace.
    expect(JSON.stringify(tried)).not.toContain("@example.test");
    expect(JSON.stringify(tried)).not.toContain(actor.personId);
  });

  it("is for who may export, of what they see", async () => {
    const { w, actor, choice, sales } = await setUp();
    const gus = await w.person("guest");
    await expect(tryExportedPack(w.actor(gus, "guest"), MANIFEST, choice)).rejects.toThrow(Forbidden);
    await expect(tryExportedPack({ ...actor, key: { id: 1 } } as never, MANIFEST, choice)).rejects.toThrow(Forbidden);
    const other = await ws(); const eve = await other.person("owner");
    await expect(tryExportedPack(other.actor(eve), MANIFEST, { metrics: [sales.id] })).rejects.toThrow("The Pack cannot be made");
  });
});

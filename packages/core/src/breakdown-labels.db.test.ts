// Breakdown labels against the real database (spec 0028 step 1, ticket #335): labels are stored sealed and merged by a
// blind index of their Workspace, plain rows from before keep merging, history opens, and nothing in the table reads
// as the words people wrote. Run with and without ZIFFR_SECRETS_KEY: the words come out the same either way.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAccessKey, actorForKey } from "./access-keys";
import type { KeyActor } from "./actor";
import { submitObservation } from "./api-submissions";
import { openHistoryLabel } from "./breakdown-labels";
import { db } from "./db";
import { submitValue, type SubmissionEffects } from "./submissions";
import { opened, workspace } from "./test/db-fixtures";
import { getBreakdowns } from "./workspace-data";
import { forgetWorkspaceKey, isSealed, workspaceCipher } from "./workspace-keys";
import { periodStart } from "./periods";
import { JANUARY } from "./periods";

const saved = process.env.ZIFFR_SECRETS_KEY;
const cleanups: (() => Promise<void>)[] = [];
const sealing = process.env.ZIFFR_SECRETS_KEY !== undefined || process.env.BREAKDOWN_TEST_SEAL === "1";
beforeEach(() => { if (process.env.BREAKDOWN_TEST_SEAL === "1" || saved) process.env.ZIFFR_SECRETS_KEY = saved ?? Buffer.alloc(32, 77).toString("base64"); });
afterEach(async () => {
  for (const c of cleanups.splice(0)) await c().catch(() => {});
  if (saved === undefined) delete process.env.ZIFFR_SECRETS_KEY;
  else process.env.ZIFFR_SECRETS_KEY = saved;
}, 120_000);

const quiet = (): SubmissionEffects => ({ notifyCorrection: vi.fn(async () => {}), afterValue: vi.fn(async () => []) });
const month = () => periodStart(new Date(), "month", JANUARY);

async function setup(rule = "add") {
  const w = await workspace("Labels");
  cleanups.push(async () => { forgetWorkspaceKey(w.id); await w.cleanup(); });
  const ben = await w.person("member");
  const m = await w.metric(ben, { submission_rule: rule });
  const code = await w.token(m.id, ben);
  const { secret } = await createAccessKey(w.actor(ben, "member"), { name: "Export", scopes: ["values:submit"], expiresOn: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10) });
  const key = (await actorForKey(secret)) as KeyActor;
  const obsId = async () => (await db().from("observations").select("id").eq("metric_id", m.id).single()).data!.id as number;
  const rows = async () => {
    const { data } = await db().from("breakdown_rows").select("id, label, label_index, value, position").eq("observation_id", await obsId()).order("position");
    return data ?? [];
  };
  return { ...w, ben, m, code, key, rows, obsId };
}

describe("Breakdown labels", () => {
  it("merge when two sources send the same label, in any case, and read back as written", async () => {
    const w = await setup();
    expect(await submitObservation(w.key, w.m.slug, { value: 5, breakdown: [{ label: "Hamburg", value: 2 }, { label: "Berlin", value: 3 }] }, quiet())).toMatchObject({ ok: true });
    const r = await submitValue({ source: "web_form", sender: w.code, text: "hamburg 4\nMünchen 6" }, quiet());
    expect(r.ok).toBe(true);
    const stored = await w.rows();
    expect(stored).toHaveLength(3);
    expect(await opened("breakdown_rows", w.id, stored, { dropId: true })).toMatchObject([
      { label: "Hamburg", value: 6 }, { label: "Berlin", value: 3 }, { label: "München", value: 6 },
    ]);
    forgetWorkspaceKey(w.id);
    expect((await getBreakdowns(w.id, [w.m.id]))[w.m.id][month()]).toEqual([{ label: "Hamburg", value: 6 }, { label: "Berlin", value: 3 }, { label: "München", value: 6 }]);
    if (sealing) for (const s of stored) { expect(isSealed(s.label)).toBe(true); expect(s.label_index).toMatch(/^b1\.\d+\./); }
  });

  it("merge with plain rows from before sealing, and keep reading them", async () => {
    const w = await setup();
    await submitObservation(w.key, w.m.slug, { value: 1, breakdown: [{ label: "Shop", value: 1 }] }, quiet());
    // As written before sealing existed: plain label, no index.
    const first = await w.rows();
    await db().from("breakdown_rows").update({ label: "Old Shop", label_index: null }).eq("id", first[0].id);
    await submitObservation(w.key, w.m.slug, { value: 2, breakdown: [{ label: "  old shop ", value: 2 }, { label: "New", value: 1 }] }, quiet());
    const stored = await w.rows();
    expect(stored).toHaveLength(2);
    expect(stored[0].label).toBe("Old Shop");
    expect(Number(stored[0].value)).toBe(3);
    expect((await getBreakdowns(w.id, [w.m.id]))[w.m.id][month()]).toEqual([{ label: "Old Shop", value: 3 }, { label: "New", value: 1 }]);
    // The next one finds the new row by its index.
    await submitObservation(w.key, w.m.slug, { value: 1, breakdown: [{ label: "NEW", value: 4 }] }, quiet());
    expect((await getBreakdowns(w.id, [w.m.id]))[w.m.id][month()]).toEqual([{ label: "Old Shop", value: 3 }, { label: "New", value: 5 }]);
  });

  it("keep every row when writers add at once", async () => {
    const w = await setup();
    const sent = Array.from({ length: 6 }, (_, i) => ({ value: 1, breakdown: [{ label: i % 2 ? "shop" : "Shop", value: 1 }, { label: `Own ${i}`, value: 1 }] }));
    await Promise.all(sent.map((v) => submitObservation(w.key, w.m.slug, v, quiet())));
    const rows = (await getBreakdowns(w.id, [w.m.id]))[w.m.id][month()];
    expect(rows.find((r) => r.label.toLowerCase() === "shop")?.value).toBe(6);
    expect(rows).toHaveLength(7);
  });

  it("give different blind indexes in different Workspaces, equal ones inside one", async () => {
    if (!sealing) return;
    const a = await setup(); const b = await setup();
    for (const w of [a, b]) await submitObservation(w.key, w.m.slug, { value: 2, breakdown: [{ label: "Hamburg", value: 1 }, { label: " HAMBURG", value: 1 }] }, quiet());
    const [ra, rb] = [await a.rows(), await b.rows()];
    // Two rows of one submission are not merged (only a later value merges), but their indexes are equal.
    expect(ra[0].label_index).toBe(ra[1].label_index);
    expect(ra[0].label_index).not.toBe(rb[0].label_index);
    expect(ra[0].label).not.toBe(ra[1].label);
  });

  it("leave no label in clear, in the rows, the history or the indexes", async () => {
    const w = await setup("overwrite");
    const word = `Marker${Date.now()}`;
    await submitObservation(w.key, w.m.slug, { value: 2, breakdown: [{ label: `${word} North`, value: 1 }, { label: `${word} South`, value: 1 }] }, quiet());
    await submitObservation(w.key, w.m.slug, { value: 3, breakdown: [{ label: `${word} East`, value: 1 }, { label: `${word} West`, value: 2 }] }, quiet());
    for (const table of ["breakdown_rows", "breakdown_history"] as const) {
      const { data } = await db().from(table).select("*").eq("workspace_id", w.id);
      expect((data ?? []).length).toBeGreaterThan(0);
      const dump = JSON.stringify(data);
      expect(sealing ? dump.toLowerCase().includes(word.toLowerCase()) : false).toBe(false);
    }
  });

  it("open in the history, bound to the row they were written for", async () => {
    const w = await setup("overwrite");
    await submitObservation(w.key, w.m.slug, { value: 2, breakdown: [{ label: "Alpha", value: 1 }, { label: "Beta", value: 1 }] }, quiet());
    const before = await w.rows();
    await submitObservation(w.key, w.m.slug, { value: 3, breakdown: [{ label: "Gamma", value: 3 }] }, quiet());
    const { data: history } = await db().from("breakdown_history").select("row_id, label, value").eq("workspace_id", w.id).order("row_id");
    expect(history).toHaveLength(2);
    const cipher = await workspaceCipher(w.id);
    expect(history!.map((h) => openHistoryLabel(cipher, h))).toEqual(["Alpha", "Beta"]);
    expect(history!.map((h) => Number(h.row_id))).toEqual(before.map((r) => Number(r.id)));
    // A label copied to another row's history does not open.
    if (sealing) expect(openHistoryLabel(cipher, { row_id: Number(history![1].row_id), label: history![0].label as string })).toBeNull();
  });

  it("copy to an Action's row label, sealed too, and open with the Action", async () => {
    const { ask } = await import("./questions");
    const { getActions } = await import("./workspace-data");
    const w = await setup();
    const ana = await w.person("member");
    const id = await ask(w.actor(w.ben, "member"), { metricId: w.m.id, period: month(), assigneeId: ana, text: "Why?", breakdownLabel: "Hamburg" });
    const { data } = await db().from("actions").select("breakdown_label").eq("id", id).single();
    if (sealing) { expect(isSealed(data!.breakdown_label)).toBe(true); expect(data!.breakdown_label).not.toContain("Hamburg"); }
    expect((await getActions(w.id)).find((a) => a.id === id)?.breakdown_label).toBe("Hamburg");
  });

  it("refuse a row id the sequence has not handed out", async () => {
    const w = await setup();
    await submitObservation(w.key, w.m.slug, { value: 1, breakdown: [{ label: "A", value: 1 }] }, quiet());
    const { error } = await db().from("breakdown_rows").insert({ id: 2 ** 40, observation_id: await w.obsId(), label: "x", value: 1, position: 5 });
    expect(error).not.toBeNull();
  });
});

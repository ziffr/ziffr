// The template file for Paste values against the real database (spec 0026; GLOSSARY: Observation, Number Style): it
// names only the Metrics the page offers, by slug, writes periods as days, follows the Workspace's list separator, and,
// once filled in, is read back by Paste values with no problem and the layout it was made for.
import { afterEach, describe, expect, it, vi } from "vitest";
import { Forbidden } from "./actor";
import { db } from "./db";
import { pasteTemplate } from "./paste-template";
import { previewValues, type PasteReport } from "./paste-values";
import { JANUARY, periodStart, shiftPeriod } from "./periods";
import { workspace } from "./test/db-fixtures";

vi.setConfig({ testTimeout: 120_000, hookTimeout: 60_000 });
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
const thisMonth = () => periodStart(new Date(), "month", JANUARY);
const BOM = String.fromCharCode(0xfeff);

async function setup() {
  const w = await workspace(); cleanups.push(w.cleanup);
  const ann = await w.person("member");
  const revenue = await w.metric(ann, { name: "Revenue", unit: "", sources: ["web_form"] });
  const signups = await w.metric(ann, { name: "Signups", unit: "", sources: ["web_form"] });
  const weekly = await w.metric(ann, { name: "Visits", unit: "", period: "week", sources: ["web_form"] });
  for (const m of [revenue, signups, weekly]) await w.token(m.id, ann);
  return { w, ann, revenue, signups, weekly, actor: w.actor(ann, "member") };
}
const rowsOf = (text: string, sep = ",") => text.replace(BOM, "").trimEnd().split("\r\n").map((l) => l.split(sep));
const read = async (actor: Parameters<typeof previewValues>[0], text: string, metricId?: number): Promise<PasteReport> => {
  const r = await previewValues(actor, { text, metricId: metricId ?? null });
  if (!r.ok) throw new Error(`refused: ${r.reason}: ${r.detail}`);
  return r;
};

describe("pasteTemplate", () => {
  it("one value per row: a Metric of the person's a row, by slug, with its own current period, and, filled in, read back as that layout", async () => {
    const { actor, revenue, signups, weekly } = await setup();
    const t = await pasteTemplate(actor, { kind: "rows" });
    expect(t.fileName).toBe("ziffr-paste-values.csv");
    expect(t.text.startsWith(BOM)).toBe(true);
    const rows = rowsOf(t.text);
    expect(rows[0]).toEqual(["metric", "period", "value"]);
    expect(rows.slice(1).map((r) => r[0]).sort()).toEqual([revenue.slug, signups.slug, weekly.slug].sort());
    expect(rows.find((r) => r[0] === revenue.slug)![1]).toBe(thisMonth());
    expect(rows.find((r) => r[0] === weekly.slug)![1]).toBe(periodStart(new Date(), "week", JANUARY));
    expect(t.metrics).toBe(3);
    const filled = [rows[0], ...rows.slice(1).map((r, i) => [r[0], r[1], String(10 + i)])].map((r) => r.join(",")).join("\r\n");
    const report = await read(actor, filled);
    expect(report.layout).toBe("long");
    expect(report.rows.map((r) => r.outcome)).toEqual(["recorded", "recorded", "recorded"]);
  });

  it("Metrics down, periods across: one period length, the last periods oldest first, and, filled in, read back as that layout", async () => {
    const { actor, revenue, signups, weekly } = await setup();
    const t = await pasteTemplate(actor, { kind: "matrix", periods: 3 });
    const rows = rowsOf(t.text);
    expect(rows[0]).toEqual(["", shiftPeriod(thisMonth(), "month", -2), shiftPeriod(thisMonth(), "month", -1), thisMonth()]);
    expect(rows.slice(1).map((r) => r[0]).sort()).toEqual([revenue.slug, signups.slug].sort());
    expect(JSON.stringify(rows)).not.toContain(weekly.slug);
    expect(t.metrics).toBe(2);
    expect(t.periods).toBe(3);
    const filled = [rows[0], ...rows.slice(1).map((r) => [r[0], "1", "2", "3"])].map((r) => r.join(",")).join("\r\n");
    const report = await read(actor, filled);
    expect(report.layout).toBe("wide");
    expect(report.rows).toHaveLength(6);
    expect(report.rows.every((r) => r.outcome === "recorded" || r.outcome === "history" || r.outcome === "replaces")).toBe(true);
    // The weekly Metric has its own matrix when asked for.
    const weeks = rowsOf((await pasteTemplate(actor, { kind: "matrix", period: "week", periods: 2 })).text);
    expect(weeks.slice(1).map((r) => r[0])).toEqual([weekly.slug]);
  });

  it("one Metric's periods without a value, two columns, and, filled in, read back for that Metric", async () => {
    const { w, actor, revenue } = await setup();
    await w.value(revenue.id, shiftPeriod(thisMonth(), "month", -1), 5);
    const t = await pasteTemplate(actor, { kind: "history", metricId: revenue.id, periods: 4 });
    expect(t.fileName).toBe(`ziffr-paste-history-${revenue.slug}.csv`);
    const rows = rowsOf(t.text);
    expect(rows[0]).toEqual(["period", "value"]);
    expect(rows.slice(1).map((r) => r[0])).toEqual([shiftPeriod(thisMonth(), "month", -3), shiftPeriod(thisMonth(), "month", -2), thisMonth()]);
    expect(t.periods).toBe(3);
    const filled = [rows[0], ...rows.slice(1).map((r) => [r[0], "7"])].map((r) => r.join(",")).join("\r\n");
    const report = await read(actor, filled, revenue.id);
    expect(report.layout).toBe("one_metric");
    expect(report.rows).toHaveLength(3);
  });

  it("uses a semicolon where numbers are written with a decimal comma, and a quotation mark never opens a formula", async () => {
    const { w, ann, actor } = await setup();
    await db().from("workspaces").update({ number_style: "1.234,5" }).eq("id", w.id);
    expect(rowsOf((await pasteTemplate(actor, { kind: "rows" })).text, ";")[0]).toEqual(["metric", "period", "value"]);
    // A Metric named like a formula: its name is never in the file, only its slug.
    const evil = await w.metric(ann, { name: "=HYPERLINK(\"http://evil.example\",\"x\")", sources: ["web_form"] });
    await w.token(evil.id, ann);
    const text = (await pasteTemplate(actor, { kind: "rows" })).text;
    expect(text).not.toMatch(/HYPERLINK|evil\.example/);
    expect(text).toContain(evil.slug);
    expect(evil.slug).toMatch(/^[a-z0-9][a-z0-9-]*$/);
  });

  it("names only the Metrics the person submits for and sees, never another's", async () => {
    const { w, actor, revenue } = await setup();
    const sara = await w.person("owner");
    const secret = await w.metric(sara, { name: "Salaries", sources: ["web_form"] });
    await w.token(secret.id, sara);
    const text = (await pasteTemplate(actor, { kind: "rows" })).text;
    expect(text).toContain(revenue.slug);
    expect(text).not.toContain(secret.slug);
    await expect(pasteTemplate(actor, { kind: "history", metricId: secret.id })).rejects.toThrow(/Pick one of the Metrics/);
  });

  it("refuses a key, an unknown kind and a person with no Metric to paste for", async () => {
    const { w, actor } = await setup();
    await expect(pasteTemplate({ ...actor, key: { id: "1", scopes: ["metrics:read"] } } as never, { kind: "rows" })).rejects.toBeInstanceOf(Forbidden);
    await expect(pasteTemplate(actor, { kind: "everything" as never })).rejects.toThrow(/Pick one of the templates/);
    const nobody = await w.person("member");
    await expect(pasteTemplate(w.actor(nobody, "member"), { kind: "rows" })).rejects.toThrow(/no Metric you can paste values for/);
  });
});

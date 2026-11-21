// Condensed Values against the real database (spec 0033, ticket #380; GLOSSARY: Condensed Value, Retention): who stores
// one, that its numbers are sealed, that only what a person sees reaches them, and that a value for a period it stands
// for is refused by every Source (and by the database itself) with the day it was condensed.
import { afterEach, describe, expect, it, vi } from "vitest";
import { actorForKey, createAccessKey } from "./access-keys";
import { getCanvasData } from "./access";
import { Forbidden, type KeyActor } from "./actor";
import { listObservations } from "./api";
import { submitObservation } from "./api-submissions";
import { CONDENSED_CODE, condensedFor, condensedOn, condensedRefusal, condensedSpans, NotCondensed, storeCondensed } from "./condensed-values";
import { db } from "./db";
import { setYearStart } from "./fiscal-year";
import { previewValues } from "./paste-values";
import { decideCorrection, submitValue, type SubmissionEffects } from "./submissions";
import { shownData } from "./view-links";
import { DEMO_WORKSPACE_ID } from "./team";
import { valuesCsv } from "./trial-end";
import { workspace } from "./test/db-fixtures";

vi.setConfig({ testTimeout: 120_000, hookTimeout: 60_000 });
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws() { const w = await workspace(); cleanups.push(w.cleanup); return w; }
const quiet = (): SubmissionEffects => ({ notifyCorrection: vi.fn(async () => {}), afterValue: vi.fn(async () => []) });
const refusal = async (p: Promise<unknown>) => p.then(() => null, (e: Error) => e);
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
/** The values of the first quarter of 2024, one per month, and the Targets of two of its months. */
const Q1 = [{ period: "2024-01-01", value: 10 }, { period: "2024-02-01", value: 20.5 }, { period: "2024-03-01", value: 30 }];
const TARGETS = [{ period: "2024-01-01", value: 12 }, { period: "2024-02-01", value: 12 }, { period: "2024-03-01", value: 12 }];

/** A Workspace with an Owner, a Member who owns a monthly Metric and submits to it, and another Member who sees nothing. */
async function setup(over: Record<string, unknown> = {}) {
  const w = await ws();
  const sara = await w.person("owner"); const ben = await w.person("member"); const dan = await w.person("member");
  const m = await w.metric(ben, { name: "Field visits", aggregation: "sum", ...over });
  const code = await w.token(m.id, ben);
  return { w, sara, ben, dan, m, code };
}

describe("storing a Condensed Value", () => {
  it("is for the Metric's owner, Owners and Admins, and keeps the span, the counts and the exact sum", async () => {
    const { w, sara, ben, m } = await setup();
    const id = await storeCondensed(w.actor(ben, "member"), { metricId: m.id, into: "quarter", span: "2024-01-01", values: Q1, targets: TARGETS });
    expect(await condensedFor(w.id, [m.id])).toEqual({ [m.id]: [{ period: "2024-01-01", periodEnd: "2024-03-31", into: "quarter", held: 3, of: 3, sum: "60.5", last: null, target: { held: 3, sum: "36", last: { value: "12", day: "2024-03-01" } }, locked: false, condensedOn: new Date().toISOString().slice(0, 10) }] });
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    // An Owner may too, for any Metric of the Workspace.
    await storeCondensed(w.actor(sara), { metricId: m.id, into: "quarter", span: "2024-04-01", values: [{ period: "2024-04-01", value: 1 }], locked: true });
    expect((await condensedFor(w.id, [m.id]))[m.id].map((c) => [c.period, c.locked])).toEqual([["2024-01-01", false], ["2024-04-01", true]]);
  });

  it("seals the numbers: the database holds no readable sum", async () => {
    const { w, ben, m } = await setup();
    await storeCondensed(w.actor(ben, "member"), { metricId: m.id, into: "quarter", span: "2024-01-01", values: [{ period: "2024-01-01", value: 123456.789 }] });
    const { data } = await db().from("condensed_values").select("payload, held, period_start, period_end, span").eq("workspace_id", w.id).single();
    expect(data).toMatchObject({ held: 1, period_start: "2024-01-01", period_end: "2024-03-31", span: "quarter" });
    // Without ZIFFR_SECRETS_KEY nothing is sealed (the sealed-column tests cover that): it reads back either way.
    if (process.env.ZIFFR_SECRETS_KEY) expect(data!.payload).not.toContain("123456");
    expect((await condensedFor(w.id, [m.id]))[m.id][0].sum).toBe("123456.789");
  });

  it("refuses what is not theirs, a key, a Guest, another Workspace's Metric and the demo", async () => {
    const { w, ben, dan, m } = await setup();
    const input = { metricId: m.id, into: "quarter" as const, span: "2024-01-01", values: Q1 };
    expect(await refusal(storeCondensed(w.actor(dan, "member"), input))).toBeInstanceOf(Forbidden);
    expect(await refusal(storeCondensed(w.actor(ben, "guest"), input))).toBeInstanceOf(Forbidden);
    expect(await refusal(storeCondensed({ ...w.actor(ben, "member"), key: { id: 1, scopes: ["values:submit"] } } as never, input))).toBeInstanceOf(Forbidden);
    const other = await ws(); const eve = await other.person("owner");
    expect(await refusal(storeCondensed(other.actor(eve), input))).toBeInstanceOf(Forbidden);
    expect(await refusal(storeCondensed(w.actor(ben, "member"), { ...input, metricId: 0.5 }))).toBeInstanceOf(Forbidden);
    expect(await refusal(storeCondensed({ personId: ben, workspaceId: DEMO_WORKSPACE_ID, role: "owner" }, input))).toMatchObject({ name: "DemoReadOnly" });
    expect((await db().from("condensed_values").select("id", { count: "exact", head: true }).eq("workspace_id", w.id)).count).toBe(0);
  });

  it("refuses a rate, a Derived Metric, a span that is not one, an empty span and an overlap", async () => {
    const { w, ben, m } = await setup();
    const a = w.actor(ben, "member");
    const rate = await w.metric(ben, { name: "Rate", aggregation: "none" });
    const derived = await w.metric(ben, { name: "Margin", formula: "{field-visits} * 2" });
    expect(await refusal(storeCondensed(a, { metricId: rate.id, into: "quarter", span: "2024-01-01", values: Q1 }))).toBeInstanceOf(NotCondensed);
    expect(await refusal(storeCondensed(a, { metricId: derived.id, into: "quarter", span: "2024-01-01", values: Q1 }))).toBeInstanceOf(NotCondensed);
    expect(await refusal(storeCondensed(a, { metricId: m.id, into: "quarter", span: "2024-02-01", values: Q1 }))).toMatchObject({ message: "2024-02-01 is not the first day of a quarter." });
    expect(await refusal(storeCondensed(a, { metricId: m.id, into: "month", span: "2024-01-01", values: Q1 }))).toBeInstanceOf(NotCondensed);
    expect(await refusal(storeCondensed(a, { metricId: m.id, into: "quarter", span: "2024-01-01", values: [] }))).toMatchObject({ message: "There are no values in that span to condense." });
    await storeCondensed(a, { metricId: m.id, into: "quarter", span: "2024-01-01", values: Q1 });
    expect(await refusal(storeCondensed(a, { metricId: m.id, into: "quarter", span: "2024-01-01", values: Q1 }))).toMatchObject({ message: "That span is condensed already." });
  });

  it("follows the Fiscal Year: quarters start where the year does", async () => {
    const { w, ben, sara, m } = await setup();
    await setYearStart(w.actor(sara), 2);
    expect(await refusal(storeCondensed(w.actor(ben, "member"), { metricId: m.id, into: "quarter", span: "2024-01-01", values: Q1 }))).toBeInstanceOf(NotCondensed);
    await storeCondensed(w.actor(ben, "member"), { metricId: m.id, into: "quarter", span: "2024-02-01", values: Q1 });
    // The year cannot move to a month that would split what is condensed.
    expect(await refusal(setYearStart(w.actor(sara), 1))).toMatchObject({ message: expect.stringContaining("Condensed Values of quarters or years") });
  });
});

describe("a value for a condensed period", () => {
  async function condensed() {
    const s = await setup();
    await storeCondensed(s.w.actor(s.ben, "member"), { metricId: s.m.id, into: "quarter", span: "2024-01-01", values: Q1 });
    return s;
  }
  const today = new Date().toISOString().slice(0, 10);

  it("knows the day it was condensed, for periods inside the span only", async () => {
    const { w, m } = await condensed();
    expect(await condensedOn(w.id, m.id, "2024-02-01")).toBe(today);
    expect(await condensedOn(w.id, m.id, "2024-03-31")).toBe(today);
    expect(await condensedOn(w.id, m.id, "2024-04-01")).toBeNull();
    expect(await condensedOn(w.id, m.id, "2023-12-01")).toBeNull();
    expect(await condensedSpans(w.id, [m.id])).toEqual([{ metric_id: m.id, period_start: "2024-01-01", period_end: "2024-03-31", condensed_on: today }]);
    expect(condensedRefusal("2026-12-03")).toBe("This period was condensed on 3 December 2026.");
  });

  it("is refused by a form's paste and a program, row by row, and writes no value", async () => {
    const { w, ben, m, code } = await condensed();
    // A form's paste and a program name the period; a chat reply names it in words and goes the same way.
    const asked = [
      { source: "web_form" as const, text: "5", period: "2024-02-01", value: { value: 5 }, paste: { import: false } },
      { source: "api" as const, text: "5", period: "2024-02-01", value: { value: 5 } },
    ];
    for (const a of asked) {
      const r = await submitValue({ ...a, sender: code, workspaceId: w.id }, quiet());
      expect(r, a.source).toMatchObject({ ok: false, outcome: "rejected_period_condensed", detail: condensedRefusal(today) });
    }
    expect((await db().from("observations").select("id", { count: "exact", head: true }).eq("metric_id", m.id)).count).toBe(0);
    // A period outside the span still takes its value.
    expect(await submitValue({ source: "api", sender: code, text: "5", workspaceId: w.id, period: "2024-04-01", value: { value: 5 } }, quiet())).toMatchObject({ ok: true });
  });

  it("is answered 409-style to a program, with the same words, and a key that only submits learns nothing more", async () => {
    const { w, ben, m } = await condensed();
    const { secret } = await createAccessKey(w.actor(ben, "member"), { name: "Shop", scopes: ["values:submit"], expiresOn: inDays(30) });
    const key = (await actorForKey(secret)) as KeyActor;
    expect(await submitObservation(key, m.slug, { value: 1, period: "2024-03-01" }, quiet())).toEqual({ ok: false, reason: "period_condensed", detail: "This period was condensed; it takes no more values." });
    const reader = (await actorForKey((await createAccessKey(w.actor(ben, "member"), { name: "Both", scopes: ["values:submit", "metrics:read"], expiresOn: inDays(30) })).secret)) as KeyActor;
    expect(await submitObservation(reader, m.slug, { value: 1, period: "2024-03-01" }, quiet())).toMatchObject({ ok: false, reason: "period_condensed", detail: condensedRefusal(today) });
  });

  it("is refused in a paste's preview, row by row", async () => {
    const { w, ben, m } = await condensed();
    const text = `\t2024-02\t2024-04\nField visits\t7\t8`;
    const r = await previewValues(w.actor(ben, "member"), { text });
    if (!r.ok) throw new Error(r.detail);
    expect(r.rows.map((x) => [x.place, x.outcome])).toEqual([["B2", "refused"], ["C2", "recorded"]]);
    expect(r.rows[0].detail).toBe(condensedRefusal(today));
  });

  it("is refused by the database too, for any way a value is written", async () => {
    const { w, m } = await condensed();
    const { error } = await db().from("observations").insert({ metric_id: m.id, period_start: "2024-03-01", value: 1, source: "api", workspace_id: w.id });
    expect(error?.code).toBe(CONDENSED_CODE);
    // Moving a value into a condensed period is refused as well; one outside it is free.
    const { data: ok } = await db().from("observations").insert({ metric_id: m.id, period_start: "2024-05-01", value: 1, source: "api", workspace_id: w.id }).select("id").single();
    expect((await db().from("observations").update({ period_start: "2024-02-01" }).eq("id", ok!.id)).error?.code).toBe(CONDENSED_CODE);
    expect((await db().from("observations").update({ value: 2 }).eq("id", ok!.id)).error).toBeNull();
  });

  it("is refused to a Correction too, which stays proposed", async () => {
    const { w, sara, ben, m } = await condensed();
    const actionId = await w.action({ metric_id: m.id, period_start: "2024-02-01", asker_id: sara, assignee_id: ben });
    const { data: msg } = await db().from("thread_messages").insert({ action_id: actionId, author_id: sara, body: "x", correction_value: 9, correction_status: "proposed", workspace_id: w.id }).select("id").single();
    await expect(decideCorrection(w.actor(ben, "member"), msg!.id, true, { notifyDecision: vi.fn(async () => {}), afterValue: vi.fn(async () => []) })).rejects.toThrow(condensedRefusal(today));
    expect((await db().from("thread_messages").select("correction_status").eq("id", msg!.id).single()).data?.correction_status).toBe("proposed");
  });
});

describe("who reaches a Condensed Value", () => {
  it("is sent only to people who see the Metric, and leaves with a View Link only for the shown Metrics", async () => {
    const { w, ben, dan, m } = await setup();
    const other = await w.metric(ben, { name: "Other" });
    await storeCondensed(w.actor(ben, "member"), { metricId: m.id, into: "quarter", span: "2024-01-01", values: Q1 });
    await storeCondensed(w.actor(ben, "member"), { metricId: other.id, into: "quarter", span: "2024-01-01", values: Q1 });
    const mine = await getCanvasData(w.id, ben);
    expect(Object.keys(mine.condensed ?? {}).sort()).toEqual([String(m.id), String(other.id)].sort());
    expect((await getCanvasData(w.id, dan)).condensed).toEqual({});
    await w.share(m.id, dan);
    expect(Object.keys((await getCanvasData(w.id, dan)).condensed ?? {})).toEqual([String(m.id)]);
    expect(Object.keys(shownData(mine, new Set([m.id]), null).condensed ?? {})).toEqual([String(m.id)]);
  });
});

describe("a Condensed Value as a program reads it", () => {
  it("is one item for the span, marked with how many periods it was made from", async () => {
    const { w, ben, m } = await setup();
    await w.value(m.id, "2024-04-01", 7, ben);
    await storeCondensed(w.actor(ben, "member"), { metricId: m.id, into: "quarter", span: "2024-01-01", values: Q1 });
    const { secret } = await createAccessKey(w.actor(ben, "member"), { name: "Read", scopes: ["metrics:read"], expiresOn: inDays(30) });
    const page = await listObservations((await actorForKey(secret)) as KeyActor, m.slug, { limit: 10 });
    expect(page.items.map((i) => [i.period, i.period_end ?? null, i.condensed_from ?? null, i.value, i.state])).toEqual([["2024-01-01", "2024-03-31", 3, 60.5, "locked"], ["2024-04-01", null, null, 7, "recorded"]]);
    expect(page.items[0]).toMatchObject({ submitter: null, source: null, has_thread: false, breakdown: null });
  });

  it("is one line of the values file, with its span and count", async () => {
    const { w, ben, m } = await setup();
    await w.value(m.id, "2024-04-01", 7, ben);
    await storeCondensed(w.actor(ben, "member"), { metricId: m.id, into: "quarter", span: "2024-01-01", values: Q1 });
    const lines = (await valuesCsv(w.id, null)).trim().split("\r\n");
    expect(lines[0]).toBe('"metric","name","period","period_start","value","unit","source","recorded_at","period_end","condensed_from"');
    expect(lines.slice(1).map((l) => l.split(",").slice(2, 5).concat(l.split(",").slice(8)))).toEqual([['"month"', '"2024-04-01"', '"7"', '""', '""'], ['"quarter"', '"2024-01-01"', '"60.5"', '"2024-03-31"', '"3"']]);
  });
});

describe("deleting the Workspace", () => {
  it("takes its Condensed Values with it", async () => {
    const { w, ben, m } = await setup();
    await storeCondensed(w.actor(ben, "member"), { metricId: m.id, into: "quarter", span: "2024-01-01", values: Q1 });
    await db().from("workspaces").delete().eq("id", w.id);
    expect((await db().from("condensed_values").select("id", { count: "exact", head: true }).eq("workspace_id", w.id)).count).toBe(0);
  });
});

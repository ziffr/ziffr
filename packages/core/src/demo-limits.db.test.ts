// The demo's limits against the database (spec 0051, ticket 5; GLOSSARY: Demo Mode): the row caps the triggers read match
// the core's list, no table carries a cap while nothing is open, and the write budget counts and refuses. The cap
// trigger's own counting (per kind, per scope, the seed never counted, the last place) is tried by the database test of
// the ticket that opens the first table, with `apply_demo_limits`; it was tried here on a scratch Postgres with stand-in
// tables for this ticket (see the pull request).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { checkDemoBudget, DemoBudgetUsed } from "./demo-budget";
import { DEMO_ROW_CAPS, DEMO_WRITE_BUDGET } from "./demo-limits";
import { clearDemoVisitCounts, demoVisitCount, minuteStart, resetWindowStart, visitKey } from "./demo-visit";
import { DEMO_BUDGET_USED, DEMO_BUSY, DEMO_GOING_FAST } from "./demo-words";
import { DEMO_WORKSPACE_ID } from "./team";
import type { Actor } from "./actor";

const demo: Actor = { personId: "sara", workspaceId: DEMO_WORKSPACE_ID, role: "owner" };
const secret = "k".repeat(40);
const now = new Date("2026-11-23T14:30:10Z");
const visitId = "0123456789abcdef0123456789abcdef";
const from = (ip: string) => ({ visitId, headers: new Headers({ "x-forwarded-for": ip }) });
const savedHops = process.env.ZIFFR_PROXY_HOPS;

beforeEach(async () => { process.env.ZIFFR_PROXY_HOPS = "1"; await clearDemoVisitCounts(); });
afterEach(async () => {
  if (savedHops === undefined) delete process.env.ZIFFR_PROXY_HOPS; else process.env.ZIFFR_PROXY_HOPS = savedHops;
  await clearDemoVisitCounts();
});

describe("demo_limits", () => {
  it("holds the core's numbers, one row per kind", async () => {
    const { data, error } = await db().from("demo_limits").select("kind, max_rows");
    expect(error).toBeNull();
    expect(Object.fromEntries((data ?? []).map((r) => [r.kind, r.max_rows]))).toEqual(DEMO_ROW_CAPS);
  });

  it("lets the core change a number but nothing else", async () => {
    const original = DEMO_ROW_CAPS.tags;
    expect((await db().from("demo_limits").update({ max_rows: original + 1 }).eq("kind", "tags")).error).toBeNull();
    expect((await db().from("demo_limits").update({ max_rows: original }).eq("kind", "tags")).error).toBeNull();
    expect((await db().from("demo_limits").update({ filter_column: "id", filter_value: "1" }).eq("kind", "tags")).error).not.toBeNull();
    expect((await db().from("demo_limits").update({ max_rows: 0 }).eq("kind", "tags")).error).not.toBeNull();
    expect((await db().from("demo_limits").insert({ kind: "extra", max_rows: 1 })).error).not.toBeNull();
  });

  it("is on no table while nothing is open, and wherever it is, the table is open", async () => {
    const { data: triggers, error } = await db().rpc("demo_limit_triggers");
    expect(error).toBeNull();
    const { data: open } = await db().from("demo_open_tables").select("table_name");
    const openNames = new Set((open ?? []).map((r) => r.table_name));
    for (const t of (triggers ?? []) as { table_name: string }[]) expect(openNames.has(t.table_name), `${t.table_name} carries a cap but is not open`).toBe(true);
  });

  it("cannot be applied by the service role", async () => {
    expect((await db().rpc("apply_demo_limits", { t: "dashboards", p_kind: "dashboards" })).error).not.toBeNull();
  });
});

describe("checkDemoBudget", () => {
  it("counts a change against the address, the visit's minute and window, and the demo", async () => {
    await checkDemoBudget(demo, from("203.0.113.7"), now, secret);
    const window = resetWindowStart(now);
    expect(await demoVisitCount(demo, "visit_minute", visitKey(visitId), minuteStart(now))).toBe(1);
    expect(await demoVisitCount(demo, "visit", visitKey(visitId), window)).toBe(1);
    expect(await demoVisitCount(demo, "demo", "", window)).toBe(1);
  });

  it("refuses the 31st change in a minute with the going-fast words, and a new minute starts again", async () => {
    for (let i = 0; i < DEMO_WRITE_BUDGET.perVisitPerMinute; i++) await checkDemoBudget(demo, from("203.0.113.7"), now, secret);
    await expect(checkDemoBudget(demo, from("203.0.113.7"), now, secret)).rejects.toThrow(DEMO_GOING_FAST);
    await expect(checkDemoBudget(demo, from("203.0.113.7"), new Date(now.getTime() + 60_000), secret)).resolves.toBeUndefined();
  });

  it("keeps a script that mints new visits out with the address's count, without using up the demo's", async () => {
    const newVisit = (n: number) => ({ visitId: n.toString(16).padStart(32, "0"), headers: new Headers({ "x-forwarded-for": "198.51.100.9" }) });
    for (let i = 0; i < DEMO_WRITE_BUDGET.perAddressPerWindow; i++) await checkDemoBudget(demo, newVisit(i), now, secret);
    await expect(checkDemoBudget(demo, newVisit(99999), now, secret)).rejects.toThrow(DEMO_BUDGET_USED);
    expect(await demoVisitCount(demo, "demo", "", resetWindowStart(now))).toBe(DEMO_WRITE_BUDGET.perAddressPerWindow);
    // Another address still passes.
    await expect(checkDemoBudget(demo, { visitId, headers: new Headers({ "x-forwarded-for": "198.51.100.10" }) }, now, secret)).resolves.toBeUndefined();
  });

  it("refuses when the demo's whole budget is used", async () => {
    const { error } = await db().rpc("demo_visit_bump", { p_window: resetWindowStart(now).toISOString(), p_kind: "demo", p_key: "", p_by: DEMO_WRITE_BUDGET.demoPerWindow });
    expect(error).toBeNull();
    await expect(checkDemoBudget(demo, from("203.0.113.7"), now, secret)).rejects.toThrow(DEMO_BUSY);
  });

  it("refuses closed: no secret, no trusted address, no visit id", async () => {
    await expect(checkDemoBudget(demo, from("203.0.113.7"), now, undefined)).rejects.toBeInstanceOf(DemoBudgetUsed);
    process.env.ZIFFR_PROXY_HOPS = "";
    await expect(checkDemoBudget(demo, from("203.0.113.7"), now, secret)).rejects.toBeInstanceOf(DemoBudgetUsed);
    process.env.ZIFFR_PROXY_HOPS = "1";
    await expect(checkDemoBudget(demo, { visitId: "1", headers: new Headers({ "x-forwarded-for": "203.0.113.7" }) }, now, secret)).rejects.toBeInstanceOf(DemoBudgetUsed);
    expect(await demoVisitCount(demo, "demo", "", resetWindowStart(now))).toBe(0);
  });

  it("stores no address that works as one: the address's count is under its keyed hash", async () => {
    await checkDemoBudget(demo, from("203.0.113.7"), now, secret);
    const { data } = await db().from("demo_visit_counts").select("key").eq("kind", "address");
    expect(data).toHaveLength(1);
    expect(data?.[0].key).toMatch(/^[0-9a-f]{32}$/);
    expect(data?.[0].key).not.toContain("203");
  });
});

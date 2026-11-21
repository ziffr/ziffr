// Settable limits against the real database (ticket #518; GLOSSARY: Settable Limit): the Workspace level for Owners and
// Admins and the person level for each person, each only down from the level above and from the Installation's ceiling;
// the value in effect where the limits are used (Alerts held, View Links, the Schedule and Calendar Link); every
// change audited; Members, Guests, keys and the demo refused; the database's own range checks.
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Forbidden } from "./actor";
import { createAlert } from "./alerts";
import { db } from "./db";
import { DemoReadOnly } from "./demo";
import { createDashboard } from "./dashboards";
import { effectiveLimit, LimitRefused, mySettableLimits, setMySettableLimit, setWorkspaceSettableLimit, workspaceSettableLimits } from "./limits";
import { calendarEntries, schedule } from "./schedule";
import { forgetStoredSettings } from "./settings-in-effect";
import { DEMO_WORKSPACE_ID } from "./team";
import { auditRowsOf, workspace } from "./test/db-fixtures";
import { createViewLink } from "./view-links";

const cleanups: (() => Promise<void>)[] = [];
const CEILING = "ZIFFR_LIMIT_ALERTS_PER_PERSON";
let saved: string | undefined;
beforeEach(() => { saved = process.env[CEILING]; forgetStoredSettings(); });
afterEach(async () => {
  if (saved === undefined) delete process.env[CEILING]; else process.env[CEILING] = saved;
  forgetStoredSettings();
  for (const c of cleanups.splice(0)) await c();
});
async function ws() { const w = await workspace(); cleanups.push(w.cleanup); return w; }
const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const refusal = async (p: Promise<unknown>) => p.then(() => null, (e: Error) => e);

describe("the Workspace level", () => {
  it("is set by Owners and Admins within the Installation's range, cleared with null, and audited", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ann = await w.person("admin");
    expect(await effectiveLimit("viewLinkDays", w.id)).toBe(90);
    await setWorkspaceSettableLimit(w.actor(sara), "viewLinkDays", 30);
    await setWorkspaceSettableLimit(w.actor(ann, "admin"), "alertMailShare", 45);
    // The same value again changes nothing and records nothing.
    await setWorkspaceSettableLimit(w.actor(sara), "viewLinkDays", 30);
    expect(await effectiveLimit("viewLinkDays", w.id)).toBe(30);
    expect(await effectiveLimit("alertMailShare", w.id)).toBe(45);
    const view = await workspaceSettableLimits(w.actor(sara));
    expect(view.map((v) => v.key)).toEqual(["alertsPerPerson", "alertMessagesPerPerson", "viewLinkDays", "alertMailShare", "unusedDays"]);
    expect(view.find((v) => v.key === "viewLinkDays")).toMatchObject({ set: 30, effective: 30, min: 1, max: 90 });
    await setWorkspaceSettableLimit(w.actor(sara), "viewLinkDays", null);
    expect(await effectiveLimit("viewLinkDays", w.id)).toBe(90);
    expect(await auditRowsOf(w.id, "workspace.settable_limit_changed")).toEqual([
      { kind: "workspace.settable_limit_changed", access_key_id: null, details: { limit: "viewLinkDays", from: null, to: 30 } },
      { kind: "workspace.settable_limit_changed", access_key_id: null, details: { limit: "alertMailShare", from: null, to: 45 } },
      { kind: "workspace.settable_limit_changed", access_key_id: null, details: { limit: "viewLinkDays", from: 30, to: null } },
    ]);
  });

  it("refuses values outside the range, above the Installation's ceiling, and limits that are not the Workspace's", async () => {
    const w = await ws(); const sara = await w.person("owner"); const a = w.actor(sara);
    for (const bad of [0, 91, -5, 2.5, "30", NaN, undefined, {}]) expect(await refusal(setWorkspaceSettableLimit(a, "viewLinkDays", bad)), String(bad)).toBeInstanceOf(LimitRefused);
    for (const bad of [9, 51]) expect(await refusal(setWorkspaceSettableLimit(a, "alertMailShare", bad))).toBeInstanceOf(LimitRefused);
    for (const bad of [29, 366]) expect(await refusal(setWorkspaceSettableLimit(a, "unusedDays", bad))).toBeInstanceOf(LimitRefused);
    for (const key of ["overdueDaysBack", "calendarDaysBack", "nope", "", null, 7, "__proto__"]) expect(await refusal(setWorkspaceSettableLimit(a, key, 10)), String(key)).toBeInstanceOf(LimitRefused);
    // The Installation's ceiling for Alerts per person: a Workspace may lower it, never raise it.
    process.env[CEILING] = "12"; forgetStoredSettings();
    expect(await refusal(setWorkspaceSettableLimit(a, "alertsPerPerson", 13))).toMatchObject({ message: expect.stringContaining("from 1 to 12") });
    await setWorkspaceSettableLimit(a, "alertsPerPerson", 12);
    await setWorkspaceSettableLimit(a, "alertsPerPerson", 3);
    expect(await effectiveLimit("alertsPerPerson", w.id)).toBe(3);
    expect(await effectiveLimit("alertsPerPerson", w.id, "someone")).toBe(3);
    expect(await auditRowsOf(w.id, "workspace.settable_limit_changed")).toHaveLength(2);
  });

  it("follows an Operator who lowers the ceiling later: a stored value above it is not used", async () => {
    const w = await ws(); const sara = await w.person("owner");
    await setWorkspaceSettableLimit(w.actor(sara), "alertsPerPerson", 15);
    process.env[CEILING] = "8"; forgetStoredSettings();
    expect(await effectiveLimit("alertsPerPerson", w.id)).toBe(8);
    expect((await workspaceSettableLimits(w.actor(sara))).find((v) => v.key === "alertsPerPerson")).toMatchObject({ set: 15, effective: 8, ceiling: 8, max: 8 });
  });

  it("refuses Members, Guests, Access Keys and the demo, and the database refuses an absurd value on its own", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member"); const gus = await w.person("guest");
    for (const a of [w.actor(ben, "member"), w.actor(gus, "guest"), { ...w.actor(sara), key: { id: "k1", scopes: ["metrics:write"] } } as never]) {
      expect(await refusal(setWorkspaceSettableLimit(a, "viewLinkDays", 10))).toBeInstanceOf(Forbidden);
      expect(await refusal(workspaceSettableLimits(a))).toBeInstanceOf(Forbidden);
    }
    expect(await refusal(setWorkspaceSettableLimit({ personId: "sara", workspaceId: DEMO_WORKSPACE_ID, role: "owner" }, "viewLinkDays", 10))).toBeInstanceOf(DemoReadOnly);
    expect(await effectiveLimit("viewLinkDays", w.id)).toBe(90);
    for (const [col, v] of [["view_link_days", 0], ["view_link_days", 91], ["alert_mail_share", 5], ["alert_mail_share", 51], ["alerts_per_person", 201], ["unused_days", 10]] as const) {
      expect((await db().from("workspace_settable_limits").insert({ workspace_id: w.id, [col]: v })).error, `${col}=${v}`).not.toBeNull();
    }
    expect(await auditRowsOf(w.id, "workspace.settable_limit_changed")).toEqual([]);
  });

  it("goes with the Workspace when it is deleted", async () => {
    const w = await ws(); const sara = await w.person("owner");
    await setWorkspaceSettableLimit(w.actor(sara), "unusedDays", 120);
    await setMySettableLimit(w.actor(sara), "overdueDaysBack", 14);
    await w.cleanup();
    cleanups.length = 0;
    expect((await db().from("workspace_settable_limits").select("workspace_id").eq("workspace_id", w.id)).data).toEqual([]);
    expect((await db().from("person_settable_limits").select("workspace_id").eq("workspace_id", w.id)).data).toEqual([]);
  });
});

describe("the person level", () => {
  it("is set by each person for themselves, only down from the Workspace, and audited", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member"); const gus = await w.person("guest");
    const b = w.actor(ben, "member");
    await setWorkspaceSettableLimit(w.actor(sara), "alertMessagesPerPerson", 10);
    expect(await effectiveLimit("alertMessagesPerPerson", w.id, ben)).toBe(10);
    await setMySettableLimit(b, "alertMessagesPerPerson", 4);
    // Another person's value does not touch Ben's, and a Guest has one too.
    await setMySettableLimit(w.actor(gus, "guest"), "alertMessagesPerPerson", 2);
    expect(await effectiveLimit("alertMessagesPerPerson", w.id, ben)).toBe(4);
    expect(await effectiveLimit("alertMessagesPerPerson", w.id, sara)).toBe(10);
    expect(await effectiveLimit("alertMessagesPerPerson", w.id)).toBe(10);
    expect(await refusal(setMySettableLimit(b, "alertMessagesPerPerson", 11))).toMatchObject({ message: expect.stringContaining("from 1 to 10") });
    expect((await mySettableLimits(b)).map((v) => v.key)).toEqual(["alertMessagesPerPerson", "overdueDaysBack", "calendarDaysBack", "calendarDaysAhead"]);
    expect((await mySettableLimits(b))[0]).toMatchObject({ set: 4, effective: 4, ceiling: 10, max: 10 });
    await setMySettableLimit(b, "alertMessagesPerPerson", null);
    expect(await effectiveLimit("alertMessagesPerPerson", w.id, ben)).toBe(10);
    expect((await auditRowsOf(w.id, "person.settable_limit_changed")).map((r) => r.details)).toEqual([
      { limit: "alertMessagesPerPerson", from: null, to: 4 }, { limit: "alertMessagesPerPerson", from: null, to: 2 }, { limit: "alertMessagesPerPerson", from: 4, to: null },
    ]);
  });

  it("lowers a Workspace's value for a person after the fact: the lower of the two applies", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member");
    await setMySettableLimit(w.actor(ben, "member"), "alertMessagesPerPerson", 8);
    await setWorkspaceSettableLimit(w.actor(sara), "alertMessagesPerPerson", 5);
    expect(await effectiveLimit("alertMessagesPerPerson", w.id, ben)).toBe(5);
  });

  it("refuses values outside the range, limits that are not a person's, Access Keys and the demo", async () => {
    const w = await ws(); const ben = await w.person("member"); const b = w.actor(ben, "member");
    for (const [key, bad] of [["overdueDaysBack", 6], ["overdueDaysBack", 91], ["calendarDaysBack", -1], ["calendarDaysBack", 31], ["calendarDaysAhead", 6], ["calendarDaysAhead", 91], ["overdueDaysBack", "14"], ["overdueDaysBack", 1.5]] as const) {
      expect(await refusal(setMySettableLimit(b, key, bad)), `${key}=${bad}`).toBeInstanceOf(LimitRefused);
    }
    for (const key of ["viewLinkDays", "alertsPerPerson", "alertMailShare", "unusedDays", "nope", null]) expect(await refusal(setMySettableLimit(b, key, 20)), String(key)).toBeInstanceOf(LimitRefused);
    expect(await refusal(setMySettableLimit({ ...b, key: { id: "k1", scopes: ["metrics:read"] } } as never, "overdueDaysBack", 14))).toBeInstanceOf(Forbidden);
    expect(await refusal(mySettableLimits({ ...b, key: { id: "k1", scopes: ["metrics:read"] } } as never))).toBeInstanceOf(Forbidden);
    expect(await refusal(setMySettableLimit({ personId: "sara", workspaceId: DEMO_WORKSPACE_ID, role: "owner" }, "overdueDaysBack", 14))).toBeInstanceOf(DemoReadOnly);
    await setMySettableLimit(b, "calendarDaysBack", 0);
    await setMySettableLimit(b, "calendarDaysAhead", 7);
    expect((await db().from("person_settable_limits").insert({ workspace_id: w.id, person_id: "x-nobody", overdue_days_back: 3 })).error).not.toBeNull();
    expect((await db().from("person_settable_limits").update({ calendar_days_ahead: 91 }).eq("workspace_id", w.id)).error).not.toBeNull();
    expect(await auditRowsOf(w.id, "person.settable_limit_changed")).toHaveLength(2);
  });
});

describe("where the limits are used", () => {
  it("holds Alerts to the person's Workspace limit, and says the number", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ann = await w.person("member");
    const m = await w.metric(sara, { name: "Cash" });
    await db().from("shares").insert({ workspace_id: w.id, object_type: "metric", object_id: m.id, user_id: ann, role: "viewer" });
    await setWorkspaceSettableLimit(w.actor(sara), "alertsPerPerson", 2);
    const a = w.actor(ann, "member");
    await createAlert(a, { metricId: m.id, condition: { kind: "at_or_above", value: "1" } });
    await createAlert(a, { metricId: m.id, condition: { kind: "at_or_above", value: "2" } });
    expect(await refusal(createAlert(a, { metricId: m.id, condition: { kind: "at_or_above", value: "3" } }))).toMatchObject({ message: expect.stringContaining("You already hold 2 Alerts") });
  });

  it("ends new View Links within the Workspace's longest life", async () => {
    const w = await ws(); const sara = await w.person("owner"); const owner = w.actor(sara);
    const dash = await createDashboard(owner, "Monthly");
    await setWorkspaceSettableLimit(owner, "viewLinkDays", 30);
    await createViewLink(owner, "dashboard", dash, { label: "", expires: inDays(30), frozen: false });
    expect(await refusal(createViewLink(owner, "dashboard", dash, { label: "", expires: inDays(31), frozen: false }))).toMatchObject({ message: "Pick an end date within 30 days." });
    await setWorkspaceSettableLimit(owner, "viewLinkDays", null);
    await createViewLink(owner, "dashboard", dash, { label: "", expires: inDays(31), frozen: false });
  });

  it("shows the overdue list and the Calendar Link as far as the person chose", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member");
    const { data: flow } = await db().from("workflows").insert({ owner_id: sara, name: "Daily", config: { dueWorkingDays: 1, steps: [] }, workspace_id: w.id }).select("id").single();
    const m = await w.metric(sara, { name: "Revenue", period: "day", created_at: "2026-09-01T00:00:00Z", workflow_id: flow!.id });
    await db().from("shares").insert({ workspace_id: w.id, object_type: "metric", object_id: m.id, user_id: ben, role: "viewer" });
    await db().from("tokens").insert({ code: `tk-test-${randomUUID()}`, metric_id: m.id, submitter_id: ben, created_at: "2026-01-01T00:00:00Z" });
    const now = new Date("2026-11-19T12:00:00Z");
    const b = w.actor(ben, "member");
    const overdueDays = async () => (await schedule(b, { from: "2026-11-16", to: "2026-11-22" }, now)).overdue.length;
    const wide = await overdueDays();
    expect(wide).toBeGreaterThan(10);
    await setMySettableLimit(b, "overdueDaysBack", 7);
    expect(await overdueDays()).toBeLessThan(wide);
    expect(await overdueDays()).toBeLessThanOrEqual(8);
    const calendar = async () => (await calendarEntries(b, now)).entries.map((e) => e.date!);
    const all = await calendar();
    await setMySettableLimit(b, "calendarDaysBack", 0);
    await setMySettableLimit(b, "calendarDaysAhead", 7);
    const few = await calendar();
    expect(few.length).toBeLessThan(all.length);
    expect(few.every((d) => d >= "2026-11-19" && d <= "2026-11-26")).toBe(true);
    // An Owner reading Ben's Schedule sees everything overdue, whatever look-back Ben chose.
    expect((await schedule(w.actor(sara), { from: "2026-11-16", to: "2026-11-22", personId: ben }, now)).overdue.length).toBe(wide);
  });
});

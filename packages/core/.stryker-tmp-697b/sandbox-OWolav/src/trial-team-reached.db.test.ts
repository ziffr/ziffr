// @ts-nocheck
// What a trial's team can use beyond the Owner (spec 0040, ticket 4; ADR 0015), against the real database: View Links made
// in a trial end no later than the trial, whatever date is asked and whichever way the row is written, and get the date asked for back
// when the trial is subscribed to; and an Admin who accepted manages the trial's Webhooks within the Trial Limits while a
// Member does not. Who is reached by messages is in trial-sends.db.test.ts.
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Forbidden } from "./actor";
import { setCloudLimit } from "./cloud-api";
import { db } from "./db";
import { mailHostResolver } from "./mail-hosts";
import { workspace } from "./test/db-fixtures";
import { createViewLink, openViewLink } from "./view-links";
import { createWebhook } from "./webhooks";

vi.setConfig({ testTimeout: 120_000, hookTimeout: 60_000 });
const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const cleanups: (() => Promise<void>)[] = [];
const saved: Record<string, string | undefined> = {};
const realLookup = mailHostResolver.lookup;
beforeEach(() => {
  for (const n of ["ZIFFR_SECRETS_KEY", "ZIFFR_TRIAL_LIMIT_WEBHOOKS", "ZIFFR_TRIAL_WEBHOOKS"]) { saved[n] = process.env[n]; delete process.env[n]; }
  process.env.ZIFFR_SECRETS_KEY = Buffer.alloc(32, 78).toString("base64");
  mailHostResolver.lookup = async () => [{ address: "93.184.216.34", family: 4 }];
});
afterEach(async () => {
  mailHostResolver.lookup = realLookup;
  for (const c of cleanups.splice(0)) await c().catch(() => {});
  for (const [n, v] of Object.entries(saved)) { if (v === undefined) delete process.env[n]; else process.env[n] = v; }
});

/** A Trial Workspace ending in `days`, its Owner and a dashboard of the Owner's. */
async function trial(days = 5) {
  const w = await workspace("Trial");
  cleanups.push(w.cleanup);
  await w.trial(new Date(Date.now() + days * 86_400_000).toISOString());
  const owner = await w.person("owner");
  const { data: d } = await db().from("dashboards").insert({ name: "Board", owner_id: owner, workspace_id: w.id }).select("id").single();
  return { ...w, owner, dashboardId: d!.id as number, ownerActor: w.actor(owner) };
}
const ends = async (wsId: string) => (await db().from("view_links").select("expires_at").eq("workspace_id", wsId).order("id")).data!.map((l) => l.expires_at as string);

describe("a View Link made in a trial", () => {
  it("ends with the trial at the latest, however late the date asked for", async () => {
    const t = await trial(5);
    await createViewLink(t.ownerActor, "dashboard", t.dashboardId, { label: "late", expires: day(60), frozen: false });
    await createViewLink(t.ownerActor, "dashboard", t.dashboardId, { label: "early", expires: day(2), frozen: true });
    expect(await ends(t.id)).toEqual([day(5), day(2)]);
  });

  it("ends with the trial also when a row is written without the core: the database clamps", async () => {
    const t = await trial(5);
    const raw = await db().from("view_links").insert({ token: randomUUID(), object_type: "dashboard", object_id: t.dashboardId, created_by: t.owner, label: "", expires_at: day(90), workspace_id: t.id });
    expect(raw.error).toBeNull();
    expect(await ends(t.id)).toEqual([day(5)]);
  });

  it("is not made once the trial has ended", async () => {
    const t = await trial(-1);
    await expect(createViewLink(t.ownerActor, "dashboard", t.dashboardId, { label: "x", expires: day(1), frozen: false })).rejects.toBeInstanceOf(Forbidden);
    expect(await ends(t.id)).toEqual([]);
  });

  it("shows nothing once the trial has ended, though the link's last day is not over", async () => {
    const t = await trial(5);
    const token = await createViewLink(t.ownerActor, "dashboard", t.dashboardId, { label: "a", expires: day(5), frozen: false });
    expect(await openViewLink(token)).not.toBeNull();
    await db().from("workspaces").update({ trial_ends_at: new Date(Date.now() - 3_600_000).toISOString() }).eq("id", t.id);
    expect(await openViewLink(token)).toBeNull();
  });

  it("gets the end date that was asked for back when the trial is subscribed to, and an ordinary Workspace is not clamped", async () => {
    const t = await trial(5);
    await createViewLink(t.ownerActor, "dashboard", t.dashboardId, { label: "a", expires: day(60), frozen: false });
    await setCloudLimit({ cloud: true }, t.id, { metrics: 50, label: "Small", endTrial: true });
    expect(await ends(t.id)).toEqual([day(60)]);
    const o = await workspace("Ordinary");
    cleanups.push(o.cleanup);
    const sara = await o.person("owner");
    const { data: d } = await db().from("dashboards").insert({ name: "Board", owner_id: sara, workspace_id: o.id }).select("id").single();
    await createViewLink(o.actor(sara), "dashboard", d!.id as number, { label: "b", expires: day(60), frozen: false });
    expect(await ends(o.id)).toEqual([day(60)]);
  });
});

describe("Webhooks in a trial with a team", () => {
  const URL1 = "https://n8n.example.test/webhook/abcdef123456";

  it("are made by an Admin who accepted, within the Trial Limit, and not by a Member", async () => {
    const t = await trial(5);
    const admin = t.actor(await t.person("admin", { email: `admin-${randomUUID().slice(0, 8)}@example.test` }), "admin");
    const member = t.actor(await t.person("member", { email: `member-${randomUUID().slice(0, 8)}@example.test` }), "member");
    await expect(createWebhook(member, { name: "No", url: URL1 })).rejects.toBeInstanceOf(Forbidden);
    await createWebhook(admin, { name: "One", url: URL1 });
    await createWebhook(t.ownerActor, { name: "Two", url: URL1 });
    await expect(createWebhook(admin, { name: "Three", url: URL1 })).rejects.toThrow(/already has 2 Webhooks/);
  });
});

// Making a Practice Workspace and starting it over, against the database (spec 0063; GLOSSARY: Practice Workspace): only
// an Installation Admin, one each; it holds a copy of the demo with made-up people and sends nothing; the demo is only
// read; Start over deletes that one Workspace with its key and its people and can delete no other.
import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { Forbidden } from "./actor";
import { db } from "./db";
import { PRACTICE_HELD } from "./practice";
import { makePracticeWorkspace, practiceWorkspaceState, startOverPracticeWorkspace } from "./practice-workspace";
import { DEMO_WORKSPACE_ID } from "./team";
import { workspace } from "./test/db-fixtures";

vi.setConfig({ testTimeout: 180_000, hookTimeout: 180_000 });
const saved = process.env.ZIFFR_SECRETS_KEY;
beforeAll(() => { process.env.ZIFFR_SECRETS_KEY ??= randomBytes(32).toString("base64"); });
afterAll(() => { if (saved === undefined) delete process.env.ZIFFR_SECRETS_KEY; });
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });

/** A person with an ordinary Workspace of their own, made an Installation Admin unless said otherwise; whatever Practice
 * Workspace they end up with is deleted after the test. */
async function person(admin = true) {
  const w = await workspace("Home"); cleanups.push(w.cleanup);
  const id = await w.person("owner", { email: `admin-${randomUUID().slice(0, 8)}@example.test` });
  if (admin) await db().from("installation_admins").insert({ person_id: id }).throwOnError();
  cleanups.unshift(async () => {
    const { data } = await db().from("workspaces").select("id").eq("practice_for", id).maybeSingle();
    if (data) await db().rpc("delete_practice_workspace", { p_workspace: data.id, p_person: id });
    await db().from("installation_admins").delete().eq("person_id", id);
  });
  return { w, id, actor: { personId: id } };
}

/** How much the demo holds of each kind, to see that nothing changed it. */
async function demoCounts() {
  const tables = ["metrics", "observations", "dashboards", "widgets", "decks", "workflows", "shares", "memberships", "groups", "themes", "deliveries", "versions", "audit_events", "tokens", "dashboard_snapshots"];
  return Object.fromEntries(await Promise.all(tables.map(async (t) => [t, await count(t, DEMO_WORKSPACE_ID)] as const)));
}
const count = async (table: string, ws: string) => (await db().from(table).select("*", { count: "exact", head: true }).eq("workspace_id", ws)).count ?? 0;

describe("making a Practice Workspace", () => {
  it("is for an Installation Admin only", async () => {
    const { actor, w } = await person(false);
    await expect(practiceWorkspaceState(actor, w.id)).rejects.toBeInstanceOf(Forbidden);
    await expect(makePracticeWorkspace(actor, w.id)).rejects.toBeInstanceOf(Forbidden);
    await expect(startOverPracticeWorkspace(actor, w.id, w.id)).rejects.toBeInstanceOf(Forbidden);
  });
  it("is not offered from a trial or on a demo-only Installation", async () => {
    const { actor, w } = await person();
    await w.trial("2099-01-01");
    expect((await practiceWorkspaceState(actor, w.id)).refused).toMatch(/Trial Workspace/);
    await expect(makePracticeWorkspace(actor, w.id)).rejects.toThrow(/Trial Workspace/);
    process.env.ZIFFR_DEMO_ONLY = "1";
    try {
      await expect(makePracticeWorkspace(actor, null)).rejects.toThrow(/takes no new Workspaces/);
    } finally {
      delete process.env.ZIFFR_DEMO_ONLY;
    }
    expect((await db().from("workspaces").select("id").eq("practice_for", actor.personId)).data).toEqual([]);
  });

  it("copies the demo with made-up people, sends nothing, reads the demo only, and starts over", async () => {
    const demo = await demoCounts();
    const { actor, id: me, w } = await person();
    const made = await makePracticeWorkspace(actor, w.id);
    const { data: row } = await db().from("workspaces").select("name, practice_for, importing_at").eq("id", made).single();
    expect(row).toEqual({ name: "Practice Workspace", practice_for: me, importing_at: null });
    expect((await practiceWorkspaceState(actor, w.id)).workspace).toMatchObject({ id: made, ready: true });
    await expect(makePracticeWorkspace(actor, w.id)).rejects.toThrow(/already/);

    // The demo's company: its Metrics with history, dashboards, decks, Workflows, Themes and people.
    const counts = Object.fromEntries(await Promise.all(["metrics", "observations", "dashboards", "decks", "workflows", "themes", "memberships", "shares"].map(async (t) => [t, await count(t, made)] as const)));
    expect(counts.metrics).toBe(demo.metrics);
    expect(counts.observations).toBeGreaterThan(demo.observations * 0.9);
    for (const t of ["dashboards", "decks", "workflows", "memberships"]) expect([t, counts[t]]).toEqual([t, demo[t]]);
    expect(counts.shares).toBeGreaterThan(0);

    // Everyone but the maker is made up, with an address that cannot be routed and no sign-in; nobody is a demo person.
    const { data: members } = await db().from("memberships").select("user_id, role, profiles(email, auth_user_id, made_up_in)").eq("workspace_id", made);
    const demoPeople = new Set(((await db().from("memberships").select("user_id").eq("workspace_id", DEMO_WORKSPACE_ID)).data ?? []).map((m) => m.user_id));
    for (const m of members ?? []) {
      expect(demoPeople.has(m.user_id)).toBe(false);
      const p = m.profiles as unknown as { email: string; auth_user_id: string | null; made_up_in: string | null };
      if (m.user_id === me) expect([m.role, p.made_up_in]).toEqual(["owner", null]);
      else expect(p).toEqual({ email: expect.stringMatching(/@practice\.invalid$/), auth_user_id: null, made_up_in: made });
    }
    // No Workflow names anybody who is not in it.
    const inside = new Set((members ?? []).map((m) => m.user_id as string));
    const { data: flows } = await db().from("workflows").select("config").eq("workspace_id", made);
    const approvers = (flows ?? []).flatMap((f) => (f.config as { steps: { type: string; approvers?: string[] }[] }).steps.flatMap((s) => (s.type === "approve" ? s.approvers ?? [] : [])));
    expect(approvers.length).toBeGreaterThan(0);
    expect(approvers.filter((a) => !inside.has(a))).toEqual([]);

    // What would have been sent is in the Outbox, and nothing left.
    const { data: deliveries } = await db().from("deliveries").select("mail_state, sent_at, last_error").eq("workspace_id", made);
    expect(deliveries!.length).toBeGreaterThan(0);
    for (const d of deliveries!) expect(d).toMatchObject({ mail_state: "outbox", sent_at: null });
    // Held because it is a Practice Workspace; one that no allowed way could reach says that instead, as anywhere.
    expect(deliveries!.map((d) => d.last_error)).toContain(PRACTICE_HELD);
    expect(await demoCounts()).toEqual(demo);

    // Start over: only the one confirmed, only one's own.
    const other = await person();
    await expect(startOverPracticeWorkspace(other.actor, made, other.w.id)).rejects.toBeInstanceOf(Forbidden);
    for (const not of [w.id, DEMO_WORKSPACE_ID, randomUUID(), "x"]) await expect(startOverPracticeWorkspace(actor, not, w.id)).rejects.toBeInstanceOf(Forbidden);
    const madeUp = [...inside].filter((p) => p !== me);
    const fresh = await startOverPracticeWorkspace(actor, made, made);
    expect(fresh).not.toBe(made);
    expect((await db().from("workspaces").select("id").eq("id", made)).data).toEqual([]);
    expect((await db().from("workspace_keys").select("version").eq("workspace_id", made)).data).toEqual([]);
    expect((await db().from("profiles").select("id").in("id", madeUp)).data).toEqual([]);
    expect((await db().from("profiles").select("id").eq("id", me)).data).toHaveLength(1);
    expect(await count("metrics", fresh)).toBe(demo.metrics);
    expect(await demoCounts()).toEqual(demo);
  });
});

describe("the database step that deletes", () => {
  it("deletes only the Practice Workspace made for the person it is asked for", async () => {
    const home = await workspace("Acme"); cleanups.push(home.cleanup);
    const owner = await home.person("owner");
    const p = await workspace("Practice", { practice: true }); cleanups.push(p.cleanup);
    const me = await p.person("owner", { id: p.practiceFor! });
    await p.madeUp("member");
    const asked: [string, string][] = [[home.id, owner], [home.id, me], [p.id, owner], [DEMO_WORKSPACE_ID, "sara"], [DEMO_WORKSPACE_ID, me], [randomUUID(), me]];
    for (const [ws, person] of asked) expect((await db().rpc("delete_practice_workspace", { p_workspace: ws, p_person: person })).data).toBe(false);
    expect((await db().from("workspaces").select("id").in("id", [home.id, p.id, DEMO_WORKSPACE_ID])).data).toHaveLength(3);
    expect((await db().rpc("delete_practice_workspace", { p_workspace: p.id, p_person: me })).data).toBe(true);
    expect((await db().from("workspaces").select("id").eq("id", p.id)).data).toEqual([]);
    expect((await db().from("profiles").select("id").eq("id", me)).data).toHaveLength(1);
  });
});

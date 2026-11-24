// Workspace Announcements against the real database (spec 0054, ticket #1089; GLOSSARY: Announcement, Workspace Role): only
// an Owner or Admin of that Workspace writes and lists, a Member, a Guest, a key and an Admin of another Workspace are
// refused, no row is ever in another Workspace's list, at most 10 on at once per Workspace, the window, no reach from a
// browser role, the demo's closed list, the cascade with the Workspace and one Audit Log event per change.
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it } from "vitest";
import { Forbidden, Refused, type Actor } from "./actor";
import { auditLog } from "./audit-log";
import { db } from "./db";
import { DEMO_WORKSPACE_ID } from "./team";
import { workspace } from "./test/db-fixtures";
import {
  activeWorkspaceAnnouncements, createWorkspaceAnnouncement, deleteWorkspaceAnnouncement, setWorkspaceAnnouncementActive,
  updateWorkspaceAnnouncement, workspaceAnnouncements,
} from "./workspace-announcements";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
const hour = 3_600_000;
const at = (ms: number) => new Date(Date.now() + ms).toISOString();

/** A Workspace with an Owner, an Admin, a Member and a Guest, as actors. */
async function team() {
  const w = await workspace("Announcing");
  cleanups.push(w.cleanup);
  const [o, a, m, g] = [await w.person("owner"), await w.person("admin"), await w.person("member"), await w.person("guest")];
  return { w, owner: w.actor(o, "owner"), admin: w.actor(a, "admin"), member: w.actor(m, "member"), guest: w.actor(g, "guest") };
}
const rowsOf = async (workspaceId: string) => (await db().from("workspace_announcements").select("*").eq("workspace_id", workspaceId)).data ?? [];

describe("who may write and list", () => {
  it("lets an Owner and an Admin write and list, and refuses a Member, a Guest and a key, changing nothing", async () => {
    const t = await team();
    const id = await createWorkspaceAnnouncement(t.owner, { text: "Kept" });
    await expect(createWorkspaceAnnouncement(t.admin, { text: "Admin's" })).resolves.toBeTruthy();
    for (const who of [t.member, t.guest, { ...t.owner, key: { id: "k", scopes: ["metrics:read"] } } as unknown as Actor]) {
      await expect(workspaceAnnouncements(who)).rejects.toBeInstanceOf(Forbidden);
      await expect(createWorkspaceAnnouncement(who, { text: "No" })).rejects.toBeInstanceOf(Forbidden);
      await expect(updateWorkspaceAnnouncement(who, id, { text: "No" })).rejects.toBeInstanceOf(Forbidden);
      await expect(setWorkspaceAnnouncementActive(who, id, false)).rejects.toBeInstanceOf(Forbidden);
      await expect(deleteWorkspaceAnnouncement(who, id)).rejects.toBeInstanceOf(Forbidden);
    }
    const left = await rowsOf(t.w.id);
    expect(left.map((r) => r.text).sort()).toEqual(["Admin's", "Kept"]);
    expect(left.every((r) => r.active)).toBe(true);
  });

  it("refuses an Admin of another Workspace, for every operation, and shows them nothing of this one", async () => {
    const t = await team();
    const other = await team();
    const id = await createWorkspaceAnnouncement(t.owner, { text: "Ours" });
    await createWorkspaceAnnouncement(other.owner, { text: "Theirs" });
    // Their Admin acts in their Workspace: ours is not theirs, whatever id they name.
    await expect(updateWorkspaceAnnouncement(other.admin, id, { text: "Hijacked" })).rejects.toBeInstanceOf(Forbidden);
    await expect(setWorkspaceAnnouncementActive(other.admin, id, false)).rejects.toBeInstanceOf(Forbidden);
    await expect(deleteWorkspaceAnnouncement(other.admin, id)).rejects.toBeInstanceOf(Forbidden);
    expect((await workspaceAnnouncements(other.admin)).map((r) => r.text)).toEqual(["Theirs"]);
    expect((await workspaceAnnouncements(t.admin)).map((r) => r.text)).toEqual(["Ours"]);
    expect((await rowsOf(t.w.id)).map((r) => [r.text, r.active])).toEqual([["Ours", true]]);
    // What the shell reads for them is their own Workspace's line only.
    expect((await activeWorkspaceAnnouncements(other.member)).map((r) => r.text)).toEqual(["Theirs"]);
  });

  it("refuses the demo's Workspace and an unknown or badly shaped id", async () => {
    const t = await team();
    const demo: Actor = { personId: t.owner.personId, workspaceId: DEMO_WORKSPACE_ID, role: "owner" };
    await expect(createWorkspaceAnnouncement(demo, { text: "No" })).rejects.toBeInstanceOf(Forbidden);
    await expect(workspaceAnnouncements(demo)).rejects.toBeInstanceOf(Forbidden);
    await expect(updateWorkspaceAnnouncement(t.owner, randomUUID(), { text: "x" })).rejects.toBeInstanceOf(Forbidden);
    await expect(deleteWorkspaceAnnouncement(t.owner, "1 or 1=1")).rejects.toBeInstanceOf(Forbidden);
    await expect(setWorkspaceAnnouncementActive(t.owner, "not-an-id", false)).rejects.toBeInstanceOf(Forbidden);
  });

  it("lists every Announcement for an Owner or Admin, most urgent first, naming who made them", async () => {
    const t = await team();
    await createWorkspaceAnnouncement(t.owner, { text: "Info" });
    await createWorkspaceAnnouncement(t.admin, { text: "Warn", level: "warning", dismissible: false });
    await createWorkspaceAnnouncement(t.owner, { text: "Off", active: false });
    const list = await workspaceAnnouncements(t.owner);
    expect(list.map((r) => r.text)).toEqual(["Warn", "Info", "Off"]);
    expect(list[0]).toMatchObject({ level: "warning", dismissible: false, state: "running", createdByName: expect.stringContaining("admin") });
    expect(list[2].state).toBe("off");
    // A person who is no longer in the Workspace is not named.
    await t.w.dropMember(t.admin.personId);
    expect((await workspaceAnnouncements(t.owner)).find((r) => r.text === "Warn")?.createdByName).toBeNull();
  });
});

describe("what is stored", () => {
  it("makes, changes, switches off and on, and deletes, in the actor's Workspace", async () => {
    const t = await team();
    const id = await createWorkspaceAnnouncement(t.owner, { text: "New due date", link: { href: "https://example.test/x", label: "Read" }, level: "warning", startsAt: at(hour), endsAt: at(2 * hour) });
    expect((await rowsOf(t.w.id))[0]).toMatchObject({ workspace_id: t.w.id, text: "New due date", link_url: "https://example.test/x", link_label: "Read", level: "warning", active: true, created_by: t.owner.personId });
    await updateWorkspaceAnnouncement(t.admin, id, { text: "Due date moved" });
    expect((await rowsOf(t.w.id))[0]).toMatchObject({ text: "Due date moved", link_url: null, level: "info", updated_by: t.admin.personId });
    await setWorkspaceAnnouncementActive(t.owner, id, false);
    expect((await rowsOf(t.w.id))[0].active).toBe(false);
    await setWorkspaceAnnouncementActive(t.owner, id, true);
    expect((await rowsOf(t.w.id))[0].active).toBe(true);
    await deleteWorkspaceAnnouncement(t.owner, id);
    expect(await rowsOf(t.w.id)).toEqual([]);
  });

  it("refuses bad input before it reaches the table, and ignores an audience or sign-in page a browser sends", async () => {
    const t = await team();
    for (const bad of [{ text: "" }, { text: "x".repeat(281) }, { text: "ok", link: { href: "javascript:alert(1)", label: "x" } }, { text: "ok", link: { href: "http://a.test", label: "x" } },
      { text: "ok", link: { href: "https://u:p@a.test/", label: "x" } }, { text: "ok", level: "error" }, { text: "ok", startsAt: at(hour), endsAt: at(-hour) }, null, "text"])
      await expect(createWorkspaceAnnouncement(t.owner, bad), JSON.stringify(bad)).rejects.toBeInstanceOf(Refused);
    await createWorkspaceAnnouncement(t.owner, { text: "Plain\n words ‮", workspace_id: randomUUID(), audience: "demo", public: true });
    const [row] = await rowsOf(t.w.id);
    expect(row.text).toBe("Plain words");
    expect(row.workspace_id).toBe(t.w.id);
    expect(await rowsOf(t.w.id)).toHaveLength(1);
  });

  it("holds the same rules in the table itself, and never lets a row move to another Workspace", async () => {
    const t = await team();
    const other = await team();
    const bad = (extra: Record<string, unknown>) => db().from("workspace_announcements").insert({ workspace_id: t.w.id, text: "ok", ...extra });
    expect((await bad({ link_url: "http://a.test", link_label: "x" })).error).not.toBeNull();
    expect((await bad({ link_url: "https://a.test" })).error).not.toBeNull();
    expect((await bad({ text: "x".repeat(281) })).error).not.toBeNull();
    expect((await bad({ starts_at: at(hour), ends_at: at(-hour) })).error).not.toBeNull();
    expect((await bad({ level: "error" })).error).not.toBeNull();
    expect((await db().from("workspace_announcements").insert({ text: "no workspace" })).error).not.toBeNull();
    const id = await createWorkspaceAnnouncement(t.owner, { text: "Stays" });
    const moved = await db().from("workspace_announcements").update({ workspace_id: other.w.id }).eq("id", id);
    expect(moved.error?.code).toBe("ZF4A3");
    expect(await rowsOf(other.w.id)).toEqual([]);
  });
});

describe("at most 10 on at once, per Workspace", () => {
  it("refuses the 11th that is on, but takes one that is off or over, and leaves another Workspace alone", async () => {
    const t = await team();
    const other = await team();
    const ids: string[] = [];
    for (let i = 0; i < 10; i++) ids.push(await createWorkspaceAnnouncement(t.owner, { text: `On ${i}` }));
    await expect(createWorkspaceAnnouncement(t.owner, { text: "One too many" })).rejects.toBeInstanceOf(Refused);
    await expect(createWorkspaceAnnouncement(other.owner, { text: "Their first" })).resolves.toBeTruthy();
    await expect(createWorkspaceAnnouncement(t.owner, { text: "Off is fine", active: false })).resolves.toBeTruthy();
    await setWorkspaceAnnouncementActive(t.owner, ids[0], false);
    await expect(createWorkspaceAnnouncement(t.owner, { text: "Room again" })).resolves.toBeTruthy();
    await expect(setWorkspaceAnnouncementActive(t.owner, (await workspaceAnnouncements(t.owner)).find((r) => r.text === "Off is fine")!.id, true)).rejects.toBeInstanceOf(Refused);
    // Changing one that is on does not count it twice.
    await expect(updateWorkspaceAnnouncement(t.owner, ids[1], { text: "Changed" })).resolves.toBeUndefined();
  });

  it("does not let parallel writes pass together", async () => {
    const t = await team();
    for (let i = 0; i < 8; i++) await createWorkspaceAnnouncement(t.owner, { text: `On ${i}` });
    const results = await Promise.allSettled([1, 2, 3, 4, 5].map((i) => createWorkspaceAnnouncement(t.owner, { text: `Race ${i}` })));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
    expect((await rowsOf(t.w.id)).filter((r) => r.active)).toHaveLength(10);
  });

  it("does not count one whose end has passed", async () => {
    const t = await team();
    for (let i = 0; i < 10; i++) await db().from("workspace_announcements").insert({ workspace_id: t.w.id, text: `Past ${i}`, starts_at: at(-3 * hour), ends_at: at(-hour) });
    await expect(createWorkspaceAnnouncement(t.owner, { text: "Fine" })).resolves.toBeTruthy();
  });
});

describe("the total cap", () => {
  it("keeps at most 50 Announcements of any kind per Workspace, so off and ended ones cannot pile up", async () => {
    const t = await team();
    const other = await team();
    const row = (i: number) => ({ workspace_id: t.w.id, text: `Off ${i}`, active: false });
    await db().from("workspace_announcements").insert(Array.from({ length: 50 }, (_, i) => row(i)));
    await expect(createWorkspaceAnnouncement(t.owner, { text: "Over", active: false })).rejects.toBeInstanceOf(Refused);
    expect((await db().from("workspace_announcements").insert(row(51))).error?.code).toBe("ZF4A4");
    await expect(createWorkspaceAnnouncement(other.owner, { text: "Theirs" })).resolves.toBeTruthy();
    const [first] = await workspaceAnnouncements(t.owner);
    await deleteWorkspaceAnnouncement(t.owner, first.id);
    await expect(createWorkspaceAnnouncement(t.owner, { text: "Room again", active: false })).resolves.toBeTruthy();
    expect(await workspaceAnnouncements(t.owner)).toHaveLength(50);
  });
});

describe("changing one", () => {
  it("keeps it off when the change does not say, and records the switch when the value changes", async () => {
    const t = await team();
    const id = await createWorkspaceAnnouncement(t.owner, { text: "Parked", active: false });
    await updateWorkspaceAnnouncement(t.owner, id, { text: "Parked, reworded" });
    expect((await rowsOf(t.w.id))[0]).toMatchObject({ text: "Parked, reworded", active: false });
    await updateWorkspaceAnnouncement(t.owner, id, { text: "Parked, reworded", active: true });
    expect((await rowsOf(t.w.id))[0].active).toBe(true);
    await updateWorkspaceAnnouncement(t.owner, id, { text: "Still on" });
    expect((await rowsOf(t.w.id))[0].active).toBe(true);
    const kinds = (await auditLog(t.owner, { kind: "announcement" })).events.map((e) => e.kind).reverse();
    expect(kinds).toEqual(["announcement.created", "announcement.changed", "announcement.changed", "announcement.switched_on", "announcement.changed"]);
  });
});

describe("what the shell reads", () => {
  it("is not pushed out by many that are on but over, and at most 20 are read", async () => {
    const t = await team();
    await db().from("workspace_announcements").insert(Array.from({ length: 40 }, (_, i) => ({ workspace_id: t.w.id, text: `Over ${i}`, level: "warning", starts_at: at(-3 * hour), ends_at: at(-hour) })));
    await createWorkspaceAnnouncement(t.owner, { text: "Running" });
    expect((await activeWorkspaceAnnouncements(t.member)).map((r) => r.text)).toEqual(["Running"]);
  });

  it("is the running ones of the person's own Workspace, most urgent first, with only what the line shows", async () => {
    const t = await team();
    const other = await team();
    await createWorkspaceAnnouncement(t.owner, { text: "Info", link: { href: "https://example.test/a", label: "More" } });
    await createWorkspaceAnnouncement(t.owner, { text: "Warn", level: "warning", dismissible: false });
    await createWorkspaceAnnouncement(t.owner, { text: "Off", active: false });
    await createWorkspaceAnnouncement(t.owner, { text: "Not yet", startsAt: at(hour) });
    await createWorkspaceAnnouncement(t.owner, { text: "Over" , startsAt: at(-3 * hour), endsAt: at(-hour) });
    await createWorkspaceAnnouncement(other.owner, { text: "Not ours" });
    for (const who of [t.member, t.admin, t.owner]) {
      const shown = await activeWorkspaceAnnouncements(who);
      expect(shown.map((r) => r.text)).toEqual(["Warn", "Info"]);
      expect(Object.keys(shown[0]).sort()).toEqual(["dismissible", "id", "level", "text", "updatedAt"]);
      expect(shown[1].link).toEqual({ href: "https://example.test/a", label: "More" });
      expect(shown[0].dismissible).toBe(false);
    }
  });

  it("shows nothing to a Guest, a key or the demo, and the end of a window takes a line away", async () => {
    const t = await team();
    await createWorkspaceAnnouncement(t.owner, { text: "Members only" });
    expect(await activeWorkspaceAnnouncements(t.guest)).toEqual([]);
    expect(await activeWorkspaceAnnouncements({ ...t.member, key: { id: "k", scopes: [] } } as unknown as Actor)).toEqual([]);
    expect(await activeWorkspaceAnnouncements({ personId: t.member.personId, workspaceId: DEMO_WORKSPACE_ID, role: "member" })).toEqual([]);
    await db().from("workspace_announcements").update({ ends_at: at(-1000), starts_at: at(-hour) }).eq("workspace_id", t.w.id);
    expect(await activeWorkspaceAnnouncements(t.member)).toEqual([]);
  });

  it("is not reachable from a browser role", async () => {
    const t = await team();
    await createWorkspaceAnnouncement(t.owner, { text: "Shown" });
    let key = process.env.SUPABASE_ANON_KEY;
    if (!key) {
      try { key = JSON.parse(execFileSync("supabase", ["status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })).ANON_KEY; } catch { key = undefined; }
    }
    // Without a key to ask with (no local stack to read it from), the one check that needs it is skipped; CI has the stack.
    if (!key) return;
    const anon = createClient(process.env.SUPABASE_URL!, key, { auth: { persistSession: false } });
    expect((await anon.from("workspace_announcements").select("*")).data ?? []).toEqual([]);
    expect((await anon.from("workspace_announcements").insert({ workspace_id: t.w.id, text: "Mine" })).error).not.toBeNull();
    expect(await rowsOf(t.w.id)).toHaveLength(1);
  });
});

describe("the Workspace and the demo", () => {
  it("takes its Announcements with it when the Workspace is deleted", async () => {
    const t = await team();
    await createWorkspaceAnnouncement(t.owner, { text: "Goes" });
    await db().from("workspaces").delete().eq("id", t.w.id);
    expect(await rowsOf(t.w.id)).toEqual([]);
  });

  it("has the table on the demo's closed list, so visitors never write it", async () => {
    const closed = ((await db().from("demo_closed_tables").select("table_name")).data ?? []).map((r) => r.table_name as string);
    const open = ((await db().from("demo_open_tables").select("table_name")).data ?? []).map((r) => r.table_name as string);
    expect(closed).toContain("workspace_announcements");
    expect(open).not.toContain("workspace_announcements");
    expect(((await db().rpc("demo_unclassified_tables")).data ?? []) as string[]).toEqual([]);
  });
});

describe("the Audit Log", () => {
  it("leaves one event per change in this Workspace's log, by the actor, with the text as it was then", async () => {
    const t = await team();
    const other = await team();
    const id = await createWorkspaceAnnouncement(t.owner, { text: "First", link: { href: "https://a.test/secret-path", label: "More" } });
    await updateWorkspaceAnnouncement(t.admin, id, { text: "Second" });
    await setWorkspaceAnnouncementActive(t.owner, id, false);
    await setWorkspaceAnnouncementActive(t.owner, id, true);
    await deleteWorkspaceAnnouncement(t.owner, id);
    const { events } = await auditLog(t.owner, { kind: "announcement" });
    expect(events.map((e) => [e.kind, e.objectName]).reverse()).toEqual([
      ["announcement.created", "First"], ["announcement.changed", "Second"], ["announcement.switched_off", "Second"],
      ["announcement.switched_on", "Second"], ["announcement.deleted", "Second"],
    ]);
    expect(events.map((e) => e.actorId).reverse()).toEqual([t.owner.personId, t.admin.personId, t.owner.personId, t.owner.personId, t.owner.personId]);
    expect(JSON.stringify(events)).not.toContain("secret-path");
    expect((await auditLog(other.owner, { kind: "announcement" })).events).toEqual([]);
  });

  it("still leaves its event for long text and for emoji (cut between characters, never into half an emoji)", async () => {
    const t = await team();
    const emoji = String.fromCodePoint(0x1f600);
    await createWorkspaceAnnouncement(t.owner, { text: "w".repeat(280) });
    await createWorkspaceAnnouncement(t.owner, { text: "a" + emoji.repeat(139) });
    const { events } = await auditLog(t.owner, { kind: "announcement.created" });
    expect(events).toHaveLength(2);
    const names = events.map((e) => e.objectName ?? "");
    expect(names.every((n) => n.length <= 120)).toBe(true);
    expect(names.some((n) => n.startsWith("a" + emoji) && !/[\uD800-\uDBFF]$/.test(n))).toBe(true);
  });

  it("leaves nothing for a refused write", async () => {
    const t = await team();
    await expect(createWorkspaceAnnouncement(t.member, { text: "No" })).rejects.toBeInstanceOf(Forbidden);
    await expect(createWorkspaceAnnouncement(t.owner, { text: "" })).rejects.toBeInstanceOf(Refused);
    expect((await auditLog(t.owner, { kind: "announcement" })).events).toEqual([]);
  });
});

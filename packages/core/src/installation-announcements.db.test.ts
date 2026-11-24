// Installation Announcements against the real database (spec 0054, ticket #1085; GLOSSARY: Announcement): who may
// write and list them, the caps and the window, the public read (three fields, public, switched on, in the window), no
// reach from a browser role, the demo's closed list, and one audit event per change. The table is one per Installation,
// so each test starts empty and the rows found before are put back.
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Forbidden, Refused } from "./actor";
import { db } from "./db";
import {
  createInstallationAnnouncement, deleteInstallationAnnouncement, installationAnnouncements, publicAnnouncements,
  setInstallationAnnouncementActive, updateInstallationAnnouncement,
} from "./installation-announcements";
import { installationEvents } from "./installation-admins";
import { installationAdmin } from "./test/db-fixtures";

let before: Record<string, unknown>[] = [];
const cleanups: (() => Promise<void>)[] = [];
const hour = 3_600_000;
const at = (ms: number) => new Date(Date.now() + ms).toISOString();

beforeAll(async () => { before = (await db().from("installation_announcements").select("*")).data ?? []; });
afterAll(async () => {
  await db().from("installation_announcements").delete().neq("text", "");
  if (before.length) await db().from("installation_announcements").insert(before);
});
beforeEach(async () => { await db().from("installation_announcements").delete().neq("text", ""); });
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });

async function admin() {
  const a = await installationAdmin();
  cleanups.push(a.cleanup);
  return a.actor;
}
/** A signed-in person who is not an Installation Admin: a member of some Workspace, or a demo visitor's person. */
async function nobody() {
  const personId = `t-${randomUUID()}`;
  await db().from("profiles").insert({ id: personId, name: "Nobody", role: "", color: "#000", email: null });
  cleanups.push(async () => { await db().from("profiles").delete().eq("id", personId); });
  return { personId };
}
const rows = async () => (await db().from("installation_announcements").select("*")).data ?? [];

describe("who may write and list", () => {
  it("refuses everyone who is not an Installation Admin, for every operation, and changes nothing", async () => {
    const a = await admin();
    const id = await createInstallationAnnouncement(a, { text: "Kept" });
    const n = await nobody();
    await expect(installationAnnouncements(n)).rejects.toBeInstanceOf(Forbidden);
    await expect(createInstallationAnnouncement(n, { text: "No" })).rejects.toBeInstanceOf(Forbidden);
    await expect(updateInstallationAnnouncement(n, id, { text: "No" })).rejects.toBeInstanceOf(Forbidden);
    await expect(setInstallationAnnouncementActive(n, id, false)).rejects.toBeInstanceOf(Forbidden);
    await expect(deleteInstallationAnnouncement(n, id)).rejects.toBeInstanceOf(Forbidden);
    await expect(createInstallationAnnouncement({ personId: "" }, { text: "No" })).rejects.toBeInstanceOf(Forbidden);
    const left = await rows();
    expect(left.map((r) => r.text)).toEqual(["Kept"]);
    expect(left[0].active).toBe(true);
  });

  it("lists every Announcement for an admin, most urgent first, with who made and changed it", async () => {
    const a = await admin();
    await createInstallationAnnouncement(a, { text: "Info" });
    await createInstallationAnnouncement(a, { text: "Warn", level: "warning", dismissible: false });
    await createInstallationAnnouncement(a, { text: "Off", active: false });
    const list = await installationAnnouncements(a);
    expect(list.map((r) => r.text)).toEqual(["Warn", "Info", "Off"]);
    expect(list[0]).toMatchObject({ level: "warning", dismissible: false, state: "running", createdByName: expect.stringContaining("Admin") });
    expect(list[2].state).toBe("off");
  });

  it("works on the stored rows by id only, and an unknown id is refused", async () => {
    const a = await admin();
    await expect(updateInstallationAnnouncement(a, randomUUID(), { text: "x" })).rejects.toBeInstanceOf(Forbidden);
    await expect(deleteInstallationAnnouncement(a, "1 or 1=1")).rejects.toBeInstanceOf(Forbidden);
    await expect(setInstallationAnnouncementActive(a, "not-an-id", false)).rejects.toBeInstanceOf(Forbidden);
  });
});

describe("what is stored", () => {
  it("makes, changes, switches off and on, and deletes", async () => {
    const a = await admin();
    const id = await createInstallationAnnouncement(a, { text: "Maintenance tonight", link: { href: "https://status.example.test/x", label: "Status" }, level: "warning", startsAt: at(hour), endsAt: at(2 * hour), public: true });
    expect((await rows())[0]).toMatchObject({ text: "Maintenance tonight", link_url: "https://status.example.test/x", link_label: "Status", level: "warning", public: true, active: true, created_by: a.personId });
    await updateInstallationAnnouncement(a, id, { text: "Maintenance tomorrow" });
    expect((await rows())[0]).toMatchObject({ text: "Maintenance tomorrow", link_url: null, public: false, level: "info" });
    await setInstallationAnnouncementActive(a, id, false);
    expect((await rows())[0].active).toBe(false);
    await setInstallationAnnouncementActive(a, id, true);
    expect((await rows())[0].active).toBe(true);
    await deleteInstallationAnnouncement(a, id);
    expect(await rows()).toEqual([]);
  });

  it("refuses bad input before it reaches the table", async () => {
    const a = await admin();
    for (const bad of [{ text: "" }, { text: "x".repeat(281) }, { text: "ok", link: { href: "javascript:alert(1)", label: "x" } }, { text: "ok", link: { href: "http://a.test", label: "x" } },
      { text: "ok", link: { href: "https://u:p@a.test/", label: "x" } }, { text: "ok", level: "error" }, { text: "ok", startsAt: at(hour), endsAt: at(-hour) }, { text: "ok", public: true, audience: "demo" }])
      await expect(createInstallationAnnouncement(a, bad), JSON.stringify(bad)).rejects.toBeInstanceOf(Refused);
    expect(await rows()).toEqual([]);
  });

  it("removes control and bidirectional characters from the text", async () => {
    const a = await admin();
    await createInstallationAnnouncement(a, { text: "Down\n at ‮10:00\u0000" });
    expect((await rows())[0].text).toBe("Down at 10:00");
  });

  it("holds the same rules in the table itself, whatever writes to it", async () => {
    const bad = (extra: Record<string, unknown>) => db().from("installation_announcements").insert({ text: "ok", ...extra });
    expect((await bad({ link_url: "http://a.test", link_label: "x" })).error).not.toBeNull();
    expect((await bad({ link_url: "https://a.test" })).error).not.toBeNull();
    expect((await bad({ text: "x".repeat(281) })).error).not.toBeNull();
    expect((await bad({ starts_at: at(hour), ends_at: at(-hour) })).error).not.toBeNull();
    expect((await bad({ public: true, audience: "demo" })).error).not.toBeNull();
    expect((await bad({ level: "error" })).error).not.toBeNull();
  });
});

describe("at most 20 on at once", () => {
  it("refuses the 21st that is on, but takes one that is off or already over", async () => {
    const a = await admin();
    const ids: string[] = [];
    for (let i = 0; i < 20; i++) ids.push(await createInstallationAnnouncement(a, { text: `On ${i}` }));
    await expect(createInstallationAnnouncement(a, { text: "One too many" })).rejects.toBeInstanceOf(Refused);
    await expect(createInstallationAnnouncement(a, { text: "Off is fine", active: false })).resolves.toBeTruthy();
    await setInstallationAnnouncementActive(a, ids[0], false);
    await expect(createInstallationAnnouncement(a, { text: "Room again" })).resolves.toBeTruthy();
    await expect(setInstallationAnnouncementActive(a, (await installationAnnouncements(a)).find((r) => r.text === "Off is fine")!.id, true)).rejects.toBeInstanceOf(Refused);
    // Changing one that is on does not count it twice.
    await expect(updateInstallationAnnouncement(a, ids[1], { text: "Changed" })).resolves.toBeUndefined();
  });

  it("does not let parallel writes pass together", async () => {
    const a = await admin();
    for (let i = 0; i < 18; i++) await createInstallationAnnouncement(a, { text: `On ${i}` });
    const results = await Promise.allSettled([1, 2, 3, 4, 5].map((i) => createInstallationAnnouncement(a, { text: `Race ${i}` })));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
    expect((await rows()).filter((r) => r.active)).toHaveLength(20);
  });

  it("does not count one whose end has passed", async () => {
    const a = await admin();
    for (let i = 0; i < 20; i++) await db().from("installation_announcements").insert({ text: `Past ${i}`, starts_at: at(-3 * hour), ends_at: at(-hour) });
    await expect(createInstallationAnnouncement(a, { text: "Fine" })).resolves.toBeTruthy();
  });
});

describe("the public read for the sign-in page", () => {
  it("returns only public, switched on, inside-the-window lines, with the text, link and level", async () => {
    const a = await admin();
    await createInstallationAnnouncement(a, { text: "Shown", public: true, level: "warning", link: { href: "https://status.example.test/", label: "Status" } });
    await createInstallationAnnouncement(a, { text: "Shown too", public: true, startsAt: at(-hour), endsAt: at(hour) });
    await createInstallationAnnouncement(a, { text: "Not public" });
    await createInstallationAnnouncement(a, { text: "Switched off", public: true, active: false });
    await createInstallationAnnouncement(a, { text: "Not yet", public: true, startsAt: at(hour) });
    await db().from("installation_announcements").insert({ text: "Over", public: true, starts_at: at(-3 * hour), ends_at: at(-hour) });
    const shown = await publicAnnouncements();
    expect(shown).toEqual([
      { text: "Shown", level: "warning", link: { href: "https://status.example.test/", label: "Status" } },
      { text: "Shown too", level: "info" },
    ]);
    // Nothing else can reach the sign-in page: not an id, a person, a time or a setting.
    for (const s of shown) expect(Object.keys(s).sort().every((k) => ["level", "link", "text"].includes(k))).toBe(true);
  });

  it("is cut at the function: the database answers with exactly four columns", async () => {
    const a = await admin();
    await createInstallationAnnouncement(a, { text: "Shown", public: true });
    const { data } = await db().rpc("public_installation_announcements");
    expect(Object.keys((data as Record<string, unknown>[])[0]).sort()).toEqual(["level", "link_label", "link_url", "text"]);
  });

  it("is not reachable from a browser role, neither the table nor the function", async () => {
    const a = await admin();
    await createInstallationAnnouncement(a, { text: "Shown", public: true });
    let key = process.env.SUPABASE_ANON_KEY;
    if (!key) {
      try { key = JSON.parse(execFileSync("supabase", ["status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })).ANON_KEY; } catch { key = undefined; }
    }
    // Without a key to ask with (no local stack to read it from), the one check that needs it is skipped; CI has the stack.
    if (!key) return;
    const anon = createClient(process.env.SUPABASE_URL!, key, { auth: { persistSession: false } });
    const read = await anon.from("installation_announcements").select("*");
    expect(read.data ?? []).toEqual([]);
    expect((await anon.from("installation_announcements").insert({ text: "Mine" })).error).not.toBeNull();
    expect((await anon.rpc("public_installation_announcements")).error).not.toBeNull();
    expect(await rows()).toHaveLength(1);
  });
});

describe("the demo", () => {
  it("has the table on its closed list, so visitors never write it", async () => {
    const closed = ((await db().from("demo_closed_tables").select("table_name")).data ?? []).map((r) => r.table_name as string);
    const open = ((await db().from("demo_open_tables").select("table_name")).data ?? []).map((r) => r.table_name as string);
    expect(closed).toContain("installation_announcements");
    expect(open).not.toContain("installation_announcements");
    expect(((await db().rpc("demo_unclassified_tables")).data ?? []) as string[]).toEqual([]);
  });
});

describe("the audit", () => {
  it("leaves one event per change, by the actor, with the text as it was then and nothing more", async () => {
    const a = await admin();
    const id = await createInstallationAnnouncement(a, { text: "First words", link: { href: "https://a.test/secret-path", label: "More" } });
    await updateInstallationAnnouncement(a, id, { text: "Second words" });
    await setInstallationAnnouncementActive(a, id, false);
    await setInstallationAnnouncementActive(a, id, true);
    await deleteInstallationAnnouncement(a, id);
    const events = (await installationEvents(a, 20)).filter((e) => e.kind.startsWith("announcement.")).reverse();
    expect(events.map((e) => [e.kind, e.subject])).toEqual([
      ["announcement.created", "First words"], ["announcement.changed", "Second words"], ["announcement.switched_off", "Second words"],
      ["announcement.switched_on", "Second words"], ["announcement.deleted", "Second words"],
    ]);
    expect(events.every((e) => e.actorName.startsWith("Admin"))).toBe(true);
  });

  it("keeps at most 120 characters of the text", async () => {
    const a = await admin();
    await createInstallationAnnouncement(a, { text: "w".repeat(280) });
    const [e] = (await installationEvents(a, 5)).filter((x) => x.kind === "announcement.created");
    expect(e.subject).toHaveLength(120);
  });

  it("leaves nothing for a refused write", async () => {
    const a = await admin();
    const n = await nobody();
    const had = (await installationEvents(a, 200)).length;
    await expect(createInstallationAnnouncement(n, { text: "No" })).rejects.toBeInstanceOf(Forbidden);
    await expect(createInstallationAnnouncement(a, { text: "" })).rejects.toBeInstanceOf(Refused);
    expect((await installationEvents(a, 200)).length).toBe(had);
  });
});

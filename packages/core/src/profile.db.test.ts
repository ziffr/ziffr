// Your profile and your Deliveries against the real database (spec 0006, tickets #94 and #95): a person changes only
// their own name and colour, never in the demo or as one of its people; stops and restarts email for themselves.
import { afterEach, describe, expect, it } from "vitest";
import { Forbidden } from "./actor";
import { db, seedingDemo } from "./db";
import { emailOptedOut, optBackIn, optOutOfEmail } from "./email-opt-out";
import { cleanName, myDeliverySettings, myProfile, PERSON_COLORS, updateMyProfile } from "./profile";
import { setPreference } from "./questions";
import { DEMO_WORKSPACE_ID } from "./team";
import { workspace } from "./test/db-fixtures";
import { setAway } from "./workflows";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws() { const w = await workspace(); cleanups.push(w.cleanup); return w; }
const nameOf = async (id: string) => (await db().from("profiles").select("name, color").eq("id", id).single()).data!;

describe("your profile", () => {
  it("renames and recolours the actor, and nobody else", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member");
    const before = await nameOf(sara);
    await updateMyProfile(w.actor(ben, "member"), { name: "  Ben   Okafor ", color: PERSON_COLORS[2] });
    expect(await myProfile(w.actor(ben, "member"))).toMatchObject({ id: ben, name: "Ben Okafor", color: PERSON_COLORS[2] });
    expect(await nameOf(sara)).toEqual(before);
    await updateMyProfile(w.actor(ben, "member"), { color: PERSON_COLORS[0] });
    expect(await nameOf(ben)).toEqual({ name: "Ben Okafor", color: PERSON_COLORS[0] });
  });
  it("shows the new name in every workspace the person belongs to", async () => {
    const a = await ws(); const b = await ws(); const ann = await a.person("guest");
    await db().from("memberships").insert({ workspace_id: b.id, user_id: ann, role: "member" });
    await updateMyProfile(a.actor(ann, "guest"), { name: "Ann Lee" });
    expect((await myProfile(b.actor(ann, "member"))).name).toBe("Ann Lee");
  });
  it("refuses empty, long and hidden-character names and unknown colours", async () => {
    const w = await ws(); const sara = await w.person("owner");
    for (const name of ["", "   ", "x".repeat(81), "Sara\u202Egnp.exe", "Sara\nAdmin", "Sa\u200Bra", "\uFEFFSara", 42, null]) await expect(updateMyProfile(w.actor(sara), { name })).rejects.toThrow(/name/);
    for (const color of ["#FFFFFF", "red", "", "#7C5A3A; drop"]) await expect(updateMyProfile(w.actor(sara), { color })).rejects.toThrow(/colour/);
    expect(cleanName("x".repeat(80))).toEqual({ ok: true, name: "x".repeat(80) });
    expect((await nameOf(sara)).name).toMatch(/^owner /);
  });
  it("refuses the demo, the demo's people anywhere, and someone not in the workspace", async () => {
    const w = await ws(); const other = await ws(); const sara = await w.person("owner"); const zoe = await other.person("owner");
    await expect(updateMyProfile({ personId: "sara", workspaceId: DEMO_WORKSPACE_ID, role: "owner" }, { name: "Mallory" })).rejects.toEqual(expect.any(Forbidden));
    // A person of the demo keeps their name wherever they act: the database refuses it (#271).
    await seedingDemo(async () => { await db().from("memberships").insert({ workspace_id: DEMO_WORKSPACE_ID, user_id: sara, role: "member" }); });
    try {
      await expect(updateMyProfile(w.actor(sara), { name: "Mallory" })).rejects.toEqual(expect.any(Forbidden));
    } finally {
      await seedingDemo(async () => { await db().from("memberships").delete().eq("workspace_id", DEMO_WORKSPACE_ID).eq("user_id", sara); });
    }
    await expect(updateMyProfile({ personId: zoe, workspaceId: w.id, role: "owner" }, { name: "Mallory" })).rejects.toEqual(expect.any(Forbidden));
    const contact = await w.contact({ email: "c@example.test" });
    await expect(updateMyProfile({ personId: contact, workspaceId: w.id, role: "member" }, { name: "Mallory" })).rejects.toEqual(expect.any(Forbidden));
    expect((await nameOf(zoe)).name).toMatch(/^owner /);
    expect((await nameOf(contact)).name).toMatch(/^Contact /);
  });
});

describe("your Deliveries", () => {
  it("stops and restarts Prompts by email from Ziffr, and tells the Metric owner once", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ann = await w.person("member");
    const m = await w.metric(sara); await w.token(m.id, ann);
    await optOutOfEmail(w.actor(ann, "member"));
    await optOutOfEmail(w.actor(ann, "member"));
    expect(await emailOptedOut(w.actor(ann, "member"))).toBe(true);
    expect(await emailOptedOut(w.actor(sara))).toBe(false);
    const { count } = await db().from("deliveries").select("id", { count: "exact", head: true }).eq("workspace_id", w.id).eq("recipient_id", sara).eq("kind", "notice");
    expect(count).toBe(1);
    expect((await myDeliverySettings(w.actor(ann, "member"))).optedOut).toBe(true);
    await optBackIn(w.actor(ann, "member"));
    expect(await emailOptedOut(w.actor(ann, "member"))).toBe(false);
  });
  it("tells the owner once a day at most, however often email is switched off and on", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ann = await w.person("member");
    const m = await w.metric(sara); await w.token(m.id, ann);
    const me = w.actor(ann, "member");
    for (let i = 0; i < 3; i++) { await optOutOfEmail(me); await optBackIn(me); }
    await optOutOfEmail(me);
    // Flips sent at once claim the notice once too.
    await Promise.all([optBackIn(me), optOutOfEmail(me), optBackIn(me), optOutOfEmail(me)]);
    await optOutOfEmail(me);
    const { count } = await db().from("deliveries").select("id", { count: "exact", head: true }).eq("workspace_id", w.id).eq("recipient_id", sara).eq("kind", "notice");
    expect(count).toBe(1);
    expect(await emailOptedOut(me)).toBe(true);
  });
  it("never stops email in the demo", async () => {
    await expect(optOutOfEmail({ personId: "ben", workspaceId: DEMO_WORKSPACE_ID, role: "member" })).rejects.toEqual(expect.any(Forbidden));
  });
  it("shows a person their own preferences, the team default and their Away dates, and nobody else's", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member");
    await setPreference(w.actor(sara), null, "question", "slack");
    await setPreference(w.actor(sara), sara, "task", "whatsapp");
    await setPreference(w.actor(ben, "member"), ben, "reminder", "email");
    await setAway(w.actor(ben, "member"), ben, "2026-12-01", "2026-12-05");
    await setAway(w.actor(sara), sara, "2026-12-10", "2026-12-12");
    expect(await myDeliverySettings(w.actor(ben, "member"))).toEqual({
      mine: [{ kind: "reminder", connector: "email" }],
      team: [{ kind: "question", connector: "slack" }],
      optedOut: false,
      away: { starts: "2026-12-01", ends: "2026-12-05" },
    });
    await db().from("away").delete().in("user_id", [sara, ben]);
  });
});

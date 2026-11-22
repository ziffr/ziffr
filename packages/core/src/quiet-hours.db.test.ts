// Quiet Hours against the real database and the local Mailpit (ticket #519): who may set them, what a Prompt, reminder
// or Alert does inside them (waits, is never dropped, goes out when they end), what never waits, and time zones.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { Forbidden } from "./actor";
import { db } from "./db";
import { DemoReadOnly } from "./demo";
import { deliverAlert, deliverNotice, deliverPrompt } from "./deliveries";
import { HELD_KINDS, holdFor, quietHours, setMyQuietHours, setWorkspaceQuietHours } from "./quiet-hours";
import { sendWaiting } from "./mail";
import { DEMO_WORKSPACE_ID } from "./team";
import { workspace } from "./test/db-fixtures";

const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:55424";
const SETTINGS = { ZIFFR_SMTP_URL: process.env.TEST_SMTP_URL ?? "smtp://127.0.0.1:55425", ZIFFR_MAIL_FROM: "Ziffr <ziffr@example.test>", ZIFFR_SITE_URL: "https://ziffr.example.test" };
const saved: Record<string, string | undefined> = {};
beforeAll(() => { for (const [k, v] of Object.entries(SETTINGS)) { saved[k] = process.env[k]; process.env[k] = v; } });
afterAll(() => { for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v; });
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws() { const w = await workspace(); cleanups.push(w.cleanup); return w; }
const address = (who: string) => `${who}-${Math.random().toString(36).slice(2, 10)}@example.test`;
const inbox = async (to: string) => ((await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`)).json()) as { messages: unknown[] }).messages.length;
const lastDelivery = async (wsId: string, recipient: string) => (await db().from("deliveries").select("mail_state, not_before, kind").eq("workspace_id", wsId).eq("recipient_id", recipient).order("id", { ascending: false }).limit(1).single()).data!;
/** A rule that is quiet for the current hour and the one before and after, in UTC, whenever this test runs. */
const aroundNow = () => { const h = new Date().getUTCHours(); return { fromHour: (h + 23) % 24, toHour: (h + 2) % 24, days: [], timeZone: null }; };

describe("setting quiet hours", () => {
  it("lets a person set, read and clear their own, and sees the Workspace's default beside it", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member");
    expect(await quietHours(w.actor(ben, "member"))).toEqual({ mine: null, workspace: null, workspaceTimeZone: "UTC" });
    await setMyQuietHours(w.actor(ben, "member"), { fromHour: 19, toHour: 7, days: [6, 0], timeZone: "Asia/Tokyo" });
    await setWorkspaceQuietHours(w.actor(sara), { fromHour: 22, toHour: 6, days: [], timeZone: "Asia/Tokyo" });
    // Ben's own, and the default; the Workspace's is read in its own zone, whatever zone was sent with it.
    expect(await quietHours(w.actor(ben, "member"))).toEqual({ mine: { fromHour: 19, toHour: 7, days: [0, 6], timeZone: "Asia/Tokyo" }, workspace: { fromHour: 22, toHour: 6, days: [], timeZone: null }, workspaceTimeZone: "UTC" });
    // Sara sees her own (none), not Ben's.
    expect((await quietHours(w.actor(sara))).mine).toBeNull();
    await setMyQuietHours(w.actor(ben, "member"), { fromHour: 20, toHour: 8, days: [] });
    expect((await quietHours(w.actor(ben, "member"))).mine).toEqual({ fromHour: 20, toHour: 8, days: [], timeZone: null });
    await setMyQuietHours(w.actor(ben, "member"), null);
    expect((await quietHours(w.actor(ben, "member"))).mine).toBeNull();
    await setWorkspaceQuietHours(w.actor(sara), null);
    expect((await quietHours(w.actor(ben, "member"))).workspace).toBeNull();
    const { count } = await db().from("quiet_hours").select("*", { count: "exact", head: true }).eq("workspace_id", w.id);
    expect(count).toBe(0);
  });

  it("lets only Owners and Admins set the Workspace's default, and records it in the Audit Log", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ann = await w.person("admin"); const ben = await w.person("member"); const gus = await w.person("guest");
    await setWorkspaceQuietHours(w.actor(ann, "admin"), { fromHour: 19, toHour: 7, days: [0, 6] });
    for (const [p, role] of [[ben, "member"], [gus, "guest"]] as const) await expect(setWorkspaceQuietHours(w.actor(p, role), { fromHour: 1, toHour: 2, days: [] })).rejects.toEqual(expect.any(Forbidden));
    await expect(setWorkspaceQuietHours({ ...w.actor(sara), key: { id: "1", scopes: [] } } as never, null)).rejects.toEqual(expect.any(Forbidden));
    await expect(setMyQuietHours({ ...w.actor(sara), key: { id: "1", scopes: [] } } as never, null)).rejects.toEqual(expect.any(Forbidden));
    await expect(quietHours({ ...w.actor(sara), key: { id: "1", scopes: [] } } as never)).rejects.toEqual(expect.any(Forbidden));
    await setWorkspaceQuietHours(w.actor(sara), { fromHour: 8, toHour: 8, days: [] }); // never quiet: no default at all
    const { data } = await db().from("audit_events").select("kind, actor_id").eq("workspace_id", w.id).eq("kind", "workspace.quiet_hours_changed").order("id");
    expect(data!.map((e) => e.actor_id)).toEqual([ann, sara]);
    expect((await quietHours(w.actor(sara))).workspace).toBeNull();
  });

  it("refuses rules that are wrong and changes nothing", async () => {
    const w = await ws(); const sara = await w.person("owner");
    await setMyQuietHours(w.actor(sara), { fromHour: 19, toHour: 7, days: [] });
    for (const bad of [{ fromHour: 24, toHour: 0, days: [] }, { fromHour: 1, toHour: 2, days: [0, 1, 2, 3, 4, 5, 6] }, { fromHour: 1, toHour: 2, days: [9] }, { fromHour: 1, toHour: 2, days: [], timeZone: "Mars/Olympus" }, { fromHour: 1, toHour: 2, days: [], timeZone: "UTC'; drop" }, "x", undefined]) {
      await expect(setMyQuietHours(w.actor(sara), bad)).rejects.toThrow();
      await expect(setWorkspaceQuietHours(w.actor(sara), bad)).rejects.toThrow();
    }
    expect((await quietHours(w.actor(sara))).mine).toEqual({ fromHour: 19, toHour: 7, days: [], timeZone: null });
    expect((await quietHours(w.actor(sara))).workspace).toBeNull();
  });

  it("is never changed in the demo", async () => {
    const demo = { personId: "sara", workspaceId: DEMO_WORKSPACE_ID, role: "owner" as const };
    await expect(setMyQuietHours(demo, { fromHour: 1, toHour: 2, days: [] })).rejects.toEqual(expect.any(DemoReadOnly));
    await expect(setWorkspaceQuietHours(demo, null)).rejects.toEqual(expect.any(DemoReadOnly));
  });
});

describe("when a message waits", () => {
  it("holds only Prompts, reminders and Alerts, until the person's quiet hours end in their time zone", async () => {
    const w = await ws(); const ben = await w.person("member");
    const now = new Date("2026-11-20T11:00:00Z"); // 20:00 on Friday in Tokyo
    await setMyQuietHours(w.actor(ben, "member"), { fromHour: 19, toHour: 7, days: [0, 6], timeZone: "Asia/Tokyo" });
    expect(HELD_KINDS).toEqual(["prompt", "reminder", "alert", "checklist"]);
    for (const kind of HELD_KINDS) expect((await holdFor(w.id, ben, kind, now))?.toISOString()).toBe("2026-11-22T22:00:00.000Z"); // Monday 07:00 in Tokyo
    for (const kind of ["question", "task", "notice", "reply", "digest"]) expect(await holdFor(w.id, ben, kind, now)).toBeNull();
    // Friday noon UTC is 21:00 in Tokyo too, but 11:00 in Tokyo is not quiet.
    expect(await holdFor(w.id, ben, "prompt", new Date("2026-11-20T02:00:00Z"))).toBeNull();
  });

  it("follows the Workspace's default in its time zone until the person sets their own, even an empty one", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member");
    await setWorkspaceClock(w, sara, "Europe/Berlin");
    await setWorkspaceQuietHours(w.actor(sara), { fromHour: 19, toHour: 7, days: [] });
    const now = new Date("2026-11-20T21:00:00Z"); // 22:00 in Berlin
    expect((await holdFor(w.id, ben, "reminder", now))?.toISOString()).toBe("2026-11-21T06:00:00.000Z");
    await setMyQuietHours(w.actor(ben, "member"), { fromHour: 0, toHour: 0, days: [] });
    expect(await holdFor(w.id, ben, "reminder", now)).toBeNull();
    await setMyQuietHours(w.actor(ben, "member"), null);
    expect(await holdFor(w.id, ben, "reminder", now)).not.toBeNull();
  });

  it("is kept to the Workspace: another Workspace's rules never apply", async () => {
    const a = await ws(); const b = await ws(); const sara = await a.person("owner"); const ben = await b.person("member");
    await setWorkspaceQuietHours(a.actor(sara), { fromHour: 0, toHour: 23, days: [] });
    expect(await holdFor(b.id, ben, "prompt", new Date("2026-11-20T12:00:00Z"))).toBeNull();
  });
});

/** Sets a Workspace's time zone straight in the database. */
async function setWorkspaceClock(w: Awaited<ReturnType<typeof ws>>, _owner: string, timeZone: string) { await db().from("workspaces").update({ time_zone: timeZone }).eq("id", w.id); }

describe("what a held message does", () => {
  it("queues a Prompt without sending it, and sends it once the quiet hours are over", async () => {
    const w = await ws(); const sara = await w.person("owner", { email: address("sara") }); const ann = await w.person("member", { email: address("ann") });
    const m = await w.metric(sara, { name: "Visits" }); await w.token(m.id, ann);
    const to = (await db().from("profiles").select("email").eq("id", ann).single()).data!.email as string;
    await setMyQuietHours(w.actor(ann, "member"), aroundNow());
    const outcome = await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara });
    expect(outcome).toMatchObject({ connector: "email", state: "queued" });
    const held = await lastDelivery(w.id, ann);
    expect(held.mail_state).toBe("queued");
    expect(new Date(held.not_before!).getTime()).toBeGreaterThan(Date.now());
    expect(await inbox(to)).toBe(0);
    // The job leaves it alone while it waits, and sends it when its time has come: nothing is dropped.
    await sendWaiting();
    expect(await inbox(to)).toBe(0);
    await db().from("deliveries").update({ not_before: new Date(Date.now() - 1000).toISOString() }).eq("workspace_id", w.id).eq("recipient_id", ann);
    await sendWaiting();
    expect((await lastDelivery(w.id, ann)).mail_state).toBe("sent");
    expect(await inbox(to)).toBe(1);
  });

  it("sends at once outside quiet hours, and holds an Alert but never a notice", async () => {
    const w = await ws(); const sara = await w.person("owner", { email: address("sara") }); const ann = await w.person("member", { email: address("ann") });
    const m = await w.metric(sara, { name: "Visits" }); await w.token(m.id, ann);
    await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara });
    expect((await lastDelivery(w.id, ann)).mail_state).toBe("sent");
    await setMyQuietHours(w.actor(ann, "member"), aroundNow());
    await deliverNotice(w.id, { recipientId: ann, senderId: sara, subject: "Hello", text: "A notice", link: "/" });
    expect(await lastDelivery(w.id, ann)).toMatchObject({ kind: "notice", mail_state: "sent", not_before: null });
    await deliverAlert(w.id, { recipientId: ann, subject: "Visits fell", text: "Below target", link: "/", metricId: m.id, alertId: null });
    expect(await lastDelivery(w.id, ann)).toMatchObject({ kind: "alert", mail_state: "queued" });
    expect((await lastDelivery(w.id, ann)).not_before).not.toBeNull();
  });
});

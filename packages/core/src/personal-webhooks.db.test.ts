// Personal Webhooks against the real database (spec 0037, ticket #641; GLOSSARY: Personal Webhook): the Workspace's
// switch (off by default, pausing), who may add one (Owners, Admins and Members; never Guests or keys), the person's own
// operations, the limits also when several are made at once, that nobody reaches another's, the Admins' list and removal
// with its notice, the end of a person's Webhooks when they leave, become a Guest or lose their account, that Workspace
// Webhooks neither list nor count them, the sealed address and secret, and the Audit Log.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Forbidden, type Actor } from "./actor";
import { db } from "./db";
import { DemoReadOnly } from "./demo";
import { removeMember } from "./handover";
import { setRole } from "./invitations";
import { mailHostResolver } from "./mail-hosts";
import { recordPersonalWebhookEnds, createPersonalWebhook, deletePersonalWebhook, listOwnPersonalWebhooks, listPersonalWebhooksForAdmin, ownPersonalWebhookLog, personalWebhookLogForAdmin, removePersonalWebhook, replacePersonalWebhookSecret, sendTestPersonalWebhook, setPersonalWebhookEnabled, setPersonalWebhooksAllowed, updatePersonalWebhook } from "./personal-webhooks";
import { personalWebhooksAllowed } from "./personal-webhook-state";
import { DEMO_WORKSPACE_ID } from "./team";
import { workspace } from "./test/db-fixtures";
import { PERSONAL_WEBHOOKS_PER_PERSON, WEBHOOKS_PER_WORKSPACE } from "./webhook-limits";
import { createWebhook, listWebhooks } from "./webhooks";
import { isSealed } from "./workspace-keys";

vi.mock("./webhook-send", () => ({ sendWebhookNow: vi.fn(async () => {}) }));
vi.setConfig({ testTimeout: 120_000, hookTimeout: 60_000 });
const saved = process.env.ZIFFR_SECRETS_KEY;
const realLookup = mailHostResolver.lookup;
const cleanups: (() => Promise<void>)[] = [];
beforeEach(() => {
  process.env.ZIFFR_SECRETS_KEY = Buffer.alloc(32, 81).toString("base64");
  mailHostResolver.lookup = async (host) => (host.endsWith("inside.example.test") ? [{ address: "10.0.0.5", family: 4 }] : [{ address: "93.184.216.34", family: 4 }]);
});
afterEach(async () => {
  mailHostResolver.lookup = realLookup;
  for (const c of cleanups.splice(0)) await c().catch(() => {});
  if (saved === undefined) delete process.env.ZIFFR_SECRETS_KEY; else process.env.ZIFFR_SECRETS_KEY = saved;
});
async function ws() { const w = await workspace(); cleanups.push(w.cleanup); return w; }
/** A Workspace with an Owner, an Admin and a Member, the switch on. */
async function allowed() {
  const w = await ws();
  const owner = await w.person("owner"); const admin = await w.person("admin"); const ana = await w.person("member"); const bo = await w.person("member");
  await setPersonalWebhooksAllowed(w.actor(owner), true);
  return { w, owner, admin, ana, bo, A: w.actor(ana, "member"), B: w.actor(bo, "member"), O: w.actor(owner), D: w.actor(admin, "admin") };
}
const URL1 = "https://n8n.example.test/webhook/abcdef123456-secret-path?token=s3cret";
const refusal = async (p: Promise<unknown>) => p.then(() => null, (e: Error) => e);
const kinds = async (workspaceId: string) => ((await db().from("audit_events").select("kind").eq("workspace_id", workspaceId).like("kind", "%webhook%").order("id")).data ?? []).map((r) => r.kind as string);

describe("the Workspace's switch", () => {
  it("is off by default: nobody adds one, and the page names none", async () => {
    const w = await ws(); const owner = await w.person("owner"); const ana = await w.person("member");
    expect(await personalWebhooksAllowed(w.id)).toBe(false);
    expect(await refusal(createPersonalWebhook(w.actor(ana, "member"), { name: "Mine", url: URL1 }))).toBeInstanceOf(Forbidden);
    expect(await listOwnPersonalWebhooks(w.actor(ana, "member"))).toEqual({ allowed: false, webhooks: [] });
    // The Owner's own ones too: the switch is the Workspace's, not a role's.
    expect(await refusal(createPersonalWebhook(w.actor(owner), { name: "Mine", url: URL1 }))).toBeInstanceOf(Forbidden);
  });

  it("is switched by Owners and Admins only, and both ways are in the Audit Log", async () => {
    const w = await ws(); const owner = await w.person("owner"); const admin = await w.person("admin"); const ana = await w.person("member"); const guest = await w.person("guest");
    expect(await refusal(setPersonalWebhooksAllowed(w.actor(ana, "member"), true))).toBeInstanceOf(Forbidden);
    expect(await refusal(setPersonalWebhooksAllowed(w.actor(guest, "guest"), true))).toBeInstanceOf(Forbidden);
    await setPersonalWebhooksAllowed(w.actor(admin, "admin"), true);
    expect(await personalWebhooksAllowed(w.id)).toBe(true);
    await setPersonalWebhooksAllowed(w.actor(admin, "admin"), true);
    await setPersonalWebhooksAllowed(w.actor(owner), false);
    expect(await personalWebhooksAllowed(w.id)).toBe(false);
    expect(await kinds(w.id)).toEqual(["workspace.personal_webhooks_allowed", "workspace.personal_webhooks_refused"]);
  });

  it("pauses every Personal Webhook when off, drops what waits, and resumes them when on again", async () => {
    const { w, ana, A, O } = await allowed();
    const { id } = await createPersonalWebhook(A, { name: "Mine", url: URL1, events: ["action.created"] });
    const { data: send } = await db().from("webhook_sends").insert({ workspace_id: w.id, webhook_id: id, type: "ping", source_type: "app" }).select("id").single();
    await setPersonalWebhooksAllowed(O, false);
    expect((await db().from("webhook_sends").select("state").eq("id", send!.id).single()).data?.state).toBe("dropped");
    // Paused, not gone: it comes back with the switch, and while off it is neither listed nor tested nor switched on.
    expect((await listOwnPersonalWebhooks(A)).webhooks).toEqual([]);
    expect(await refusal(sendTestPersonalWebhook(A, id))).toBeInstanceOf(Forbidden);
    expect(await refusal(createPersonalWebhook(A, { name: "Another", url: URL1 }))).toBeInstanceOf(Forbidden);
    await setPersonalWebhooksAllowed(O, true);
    expect((await listOwnPersonalWebhooks(A)).webhooks.map((x) => x.id)).toEqual([id]);
    expect(ana).toBeTruthy();
  });
});

describe("a person's own Webhooks", () => {
  it("adds, lists, changes, replaces the secret, tests, switches off and deletes, as an Owner, an Admin and a Member", async () => {
    const { O, D, A } = await allowed();
    for (const a of [O, D, A]) {
      const made = await createPersonalWebhook(a, { name: "  My   notes ", url: URL1, events: ["action.created", "action.done", "action.done"] });
      expect(made.secret).toMatch(/^whsec_[A-Za-z0-9_-]{43}$/);
      const { allowed: on, webhooks } = await listOwnPersonalWebhooks(a);
      expect(on).toBe(true);
      expect(webhooks).toHaveLength(1);
      expect(webhooks[0]).toMatchObject({ id: made.id, name: "My notes", events: ["action.created", "action.done"], enabled: true, paused: false, replacingSecret: false });
      expect(webhooks[0].address).toBe("https://n8n.example.test/webhook/……");
      expect(JSON.stringify(webhooks)).not.toContain("s3cret");
      expect(JSON.stringify(webhooks)).not.toContain(made.secret);
      await updatePersonalWebhook(a, made.id, { name: "Renamed", events: ["value.recorded"], url: "https://other.example.test/hook" });
      expect((await listOwnPersonalWebhooks(a)).webhooks[0]).toMatchObject({ name: "Renamed", events: ["value.recorded"], address: "https://other.example.test/hook" });
      const second = await replacePersonalWebhookSecret(a, made.id);
      expect(second.secret).not.toBe(made.secret);
      expect((await listOwnPersonalWebhooks(a)).webhooks[0].replacingSecret).toBe(true);
      await sendTestPersonalWebhook(a, made.id);
      expect((await ownPersonalWebhookLog(a, made.id)).map((e) => e.type)).toEqual(["ping"]);
      await setPersonalWebhookEnabled(a, made.id, false);
      expect((await listOwnPersonalWebhooks(a)).webhooks[0]).toMatchObject({ enabled: false, disabledReason: "owner" });
      expect(await refusal(sendTestPersonalWebhook(a, made.id))).toBeInstanceOf(Forbidden);
      await setPersonalWebhookEnabled(a, made.id, true);
      expect((await listOwnPersonalWebhooks(a)).webhooks[0]).toMatchObject({ enabled: true, disabledReason: null });
      await deletePersonalWebhook(a, made.id);
      expect((await listOwnPersonalWebhooks(a)).webhooks).toEqual([]);
    }
  });

  it("seals the address and the secrets, as a Workspace Webhook's", async () => {
    const { A } = await allowed();
    const { id } = await createPersonalWebhook(A, { name: "Sealed", url: URL1 });
    await replacePersonalWebhookSecret(A, id);
    const { data } = await db().from("webhooks").select("url, secret, secret_previous, owner_id").eq("id", id).single();
    for (const v of [data!.url, data!.secret, data!.secret_previous]) expect(isSealed(v as string)).toBe(true);
    expect(JSON.stringify(data)).not.toContain("example.test");
    expect(data!.owner_id).toBe(A.personId);
  });

  it("refuses an address inside the server's network, an http one and a bad name", async () => {
    const { A } = await allowed();
    expect((await refusal(createPersonalWebhook(A, { name: "x", url: "https://db.inside.example.test/hook" })))?.message).toMatch(/inside this server/);
    expect(await refusal(createPersonalWebhook(A, { name: "x", url: "http://n8n.example.test/hook" }))).toBeTruthy();
    expect(await refusal(createPersonalWebhook(A, { name: "x", url: "https://127.0.0.1/hook" }))).toBeTruthy();
    expect(await refusal(createPersonalWebhook(A, { name: " ", url: URL1 }))).toBeTruthy();
    expect(await refusal(createPersonalWebhook(A, { name: "x", url: URL1, events: ["nope"] }))).toBeTruthy();
    expect((await listOwnPersonalWebhooks(A)).webhooks).toEqual([]);
  });

  it("is for Owners, Admins and Members: not a Guest, not a key, not someone who is no longer in the Workspace, not the demo", async () => {
    const { w, ana, A } = await allowed();
    const guest = await w.person("guest");
    expect(await refusal(createPersonalWebhook(w.actor(guest, "guest"), { name: "x", url: URL1 }))).toBeInstanceOf(Forbidden);
    // A role the Actor claims is not enough: the database says what the person is now.
    expect(await refusal(createPersonalWebhook({ ...w.actor(guest, "member") }, { name: "x", url: URL1 }))).toBeInstanceOf(Forbidden);
    const keyed = { ...A, key: { id: "k", scopes: ["*"] } } as unknown as Actor;
    expect(await refusal(createPersonalWebhook(keyed, { name: "x", url: URL1 }))).toBeInstanceOf(Forbidden);
    expect(await refusal(listOwnPersonalWebhooks(keyed))).toBeInstanceOf(Forbidden);
    // A Contact has no membership at all.
    const contact = await w.contact({ email: "c@example.test" });
    expect(await refusal(createPersonalWebhook(w.actor(contact, "member"), { name: "x", url: URL1 }))).toBeInstanceOf(Forbidden);
    expect(await refusal(createPersonalWebhook({ personId: ana, workspaceId: DEMO_WORKSPACE_ID, role: "member" }, { name: "x", url: URL1 }))).toBeInstanceOf(DemoReadOnly);
  });

  it("is possible in a Trial Workspace within its limit of two Webhooks of both kinds together, and not where the operator switched trial Webhooks off", async () => {
    const { w, A, O } = await allowed();
    await w.trial("2099-01-01");
    await createPersonalWebhook(A, { name: "one", url: URL1 });
    await createWebhook(O, { name: "two", url: URL1 });
    expect((await refusal(createPersonalWebhook(A, { name: "three", url: URL1 })))?.message).toMatch(/trial already has 2/);
    expect((await refusal(createWebhook(O, { name: "three", url: URL1 })))?.message).toMatch(/already has 2/);
    process.env.ZIFFR_TRIAL_WEBHOOKS = "false";
    try {
      expect(await refusal(createPersonalWebhook(A, { name: "four", url: URL1 }))).toBeInstanceOf(Forbidden);
      expect(await refusal(sendTestPersonalWebhook(A, (await listOwnPersonalWebhooks(A)).webhooks[0].id))).toBeInstanceOf(Forbidden);
    } finally { delete process.env.ZIFFR_TRIAL_WEBHOOKS; }
  });

  it("does not let the operator's private hosts reach a trial, but does for an ordinary Workspace", async () => {
    const { w, A } = await allowed();
    const saved = process.env.ZIFFR_WEBHOOK_PRIVATE_HOSTS;
    process.env.ZIFFR_WEBHOOK_PRIVATE_HOSTS = "db.inside.example.test";
    try {
      await createPersonalWebhook(A, { name: "inside", url: "https://db.inside.example.test/hook" });
      await w.trial("2099-01-01");
      expect((await refusal(updatePersonalWebhook(A, (await listOwnPersonalWebhooks(A)).webhooks[0].id, { url: "https://db2.inside.example.test/hook" })))?.message).toMatch(/inside/);
    } finally { if (saved === undefined) delete process.env.ZIFFR_WEBHOOK_PRIVATE_HOSTS; else process.env.ZIFFR_WEBHOOK_PRIVATE_HOSTS = saved; }
  });
});

describe("limits", () => {
  it("allows three per person, also when several are made at once, and each person has their own three", async () => {
    const { A, B } = await allowed();
    const made = await Promise.all(Array.from({ length: 6 }, (_, i) => refusal(createPersonalWebhook(A, { name: `W${i}`, url: URL1 }))));
    expect(made.filter((e) => e === null)).toHaveLength(PERSONAL_WEBHOOKS_PER_PERSON);
    expect((await listOwnPersonalWebhooks(A)).webhooks).toHaveLength(3);
    expect((await refusal(createPersonalWebhook(A, { name: "4th", url: URL1 })))?.message).toMatch(/at most|the most/);
    await createPersonalWebhook(B, { name: "Bo's", url: URL1 });
    expect((await listOwnPersonalWebhooks(B)).webhooks).toHaveLength(1);
  });

  it("keeps the Workspace's five for Workspace Webhooks: they neither count Personal ones nor are counted by them", async () => {
    const { A, B, O } = await allowed();
    for (let i = 0; i < 3; i++) await createPersonalWebhook(A, { name: `A${i}`, url: URL1 });
    for (let i = 0; i < 3; i++) await createPersonalWebhook(B, { name: `B${i}`, url: URL1 });
    for (let i = 0; i < WEBHOOKS_PER_WORKSPACE; i++) await createWebhook(O, { name: `W${i}`, url: URL1 });
    expect((await refusal(createWebhook(O, { name: "one more", url: URL1 })))?.message).toMatch(/already has/);
    expect((await listWebhooks(O)).map((x) => x.name).sort()).toEqual(["W0", "W1", "W2", "W3", "W4"]);
  });

  it("takes a send slot from the person's day and the Workspace's together, or neither", async () => {
    const { w, ana, bo } = await allowed();
    const take = async (person: string, personCap: number, wsCap: number) => (await db().rpc("take_personal_webhook_send_slot", { p_workspace: w.id, p_person: person, p_person_cap: personCap, p_workspace_cap: wsCap })).data;
    expect(await take(ana, 2, 100)).toBe(true);
    expect(await take(ana, 2, 100)).toBe(true);
    expect(await take(ana, 2, 100)).toBe(false);
    // Another person is not held by Ana's day, but the Workspace's count includes hers: 2 of 3 are gone.
    expect(await take(bo, 2, 3)).toBe(true);
    expect(await take(bo, 2, 3)).toBe(false);
    expect((await db().from("webhook_send_days").select("n").eq("workspace_id", w.id).single()).data?.n).toBe(3);
    expect((await db().from("webhook_person_send_days").select("n").eq("workspace_id", w.id).eq("person_id", bo).single()).data?.n).toBe(1);
  });
});

describe("nobody reaches another's", () => {
  it("answers a Webhook of someone else, of a Workspace Webhook and of another Workspace like one that is not there", async () => {
    const { w, A, B, O } = await allowed();
    const mine = await createPersonalWebhook(A, { name: "Ana's", url: URL1 });
    const workspaceOne = await createWebhook(O, { name: "Team", url: URL1 });
    const other = await allowed();
    const theirs = await createPersonalWebhook(other.A, { name: "Other", url: URL1 });
    const ops = [
      (a: Actor, id: string) => updatePersonalWebhook(a, id, { name: "Taken" }), (a: Actor, id: string) => replacePersonalWebhookSecret(a, id),
      (a: Actor, id: string) => setPersonalWebhookEnabled(a, id, false), (a: Actor, id: string) => deletePersonalWebhook(a, id),
      (a: Actor, id: string) => sendTestPersonalWebhook(a, id), (a: Actor, id: string) => ownPersonalWebhookLog(a, id),
    ];
    for (const op of ops) {
      for (const [a, id] of [[B, mine.id], [A, workspaceOne.id], [A, theirs.id], [O, mine.id], [A, "not-an-id"]] as [Actor, string][]) {
        const e = await refusal(op(a, id));
        expect(e).toBeInstanceOf(Forbidden);
        expect(e?.message).toBe("That Webhook was not found.");
      }
    }
    expect((await listOwnPersonalWebhooks(A)).webhooks.map((x) => x.name)).toEqual(["Ana's"]);
    expect((await listOwnPersonalWebhooks(B)).webhooks).toEqual([]);
    expect(w.id).not.toBe(other.w.id);
  });

  it("keeps the Workspace's own list and operations away from Personal Webhooks, and the other way round", async () => {
    const { A, O } = await allowed();
    const mine = await createPersonalWebhook(A, { name: "Ana's", url: URL1 });
    expect(await listWebhooks(O)).toEqual([]);
    const { updateWebhook, deleteWebhook, setWebhookEnabled, replaceWebhookSecret } = await import("./webhooks");
    for (const e of [await refusal(updateWebhook(O, mine.id, { name: "x" })), await refusal(deleteWebhook(O, mine.id)), await refusal(setWebhookEnabled(O, mine.id, false)), await refusal(replaceWebhookSecret(O, mine.id))]) expect(e).toBeInstanceOf(Forbidden);
    expect(await refusal(removePersonalWebhook(O, (await createWebhook(O, { name: "Team", url: URL1 })).id))).toBeInstanceOf(Forbidden);
    expect((await listOwnPersonalWebhooks(A)).webhooks).toHaveLength(1);
  });

  it("is not heard by the Workspace's events or the inbound endpoint", async () => {
    const { w, A } = await allowed();
    const { id } = await createPersonalWebhook(A, { name: "Ana's", url: URL1, events: ["action.created", "alert.fired"] });
    const { queueWebhookEvent, queueAlertFired } = await import("./webhook-events");
    expect(await queueWebhookEvent(w.id, "action.created", { type: "app" }, { actionId: 1, metricId: 1 })).toBe(0);
    expect(await queueAlertFired(w.id, [id], { workflowId: 1, stepId: "s", metricId: 1, period: "2026-01-01" })).toBe(0);
    const { authenticateWebhookRequest } = await import("./webhook-inbound");
    expect(await authenticateWebhookRequest(id, { timestamp: "1", signature: "sha256=x", body: "{}" })).toMatchObject({ ok: false });
  });
});

describe("the Admins' list and removal", () => {
  it("asks the database for the Admin's role: an Admin demoted to Member, with the same Actor object, is refused", async () => {
    const { w, admin, A, D } = await allowed();
    const { id } = await createPersonalWebhook(A, { name: "Ana's", url: URL1 });
    expect(await listPersonalWebhooksForAdmin(D)).toHaveLength(1);
    await w.setRole(admin, "member");
    expect(await refusal(listPersonalWebhooksForAdmin(D))).toBeInstanceOf(Forbidden);
    expect(await refusal(removePersonalWebhook(D, id))).toBeInstanceOf(Forbidden);
    expect(await refusal(personalWebhookLogForAdmin(D, id))).toBeInstanceOf(Forbidden);
    expect((await listOwnPersonalWebhooks(A)).webhooks).toHaveLength(1);
  });

  it("lists every Personal Webhook with whose it is, masked, and nothing that was sent", async () => {
    const { w, ana, bo, A, B, D, O } = await allowed();
    const one = await createPersonalWebhook(A, { name: "Ana's", url: URL1, events: ["action.done"] });
    await createPersonalWebhook(B, { name: "Bo's", url: "https://hooks.example.test/x/yyyyyyyyyyy" });
    const { data: ping } = await db().from("webhook_sends").insert({ workspace_id: w.id, webhook_id: one.id, type: "ping", source_type: "app", state: "delivered", status_code: 200, last_attempt_at: new Date().toISOString(), action_id: null }).select("id").single();
    for (const a of [D, O]) {
      const list = await listPersonalWebhooksForAdmin(a);
      expect(list.map((x) => [x.ownerId, x.name]).sort()).toEqual([[ana, "Ana's"], [bo, "Bo's"]].sort());
      expect(list.find((x) => x.ownerId === ana)).toMatchObject({ ownerName: expect.stringContaining("member"), events: ["action.done"], enabled: true, address: "https://n8n.example.test/webhook/……" });
      expect(list.find((x) => x.ownerId === ana)!.lastSendAt).toBeTruthy();
      expect(list.find((x) => x.ownerId === bo)!.lastSendAt).toBeNull();
      expect(JSON.stringify(list)).not.toMatch(/s3cret|whsec_|secret-path/);
    }
    expect((await personalWebhookLogForAdmin(D, one.id)).map((e) => [e.id, e.state, e.about])).toEqual([[ping!.id, "delivered", null]]);
    expect(await refusal(listPersonalWebhooksForAdmin(A))).toBeInstanceOf(Forbidden);
    expect(await refusal(personalWebhookLogForAdmin(A, one.id))).toBeInstanceOf(Forbidden);
  });

  it("removes one, tells its person who did it, and records it", async () => {
    const { w, ana, admin, A, D } = await allowed();
    const { id } = await createPersonalWebhook(A, { name: "Ana's", url: URL1 });
    expect(await refusal(removePersonalWebhook(A, id))).toBeInstanceOf(Forbidden);
    await removePersonalWebhook(D, id);
    expect((await listOwnPersonalWebhooks(A)).webhooks).toEqual([]);
    expect(await refusal(removePersonalWebhook(D, id))).toBeInstanceOf(Forbidden);
    const { data: notes } = await db().from("deliveries").select("recipient_id, kind").eq("workspace_id", w.id).eq("kind", "notice");
    expect((notes ?? []).map((n) => n.recipient_id)).toEqual([ana]);
    const { openRows } = await import("./sealed-columns");
    const { data: ev } = await db().from("audit_events").select("id, kind, actor_id, details, object_name").eq("workspace_id", w.id).eq("kind", "webhook.personal_removed");
    const [e] = await openRows("audit_events", w.id, (ev ?? []) as Record<string, unknown>[]);
    expect(e).toMatchObject({ actor_id: admin, details: { owner_id: ana, address: "*.example.test" } });
  });
});

describe("the end of a person's Webhooks", () => {
  const made = async (w: Awaited<ReturnType<typeof allowed>>, a: Actor) => (await createPersonalWebhook(a, { name: "Mine", url: URL1 })).id;
  const rows = async (id: string) => (await db().from("webhooks").select("id").eq("id", id)).data ?? [];

  it("ends when an Owner or Admin removes the person, with the reason in the Audit Log, and leaves others' alone", async () => {
    const x = await allowed();
    const ana = await made(x, x.A); const bo = await made(x, x.B);
    await removeMember(x.O, x.ana, x.owner);
    expect(await rows(ana)).toEqual([]);
    expect(await rows(bo)).toHaveLength(1);
    const { openRows } = await import("./sealed-columns");
    const { data } = await db().from("audit_events").select("id, kind, object_id, details").eq("workspace_id", x.w.id).eq("kind", "webhook.personal_ended");
    const events = await openRows("audit_events", x.w.id, (data ?? []) as Record<string, unknown>[]);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ object_id: ana, details: { reason: "left", owner_id: x.ana } });
  });

  it("writes an Admin's removal into that Workspace's log only, and leaves another Workspace's waiting ends to the system sweep", async () => {
    const x = await allowed(); const y = await allowed();
    const ana = await made(x, x.A); const yAna = await made(y, y.A);
    await y.w.dropMember(y.ana);
    await removeMember(x.O, x.ana, x.owner);
    const { openRows } = await import("./sealed-columns");
    const log = async (w: { id: string }) => (await openRows("audit_events", w.id, ((await db().from("audit_events").select("id, actor_id, object_id, details").eq("workspace_id", w.id).eq("kind", "webhook.personal_ended")).data ?? []) as Record<string, unknown>[]));
    expect((await log(x.w)).map((e) => [e.object_id, e.actor_id])).toEqual([[ana, x.owner]]);
    // Nothing of the other Workspace is written under the Admin's name; the system's sweep (which may also have run in
    // another test) writes it as Ziffr's own.
    expect((await log(y.w)).every((e) => e.actor_id === null)).toBe(true);
    await recordPersonalWebhookEnds();
    expect((await log(y.w)).map((e) => [e.object_id, e.actor_id])).toEqual([[yAna, null]]);
  });

  it("ends when the person becomes a Guest, not when they change between the roles that may have one", async () => {
    const x = await allowed();
    const ana = await made(x, x.A);
    await setRole(x.O, x.ana, "admin");
    expect(await rows(ana)).toHaveLength(1);
    await setRole(x.O, x.ana, "guest");
    expect(await rows(ana)).toEqual([]);
    expect((await kinds(x.w.id)).filter((k) => k === "webhook.personal_ended")).toHaveLength(1);
  });

  it("ends when the membership goes by any other way, and when the account is deleted, each with its reason in the Audit Log", async () => {
    const x = await allowed();
    const ana = await made(x, x.A); const bo = await made(x, x.B);
    await x.w.dropMember(x.ana);
    expect(await rows(ana)).toEqual([]);
    await db().from("profiles").delete().eq("id", x.bo);
    expect(await rows(bo)).toEqual([]);
    // The send queue and log go with the Webhook.
    expect((await db().from("webhook_sends").select("id").eq("webhook_id", bo)).data).toEqual([]);
    await recordPersonalWebhookEnds();
    await recordPersonalWebhookEnds();
    const { openRows } = await import("./sealed-columns");
    const { data } = await db().from("audit_events").select("id, object_id, details").eq("workspace_id", x.w.id).eq("kind", "webhook.personal_ended");
    const events = await openRows("audit_events", x.w.id, (data ?? []) as Record<string, unknown>[]);
    expect(events.map((e) => [e.object_id, (e.details as { reason: string }).reason]).sort()).toEqual([[ana, "left"], [bo, "account"]].sort());
    expect((await db().from("personal_webhook_ends").select("webhook_id").in("webhook_id", [ana, bo])).data).toEqual([]);
  });
});

describe("the Audit Log", () => {
  it("records each change with the masked address and never the address, the token or a secret", async () => {
    const { w, A } = await allowed();
    const { id } = await createPersonalWebhook(A, { name: "Logged", url: URL1 });
    await updatePersonalWebhook(A, id, { events: ["action.done"] });
    await replacePersonalWebhookSecret(A, id);
    await setPersonalWebhookEnabled(A, id, false);
    await setPersonalWebhookEnabled(A, id, true);
    await deletePersonalWebhook(A, id);
    expect(await kinds(w.id)).toEqual(["workspace.personal_webhooks_allowed", "webhook.personal_added", "webhook.personal_changed", "webhook.personal_secret_replaced", "webhook.personal_switched_off", "webhook.personal_switched_on", "webhook.personal_deleted"]);
    const { openRows } = await import("./sealed-columns");
    const { data } = await db().from("audit_events").select("id, details, object_name").eq("workspace_id", w.id).eq("object_type", "webhook");
    const text = JSON.stringify(await openRows("audit_events", w.id, (data ?? []) as Record<string, unknown>[]));
    expect(text).not.toMatch(/s3cret|whsec_|webhook\/|secret-path/);
    expect(text).toContain("*.example.test");
  });
});

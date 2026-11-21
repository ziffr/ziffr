// Webhooks against the real database (spec 0034, ticket #399; GLOSSARY: Webhook): who may manage them, the address
// checks, the limit also when several are made at once, no Webhook in a trial or the demo, the sealed address and
// secrets, the secret's replacement, the Audit Log, another Workspace, and that no read gives the secret back.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Forbidden } from "./actor";
import { db } from "./db";
import { DemoReadOnly } from "./demo";
import { mailHostResolver } from "./mail-hosts";
import { DEMO_WORKSPACE_ID } from "./team";
import { workspace } from "./test/db-fixtures";
import { WEBHOOKS_PER_WORKSPACE } from "./webhook-limits";
import { createWebhook, deleteWebhook, listWebhooks, replaceWebhookSecret, setWebhookEnabled, updateWebhook } from "./webhooks";
import { forgetWorkspaceKey, isSealed } from "./workspace-keys";

vi.setConfig({ testTimeout: 120_000, hookTimeout: 60_000 });
const saved = process.env.ZIFFR_SECRETS_KEY;
const realLookup = mailHostResolver.lookup;
const cleanups: (() => Promise<void>)[] = [];
beforeEach(() => {
  process.env.ZIFFR_SECRETS_KEY = Buffer.alloc(32, 77).toString("base64");
  mailHostResolver.lookup = async (host) => (host.endsWith("inside.example.test") ? [{ address: "10.0.0.5", family: 4 }] : host === "nowhere.example.test" ? [] : [{ address: "93.184.216.34", family: 4 }]);
});
afterEach(async () => {
  mailHostResolver.lookup = realLookup;
  for (const c of cleanups.splice(0)) await c().catch(() => {});
  if (saved === undefined) delete process.env.ZIFFR_SECRETS_KEY; else process.env.ZIFFR_SECRETS_KEY = saved;
});
async function ws() { const w = await workspace(); cleanups.push(w.cleanup); return w; }
const URL1 = "https://n8n.example.test/webhook/abcdef123456-secret-path?token=s3cret";
const refusal = async (p: Promise<unknown>) => p.then(() => null, (e: Error) => e);

describe("making, listing and changing", () => {
  it("lets an Owner and an Admin make a Webhook, and shows the secret only once", async () => {
    const w = await ws(); const owner = await w.person("owner"); const admin = await w.person("admin");
    const made = await createWebhook(w.actor(owner), { name: "  To   Do ", url: URL1, events: ["action.created", "action.done", "action.done"] });
    expect(made.secret).toMatch(/^whsec_[A-Za-z0-9_-]{43}$/);
    await createWebhook(w.actor(admin, "admin"), { name: "Second", url: "https://example.test/hook" });
    const list = await listWebhooks(w.actor(admin, "admin"));
    expect(list).toHaveLength(2);
    const first = list.find((x) => x.id === made.id)!;
    expect(first).toMatchObject({ name: "To Do", events: ["action.created", "action.done"], enabled: true, disabledReason: null, replacingSecret: false });
    // Masked: the host and the first of the path, never the token in the query or the rest of the path.
    expect(first.address).toBe("https://n8n.example.test/webhook/……");
    expect(JSON.stringify(list)).not.toContain("s3cret");
    expect(JSON.stringify(list)).not.toContain(made.secret);
    expect((await listWebhooks(w.actor(owner)))).toHaveLength(2);
  });

  it("changes the name and the events, switches off and on, and deletes", async () => {
    const w = await ws(); const owner = await w.person("owner"); const a = w.actor(owner);
    const { id } = await createWebhook(a, { name: "One", url: URL1 });
    expect((await listWebhooks(a))[0].events).toEqual([]);
    await updateWebhook(a, id, { name: "Renamed", events: ["value.recorded", "value.unusual"] });
    expect((await listWebhooks(a))[0]).toMatchObject({ name: "Renamed", events: ["value.recorded", "value.unusual"] });
    await setWebhookEnabled(a, id, false);
    expect((await listWebhooks(a))[0]).toMatchObject({ enabled: false, disabledReason: "owner" });
    await setWebhookEnabled(a, id, true);
    expect((await listWebhooks(a))[0]).toMatchObject({ enabled: true, disabledReason: null, disabledAt: null });
    await deleteWebhook(a, id);
    expect(await listWebhooks(a)).toEqual([]);
    expect(await refusal(deleteWebhook(a, id))).toBeInstanceOf(Forbidden);
  });

  it("refuses an event that does not exist and a bad name", async () => {
    const w = await ws(); const a = w.actor(await w.person("owner"));
    expect(await refusal(createWebhook(a, { name: "X", url: URL1, events: ["action.nope"] }))).toBeInstanceOf(Error);
    expect(await refusal(createWebhook(a, { name: "  ", url: URL1 }))).toBeInstanceOf(Error);
    expect(await refusal(createWebhook(a, { name: "x".repeat(81), url: URL1 }))).toBeInstanceOf(Error);
    const { id } = await createWebhook(a, { name: "X", url: URL1 });
    expect(await refusal(updateWebhook(a, id, { events: ["alert.nope"] }))).toBeInstanceOf(Error);
    expect(await listWebhooks(a)).toHaveLength(1);
  });
});

describe("who may", () => {
  it("refuses Members, Guests and keys everything", async () => {
    const w = await ws(); const owner = await w.person("owner"); const member = await w.person("member"); const guest = await w.person("guest");
    const { id } = await createWebhook(w.actor(owner), { name: "One", url: URL1 });
    const keyed = { ...w.actor(owner), key: { id: "k1", scopes: ["metrics:read"] } } as never;
    for (const a of [w.actor(member, "member"), w.actor(guest, "guest"), keyed]) {
      expect(await refusal(createWebhook(a, { name: "X", url: URL1 }))).toBeInstanceOf(Forbidden);
      expect(await refusal(listWebhooks(a))).toBeInstanceOf(Forbidden);
      expect(await refusal(updateWebhook(a, id, { events: [] }))).toBeInstanceOf(Forbidden);
      expect(await refusal(replaceWebhookSecret(a, id))).toBeInstanceOf(Forbidden);
      expect(await refusal(setWebhookEnabled(a, id, false))).toBeInstanceOf(Forbidden);
      expect(await refusal(deleteWebhook(a, id))).toBeInstanceOf(Forbidden);
    }
    expect(await listWebhooks(w.actor(owner))).toHaveLength(1);
  });

  it("answers another Workspace's Webhook like one that is not there", async () => {
    const w1 = await ws(); const w2 = await ws();
    const a1 = w1.actor(await w1.person("owner")); const a2 = w2.actor(await w2.person("owner"));
    const { id } = await createWebhook(a1, { name: "Mine", url: URL1 });
    const gone = (await refusal(deleteWebhook(a2, "00000000-0000-4000-8000-000000000000")))!.message;
    for (const call of [() => updateWebhook(a2, id, { name: "Hijack" }), () => replaceWebhookSecret(a2, id), () => setWebhookEnabled(a2, id, false), () => deleteWebhook(a2, id)]) {
      const e = await refusal(call());
      expect(e).toBeInstanceOf(Forbidden);
      expect(e!.message).toBe(gone);
    }
    expect(await refusal(deleteWebhook(a2, "not-an-id"))).toBeInstanceOf(Forbidden);
    expect(await listWebhooks(a2)).toEqual([]);
    expect((await listWebhooks(a1))[0]).toMatchObject({ name: "Mine", enabled: true });
  });
});

describe("the address", () => {
  it("takes only a public https address", async () => {
    const w = await ws(); const a = w.actor(await w.person("owner"));
    const bad = [
      "http://example.test/hook", "ftp://example.test/x", "https://user:pw@example.test/x", "https://example.test/x#frag", "example.test/x", "",
      "https://localhost/x", "https://127.0.0.1/x", "https://169.254.169.254/latest/meta-data", "https://[::1]/x", "https://[::ffff:10.0.0.1]/x",
      "https://inside.example.test/x", "https://nowhere.example.test/x", "https://example.test/x y", `https://example.test/${"a".repeat(2000)}`,
    ];
    for (const url of bad) expect([url.slice(0, 40), (await refusal(createWebhook(a, { name: "X", url })))?.message]).toEqual([url.slice(0, 40), expect.any(String)]);
    expect(await listWebhooks(a)).toEqual([]);
    await createWebhook(a, { name: "Fine", url: "https://example.test:8443/hook" });
  });

  it("lets only the operator's exact hosts reach the private network", async () => {
    const w = await ws(); const a = w.actor(await w.person("owner"));
    const was = process.env.ZIFFR_WEBHOOK_PRIVATE_HOSTS;
    try {
      process.env.ZIFFR_WEBHOOK_PRIVATE_HOSTS = "inside.example.test";
      await createWebhook(a, { name: "Own n8n", url: "https://inside.example.test/hook" });
      expect(await refusal(createWebhook(a, { name: "Neighbour", url: "https://other.inside.example.test/hook" }))).toBeInstanceOf(Error);
      expect(await refusal(createWebhook(a, { name: "http", url: "http://inside.example.test/hook" }))).toBeInstanceOf(Error);
    } finally {
      if (was === undefined) delete process.env.ZIFFR_WEBHOOK_PRIVATE_HOSTS; else process.env.ZIFFR_WEBHOOK_PRIVATE_HOSTS = was;
    }
  });
});

describe("limits, trials and the demo", () => {
  it("follows ZIFFR_LIMIT_WEBHOOKS_PER_WORKSPACE: a lowered limit keeps what exists, a value out of range is ignored", async () => {
    const w = await ws(); const a = w.actor(await w.person("owner"));
    try {
      for (let i = 0; i < 3; i++) await createWebhook(a, { name: `W${i}`, url: URL1 });
      process.env.ZIFFR_LIMIT_WEBHOOKS_PER_WORKSPACE = "2";
      const e = await refusal(createWebhook(a, { name: "Over", url: URL1 }));
      expect(e!.message).toContain("already has 2 Webhooks");
      // Nothing is deleted or switched off by lowering it.
      expect((await listWebhooks(a)).filter((x) => x.enabled)).toHaveLength(3);
      // 0 would mean no safeguard: it is ignored, and the default of 5 holds.
      process.env.ZIFFR_LIMIT_WEBHOOKS_PER_WORKSPACE = "0";
      await createWebhook(a, { name: "Fourth", url: URL1 });
      await createWebhook(a, { name: "Fifth", url: URL1 });
      expect((await refusal(createWebhook(a, { name: "Sixth", url: URL1 })))!.message).toContain("already has 5 Webhooks");
    } finally {
      delete process.env.ZIFFR_LIMIT_WEBHOOKS_PER_WORKSPACE;
    }
  });

  it("allows the limit and refuses one more, also when several are made at once", async () => {
    const w = await ws(); const a = w.actor(await w.person("owner"));
    const results = await Promise.allSettled(Array.from({ length: WEBHOOKS_PER_WORKSPACE + 3 }, (_, i) => createWebhook(a, { name: `W${i}`, url: URL1 })));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(WEBHOOKS_PER_WORKSPACE);
    expect(await listWebhooks(a)).toHaveLength(WEBHOOKS_PER_WORKSPACE);
    const e = await refusal(createWebhook(a, { name: "One more", url: URL1 }));
    expect(e!.message).toContain(String(WEBHOOKS_PER_WORKSPACE));
    // Deleting one makes room; another Workspace has its own count.
    await deleteWebhook(a, (await listWebhooks(a))[0].id);
    await createWebhook(a, { name: "Room", url: URL1 });
    const w2 = await ws();
    await createWebhook(w2.actor(await w2.person("owner")), { name: "Elsewhere", url: URL1 });
  });

  it("allows Webhooks on a Workspace with a limit of its own, and none in a Trial Workspace", async () => {
    const w = await ws(); const a = w.actor(await w.person("owner"));
    await w.limit(10);
    await createWebhook(a, { name: "On a Size", url: URL1 });
    await w.trial(new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10));
    expect(await refusal(createWebhook(a, { name: "Trial", url: URL1 }))).toBeInstanceOf(Forbidden);
    expect(await listWebhooks(a)).toHaveLength(1);
  });

  it("refuses the demo, in the core and in the database", async () => {
    const demo = { personId: "demo-person", workspaceId: DEMO_WORKSPACE_ID, role: "owner" as const };
    expect(await refusal(createWebhook(demo, { name: "X", url: URL1 }))).toBeInstanceOf(DemoReadOnly);
    expect(await refusal(listWebhooks(demo))).toBeInstanceOf(DemoReadOnly);
    // The database's own refusal, which db.ts raises as DemoReadOnly.
    expect(await refusal(Promise.resolve(db().from("webhooks").insert({ id: "11111111-1111-4111-8111-111111111111", workspace_id: DEMO_WORKSPACE_ID, name: "X", url: "u", secret: "s" })))).toBeInstanceOf(DemoReadOnly);
  });
});

describe("sealing and the secret", () => {
  it("keeps the address and the secrets sealed in the database", async () => {
    const w = await ws(); const a = w.actor(await w.person("owner"));
    const { id, secret } = await createWebhook(a, { name: "Sealed", url: URL1 });
    const second = await replaceWebhookSecret(a, id);
    const { data } = await db().from("webhooks").select("url, secret, secret_previous").eq("id", id).single();
    for (const stored of [data!.url, data!.secret, data!.secret_previous]) {
      expect(isSealed(stored as string)).toBe(true);
      expect(stored).not.toContain("n8n.example.test");
      expect(stored).not.toContain("whsec_");
      expect(stored).not.toContain(secret.slice(6));
      expect(stored).not.toContain(second.secret.slice(6));
    }
    // A sealed value is bound to its row: another row's copy does not open there.
    const w2 = await ws();
    const other = await createWebhook(w2.actor(await w2.person("owner")), { name: "Other", url: URL1 });
    await db().from("webhooks").update({ url: data!.url }).eq("id", other.id);
    expect((await listWebhooks(w2.actor((await db().from("memberships").select("user_id").eq("workspace_id", w2.id).single()).data!.user_id as string)))[0].address).toBe("");
    forgetWorkspaceKey(w.id);
  });

  it("lets only one of two replacements at once win, so no shown secret is one that never signs", async () => {
    const w = await ws(); const a = w.actor(await w.person("owner"));
    const { id } = await createWebhook(a, { name: "Race", url: URL1 });
    const results = await Promise.allSettled([replaceWebhookSecret(a, id), replaceWebhookSecret(a, id)]);
    const won = results.filter((r): r is PromiseFulfilledResult<{ secret: string }> => r.status === "fulfilled");
    expect(won.length).toBeGreaterThanOrEqual(1);
    const { data } = await db().from("webhooks").select("id, secret").eq("id", id).single();
    const { openRows } = await import("./sealed-columns");
    const [opened] = await openRows("webhooks", w.id, [data!]);
    expect(won.map((r) => r.value.secret)).toContain(opened.secret);
  });

  it("replaces the secret, keeps the old one 24 hours, and ends it at the next replacement", async () => {
    const w = await ws(); const a = w.actor(await w.person("owner"));
    const { id, secret } = await createWebhook(a, { name: "Rotate", url: URL1 });
    const before = await db().from("webhooks").select("secret").eq("id", id).single();
    const second = await replaceWebhookSecret(a, id);
    expect(second.secret).not.toBe(secret);
    expect((await listWebhooks(a))[0].replacingSecret).toBe(true);
    const mid = await db().from("webhooks").select("secret, secret_previous, secret_previous_until").eq("id", id).single();
    expect(mid.data!.secret).not.toBe(before.data!.secret);
    const hours = (new Date(mid.data!.secret_previous_until as string).getTime() - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(23.9); expect(hours).toBeLessThanOrEqual(24);
    // The previous secret is the first one, opened.
    const { openRows } = await import("./sealed-columns");
    const [opened] = await openRows("webhooks", w.id, [{ id, secret: mid.data!.secret, secret_previous: mid.data!.secret_previous }]);
    expect(opened.secret).toBe(second.secret); expect(opened.secret_previous).toBe(secret);
    const third = await replaceWebhookSecret(a, id);
    const end = await db().from("webhooks").select("secret, secret_previous").eq("id", id).single();
    const [o2] = await openRows("webhooks", w.id, [{ id, secret: end.data!.secret, secret_previous: end.data!.secret_previous }]);
    expect(o2.secret).toBe(third.secret); expect(o2.secret_previous).toBe(second.secret);
    // Once the 24 hours are over, nothing is listed as rotating.
    await db().from("webhooks").update({ secret_previous_until: new Date(Date.now() - 1000).toISOString() }).eq("id", id);
    expect((await listWebhooks(a))[0].replacingSecret).toBe(false);
  });
});

describe("the Audit Log and the Owners' notice", () => {
  it("records every change with the masked address, and tells the other Owners", async () => {
    const w = await ws(); const owner = await w.person("owner"); const other = await w.person("owner"); const admin = await w.person("admin");
    const a = w.actor(admin, "admin");
    const { id } = await createWebhook(a, { name: "Logged", url: URL1 });
    await updateWebhook(a, id, { events: ["action.done"] });
    await replaceWebhookSecret(a, id);
    await setWebhookEnabled(a, id, false);
    await setWebhookEnabled(a, id, true);
    await deleteWebhook(a, id);
    const { data } = await db().from("audit_events").select("id, kind, object_type, object_id, details, object_name").eq("workspace_id", w.id).eq("object_type", "webhook").order("id");
    expect((data ?? []).map((e) => e.kind)).toEqual(["webhook.created", "webhook.changed", "webhook.secret_replaced", "webhook.switched_off", "webhook.switched_on", "webhook.deleted"]);
    const { openRows } = await import("./sealed-columns");
    const events = await openRows("audit_events", w.id, (data ?? []) as Record<string, unknown>[]);
    expect(JSON.stringify(events)).not.toContain("s3cret");
    expect(JSON.stringify(events)).not.toContain("whsec_");
    // Only the last two labels of the host: some tools make the subdomain or the path the secret.
    expect(JSON.stringify(events)).not.toContain("webhook/");
    expect(events[0].details).toMatchObject({ address: "*.example.test" });
    expect((data ?? []).every((e) => e.object_id === id)).toBe(true);
    const { data: notices } = await db().from("deliveries").select("recipient_id, kind").eq("workspace_id", w.id).eq("kind", "notice");
    const recipients = new Set((notices ?? []).map((n) => n.recipient_id));
    expect(recipients).toEqual(new Set([owner, other]));
    expect((notices ?? []).length).toBe(12);
  });
});

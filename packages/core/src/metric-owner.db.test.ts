// Handing a Metric over, through the core, against the real database (ticket #798).
import { vi } from "vitest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { Forbidden } from "./actor";
import { db } from "./db";
import { handOverChoices, handOverMetric } from "./metric-owner";
import { removeMember } from "./handover";
import { setRole as changeRole } from "./invitations";
import { share } from "./sharing";
import { setMyQuietHours } from "./quiet-hours";
import { createAccessKey, actorForKey } from "./access-keys";
import { setPreference } from "./questions";
import { finishSlackInstall, startSlackInstall } from "./slack-connection";
import { fakeSlack } from "./test/fake-slack";
import { opened, workspace } from "./test/db-fixtures";

let slack: Awaited<ReturnType<typeof fakeSlack>>;
beforeAll(async () => { slack = await fakeSlack(); });
afterAll(async () => { await slack.stop(); });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws() { const w = await workspace(); cleanups.push(w.cleanup); return w; }
const forbidden = expect.any(Forbidden);
const ownerOf = async (id: number) => (await db().from("metrics").select("owner_id").eq("id", id).single()).data!.owner_id as string;
const sharesOf = async (wsId: string, id: number) => (await db().from("shares").select("user_id, role").eq("workspace_id", wsId).eq("object_type", "metric").eq("object_id", id)).data ?? [];

describe("handing a Metric over", () => {
  it("moves the Metric to someone who sees it, keeps the old owner on as Editor, and is audited and told", async () => {
    const w = await ws(); await w.person("owner"); const ben = await w.person("member"); const ann = await w.person("member");
    const m = await w.metric(ben);
    await share(w.actor(ben, "member"), "metric", m.id, ann, "viewer");
    await handOverMetric(w.actor(ben, "member"), m.id, ann);
    expect(await ownerOf(m.id)).toBe(ann);
    expect(await sharesOf(w.id, m.id)).toEqual([{ user_id: ben, role: "editor" }]);
    const ev = await opened("audit_events", w.id, (await db().from("audit_events").select("*").eq("workspace_id", w.id).eq("kind", "metric.handed_over")).data ?? []);
    expect(ev).toHaveLength(1);
    expect(ev![0]).toMatchObject({ actor_id: ben, details: { from_id: ben, to_id: ann } });
    const { data: told } = await db().from("deliveries").select("kind, subject").eq("workspace_id", w.id).eq("recipient_id", ann);
    expect(told?.map((d) => d.kind)).toEqual(["notice"]);
    // The old owner no longer owns it: they cannot hand it on, delete it, or give it away again.
    await expect(handOverMetric(w.actor(ben, "member"), m.id, ben)).rejects.toEqual(forbidden);
  });
  it("tells the new owner by their own way, and after their Quiet Hours", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member");
    const address = `ann-${Date.now()}@example.test`;
    const ann = await w.person("member", { email: address });
    slack.newTeam();
    const state = new URL(await startSlackInstall(w.actor(sara))).searchParams.get("state")!;
    expect(await finishSlackInstall(w.actor(sara), { code: "code-1234567890", state })).toBe("connected");
    slack.user(address);
    await setPreference(w.actor(ann, "member"), ann, "update", "slack");
    const m = await w.metric(ben); await w.share(m.id, ann);
    const h = new Date().getUTCHours();
    await setMyQuietHours(w.actor(ann, "member"), { fromHour: (h + 23) % 24, toHour: (h + 2) % 24, days: [], timeZone: null });
    const posted = slack.of("chat.postMessage").length;
    await handOverMetric(w.actor(ben, "member"), m.id, ann);
    const { data } = await db().from("deliveries").select("connector, mail_state, not_before").eq("workspace_id", w.id).eq("recipient_id", ann).eq("kind", "notice");
    expect(data?.[0], JSON.stringify(data)).toMatchObject({ connector: "slack", mail_state: "queued" });
    expect(data?.[0]?.not_before).toBeTruthy();
    expect(slack.of("chat.postMessage")).toHaveLength(posted);
  });
  it("gives only to a Member who already sees it, when the owner hands it over; never to a Guest, Contact or the owner", async () => {
    const w = await ws(); await w.person("owner"); const ben = await w.person("member"); const ann = await w.person("member"); const gus = await w.person("guest"); const cleo = await w.contact({ email: `c-${Date.now()}@example.test` });
    const m = await w.metric(ben); await w.share(m.id, gus);
    await expect(handOverMetric(w.actor(ben, "member"), m.id, ann)).rejects.toThrow(/already sees/);
    await expect(handOverMetric(w.actor(ben, "member"), m.id, gus)).rejects.toThrow(/not a Guest/);
    await expect(handOverMetric(w.actor(ben, "member"), m.id, cleo)).rejects.toThrow();
    await expect(handOverMetric(w.actor(ben, "member"), m.id, ben)).rejects.toThrow();
    expect(await ownerOf(m.id)).toBe(ben);
  });
  it("lets an Owner or Admin reassign any Metric, and nobody else", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ad = await w.person("admin"); const ben = await w.person("member"); const ann = await w.person("member"); const gus = await w.person("guest");
    const m = await w.metric(ben);
    await expect(handOverMetric(w.actor(ann, "member"), m.id, ann)).rejects.toEqual(forbidden);
    await expect(handOverMetric(w.actor(gus, "guest"), m.id, ann)).rejects.toEqual(forbidden);
    await expect(handOverMetric(w.actor(ad, "admin"), m.id, gus)).rejects.toThrow(/not a Guest/);
    await handOverMetric(w.actor(ad, "admin"), m.id, ann);
    expect(await ownerOf(m.id)).toBe(ann);
    await handOverMetric(w.actor(sara), m.id, sara);
    expect(await ownerOf(m.id)).toBe(sara);
    expect((await sharesOf(w.id, m.id)).map((s) => s.user_id).sort()).toEqual([ann, ben].sort());
    expect(await handOverChoices(w.actor(ben, "member"), m.id)).toEqual([]);
    expect((await handOverChoices(w.actor(ad, "admin"), m.id)).map((c) => c.id).sort()).toEqual([ad, ann, ben].sort());
  });
  it("is never done by an Access Key, nor with a key's creator's role", async () => {
    const w = await ws(); await w.person("owner"); const ben = await w.person("member"); const ann = await w.person("member");
    const m = await w.metric(ben); await w.share(m.id, ann);
    const { secret } = await createAccessKey(w.actor(ben, "member"), { name: "script", scopes: ["metrics:read", "metrics:edit", "metrics:write"], expiresOn: new Date(Date.now() + 86400000).toISOString().slice(0, 10) });
    const key = await actorForKey(secret);
    expect(key).not.toBeNull();
    await expect(handOverMetric(key as never, m.id, ann)).rejects.toEqual(forbidden);
    expect(await ownerOf(m.id)).toBe(ben);
  });
  it("follows the new owner: only they delete it", async () => {
    const w = await ws(); await w.person("owner"); const ben = await w.person("member"); const ann = await w.person("member");
    const m = await w.metric(ben); await w.share(m.id, ann);
    await handOverMetric(w.actor(ben, "member"), m.id, ann);
    const { deleteMetric } = await import("./metrics");
    await expect(deleteMetric(w.actor(ben, "member"), m.id, "x")).rejects.toEqual(forbidden);
  });
});

describe("a hand-over the database refuses", () => {
  it("leaves no audit row, changes no owner or Share, and does not change what the next hand-over does", async () => {
    const w = await ws(); await w.person("owner"); const ad = await w.person("admin"); const ben = await w.person("member"); const ann = await w.person("member");
    const m = await w.metric(ben);
    const client = db(); const real = client.rpc.bind(client);
    const spy = vi.spyOn(client, "rpc").mockImplementation(((name: string, args: never) => (name === "hand_over_metric" ? Promise.resolve({ data: null, error: { message: "boom" } }) : (real as (n: string, a: never) => unknown)(name, args))) as never);
    await expect(handOverMetric(w.actor(ad, "admin"), m.id, ad)).rejects.toThrow(/did not work/);
    spy.mockRestore();
    expect(await ownerOf(m.id)).toBe(ben);
    expect(await sharesOf(w.id, m.id)).toEqual([]);
    expect((await db().from("audit_events").select("id").eq("workspace_id", w.id).eq("kind", "metric.handed_over")).data).toEqual([]);
    // The next one behaves as if the failed one never happened: the Admin took it for real now, and hands it on without a Share.
    await handOverMetric(w.actor(ad, "admin"), m.id, ad);
    await handOverMetric(w.actor(ad, "admin"), m.id, ann);
    expect((await sharesOf(w.id, m.id)).map((x) => x.user_id)).toEqual([ben]);
  });
});

describe("a stale mark of taking by role", () => {
  it("never matches a new owner set by another path", async () => {
    const w = await ws(); await w.person("owner"); const ad = await w.person("admin"); const ben = await w.person("member"); const ann = await w.person("member");
    const m = await w.metric(ben);
    await handOverMetric(w.actor(ad, "admin"), m.id, ad);
    expect((await db().from("metrics").select("owner_taken_by").eq("id", m.id).single()).data!.owner_taken_by).toBe(ad);
    // Another path (an import, say) gives it to Ann; the mark still names the Admin.
    await db().from("metrics").update({ owner_id: ann }).eq("id", m.id);
    await handOverMetric(w.actor(ann, "member"), m.id, ben);
    expect((await sharesOf(w.id, m.id)).filter((x) => x.user_id === ann)).toEqual([{ user_id: ann, role: "editor" }]);
    expect((await db().from("metrics").select("owner_taken_by").eq("id", m.id).single()).data!.owner_taken_by).toBeNull();
  });
});

describe("a Metric never stays with someone who is gone", () => {
  it("records taking a removed person's Metrics for oneself, so a round trip is seen", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member"); const ann = await w.person("member");
    const m = await w.metric(ben);
    await removeMember(w.actor(sara), ben, sara);
    await handOverMetric(w.actor(sara), m.id, ann);
    // Sara took it by her role: she keeps no Editor Share from handing it on.
    expect(await sharesOf(w.id, m.id)).toEqual([]);
  });
  it("leaves a removed person owning no Metric", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member");
    const a = await w.metric(ben); const b = await w.metric(ben);
    await removeMember(w.actor(sara), ben, sara);
    expect([await ownerOf(a.id), await ownerOf(b.id)]).toEqual([sara, sara]);
    expect((await db().from("metrics").select("id").eq("workspace_id", w.id).eq("owner_id", ben)).data).toEqual([]);
  });
  it("refuses to make an owner of Metrics a Guest until they are handed over", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member");
    const m = await w.metric(ben);
    await expect(changeRole(w.actor(sara), ben, "guest")).rejects.toThrow(/Hand it over first/);
    await handOverMetric(w.actor(sara), m.id, sara);
    await changeRole(w.actor(sara), ben, "guest");
    expect((await db().from("memberships").select("role").eq("workspace_id", w.id).eq("user_id", ben).single()).data!.role).toBe("guest");
  });
});

describe("what follows the hand-over", () => {
  it("tells the old owner when someone else did it, and never leaves a lasting Editor Share to a round trip", async () => {
    const w = await ws(); await w.person("owner"); const ad = await w.person("admin"); const ben = await w.person("member"); const ann = await w.person("member");
    const m = await w.metric(ben);
    await handOverMetric(w.actor(ad, "admin"), m.id, ad);
    expect(await sharesOf(w.id, m.id)).toEqual([{ user_id: ben, role: "editor" }]);
    const to = async (id: string) => (await db().from("deliveries").select("subject").eq("workspace_id", w.id).eq("recipient_id", id).eq("kind", "notice")).data ?? [];
    expect((await to(ben)).length).toBe(1);
    await handOverMetric(w.actor(ad, "admin"), m.id, ann);
    // The Admin did not really own it: no Share for them; Ben's stays.
    expect((await sharesOf(w.id, m.id)).map((x) => x.user_id).sort()).toEqual([ben].sort());
    expect((await to(ben)).length).toBe(1);
    expect((await to(ann)).length).toBe(1);
  });
  it("keeps the sight an Admin had before taking it, and never downgrades an Editor", async () => {
    const w = await ws(); await w.person("owner"); const ad = await w.person("admin"); const ben = await w.person("member"); const ann = await w.person("member");
    const m = await w.metric(ben);
    await share(w.actor(ben, "member"), "metric", m.id, ad, "viewer");
    await share(w.actor(ben, "member"), "metric", m.id, ann, "viewer");
    await handOverMetric(w.actor(ad, "admin"), m.id, ad);
    await handOverMetric(w.actor(ad, "admin"), m.id, ann);
    expect((await sharesOf(w.id, m.id)).find((x) => x.user_id === ad)).toEqual({ user_id: ad, role: "viewer" });
    await db().from("shares").update({ role: "editor" }).eq("workspace_id", w.id).eq("object_id", m.id).eq("user_id", ben);
    await handOverMetric(w.actor(ann, "member"), m.id, ben);
    expect((await sharesOf(w.id, m.id)).find((x) => x.user_id === ann)).toEqual({ user_id: ann, role: "editor" });
  });
  it("moves the open Questions waiting on the owner as owner, and nothing else", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member"); const ann = await w.person("member");
    const m = await w.metric(ben); await w.share(m.id, ann);
    const row = { metric_id: m.id, period_start: "2026-01-01", asker_id: sara, assignee_id: ben, kind: "question" };
    const esc = await w.action({ ...row, purpose: "escalation", question: "q" } as never);
    const plain = await w.action({ ...row, question: "other" } as never);
    const task = await w.action({ ...row, kind: "task", purpose: "approval", question: "t" } as never);
    const approval = await w.action({ ...row, purpose: "approval", question: "a" } as never);
    await handOverMetric(w.actor(ben, "member"), m.id, ann);
    const who = async (id: number) => (await db().from("actions").select("assignee_id").eq("id", id).single()).data!.assignee_id;
    expect([await who(esc), await who(plain), await who(task), await who(approval)]).toEqual([ann, ben, ben, ben]);
  });
  it("is enforced by the database: no Guest owns a Metric, and no owner is a non-member", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member"); const gus = await w.person("guest");
    const m = await w.metric(ben);
    expect((await db().from("memberships").update({ role: "guest" }).eq("workspace_id", w.id).eq("user_id", ben)).error?.message).toMatch(/cannot own a Metric/);
    expect((await db().from("metrics").update({ owner_id: gus }).eq("id", m.id)).error?.message).toMatch(/not be a Guest|not a Guest/);
    expect((await db().from("metrics").update({ owner_id: "t-nobody" }).eq("id", m.id)).error).toBeTruthy();
    await expect(handOverMetric(w.actor(sara), m.id, gus)).rejects.toThrow(/not a Guest/);
    expect(await ownerOf(m.id)).toBe(ben);
    await expect(w.metric(gus)).rejects.toThrow();
    await expect(w.metric("t-nobody")).rejects.toThrow();
  });
});

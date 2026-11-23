// The API's core functions with an Access Key, against the real database (spec 0002, tickets #46 and #48).
import { afterEach, describe, expect, it } from "vitest";
import { Forbidden } from "./actor";
import { actorForKey, createAccessKey } from "./access-keys";
import { getMetric, listGroups, listMetrics, listObservations, listPeople } from "./api";
import { db, seedingDemo } from "./db";
import { share } from "./sharing";
import { createGroup } from "./team";
import { DEMO_WORKSPACE_ID } from "./team";
import { workspace } from "./test/db-fixtures";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws(name?: string) { const w = await workspace(name); cleanups.push(w.cleanup); return w; }
const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

describe("listMetrics", () => {
  it("lists only what the key's creator sees, a page at a time, and nothing of another workspace", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member");
    const a = await w.metric(ben, { name: "A" }); const b = await w.metric(ben, { name: "B" }); const c = await w.metric(sara, { name: "C" });
    const hidden = await w.metric(sara, { name: "Hidden" });
    await share(w.actor(sara), "metric", c.id, ben, "viewer");
    const other = await ws("Other"); const zoe = await other.person("owner"); await other.metric(zoe, { name: "Elsewhere" });
    const key = (await actorForKey((await createAccessKey(w.actor(ben, "member"), { name: "Script", scopes: ["metrics:read"], expiresOn: inDays(30) })).secret))!;
    const first = await listMetrics(key, { limit: 2 });
    expect(first.items.map((m) => m.slug)).toEqual([a.slug, b.slug]);
    expect(first.next).toBe(b.id);
    const second = await listMetrics(key, { after: first.next, limit: 2 });
    expect(second).toEqual({ items: [expect.objectContaining({ slug: c.slug, name: "C", derived: false })], next: null });
    expect(JSON.stringify([first, second])).not.toContain(hidden.slug);
    expect(Object.keys(second.items[0])).not.toContain("owner_id");
  });
  it("refuses a key without metrics:read", async () => {
    const w = await ws(); const ben = await w.person("member");
    const key = (await actorForKey((await createAccessKey(w.actor(ben, "member"), { name: "Feed", scopes: ["values:submit"], expiresOn: inDays(30) })).secret))!;
    await expect(listMetrics(key, { limit: 10 })).rejects.toEqual(expect.any(Forbidden));
  });
  it("ignore a key that ended up in the demo workspace", async () => {
    const w = await ws(); const ben = await w.person("member");
    const { id, secret } = await createAccessKey(w.actor(ben, "member"), { name: "Moved", scopes: ["metrics:read"], expiresOn: inDays(30) });
    expect(await actorForKey(secret)).not.toBeNull();
    // Only the demo's seed can put a row there (#271).
    const { error } = await seedingDemo(async () => db().from("access_keys").update({ workspace_id: DEMO_WORKSPACE_ID }).eq("id", id));
    expect(error).toBeNull();
    expect(await actorForKey(secret)).toBeNull();
    await seedingDemo(async () => { await db().from("access_keys").delete().eq("id", id); });
  });
});

const forbidden = expect.any(Forbidden);
async function keyOf(w: Awaited<ReturnType<typeof ws>>, person: string, scopes: ("metrics:read" | "values:submit")[] = ["metrics:read"]) {
  return (await actorForKey((await createAccessKey(w.actor(person, "member"), { name: "Script", scopes, expiresOn: inDays(30) })).secret))!;
}
async function value(w: Awaited<ReturnType<typeof ws>>, metricId: number, period: string, v: number, submitter: string | null = null) {
  const { data, error } = await db().from("observations").insert({ metric_id: metricId, period_start: period, value: v, submitter_id: submitter, source: "api", workspace_id: w.id }).select("id").single();
  if (error) throw new Error(error.message);
  return data.id as number;
}

describe("getMetric and listObservations", () => {
  it("describe a visible Metric and treat a hidden, foreign or missing one as not there", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member");
    const mine = await w.metric(ben, { name: "Orders", unit: "orders", target_min: 40 });
    const hidden = await w.metric(sara, { name: "Payroll" });
    const other = await ws("Other"); const zoe = await other.person("owner"); const foreign = await other.metric(zoe, { name: "Elsewhere" });
    const key = await keyOf(w, ben);
    expect(await getMetric(key, mine.slug)).toEqual(expect.objectContaining({ slug: mine.slug, name: "Orders", unit: "orders", period: "month", target_min: 40, derived: false }));
    for (const slug of [hidden.slug, foreign.slug, "no-such-metric"]) {
      await expect(getMetric(key, slug)).rejects.toEqual(forbidden);
      await expect(listObservations(key, slug, { limit: 10 })).rejects.toEqual(forbidden);
    }
    await expect(getMetric(await keyOf(w, ben, ["values:submit"]), mine.slug)).rejects.toEqual(forbidden);
  });
  it("return values in a range, a page at a time, with Breakdown, submitter and state", async () => {
    const w = await ws(); const ben = await w.person("member");
    const m = await w.metric(ben, { name: "Revenue" });
    for (const [i, month] of ["2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01"].entries()) await value(w, m.id, month, 10 * (i + 1), ben);
    const feb = (await db().from("observations").select("id").eq("metric_id", m.id).eq("period_start", "2026-02-01").single()).data!.id;
    await db().from("breakdown_rows").insert([{ observation_id: feb, label: "Shop", value: 15, position: 0, workspace_id: w.id }, { observation_id: feb, label: "Online", value: 5, position: 1, workspace_id: w.id }]);
    await db().from("period_states").insert({ metric_id: m.id, period_start: "2026-03-01", state: "locked", workspace_id: w.id });
    const key = await keyOf(w, ben);
    const first = await listObservations(key, m.slug, { from: "2026-02-01", to: "2026-04-01", limit: 2 });
    expect(first).toEqual({
      items: [
        { period: "2026-02-01", value: 20, state: "recorded", submitter: ben, submitter_name: expect.any(String), submitted_at: expect.any(String), source: "api", has_thread: false, entered_by: null, entered_by_name: null, breakdown: [{ label: "Shop", value: 15 }, { label: "Online", value: 5 }] },
        { period: "2026-03-01", value: 30, state: "locked", submitter: ben, submitter_name: expect.any(String), submitted_at: expect.any(String), source: "api", has_thread: false, entered_by: null, entered_by_name: null, breakdown: null },
      ],
      next: "2026-03-01",
    });
    expect(await listObservations(key, m.slug, { from: "2026-02-01", to: "2026-04-01", after: first.next, limit: 2 })).toEqual({ items: [expect.objectContaining({ period: "2026-04-01", value: 40 })], next: null });
  });
  it("compute a Derived Metric's values without handing out its inputs", async () => {
    const w = await ws(); const ben = await w.person("member");
    const a = await w.metric(ben, { name: "A" }); const b = await w.metric(ben, { name: "B" });
    const d = await w.metric(ben, { name: "Ratio", formula: `{${a.slug}} / {${b.slug}}` });
    await value(w, a.id, "2026-01-01", 30); await value(w, b.id, "2026-01-01", 10);
    expect((await listObservations(await keyOf(w, ben), d.slug, { limit: 10 })).items).toEqual([{ period: "2026-01-01", value: 3, state: "recorded", submitter: null, submitter_name: null, submitted_at: null, source: null, has_thread: false, entered_by: null, entered_by_name: null, breakdown: null }]);
  });
});

describe("listPeople and listGroups", () => {
  it("name the workspace's people, Contacts and Groups, with no contact details and nothing of another workspace", async () => {
    const w = await ws(); const tag = w.id.slice(0, 8);
    const sara = await w.person("owner", { email: `sara-${tag}@example.test`, slack_handle: `@sara-${tag}` }); const ben = await w.person("member");
    const dana = await w.contact({ email: `dana-${tag}@example.test`, phone: "+49 1" });
    await createGroup(w.actor(sara), `Sales ${w.id.slice(0, 6)}`);
    const other = await ws("Other"); const zoe = await other.person("owner"); await createGroup(other.actor(zoe), `Hidden ${other.id.slice(0, 6)}`);
    const key = await keyOf(w, ben);
    const first = await listPeople(key, { limit: 2 });
    const rest = await listPeople(key, { after: first.next, limit: 2 });
    const all = [...first.items, ...rest.items];
    expect(rest.next).toBeNull();
    expect(all.map((p) => p.id).sort()).toEqual([sara, ben, dana].sort());
    expect(all.find((p) => p.id === dana)).toEqual({ id: dana, name: expect.any(String), contact: true });
    expect(all.every((p) => Object.keys(p).sort().join() === "contact,id,name")).toBe(true);
    expect(JSON.stringify(all)).not.toMatch(/example\.test|@sara|\+49/);
    expect(all.map((p) => p.id)).not.toContain(zoe);
    const groups = await listGroups(key, { limit: 50 });
    expect(groups.items.map((g) => g.name)).toEqual(expect.arrayContaining([`Sales ${w.id.slice(0, 6)}`]));
    expect(JSON.stringify(groups)).not.toContain("Hidden");
    await expect(listPeople(await keyOf(w, ben, ["values:submit"]), { limit: 10 })).rejects.toEqual(forbidden);
    await expect(listGroups(await keyOf(w, ben, ["values:submit"]), { limit: 10 })).rejects.toEqual(forbidden);
  });
});

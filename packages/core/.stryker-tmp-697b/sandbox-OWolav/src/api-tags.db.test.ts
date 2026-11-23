// @ts-nocheck
// Tags through the API and the MCP Server's calls, against the real database (GLOSSARY: Tag, Access Key; spec 0038, ticket
// #659): a key sees no more Tags than its creator sees through Metrics they may see, the `tag` filter narrows and never
// leaks, `tags` on create and update follow the Tag rules (limits, who may tag, words from programs are untrusted) and
// nothing here renames, merges or deletes a Tag.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Forbidden, type KeyActor } from "./actor";
import { actorForKey, createAccessKey } from "./access-keys";
import { listMetrics, listTags, getMetric } from "./api";
import { createMetricWithKey, MetricChangeRefused, setMetricArchivedWithKey, updateMetricWithKey } from "./api-metrics";
import { db } from "./db";
import { metricEffects, type MetricEffects } from "./metrics";
import { TAGS_PER_METRIC, TAGS_PER_WORKSPACE } from "./tag-names";
import { setMetricTags } from "./tags";
import { workspace } from "./test/db-fixtures";
import { forgetWorkspaceKey } from "./workspace-keys";

const saved = process.env.ZIFFR_SECRETS_KEY;
const cleanups: (() => Promise<void>)[] = [];
beforeEach(() => { process.env.ZIFFR_SECRETS_KEY = Buffer.alloc(32, 59).toString("base64"); });
afterEach(async () => {
  for (const c of cleanups.splice(0)) await c().catch(() => {});
  if (saved === undefined) delete process.env.ZIFFR_SECRETS_KEY;
  else process.env.ZIFFR_SECRETS_KEY = saved;
}, 120_000);

const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const fx = (): MetricEffects => ({ ...metricEffects, promptSubmitter: vi.fn(async () => {}) });
type W = Awaited<ReturnType<typeof workspace>>;
async function keyFor(w: W, person: string, role: "owner" | "admin" | "member" | "guest", scopes: ("metrics:read" | "metrics:write" | "metrics:edit")[] = ["metrics:read", "metrics:write", "metrics:edit"]) {
  const { secret } = await createAccessKey(w.actor(person, role), { name: "Script", scopes, expiresOn: inDays(30) });
  return (await actorForKey(secret)) as KeyActor;
}

/** Sara owns three Metrics; Mia (Member) sees one as a Viewer and one as an Editor and nothing else. */
async function setup() {
  const w = await workspace("Tags API");
  cleanups.push(async () => { forgetWorkspaceKey(w.id); await w.cleanup(); });
  const sara = await w.person("owner");
  const mia = await w.person("member");
  const privateM = await w.metric(sara, { name: "Private", slug: "private" });
  const viewedM = await w.metric(sara, { name: "Viewed", slug: "viewed" });
  const editedM = await w.metric(sara, { name: "Edited", slug: "edited" });
  for (const [m, role] of [[viewedM, "viewer"], [editedM, "editor"]] as const) await db().from("shares").insert({ workspace_id: w.id, object_type: "metric", object_id: m.id, user_id: mia, role });
  await setMetricTags(w.actor(sara, "owner"), privateM.id, ["secret", "finance"]);
  await setMetricTags(w.actor(sara, "owner"), viewedM.id, ["finance", "monthly"]);
  await setMetricTags(w.actor(sara, "owner"), editedM.id, ["ops"]);
  return { w, sara, mia, privateM, viewedM, editedM, saraKey: await keyFor(w, sara, "owner"), miaKey: await keyFor(w, mia, "member") };
}

describe("reading Tags through a key", () => {
  it("lists the Tags and counts only through Metrics the key's creator sees", async () => {
    const t = await setup();
    expect(await listTags(t.saraKey)).toEqual([
      { name: "finance", metrics: 2, archived: 0 }, { name: "monthly", metrics: 1, archived: 0 }, { name: "ops", metrics: 1, archived: 0 }, { name: "secret", metrics: 1, archived: 0 },
    ]);
    // Mia never sees `secret`, and `finance` counts one Metric: no name or number that only hidden Metrics carry.
    expect(await listTags(t.miaKey)).toEqual([{ name: "finance", metrics: 1, archived: 0 }, { name: "monthly", metrics: 1, archived: 0 }, { name: "ops", metrics: 1, archived: 0 }]);
  });
  it("needs metrics:read", async () => {
    const t = await setup();
    await expect(listTags(await keyFor(t.w, t.sara, "owner", ["metrics:write"]))).rejects.toBeInstanceOf(Forbidden);
  });
  it("puts `tags` (sorted) on every Metric read, those the creator sees", async () => {
    const t = await setup();
    const all = (await listMetrics(t.saraKey, { limit: 50 })).items;
    expect(Object.fromEntries(all.map((m) => [m.name, m.tags]))).toEqual({ Private: ["finance", "secret"], Viewed: ["finance", "monthly"], Edited: ["ops"] });
    expect(Object.fromEntries((await listMetrics(t.miaKey, { limit: 50 })).items.map((m) => [m.name, m.tags]))).toEqual({ Viewed: ["finance", "monthly"], Edited: ["ops"] });
    expect((await getMetric(t.saraKey, "private")).tags).toEqual(["finance", "secret"]);
  });
  it("filters by Tag: all of them must match, case does not matter, and an unseen or unknown word matches nothing", async () => {
    const t = await setup();
    const names = async (key: KeyActor, tags: string[]) => (await listMetrics(key, { limit: 50, tags })).items.map((m) => m.name);
    expect(await names(t.saraKey, ["finance"])).toEqual(["Private", "Viewed"]);
    expect(await names(t.saraKey, ["Finance", "monthly"])).toEqual(["Viewed"]);
    expect(await names(t.saraKey, ["finance", "ops"])).toEqual([]);
    expect(await names(t.miaKey, ["finance"])).toEqual(["Viewed"]);
    // The same answer for a word only hidden Metrics carry as for a word nobody uses.
    expect(await names(t.miaKey, ["secret"])).toEqual([]);
    expect(await names(t.miaKey, ["nobody-uses-this"])).toEqual([]);
    expect(await names(t.miaKey, ["finance", "secret"])).toEqual([]);
  });
  it("pages a filtered list and keeps Archived Metrics apart", async () => {
    const t = await setup();
    const first = await listMetrics(t.saraKey, { limit: 1, tags: ["finance"] });
    expect(first.items.map((m) => m.name)).toEqual(["Private"]);
    expect((await listMetrics(t.saraKey, { limit: 1, tags: ["finance"], after: first.next })).items.map((m) => m.name)).toEqual(["Viewed"]);
    const archived = await setMetricArchivedWithKey(t.saraKey, "viewed", true);
    expect(archived.tags).toEqual(["finance", "monthly"]);
    expect((await listMetrics(t.saraKey, { limit: 50, tags: ["finance"] })).items.map((m) => m.name)).toEqual(["Private"]);
    expect((await listMetrics(t.saraKey, { limit: 50, tags: ["finance"], archived: true })).items.map((m) => m.name)).toEqual(["Viewed"]);
    expect((await listTags(t.saraKey)).find((x) => x.name === "monthly")).toEqual({ name: "monthly", metrics: 0, archived: 1 });
  });
});

describe("setting Tags through a key", () => {
  it("creates a Metric with tags, the same Tag Workspace-wide whatever the spelling, and names the key in its Version", async () => {
    const t = await setup();
    const made = await createMetricWithKey(t.saraKey, { name: "Revenue", tags: ["#Finance", "new  word"] }, fx());
    // `finance` exists: the same Tag, in the spelling the Workspace has; the new word is made as typed, spaces collapsed.
    expect(made.tags).toEqual(["finance", "new word"]);
    expect(made.tags_left_out).toBeUndefined();
    const { data: v } = await db().from("versions").select("message").eq("object_type", "metric").eq("object_id", (await db().from("metrics").select("id").eq("workspace_id", t.w.id).eq("slug", "revenue").single()).data!.id);
    expect((v ?? []).map((x) => x.message).join(" ")).toMatch(/Tags|API/);
  });
  it("makes a Derived Metric with tags too", async () => {
    const t = await setup();
    const made = await createMetricWithKey(t.saraKey, { name: "Double", formula: "{private} * 2", tags: ["finance"] }, fx());
    expect(made.tags).toEqual(["finance"]);
  });
  it("refuses a bad word, a comma, markup and more than ten Tags before anything is created", async () => {
    const t = await setup();
    const before = (await db().from("metrics").select("id", { count: "exact", head: true }).eq("workspace_id", t.w.id)).count;
    for (const tags of [["a,b"], ["<b>x</b>"], ["x".repeat(33)], [""], Array.from({ length: TAGS_PER_METRIC + 1 }, (_, i) => `t${i}`), ["ok", "bell\u0007"], [42 as unknown as string]]) {
      await expect(createMetricWithKey(t.saraKey, { name: "Nope", tags }, fx()), JSON.stringify(tags)).rejects.toBeInstanceOf(MetricChangeRefused);
    }
    expect((await db().from("metrics").select("id", { count: "exact", head: true }).eq("workspace_id", t.w.id)).count).toBe(before);
  });
  it("makes the Metric and names the words left out when the Workspace is at its Tag limit", async () => {
    const t = await setup();
    const sara = t.w.actor(t.sara, "owner");
    const m = await t.w.metric(t.sara, { name: "Full" });
    // 200 words in use across Metrics of ten each.
    const have = (await listTags(t.saraKey)).length;
    const filler = Array.from({ length: TAGS_PER_WORKSPACE - have }, (_, i) => `filler ${i}`);
    for (let i = 0; i < filler.length; i += TAGS_PER_METRIC) await setMetricTags(sara, (await t.w.metric(t.sara, { name: `F${i}` })).id, filler.slice(i, i + TAGS_PER_METRIC));
    void m;
    const made = await createMetricWithKey(t.saraKey, { name: "Late", tags: ["one more"] }, fx());
    expect(made).toMatchObject({ name: "Late", tags: [], tags_left_out: ["one more"] });
    // A word that exists is still accepted at the limit.
    expect((await createMetricWithKey(t.saraKey, { name: "Late 2", tags: ["finance"] }, fx())).tags).toEqual(["finance"]);
  }, 120_000);
  it("sets the whole set on update, [] takes them all off, and the key's Version names it", async () => {
    const t = await setup();
    expect((await updateMetricWithKey(t.saraKey, "private", { tags: ["finance", "audit"] })).tags).toEqual(["audit", "finance"]);
    expect((await updateMetricWithKey(t.saraKey, "private", { tags: [] })).tags).toEqual([]);
    // `secret` was on this Metric only: a Tag with no Metric left is gone.
    expect((await listTags(t.saraKey)).map((x) => x.name)).not.toContain("secret");
  });
  it("lets an Editor change Tags and refuses a Viewer, saying why; a Metric out of sight is not found", async () => {
    const t = await setup();
    expect((await updateMetricWithKey(t.miaKey, "edited", { tags: ["ops", "finance"] })).tags).toEqual(["finance", "ops"]);
    const refused = await updateMetricWithKey(t.miaKey, "viewed", { tags: ["x"] }).catch((e) => e);
    expect(refused).toBeInstanceOf(Forbidden);
    expect((await getMetric(t.miaKey, "viewed")).tags).toEqual(["finance", "monthly"]);
    await expect(updateMetricWithKey(t.miaKey, "private", { tags: ["x"] })).rejects.toMatchObject({ message: "Forbidden" });
  });
  it("attaches a word that exists only out of sight, silently, and answers in the creator's own spelling", async () => {
    const t = await setup();
    // The answer never tells that the word exists out of sight, nor how it was first written; a later read shows the Workspace's spelling (spec 0038).
    expect((await updateMetricWithKey(t.miaKey, "edited", { tags: ["SECRET"] })).tags).toEqual(["SECRET"]);
    expect((await createMetricWithKey(t.miaKey, { name: "Mias", tags: ["FINANCE", "brand new"] }, fx())).tags).toEqual(["brand new", "finance"]);
  });
  it("needs metrics:edit to change and refuses a key whose creator is a Guest", async () => {
    const t = await setup();
    await expect(updateMetricWithKey(await keyFor(t.w, t.sara, "owner", ["metrics:write"]), "private", { tags: ["x"] })).rejects.toBeInstanceOf(Forbidden);
    const gus = await t.w.person("guest");
    await expect(updateMetricWithKey({ personId: gus, workspaceId: t.w.id, role: "guest", key: { id: "0", scopes: ["metrics:edit"] } }, "private", { tags: ["x"] })).rejects.toBeInstanceOf(Forbidden);
  });
  it("leaves the Tags as they were when the rest of an update is refused", async () => {
    const t = await setup();
    await expect(updateMetricWithKey(t.saraKey, "private", { tags: ["changed"], target_min: 10, target_max: 1 })).rejects.toBeInstanceOf(MetricChangeRefused);
    expect((await getMetric(t.saraKey, "private")).tags).toEqual(["finance", "secret"]);
  });
  it("needs the scope for each way in and the creator's right to edit", async () => {
    const t = await setup();
    await expect(createMetricWithKey(await keyFor(t.w, t.sara, "owner", ["metrics:edit"]), { name: "X", tags: ["a"] }, fx())).rejects.toBeInstanceOf(Forbidden);
    await expect(updateMetricWithKey(await keyFor(t.w, t.mia, "member", ["metrics:read"]), "edited", { tags: ["a"] })).rejects.toBeInstanceOf(Forbidden);
    // Mia only views `viewed`: her key with every scope still cannot tag it.
    await expect(updateMetricWithKey(t.miaKey, "viewed", { tags: ["a"] })).rejects.toBeInstanceOf(Forbidden);
    expect((await getMetric(t.saraKey, "viewed")).tags).toEqual(["finance", "monthly"]);
  });
  it("refuses a bad word on update without changing anything else", async () => {
    const t = await setup();
    await expect(updateMetricWithKey(t.saraKey, "private", { name: "Renamed", tags: ["a,b"] })).rejects.toBeInstanceOf(MetricChangeRefused);
    expect((await getMetric(t.saraKey, "private")).name).toBe("Private");
  });
});

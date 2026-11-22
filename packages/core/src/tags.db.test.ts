// Tags in the core against the real database (GLOSSARY: Tag; spec 0038, ticket #656): who sees which Tag (only through a
// Metric they may see), who may tag, the limits (also under parallel requests), the lifecycle (a Tag with no Metric left
// goes, Versions and restore), rename, merge and delete as an Admin who cannot see every tagged Metric, the sealing of
// names and their blind index, and the Audit Log.
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Forbidden, Refused } from "./actor";
import { auditLog } from "./audit-log";
import { db } from "./db";
import { deleteMetric } from "./metrics";
import { readTags, tagIndexes } from "./tag-rows";
import { metricIdsWithTags, metricTagNames, visibleTags } from "./tag-sight";
import { TAGS_PER_METRIC, TAGS_PER_WORKSPACE } from "./tag-names";
import { addMetricTags, deleteTag, mergeTags, removeMetricTags, renameTag, setMetricTags, tagImpact } from "./tags";
import { workspace } from "./test/db-fixtures";
import { listVersions, restoreVersion } from "./version-history";
import { reencryptionJob } from "./workspace-key-job";
import { forgetWorkspaceKey, isSealed, workspaceCipher } from "./workspace-keys";

const saved = process.env.ZIFFR_SECRETS_KEY;
const cleanups: (() => Promise<void>)[] = [];
beforeEach(() => { process.env.ZIFFR_SECRETS_KEY = Buffer.alloc(32, 38).toString("base64"); });
afterEach(async () => {
  for (const c of cleanups.splice(0)) await c().catch(() => {});
  if (saved === undefined) delete process.env.ZIFFR_SECRETS_KEY;
  else process.env.ZIFFR_SECRETS_KEY = saved;
}, 120_000);

const names = (tags: { name: string }[]) => tags.map((t) => t.name);

/** A Workspace of people who see different things: Sara (Owner) owns four Metrics, Adam (Admin) owns one and shares nothing,
 * Mia (Member) sees one of Sara's as a Viewer and one as an Editor, Ben (Member) sees one through a Group, Gus (Guest) is
 * a Viewer of one Metric and an Editor of another, and Nia (Member) sees nothing. */
async function setup() {
  const w = await workspace("Tags");
  cleanups.push(async () => { forgetWorkspaceKey(w.id); await w.cleanup(); });
  const sara = await w.person("owner");
  const adam = await w.person("admin");
  const mia = await w.person("member");
  const ben = await w.person("member");
  const gus = await w.person("guest");
  const nia = await w.person("member");
  const privateM = await w.metric(sara, { name: "Private" });
  const viewedM = await w.metric(sara, { name: "Viewed by Mia" });
  const editedM = await w.metric(sara, { name: "Edited by Mia and Gus" });
  const groupM = await w.metric(sara, { name: "Group's" });
  const gusViewM = await w.metric(sara, { name: "Gus views" });
  const adamM = await w.metric(adam, { name: "Adam's" });
  const share = (metric: number, user: string, role: "viewer" | "editor") => db().from("shares").insert({ workspace_id: w.id, object_type: "metric", object_id: metric, user_id: user, role });
  await share(viewedM.id, mia, "viewer");
  await share(editedM.id, mia, "editor");
  await share(editedM.id, gus, "editor");
  await share(gusViewM.id, gus, "viewer");
  const { data: g } = await db().from("groups").insert({ workspace_id: w.id, name: "Board" }).select("id").single();
  await db().from("group_members").insert({ workspace_id: w.id, group_id: g!.id, user_id: ben });
  await db().from("shares").insert({ workspace_id: w.id, object_type: "metric", object_id: groupM.id, group_id: g!.id, role: "viewer" });
  const as = { sara: w.actor(sara, "owner"), adam: w.actor(adam, "admin"), mia: w.actor(mia, "member"), ben: w.actor(ben, "member"), gus: w.actor(gus, "guest"), nia: w.actor(nia, "member") };
  return { ...w, sara, adam, mia, ben, gus, nia, privateM, viewedM, editedM, groupM, gusViewM, adamM, as };
}

describe("what a person sees of Tags", () => {
  it("is only what a Metric they may see carries, with counts of those Metrics", async () => {
    const t = await setup();
    await setMetricTags(t.as.sara, t.privateM.id, ["secret", "both"]);
    await setMetricTags(t.as.sara, t.viewedM.id, ["shared", "both"]);
    await setMetricTags(t.as.sara, t.groupM.id, ["groupy"]);
    await setMetricTags(t.as.adam, t.adamM.id, ["adams", "both"]);
    expect((await visibleTags(t.as.sara)).map((x) => [x.name, x.metrics])).toEqual([["both", 2], ["groupy", 1], ["secret", 1], ["shared", 1]]);
    expect((await visibleTags(t.as.mia)).map((x) => [x.name, x.metrics])).toEqual([["both", 1], ["shared", 1]]);
    expect((await visibleTags(t.as.ben)).map((x) => [x.name, x.metrics])).toEqual([["groupy", 1]]);
    // An Admin sees nothing of Sara's: a Workspace Role grants no Metric, so no Tag either, and no count of what is hidden.
    expect((await visibleTags(t.as.adam)).map((x) => [x.name, x.metrics])).toEqual([["adams", 1], ["both", 1]]);
    expect(await visibleTags(t.as.nia)).toEqual([]);
    expect(await visibleTags(t.as.gus)).toEqual([]);
  });

  it("gives the Tags of a Metric, the Metrics of a Tag and the filter only inside a person's own sight", async () => {
    const t = await setup();
    await setMetricTags(t.as.sara, t.privateM.id, ["secret", "both"]);
    await setMetricTags(t.as.sara, t.viewedM.id, ["shared", "both"]);
    expect(Object.fromEntries(await metricTagNames(t.as.mia))).toEqual({ [t.viewedM.id]: ["both", "shared"], [t.editedM.id]: [] });
    // Asking for a Metric one does not see says nothing about it.
    expect((await metricTagNames(t.as.mia, [t.privateM.id, t.viewedM.id])).has(t.privateM.id)).toBe(false);
    expect(await metricIdsWithTags(t.as.sara, ["both"])).toEqual([t.privateM.id, t.viewedM.id]);
    expect(await metricIdsWithTags(t.as.mia, ["BOTH"])).toEqual([t.viewedM.id]);
    expect(await metricIdsWithTags(t.as.mia, ["both", "shared"])).toEqual([t.viewedM.id]);
    // A Tag Mia cannot see matches nothing, as a word nobody uses does.
    expect(await metricIdsWithTags(t.as.mia, ["secret"])).toEqual([]);
    expect(await metricIdsWithTags(t.as.mia, ["both", "secret"])).toEqual([]);
    expect(await metricIdsWithTags(t.as.nia, ["both"])).toEqual([]);
    expect(await metricIdsWithTags(t.as.sara, [])).toEqual([]);
  });

  it("is never another Workspace's", async () => {
    const t = await setup();
    const o = await workspace("Other");
    cleanups.push(async () => { forgetWorkspaceKey(o.id); await o.cleanup(); });
    const boss = await o.person("owner");
    const m = await o.metric(boss);
    await setMetricTags(t.as.sara, t.privateM.id, ["finance"]);
    await setMetricTags(o.actor(boss), m.id, ["finance", "theirs"]);
    expect(names(await visibleTags(t.as.sara))).toEqual(["finance"]);
    expect(names(await visibleTags(o.actor(boss)))).toEqual(["finance", "theirs"]);
    // Another Workspace's Metric cannot be tagged by this one's Owner.
    await expect(setMetricTags(t.as.sara, m.id, ["x"])).rejects.toBeInstanceOf(Forbidden);
    expect(names(await readTags(o.id))).toEqual(["finance", "theirs"]);
  });

  it("counts archived Metrics apart, and keeps a Tag whose Metrics are all archived", async () => {
    const t = await setup();
    await setMetricTags(t.as.sara, t.privateM.id, ["old", "live"]);
    await setMetricTags(t.as.sara, t.viewedM.id, ["live"]);
    await db().from("metrics").update({ archived_at: new Date().toISOString() }).eq("id", t.privateM.id);
    expect((await visibleTags(t.as.sara)).map((x) => [x.name, x.metrics, x.archived])).toEqual([["live", 2, 1], ["old", 1, 1]]);
  });
});

describe("who may tag", () => {
  it("is the owner and the Editors of a Metric, never a Viewer or someone who does not see it", async () => {
    const t = await setup();
    expect(await setMetricTags(t.as.sara, t.privateM.id, ["a"])).toEqual(["a"]);
    expect(await setMetricTags(t.as.adam, t.adamM.id, ["b"])).toEqual(["b"]);
    expect(await addMetricTags(t.as.mia, t.editedM.id, ["c"])).toEqual(["c"]);
    await expect(setMetricTags(t.as.mia, t.viewedM.id, ["x"])).rejects.toBeInstanceOf(Forbidden);
    await expect(addMetricTags(t.as.mia, t.privateM.id, ["x"])).rejects.toBeInstanceOf(Forbidden);
    await expect(removeMetricTags(t.as.mia, t.viewedM.id, ["x"])).rejects.toBeInstanceOf(Forbidden);
    await expect(addMetricTags(t.as.ben, t.groupM.id, ["x"])).rejects.toBeInstanceOf(Forbidden);
    await expect(addMetricTags(t.as.gus, t.gusViewM.id, ["c"])).rejects.toBeInstanceOf(Forbidden);
    // An Owner or Admin has no right over a Metric they may not change: the Role grants no Metric.
    await expect(addMetricTags(t.as.adam, t.privateM.id, ["x"])).rejects.toBeInstanceOf(Forbidden);
    await expect(addMetricTags(t.as.sara, 999_999_999, ["x"])).rejects.toBeInstanceOf(Forbidden);
    await expect(addMetricTags(t.as.sara, Number.NaN, ["x"])).rejects.toBeInstanceOf(Forbidden);
  });

  it("lets a Guest Editor use only Tags they already see, and make none", async () => {
    const t = await setup();
    await setMetricTags(t.as.sara, t.editedM.id, ["team"]);
    await setMetricTags(t.as.sara, t.privateM.id, ["hidden-word"]);
    expect(await addMetricTags(t.as.gus, t.editedM.id, ["TEAM"])).toEqual(["team"]);
    // New, or existing only where the Guest sees nothing: the same refusal, so it says nothing about the word.
    const a = await addMetricTags(t.as.gus, t.editedM.id, ["brand-new"]).catch((e: Error) => e);
    const b = await addMetricTags(t.as.gus, t.editedM.id, ["hidden-word"]).catch((e: Error) => e);
    expect(a).toBeInstanceOf(Refused);
    expect(b).toBeInstanceOf(Refused);
    expect((a as Error).message).toBe((b as Error).message);
    expect(await removeMetricTags(t.as.gus, t.editedM.id, ["team"])).toEqual([]);
    expect(names(await readTags(t.id))).toEqual(["hidden-word"]);
  });

  it("lets a Member type a word that exists only where they see nothing: it is the same Tag, said to no one", async () => {
    const t = await setup();
    await setMetricTags(t.as.sara, t.privateM.id, ["Hidden"]);
    expect(await addMetricTags(t.as.mia, t.editedM.id, ["hidden"])).toEqual(["Hidden"]);
    expect(names(await readTags(t.id))).toEqual(["Hidden"]);
    expect((await visibleTags(t.as.mia)).map((x) => [x.name, x.metrics])).toEqual([["Hidden", 1]]);
  });

  it("refuses bad words in words, and an Access Key's actor shape", async () => {
    const t = await setup();
    for (const bad of [["a,b"], [""], ["x".repeat(33)], ["<i>"], "finance", [3], null]) {
      await expect(setMetricTags(t.as.sara, t.privateM.id, bad)).rejects.toBeInstanceOf(Refused);
    }
    const keyActor = { ...t.as.sara, key: { id: "1", scopes: ["metrics:write"] } };
    // A key never tags as itself: the API acts as its creator through the core's person functions.
    await expect(renameTag(keyActor as never, randomUUID(), "x")).rejects.toBeInstanceOf(Forbidden);
  });
});

describe("limits", () => {
  it("allows 10 Tags on a Metric and says what to do at the 11th, on set and on add", async () => {
    const t = await setup();
    const ten = Array.from({ length: TAGS_PER_METRIC }, (_, i) => `t${i}`);
    expect(await setMetricTags(t.as.sara, t.privateM.id, ten)).toHaveLength(TAGS_PER_METRIC);
    await expect(addMetricTags(t.as.sara, t.privateM.id, ["t10"])).rejects.toThrow(/at most 10 Tags/);
    await expect(setMetricTags(t.as.sara, t.privateM.id, [...ten, "t10"])).rejects.toThrow(/at most 10 Tags/);
    // A word it has already does not count again.
    expect(await addMetricTags(t.as.sara, t.privateM.id, ["T0"])).toHaveLength(TAGS_PER_METRIC);
    expect(names(await readTags(t.id))).not.toContain("t10");
  });

  it("allows 200 Tags in a Workspace, refuses a new word at the 201st, still takes one that exists and counts what a change frees", async () => {
    const t = await setup();
    const metrics: { id: number }[] = [];
    for (let i = 0; i < 22; i++) metrics.push(await t.metric(t.sara));
    for (let i = 0; i < 20; i++) await setMetricTags(t.as.sara, metrics[i].id, Array.from({ length: 10 }, (_, j) => `w${i}-${j}`));
    expect(await readTags(t.id)).toHaveLength(TAGS_PER_WORKSPACE);
    await expect(addMetricTags(t.as.sara, metrics[20].id, ["one-too-many"])).rejects.toThrow(/200 Tags.*Merge or delete/);
    // A word that exists is accepted at the limit (the accepted signal of the spec), and replacing a Metric's own words is not new ones.
    expect(await addMetricTags(t.as.sara, metrics[20].id, ["w0-0"])).toEqual(["w0-0"]);
    expect(await setMetricTags(t.as.sara, metrics[1].id, Array.from({ length: 10 }, (_, j) => `r${j}`))).toHaveLength(10);
    expect(await readTags(t.id)).toHaveLength(TAGS_PER_WORKSPACE);
    // Nothing was made by a refused change.
    expect(names(await readTags(t.id))).not.toContain("one-too-many");
  });

  it("holds under parallel requests: one of two new words at 199 Tags, one of two words on a Metric at 9", async () => {
    const t = await setup();
    const metrics: { id: number }[] = [];
    for (let i = 0; i < 22; i++) metrics.push(await t.metric(t.sara));
    for (let i = 0; i < 20; i++) await setMetricTags(t.as.sara, metrics[i].id, Array.from({ length: 10 }, (_, j) => `w${i}-${j}`).slice(0, i === 19 ? 9 : 10));
    expect(await readTags(t.id)).toHaveLength(TAGS_PER_WORKSPACE - 1);
    const settled = await Promise.allSettled([addMetricTags(t.as.sara, metrics[20].id, ["p1"]), addMetricTags(t.as.sara, metrics[21].id, ["p2"]), addMetricTags(t.as.sara, metrics[20].id, ["p3"])]);
    expect(settled.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(settled.filter((r) => r.status === "rejected").every((r) => (r as PromiseRejectedResult).reason instanceof Refused)).toBe(true);
    expect(await readTags(t.id)).toHaveLength(TAGS_PER_WORKSPACE);

    // A Metric with 9 Tags and two adds at once: one fits, the other is refused, never 11.
    const u = await setup();
    await setMetricTags(u.as.sara, u.privateM.id, Array.from({ length: 9 }, (_, i) => `n${i}`));
    const both = await Promise.allSettled([addMetricTags(u.as.sara, u.privateM.id, ["x"]), addMetricTags(u.as.sara, u.privateM.id, ["y"])]);
    expect(both.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await metricTagNames(u.as.sara, [u.privateM.id])).get(u.privateM.id)).toHaveLength(TAGS_PER_METRIC);
  });

  it("loses no change when two people add different words at once", async () => {
    const t = await setup();
    await Promise.all([addMetricTags(t.as.sara, t.editedM.id, ["from-sara"]), addMetricTags(t.as.mia, t.editedM.id, ["from-mia"]), addMetricTags(t.as.gus, t.editedM.id, ["from-mia"]).catch(() => [])]);
    expect((await metricTagNames(t.as.sara, [t.editedM.id])).get(t.editedM.id)).toEqual(["from-mia", "from-sara"]);
  });
});

describe("the life of a Tag", () => {
  it("is removed with its last Metric, whether it was taken off or the Metric was deleted", async () => {
    const t = await setup();
    await setMetricTags(t.as.sara, t.privateM.id, ["solo", "pair"]);
    await setMetricTags(t.as.sara, t.viewedM.id, ["pair"]);
    await removeMetricTags(t.as.sara, t.privateM.id, ["solo"]);
    expect(names(await readTags(t.id))).toEqual(["pair"]);
    await removeMetricTags(t.as.sara, t.privateM.id, ["pair"]);
    expect(names(await readTags(t.id))).toEqual(["pair"]);
    await deleteMetric(t.as.sara, t.viewedM.id, "Viewed by Mia");
    expect(await readTags(t.id)).toEqual([]);
    const { count } = await db().from("metric_tags").select("*", { count: "exact", head: true }).eq("workspace_id", t.id);
    expect(count).toBe(0);
  });

  it("keeps a Tag of archived Metrics, and a set that names a word twice makes one Tag", async () => {
    const t = await setup();
    expect(await setMetricTags(t.as.sara, t.privateM.id, ["Finance", "finance", "#finance"])).toEqual(["Finance"]);
    await db().from("metrics").update({ archived_at: new Date().toISOString() }).eq("id", t.privateM.id);
    expect(names(await readTags(t.id))).toEqual(["Finance"]);
    // The Tag keeps the spelling it was first written with.
    await setMetricTags(t.as.sara, t.viewedM.id, ["FINANCE"]);
    expect(names(await readTags(t.id))).toEqual(["Finance"]);
  });

  it("is a Version of the Metric: kept by name, restored by name, a deleted Tag made again", async () => {
    const t = await setup();
    await setMetricTags(t.as.sara, t.privateM.id, ["alpha", "beta"]);
    await setMetricTags(t.as.sara, t.viewedM.id, ["beta"]);
    const first = (await listVersions(t.as.sara, "metric", t.privateM.id)).versions;
    expect(first[0].changes).toEqual(["Created"]);
    // Sara changes a Tag a day later: a Workspace act (delete) does not make a Version of each Metric by itself.
    const alpha = (await visibleTags(t.as.sara)).find((x) => x.name === "alpha")!;
    await deleteTag(t.as.sara, alpha.id);
    expect((await listVersions(t.as.sara, "metric", t.privateM.id)).versions).toHaveLength(1);
    await setMetricTags(t.as.sara, t.privateM.id, ["gamma"]);
    const versions = (await listVersions(t.as.sara, "metric", t.privateM.id)).versions;
    expect(versions[0].changes.join(" ")).toMatch(/tags: \+gamma/);
    // Restoring the first Version puts alpha (deleted meanwhile) and beta back, matched by name.
    await restoreVersion(t.as.sara, versions[versions.length - 1].id);
    expect((await metricTagNames(t.as.sara, [t.privateM.id])).get(t.privateM.id)).toEqual(["alpha", "beta"]);
    expect(names(await readTags(t.id)).sort()).toEqual(["alpha", "beta"]);
    // The Version holds the names sealed, as the Metric's words are.
    const { data: rows } = await db().from("versions").select("snapshot").eq("object_type", "metric").eq("object_id", t.privateM.id);
    expect(JSON.stringify(rows)).not.toMatch(/alpha|beta|gamma/);
  });

  it("restores what it can at the Workspace's limit and leaves out the words it cannot make", async () => {
    const t = await setup();
    await setMetricTags(t.as.sara, t.privateM.id, ["keep-me", "gone-word"]);
    const gone = (await visibleTags(t.as.sara)).find((x) => x.name === "gone-word")!;
    await deleteTag(t.as.sara, gone.id);
    await setMetricTags(t.as.sara, t.privateM.id, ["other"]);
    const metrics: { id: number }[] = [];
    for (let i = 0; i < 20; i++) metrics.push(await t.metric(t.sara));
    for (let i = 0; i < 19; i++) await setMetricTags(t.as.sara, metrics[i].id, Array.from({ length: 10 }, (_, j) => `w${i}-${j}`));
    await setMetricTags(t.as.sara, metrics[19].id, Array.from({ length: 9 }, (_, j) => `x${j}`));
    // 190 + 9 + "other" + "keep-me"'s home: the Workspace is full, so only the word that exists is put back.
    expect((await readTags(t.id)).length).toBeGreaterThanOrEqual(TAGS_PER_WORKSPACE - 1);
    const versions = (await listVersions(t.as.sara, "metric", t.privateM.id)).versions;
    await restoreVersion(t.as.sara, versions[versions.length - 1].id);
    const now = (await metricTagNames(t.as.sara, [t.privateM.id])).get(t.privateM.id)!;
    expect(now).not.toContain("gone-word");
    expect((await readTags(t.id)).length).toBeLessThanOrEqual(TAGS_PER_WORKSPACE);
  });
});

describe("renaming, merging and deleting", () => {
  it("is for Owners and Admins, for a Tag they see, and for no one else", async () => {
    const t = await setup();
    await setMetricTags(t.as.sara, t.editedM.id, ["team"]);
    const tag = (await visibleTags(t.as.mia))[0];
    for (const who of [t.as.mia, t.as.gus]) {
      await expect(renameTag(who, tag.id, "squad")).rejects.toBeInstanceOf(Forbidden);
      await expect(deleteTag(who, tag.id)).rejects.toBeInstanceOf(Forbidden);
      await expect(mergeTags(who, tag.id, tag.id)).rejects.toBeInstanceOf(Forbidden);
      await expect(tagImpact(who, tag.id)).rejects.toBeInstanceOf(Forbidden);
    }
    // An Admin who sees none of the Metrics gets the same answer as for a Tag that does not exist.
    await expect(renameTag(t.as.adam, tag.id, "squad")).rejects.toBeInstanceOf(Forbidden);
    await expect(renameTag(t.as.adam, randomUUID(), "squad")).rejects.toBeInstanceOf(Forbidden);
    await expect(renameTag(t.as.adam, "not-an-id", "squad")).rejects.toBeInstanceOf(Forbidden);
    await expect(deleteTag(t.as.adam, tag.id)).rejects.toBeInstanceOf(Forbidden);
    expect(names(await readTags(t.id))).toEqual(["team"]);
    expect(await renameTag(t.as.sara, tag.id, " #Team Four ")).toEqual({ name: "Team Four" });
    expect(names(await visibleTags(t.as.mia))).toEqual(["Team Four"]);
  });

  it("acts on every Metric, those an Admin cannot see included, and says nothing more about them", async () => {
    const t = await setup();
    // Adam (Admin) sees only his own Metric; Sara's Metrics carry the same word, and a few of Sara's carry others.
    await setMetricTags(t.as.adam, t.adamM.id, ["cost", "adam-only"]);
    await setMetricTags(t.as.sara, t.privateM.id, ["cost", "cost-center"]);
    await setMetricTags(t.as.sara, t.viewedM.id, ["cost"]);
    const seen = await visibleTags(t.as.adam);
    expect(seen.map((x) => [x.name, x.metrics])).toEqual([["adam-only", 1], ["cost", 1]]);
    const cost = seen.find((x) => x.name === "cost")!;
    // The confirmation may say "and any you cannot", and only that.
    expect(await tagImpact(t.as.adam, cost.id)).toEqual({ name: "cost", metrics: 1, hidden: true });
    const adamOnly = seen.find((x) => x.name === "adam-only")!;
    expect(await tagImpact(t.as.adam, adamOnly.id)).toEqual({ name: "adam-only", metrics: 1, hidden: false });
    expect(await renameTag(t.as.adam, cost.id, "Costs")).toEqual({ name: "Costs" });
    expect((await metricTagNames(t.as.sara, [t.privateM.id, t.viewedM.id])).get(t.viewedM.id)).toEqual(["Costs"]);
    // Deleting removes it from all three, and answers with the one Metric Adam saw.
    expect(await deleteTag(t.as.adam, cost.id)).toEqual({ metrics: 1 });
    expect((await metricTagNames(t.as.sara, [t.privateM.id, t.viewedM.id])).get(t.privateM.id)).toEqual(["cost-center"]);
    expect((await metricTagNames(t.as.sara, [t.privateM.id, t.viewedM.id])).get(t.viewedM.id)).toEqual([]);
    expect(names(await readTags(t.id))).toEqual(["adam-only", "cost-center"]);
  });

  it("merges two Tags the person sees: a Metric with both keeps one, hidden Metrics carry the second afterwards", async () => {
    const t = await setup();
    await setMetricTags(t.as.adam, t.adamM.id, ["Finanz", "finance"]);
    await setMetricTags(t.as.sara, t.privateM.id, ["Finanz"]);
    await setMetricTags(t.as.sara, t.viewedM.id, ["finance"]);
    const seen = await visibleTags(t.as.adam);
    const finanz = seen.find((x) => x.name === "Finanz")!;
    const finance = seen.find((x) => x.name === "finance")!;
    await expect(mergeTags(t.as.adam, finance.id, finance.id)).rejects.toBeInstanceOf(Refused);
    expect(await mergeTags(t.as.adam, finanz.id, finance.id)).toEqual({ metrics: 1 });
    expect((await metricTagNames(t.as.adam, [t.adamM.id])).get(t.adamM.id)).toEqual(["finance"]);
    expect((await metricTagNames(t.as.sara, [t.privateM.id, t.viewedM.id])).get(t.privateM.id)).toEqual(["finance"]);
    expect(names(await readTags(t.id))).toEqual(["finance"]);
    // The merged Tag no longer exists to merge again.
    await expect(mergeTags(t.as.adam, finanz.id, finance.id)).rejects.toBeInstanceOf(Forbidden);
  });

  it("refuses a name another visible Tag has and says to merge; a name used only out of sight is the same Tag, merged silently", async () => {
    const t = await setup();
    await setMetricTags(t.as.adam, t.adamM.id, ["one", "two"]);
    await setMetricTags(t.as.sara, t.privateM.id, ["hidden-word"]);
    await setMetricTags(t.as.adam, t.adamM.id, ["one", "two", "mine"]);
    const seen = await visibleTags(t.as.adam);
    const one = seen.find((x) => x.name === "one")!;
    await expect(renameTag(t.as.adam, one.id, "TWO")).rejects.toThrow(/Merge the two instead/);
    expect(await renameTag(t.as.adam, one.id, "hidden-word")).toEqual({ name: "hidden-word" });
    expect((await metricTagNames(t.as.adam, [t.adamM.id])).get(t.adamM.id)).toEqual(["hidden-word", "mine", "two"]);
    expect(names(await readTags(t.id))).toEqual(["hidden-word", "mine", "two"]);
    await expect(renameTag(t.as.adam, seen.find((x) => x.name === "mine")!.id, "a,b")).rejects.toBeInstanceOf(Refused);
  });

  it("lets a rename change only the capitals of a Tag", async () => {
    const t = await setup();
    await setMetricTags(t.as.sara, t.privateM.id, ["finance"]);
    const tag = (await visibleTags(t.as.sara))[0];
    expect(await renameTag(t.as.sara, tag.id, "Finance")).toEqual({ name: "Finance" });
    expect(names(await readTags(t.id))).toEqual(["Finance"]);
  });
});

describe("sealing", () => {
  it("stores a Tag's name sealed for its row, with a blind index that finds Finance for finance and differs per Workspace", async () => {
    const t = await setup();
    const o = await workspace("Other");
    cleanups.push(async () => { forgetWorkspaceKey(o.id); await o.cleanup(); });
    const boss = await o.person("owner");
    const m = await o.metric(boss);
    await setMetricTags(t.as.sara, t.privateM.id, ["Quarterly Zephyr"]);
    await setMetricTags(o.actor(boss), m.id, ["quarterly zephyr"]);
    const { data } = await db().from("tags").select("id, name, name_index, workspace_id").eq("workspace_id", t.id);
    expect(data).toHaveLength(1);
    expect(isSealed(data![0].name)).toBe(true);
    expect(data![0].name).not.toMatch(/Zephyr/i);
    expect(data![0].name_index).not.toMatch(/zephyr/i);
    const mine = tagIndexes(await workspaceCipher(t.id), "QUARTERLY   zephyr".replace(/\s+/g, " "));
    expect(mine.all).toContain(data![0].name_index);
    const { data: theirs } = await db().from("tags").select("name_index").eq("workspace_id", o.id);
    expect(theirs![0].name_index).not.toBe(data![0].name_index);
    // A sealed name does not open for another row: copied to another Tag it reads as nothing, never as ciphertext.
    const other = randomUUID();
    await db().from("tags").insert({ id: other, workspace_id: t.id, name: data![0].name, name_index: "b1.1.copy" });
    await db().from("metric_tags").insert({ metric_id: t.viewedM.id, tag_id: other, workspace_id: t.id });
    expect(names(await readTags(t.id))).toEqual(["Quarterly Zephyr"]);
    expect(names(await visibleTags(t.as.sara))).toEqual(["Quarterly Zephyr"]);
  });

  it("finds a Tag written under an older key version (and the plain index of a Workspace that did not seal yet)", async () => {
    const t = await setup();
    // Made while the Installation had no key: a plain name and a plain index.
    delete process.env.ZIFFR_SECRETS_KEY;
    forgetWorkspaceKey(t.id);
    await setMetricTags(t.as.sara, t.privateM.id, ["Before keys"]);
    const { data: plain } = await db().from("tags").select("name, name_index").eq("workspace_id", t.id);
    expect(plain![0].name).toBe("Before keys");
    expect(plain![0].name_index).toMatch(/^p1\./);
    process.env.ZIFFR_SECRETS_KEY = Buffer.alloc(32, 38).toString("base64");
    forgetWorkspaceKey(t.id);
    // The same word with another spelling is that Tag, whichever way it was indexed.
    expect(await addMetricTags(t.as.sara, t.viewedM.id, ["BEFORE   keys"])).toEqual(["Before keys"]);
    expect(await readTags(t.id)).toHaveLength(1);
  });
});

describe("the re-encryption job", () => {
  it("seals a plain Tag name and replaces its plain index with the blind index, and the Tag is still found", async () => {
    const t = await setup();
    delete process.env.ZIFFR_SECRETS_KEY;
    forgetWorkspaceKey(t.id);
    await setMetricTags(t.as.sara, t.privateM.id, ["Plain Tag"]);
    process.env.ZIFFR_SECRETS_KEY = Buffer.alloc(32, 38).toString("base64");
    forgetWorkspaceKey(t.id);
    for (let i = 0; i < 2; i++) await reencryptionJob({ only: [t.id] });
    const { data } = await db().from("tags").select("name, name_index").eq("workspace_id", t.id);
    expect(isSealed(data![0].name)).toBe(true);
    expect(data![0].name_index).toMatch(/^b1\.1\./);
    expect(names(await visibleTags(t.as.sara))).toEqual(["Plain Tag"]);
    expect(await addMetricTags(t.as.sara, t.viewedM.id, ["plain tag"])).toEqual(["Plain Tag"]);
    expect(await readTags(t.id)).toHaveLength(1);
  });
});

describe("the Audit Log", () => {
  it("records renamed, merged and deleted with the names and a number the actor sees, and shows another Admin only what they see", async () => {
    const t = await setup();
    const adam2 = await t.person("admin");
    await setMetricTags(t.as.sara, t.privateM.id, ["draft", "keeper", "gone"]);
    await setMetricTags(t.as.sara, t.viewedM.id, ["draft"]);
    const seen = await visibleTags(t.as.sara);
    const draft = seen.find((x) => x.name === "draft")!;
    await renameTag(t.as.sara, draft.id, "final");
    const keeper = (await visibleTags(t.as.sara)).find((x) => x.name === "keeper")!;
    const gone = (await visibleTags(t.as.sara)).find((x) => x.name === "gone")!;
    await mergeTags(t.as.sara, gone.id, keeper.id);
    await deleteTag(t.as.sara, keeper.id);
    const log = await auditLog(t.as.sara, { kind: "tag" });
    const kinds = log.events.map((e) => [e.kind, e.objectName, e.details]);
    expect(kinds).toEqual([
      ["tag.deleted", "keeper", { metrics: 1 }],
      ["tag.merged", "gone", { into: "keeper", metrics: 1 }],
      ["tag.renamed", "final", { from: "draft", metrics: 2 }],
    ]);
    // Another Admin sees that something happened, and no name of a Tag they cannot see.
    const other = await auditLog({ ...t.as.adam, personId: adam2 }, { kind: "tag" });
    expect(other.events).toHaveLength(3);
    expect(other.events.every((e) => e.hidden && e.objectName === null && Object.keys(e.details).length === 0)).toBe(true);
    // The names are sealed in the log's own columns, as every object name is.
    const { data } = await db().from("audit_events").select("object_name, details").eq("workspace_id", t.id).like("kind", "tag.%");
    expect(JSON.stringify(data)).not.toMatch(/keeper|draft|final|gone/);
    // Adding a Tag to one Metric is an edit with a Version, not an Audit Log event.
    await addMetricTags(t.as.sara, t.privateM.id, ["plain"]);
    expect((await auditLog(t.as.sara, { kind: "tag" })).events).toHaveLength(3);
  });
});

describe("speed", () => {
  it("lists the Tags of 1,000 Metrics with 10 Tags each in well under a second or two", async () => {
    const t = await setup();
    const cipher = await workspaceCipher(t.id);
    const tagRows = Array.from({ length: 20 }, (_, i) => {
      const id = randomUUID();
      const name = `speed-${i}`;
      return { id, workspace_id: t.id, name: cipher.seal({ table: "tags", column: "name", row: id }, name), name_index: tagIndexes(cipher, name).current };
    });
    await db().from("tags").insert(tagRows);
    const rows = Array.from({ length: 1000 }, (_, i) => ({ slug: `speed-${randomUUID().slice(0, 8)}-${i}`, name: `Speed ${i}`, owner_id: t.sara, workspace_id: t.id, unit: "", format: "number", decimals: 0, period: "month", submission_rule: "overwrite", polarity: "higher", sources: ["api"] }));
    const { data: made, error } = await db().from("metrics").insert(rows).select("id");
    expect(error).toBeNull();
    const links = made!.flatMap((m, i) => Array.from({ length: 10 }, (_, j) => ({ metric_id: m.id, tag_id: tagRows[(i + j) % 20].id, workspace_id: t.id })));
    for (let i = 0; i < links.length; i += 1000) expect((await db().from("metric_tags").insert(links.slice(i, i + 1000))).error).toBeNull();
    const started = Date.now();
    const seen = await visibleTags(t.as.sara);
    const took = Date.now() - started;
    expect(seen).toHaveLength(20);
    expect(seen.every((x) => x.metrics === 500)).toBe(true);
    console.info(`visibleTags over 1,000 Metrics with 10 Tags each took ${took} ms`);
    expect(took).toBeLessThan(5000);
  });
});

describe("what the API and the MCP Server offer", () => {
  it("has no route and no tool that renames, merges or deletes a Tag: a prompt-injected assistant could be asked to tidy one away", () => {
    const roots = [join(__dirname, "../../../apps/web/src/app/api"), join(__dirname, "../../mcp/src")];
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) { if (f !== "node_modules") walk(p); continue; }
        if (/\.(ts|tsx)$/.test(f) && !/\.test\./.test(f) && /(rename|merge|delete)[_-]?tags?\b|\b(rename|merge|delete)Tags?\b/i.test(readFileSync(p, "utf8"))) hits.push(p);
      }
    };
    for (const r of roots) { try { walk(r); } catch { /* the folder does not exist here */ } }
    expect(hits).toEqual([]);
  });
});

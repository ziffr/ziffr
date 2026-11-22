// Tags in Packs against the real database (spec 0038, ticket 6; GLOSSARY: Tag, Pack, Metric Catalog): an entry's Tags are stored
// with the entry (installing and updating), a Metric made from it by Set up or from the Metric Catalog gets them through the
// Tags core as the person who made it, a limit leaves words out and never the Metric, a hostile Tag in a file is refused
// before anything is stored, and Export as Pack carries only Tags the exporter sees, on Metrics they picked.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { createMetric } from "./metrics";
import { tagsLeftOffEntry } from "./pack-tags";
import { exportPack, type ExportManifest } from "./pack-export";
import { packSetupOptions, setUpFromPack } from "./pack-setup";
import { updatePackFile } from "./pack-updates";
import { installPackFile } from "./packs";
import { metricTagNames } from "./tag-sight";
import { readTags } from "./tag-rows";
import { TAGS_PER_WORKSPACE } from "./tag-names";
import { setMetricTags } from "./tags";
import { workspace } from "./test/db-fixtures";
import { forgetWorkspaceKey } from "./workspace-keys";
import { METRIC } from "./pack-files.test";
import { PACK } from "./pack.test";

const saved = process.env.ZIFFR_SECRETS_KEY;
const cleanups: (() => Promise<void>)[] = [];
beforeEach(() => { process.env.ZIFFR_SECRETS_KEY = Buffer.alloc(32, 61).toString("base64"); });
afterEach(async () => {
  for (const c of cleanups.splice(0)) await c().catch(() => {});
  if (saved === undefined) delete process.env.ZIFFR_SECRETS_KEY;
  else process.env.ZIFFR_SECRETS_KEY = saved;
}, 120_000);
const yes = { unsigned: true, assistantTexts: true };
const MANIFEST: ExportManifest = { id: "northwind/board", name: "Board pack", version: "1.0.0", summary: "What the board sees.", author: "Northwind", license: "CC-BY-4.0" };

async function ws(name = "Pack tags") {
  const w = await workspace(name);
  cleanups.push(async () => { forgetWorkspaceKey(w.id); await w.cleanup(); });
  return w;
}
const entry = (name: string, tags?: unknown) => ({ ...METRIC, name, industries: undefined, segments: undefined, category: undefined, ...(tags === undefined ? {} : { tags }) });
/** A small Pack of three entries: two with Tags, and a Derived one with one. */
const pack = (over: Record<string, unknown> = {}, version = "1.0.0") => JSON.stringify({
  ...PACK, version, listing: undefined, contents: {
    metrics: [
      { key: "mrr", metric: entry("MRR", ["finance", "monthly review"]) },
      { key: "customers", metric: { ...entry("Customers"), name: "Customers", tags: ["finance", "growth"] } },
      { key: "arpa", metric: { format: "ziffr.metric/1", name: "Revenue per account", period: "month", aggregation: "last", polarity: "higher", formula: "{mrr} / {customers}", tags: ["unit economics"] } },
    ],
  }, ...over,
});
const tagsOf = async (w: Awaited<ReturnType<typeof ws>>, actor: Parameters<typeof metricTagNames>[0], ids: number[]) => Object.fromEntries([...(await metricTagNames(actor, ids))].map(([id, t]) => [id, t]));
const entryRow = async (installId: number, key: string) => (await db().from("catalog_metrics").select("tags, pack_hash").eq("pack_install_id", installId).eq("pack_key", key).single()).data!;

describe("Tags stored with an entry", () => {
  it("installing keeps an entry's Tags in the same step, and an entry without Tags has none", async () => {
    const w = await ws(); const sara = await w.person("owner");
    const id = await installPackFile(w.actor(sara), pack(), yes);
    expect((await entryRow(id, "mrr")).tags).toEqual(["finance", "monthly review"]);
    expect((await entryRow(id, "arpa")).tags).toEqual(["unit economics"]);
    const b = await ws("Other"); const zoe = await b.person("owner");
    const plain = await installPackFile(b.actor(zoe), JSON.stringify({ ...PACK, listing: undefined, contents: { metrics: [{ key: "mrr", metric: entry("MRR") }] } }), yes);
    expect((await entryRow(plain, "mrr")).tags).toBeNull();
  });

  it("an update brings the new version's Tags, takes them away when the new version has none, and does not call an untouched entry changed", async () => {
    const w = await ws(); const sara = await w.person("owner"); const actor = w.actor(sara);
    const id = await installPackFile(actor, pack(), yes);
    await updatePackFile(actor, id, JSON.stringify({ ...JSON.parse(pack({}, "1.1.0")), contents: { metrics: [
      { key: "mrr", metric: entry("MRR", ["finance"]) },
      { key: "customers", metric: entry("Customers") },
      { key: "arpa", metric: { format: "ziffr.metric/1", name: "Revenue per account", period: "month", aggregation: "last", polarity: "higher", formula: "{mrr} / {customers}", tags: ["margins", "unit economics"] } },
    ] } }), yes);
    expect((await entryRow(id, "mrr")).tags).toEqual(["finance"]);
    expect((await entryRow(id, "customers")).tags).toBeNull();
    expect((await entryRow(id, "arpa")).tags).toEqual(["margins", "unit economics"]);
  });

  it("refuses a hostile Tag in a Pack file before anything is stored: 6 Tags, a comma, 33 characters, markup, an address, a control character", async () => {
    const w = await ws(); const sara = await w.person("owner");
    for (const bad of [["a", "b", "c", "d", "e", "f"], ["a,b"], ["x".repeat(33)], ["<script>"], ["evil.com"], ["a\u0007b"], ["a", "A"], "finance", [{ $gt: "" }], [null]]) {
      await expect(installPackFile(w.actor(sara), pack({ contents: { metrics: [{ key: "mrr", metric: entry("MRR", bad) }] } }), yes), JSON.stringify(bad)).rejects.toThrow(/cannot be installed/);
    }
    expect((await db().from("pack_installs").select("id").eq("workspace_id", w.id)).data).toEqual([]);
    expect((await db().from("catalog_metrics").select("id").eq("workspace_id", w.id)).data).toEqual([]);
    // The database holds the limit too, whatever the core let through.
    const { error } = await db().from("catalog_metrics").insert({ workspace_id: w.id, category: "x", name: "x", description: "", unit: "", unit_position: "after", format: "number", decimals: 0, period: "month", submission_rule: "overwrite", polarity: "higher", sources: [], aggregation: "sum", tags: ["a", "b", "c", "d", "e", "f"] });
    expect(error?.code).toBe("23514");
    const long = await db().from("catalog_metrics").insert({ workspace_id: w.id, category: "x", name: "y", description: "", unit: "", unit_position: "after", format: "number", decimals: 0, period: "month", submission_rule: "overwrite", polarity: "higher", sources: [], aggregation: "sum", tags: ["x".repeat(33)] });
    expect(long.error?.code).toBe("23514");
    // The wrapped steps are not callable on their own.
    expect((await db().rpc("install_pack_untagged", { p_workspace: w.id, p_by: "x", p_install: {}, p_catalog: [], p_templates: [], p_designs: [], p_themes: [] })).error).toBeTruthy();
  });
});

describe("Set up from this Pack", () => {
  it("shows an entry's Tags, and puts them on the Metrics it makes as the person, matching a word that exists whatever its capitals", async () => {
    const w = await ws(); const sara = await w.person("owner"); const actor = w.actor(sara);
    const before = await w.metric(sara, { name: "Existing" });
    await setMetricTags(actor, before.id, ["Finance"]);
    const id = await installPackFile(actor, pack(), yes);
    const options = await packSetupOptions(actor, id);
    expect(options.entries.find((e) => e.key === "mrr")!.tags).toEqual(["finance", "monthly review"]);
    const made = await setUpFromPack(actor, id, { metrics: ["arpa"] });
    expect(made.tagsLeftOut).toEqual([]);
    const tags = await tagsOf(w, actor, made.metrics.map((m) => m.id));
    expect(Object.fromEntries(made.metrics.map((m) => [m.name, tags[m.id]]))).toEqual({
      MRR: ["Finance", "monthly review"], Customers: ["Finance", "growth"], "Revenue per account": ["unit economics"],
    });
    // One "Finance" Tag, in its first spelling; no link back to the entry, and each is a Version of its Metric.
    expect((await readTags(w.id)).map((t) => t.name).sort()).toEqual(["Finance", "growth", "monthly review", "unit economics"]);
    const { data: versions } = await db().from("versions").select("message").eq("workspace_id", w.id).eq("object_id", made.metrics[0].id).eq("object_type", "metric");
    expect((versions ?? []).some((v) => v.message === "Changed its Tags")).toBe(true);
  });

  it("at the Tag limit still makes every Metric, attaches the words that exist and says which were left out; nothing is half-made", async () => {
    const w = await ws(); const sara = await w.person("owner"); const actor = w.actor(sara);
    const fillers: { id: number }[] = [];
    for (let i = 0; i < 20; i++) fillers.push(await w.metric(sara));
    for (let i = 0; i < 20; i++) await setMetricTags(actor, fillers[i].id, i === 0 ? ["finance", ...Array.from({ length: 9 }, (_, j) => `w0-${j}`)] : Array.from({ length: 10 }, (_, j) => `w${i}-${j}`));
    expect(await readTags(w.id)).toHaveLength(TAGS_PER_WORKSPACE);
    const id = await installPackFile(actor, pack(), yes);
    const made = await setUpFromPack(actor, id, { metrics: ["arpa"] });
    expect(made.metrics.map((m) => m.name)).toEqual(["MRR", "Customers", "Revenue per account"]);
    const mrr = made.metrics.find((m) => m.name === "MRR")!;
    expect(await tagsLeftOffEntry(actor, mrr.id)).toEqual(["monthly review"]);
    expect(await tagsLeftOffEntry(actor, fillers[0].id)).toEqual([]);
    const nia = await w.person("member");
    expect(await tagsLeftOffEntry(w.actor(nia, "member"), mrr.id)).toEqual([]);
    expect(made.tagsLeftOut).toEqual([{ metric: "MRR", tags: ["monthly review"] }, { metric: "Customers", tags: ["growth"] }, { metric: "Revenue per account", tags: ["unit economics"] }]);
    const tags = await tagsOf(w, actor, made.metrics.map((m) => m.id));
    expect(made.metrics.map((m) => tags[m.id])).toEqual([["finance"], ["finance"], []]);
    expect(await readTags(w.id)).toHaveLength(TAGS_PER_WORKSPACE);
    expect((await db().from("metrics").select("id").eq("workspace_id", w.id)).data).toHaveLength(23);
  });

  it("is still for Owners and Admins only: a Member cannot set up, and so tags nothing through it", async () => {
    const w = await ws(); const sara = await w.person("owner"); const mia = await w.person("member");
    const id = await installPackFile(w.actor(sara), pack(), yes);
    await expect(setUpFromPack(w.actor(mia, "member"), id, { metrics: ["mrr"] })).rejects.toThrow();
    expect((await db().from("metrics").select("id").eq("workspace_id", w.id)).data).toEqual([]);
  });

  it("a Metric made from the Metric Catalog by a Member gets the entry's Tags too, and one entry's stored words that no longer pass are not put on", async () => {
    const w = await ws(); const sara = await w.person("owner"); const mia = await w.person("member");
    const id = await installPackFile(w.actor(sara), pack(), yes);
    const { data: row } = await db().from("catalog_metrics").select("id").eq("pack_install_id", id).eq("pack_key", "mrr").single();
    const made = await createMetric(w.actor(mia, "member"), { name: "My MRR", fromCatalogId: Number(row!.id), period: "month" });
    expect(made.tagsLeftOut).toEqual([]);
    expect((await tagsOf(w, w.actor(mia, "member"), [made.id]))[made.id]).toEqual(["finance", "monthly review"]);
    // A stored list that no longer meets the rules (written by something else) is no Tags, not half of them.
    await db().from("catalog_metrics").update({ tags: ["fine", "bad,one"] }).eq("id", row!.id);
    const again = await createMetric(w.actor(mia, "member"), { name: "My MRR 2", fromCatalogId: Number(row!.id), period: "month" });
    expect((await tagsOf(w, w.actor(mia, "member"), [again.id]))[again.id]).toEqual([]);
  });
});

describe("Export as Pack", () => {
  it("carries the Tags of the Metrics picked that the exporter sees, never a Tag only on a Metric not picked or hidden, and the Pack installs", async () => {
    const w = await ws(); const sara = await w.person("owner"); const mia = await w.person("member");
    const hers = await w.metric(mia, { name: "Mia's revenue" });
    const miaA = w.actor(mia, "member");
    await setMetricTags(miaA, hers.id, ["finance", "weekly"]);
    const notPicked = await w.metric(mia, { name: "Mia's other" });
    await setMetricTags(miaA, notPicked.id, ["not-picked-tag"]);
    const secret = await w.metric(sara, { name: "Sara's secret" });
    await setMetricTags(w.actor(sara, "owner"), secret.id, ["hidden-tag", "finance"]);
    const out = await exportPack(miaA, MANIFEST, { metrics: [hers.id, secret.id] });
    const file = JSON.parse(out.text);
    expect(file.contents.metrics).toHaveLength(1);
    expect(file.contents.metrics[0].metric.tags).toEqual(["finance", "weekly"]);
    expect(out.text).not.toContain("hidden-tag");
    expect(out.text).not.toContain("not-picked-tag");
    expect(out.leftOut).toEqual([{ name: `Metric ${secret.id}`, why: "You do not see it." }]);
    // Left out on request.
    const bare = await exportPack(miaA, MANIFEST, { metrics: [hers.id] }, { tags: false });
    expect(JSON.parse(bare.text).contents.metrics[0].metric.tags).toBeUndefined();
    // A Pack that another Workspace sets up: the same words come back on its Metrics.
    const b = await ws("B"); const zoe = await b.person("owner");
    const install = await installPackFile(b.actor(zoe), out.text, yes);
    const made = await setUpFromPack(b.actor(zoe), install, { metrics: [Object.keys(await entryKeys(install))[0]] });
    expect((await tagsOf(b, b.actor(zoe), [made.metrics[0].id]))[made.metrics[0].id]).toEqual(["finance", "weekly"]);
  });

  it("keeps 5 Tags of a Metric with more and says so, and leaves out a Tag a Pack may not hold without losing the entry", async () => {
    const w = await ws(); const sara = await w.person("owner"); const a = w.actor(sara, "owner");
    const m = await w.metric(sara, { name: "Busy" });
    await setMetricTags(a, m.id, ["a1", "b2", "c3", "d4", "e5", "f6", "shop.com", "g7"]);
    const out = await exportPack(a, MANIFEST, { metrics: [m.id] });
    const tags = JSON.parse(out.text).contents.metrics[0].metric.tags as string[];
    expect(tags).toHaveLength(5);
    expect(tags).not.toContain("shop.com");
    expect(out.leftOut).toHaveLength(1);
    expect(out.leftOut[0].name).toBe("Tags of Busy");
    expect(out.leftOut[0].why).toMatch(/at most 5 Tags/);
  });

  it("is the same file again for what an installed Pack added, Tags included", async () => {
    const w = await ws(); const sara = await w.person("owner");
    const id = await installPackFile(w.actor(sara), pack(), yes);
    const ids = ((await db().from("catalog_metrics").select("id").eq("pack_install_id", id)).data ?? []).map((r) => Number(r.id));
    const first = await exportPack(w.actor(sara, "owner"), MANIFEST, { catalog: ids });
    expect(JSON.parse(first.text).contents.metrics.find((x: { key: string }) => x.key === "mrr").metric.tags).toEqual(["finance", "monthly review"]);
    const b = await ws("B2"); const zoe = await b.person("owner");
    const again = await installPackFile(b.actor(zoe), first.text, yes);
    const idsB = ((await db().from("catalog_metrics").select("id").eq("pack_install_id", again)).data ?? []).map((r) => Number(r.id));
    expect((await exportPack(b.actor(zoe, "owner"), MANIFEST, { catalog: idsB })).text).toBe(first.text);
  });
});

async function entryKeys(installId: number) {
  const { data } = await db().from("catalog_metrics").select("pack_key").eq("pack_install_id", installId);
  return Object.fromEntries((data ?? []).map((r) => [String(r.pack_key), true]));
}

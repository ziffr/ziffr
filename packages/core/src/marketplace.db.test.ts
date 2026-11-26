// The Marketplace connection against the real database and a stub Marketplace (specs 0030 and 0059, #278, #1193):
// nothing leaves when it is off; searches, files and the update question carry no Workspace and no person; a file is
// taken only with a Signed Statement about it by a trusted key that is not revoked; only the reserve key revokes;
// answers too big or malformed are refused; and updates are asked for the whole Installation at once.
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { checkMarketplaceVersions, installFromMarketplace, marketplaceReportLinks, marketplaceTransport, marketplaceUpdates, readMarketplacePack, searchMarketplace, updateFromMarketplace, MarketplaceUnavailable } from "./marketplace";
import { listInstalledPacks } from "./packs";
import { updatePackFile } from "./pack-updates";
import { forgetStoredSettings } from "./settings-in-effect";
import { PACK } from "./pack.test";
import { testKeys } from "./test/marketplace-keys";
import { opened, workspace } from "./test/db-fixtures";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws(name?: string) { const w = await workspace(name); cleanups.push(w.cleanup); return w; }

const keys = testKeys();
const reserve = testKeys();
const TRUSTED = `signing:${keys.publicKey},reserve:${reserve.publicKey}`;
const NO_THEMES = { ...PACK, contents: { ...PACK.contents, themes: undefined, decks: undefined } };
const V120 = JSON.stringify(NO_THEMES);
const V130 = JSON.stringify({ ...NO_THEMES, version: "1.3.0", summary: "Version 1.3.0." });
type Sent = { method: string; url: string; body?: string };
let sent: Sent[] = [];
let answers: Record<string, () => { status: number; body: string; tooBig?: boolean }> = {};
const real = marketplaceTransport.request;
const env = { ...process.env };

beforeEach(async () => {
  sent = [];
  answers = {
    "GET /v1/packs": () => ({ status: 200, body: JSON.stringify({ packs: [
      { id: "ziffr/saas-metrics", name: "SaaS metrics", summary: "MRR and more.", author: "Ziffr", license: "CC-BY-4.0", version: "1.3.0" },
      { id: "someone/paid", name: "Paid", summary: "Costs money.", author: "Someone", license: "Ziffr-Pack-1.0", version: "1.0.0" },
      { id: "someone/evil", name: "<script>", summary: "x", author: "x", license: "MIT", version: "1.0.0" },
    ] }) }),
    "GET /v1/packs/ziffr/saas-metrics/versions/1.2.0": () => ({ status: 200, body: JSON.stringify(keys.version(V120)) }),
    "GET /v1/packs/ziffr/saas-metrics/versions/1.3.0": () => ({ status: 200, body: JSON.stringify(keys.version(V130)) }),
    "POST /v1/updates": () => ({ status: 200, body: JSON.stringify({ updates: [{ id: "ziffr/saas-metrics", version: "1.3.0" }, { id: "someone/not-installed", version: "9.0.0" }] }) }),
  };
  marketplaceTransport.request = async (url, init) => {
    sent.push({ method: init.method, url: url.href, body: init.body });
    const a = answers[`${init.method} ${url.pathname}`];
    return a ? { tooBig: false, ...a() } : { status: 404, body: "", tooBig: false };
  };
  Object.assign(process.env, { ZIFFR_MARKETPLACE: "on", ZIFFR_MARKETPLACE_URL: "https://market.example.com", ZIFFR_MARKETPLACE_PUBLIC_KEY: TRUSTED });
  forgetStoredSettings();
  await db().from("marketplace_checks").delete().eq("only_row", true);
  await db().from("marketplace_versions").delete().neq("pack_id", "");
  // Only this run's test keys: whatever else the database holds stays.
  await db().from("marketplace_revoked_keys").delete().in("key_id", [keys.id, reserve.id]);
});
afterAll(() => {
  marketplaceTransport.request = real;
  for (const k of ["ZIFFR_MARKETPLACE", "ZIFFR_MARKETPLACE_URL", "ZIFFR_MARKETPLACE_PUBLIC_KEY"]) { if (env[k] === undefined) delete process.env[k]; else process.env[k] = env[k]; }
});

describe("the Marketplace connection", () => {
  it("sends nothing when it is off", async () => {
    process.env.ZIFFR_MARKETPLACE = "off";
    const w = await ws(); const ann = await w.person("owner");
    await expect(searchMarketplace(w.actor(ann), "saas")).rejects.toThrow("connection is off");
    await expect(installFromMarketplace(w.actor(ann), "ziffr/saas-metrics", "1.2.0", { assistantTexts: true })).rejects.toThrow("connection is off");
    expect(await marketplaceUpdates(w.actor(ann))).toEqual([]);
    await checkMarketplaceVersions(true);
    expect(sent).toEqual([]);
  });

  it("lists free Packs whose every field passes, and sends only the search words", async () => {
    const w = await ws("Northwind"); const ann = await w.person("owner");
    const found = await searchMarketplace(w.actor(ann), "  saas   metrics ");
    expect(found.map((p) => p.id)).toEqual(["ziffr/saas-metrics"]);
    expect(sent).toEqual([{ method: "GET", url: "https://market.example.com/v1/packs?q=saas%20metrics", body: undefined }]);
  });

  it("links to the report form on a Preview and for installed Marketplace Packs, only while the connection is on", async () => {
    const w = await ws(); const ann = await w.person("owner"); const mia = await w.person("member"); const gus = await w.person("guest");
    const form = "https://market.example.com/packs/ziffr/saas-metrics/report?version=1.2.0";
    const read = await readMarketplacePack(w.actor(ann), "ziffr/saas-metrics", "1.2.0");
    expect(read.ok && read.preview.report).toBe(form);
    const id = await installFromMarketplace(w.actor(ann), "ziffr/saas-metrics", "1.2.0", { assistantTexts: true });
    sent = [];
    expect(await marketplaceReportLinks(w.actor(ann))).toEqual([{ installId: id, address: form }]);
    expect(await marketplaceReportLinks(w.actor(mia, "member"))).toHaveLength(1);
    expect(await marketplaceReportLinks(w.actor(gus, "guest"))).toEqual([]);
    const other = await ws(); const zoe = await other.person("owner");
    expect(await marketplaceReportLinks(other.actor(zoe))).toEqual([]);
    // Updated from a file, it is no longer the Marketplace's Pack.
    await updatePackFile(w.actor(ann), id, JSON.stringify({ ...NO_THEMES, version: "1.4.0" }), { unsigned: true, assistantTexts: true });
    expect(await marketplaceReportLinks(w.actor(ann))).toEqual([]);
    process.env.ZIFFR_MARKETPLACE = "off";
    expect(await marketplaceReportLinks(w.actor(ann))).toEqual([]);
    // A link is only built: nothing goes to the Marketplace.
    expect(sent).toEqual([]);
  });

  it("keeps a listing's mark of a new creator, and only a true one", async () => {
    const w = await ws(); const ann = await w.person("owner");
    const base = { name: "N", summary: "S.", author: "A", license: "MIT", version: "1.0.0" };
    answers["GET /v1/packs"] = () => ({ status: 200, body: JSON.stringify({ packs: [{ ...base, id: "a/new", newCreator: true, more: "ignored" }, { ...base, id: "a/old", newCreator: false }, { ...base, id: "a/odd", newCreator: "yes" }] }) });
    expect(await searchMarketplace(w.actor(ann), "")).toEqual([{ ...base, id: "a/new", newCreator: true }, { ...base, id: "a/old" }]);
    expect(sent.at(-1)!.url).toBe("https://market.example.com/v1/packs?q=");
  });

  it("remembers whether the statement says a moderator looked, from the Preview to the installed Pack and its updates", async () => {
    const w = await ws(); const ann = await w.person("owner");
    answers["GET /v1/packs/ziffr/saas-metrics/versions/1.2.0"] = () => ({ status: 200, body: JSON.stringify(keys.version(V120, { reviewed: true })) });
    const read = await readMarketplacePack(w.actor(ann), "ziffr/saas-metrics", "1.2.0");
    expect(read.ok && read.preview.reviewed).toBe(true);
    const id = await installFromMarketplace(w.actor(ann), "ziffr/saas-metrics", "1.2.0", { assistantTexts: true });
    expect((await listInstalledPacks(w.actor(ann)))[0].reviewed).toBe(true);
    // The next version's statement says nobody looked: the mark goes with it.
    await updateFromMarketplace(w.actor(ann), id, "1.3.0", { assistantTexts: true });
    expect((await listInstalledPacks(w.actor(ann)))[0]).toMatchObject({ version: "1.3.0", reviewed: false });
  });

  it("installs a Pack whose signature holds, as from the Marketplace, without the upload warning", async () => {
    const w = await ws(); const ann = await w.person("owner");
    const read = await readMarketplacePack(w.actor(ann), "ziffr/saas-metrics", "1.2.0");
    expect(read.ok && read.preview.unsigned).toBe(false);
    await installFromMarketplace(w.actor(ann), "ziffr/saas-metrics", "1.2.0", { assistantTexts: true });
    const [p] = await listInstalledPacks(w.actor(ann));
    expect(p).toMatchObject({ packId: "ziffr/saas-metrics", version: "1.2.0", source: "marketplace", signed: true });
    const events = await opened("audit_events", w.id, (await db().from("audit_events").select("id, details").eq("workspace_id", w.id).eq("kind", "pack.installed")).data, { dropId: true });
    expect(events).toEqual([{ details: { pack: "ziffr/saas-metrics", version: "1.2.0", source: "marketplace", signed: true } }]);
  });

  it("refuses a file whose statement does not hold, a file of another Pack, and answers too big or malformed", async () => {
    const w = await ws(); const ann = await w.person("owner");
    const cases: [string, () => { status: number; body: string; tooBig?: boolean }, string][] = [
      ["a changed file", () => ({ status: 200, body: JSON.stringify({ ...keys.version(V120), file: V120.replace("SaaS", "Evil") }) }), "other than the one it signed"],
      ["another hash", () => ({ status: 200, body: JSON.stringify(keys.version(V120, { sha256: "0".repeat(64) })) }), "other than the one it signed"],
      ["a broken signature", () => ({ status: 200, body: JSON.stringify({ ...keys.version(V120), signature: `${"A".repeat(86)}==` }) }), "signature does not hold"],
      ["the signature alone, as before spec 0059", () => ({ status: 200, body: JSON.stringify({ file: V120, signature: keys.version(V120).signature }) }), "signature does not hold"],
      ["another key", () => ({ status: 200, body: JSON.stringify(testKeys().version(V120)) }), "signature does not hold"],
      ["the reserve key, with nothing revoked", () => ({ status: 200, body: JSON.stringify(reserve.version(V120)) }), "signature does not hold"],
      ["a file with half a character", () => ({ status: 200, body: JSON.stringify(keys.version(V120, {})).replace('"file":"{', '"file":"\\ud800{') }), "does not take"],
      ["a statement about another id", () => ({ status: 200, body: JSON.stringify(keys.version(V120, { id: "ziffr/other" })) }), "other than the one it signed"],
      ["a statement about another version", () => ({ status: 200, body: JSON.stringify(keys.version(V120, { version: "1.3.0" })) }), "other than the one it signed"],
      ["another version, rightly signed", () => ({ status: 200, body: JSON.stringify(keys.version(V130)) }), "another Pack"],
      ["too big", () => ({ status: 200, body: "", tooBig: true }), "more than Ziffr takes"],
      ["not JSON", () => ({ status: 200, body: "<html>" }), "cannot read"],
      ["an error", () => ({ status: 500, body: "{}" }), "cannot be reached"],
    ];
    for (const [name, answer, message] of cases) {
      answers["GET /v1/packs/ziffr/saas-metrics/versions/1.2.0"] = answer;
      await expect(installFromMarketplace(w.actor(ann), "ziffr/saas-metrics", "1.2.0", { assistantTexts: true }), name).rejects.toThrow(message);
    }
    await expect(installFromMarketplace(w.actor(ann), "../../etc", "1.2.0", { assistantTexts: true })).rejects.toThrow();
    expect((await db().from("pack_installs").select("id").eq("workspace_id", w.id)).data).toEqual([]);
    const member = await w.person("member");
    await expect(searchMarketplace(w.actor(member, "member"), "x")).rejects.toThrow();
    await expect(searchMarketplace(w.actor(ann), "x")).resolves.toBeDefined();
    await expect(Promise.reject(new MarketplaceUnavailable())).rejects.toBeInstanceOf(MarketplaceUnavailable);
  });

  it("keeps a revocation the reserve key signed, and refuses the revoked key from then on", async () => {
    const w = await ws(); const ann = await w.person("owner");
    const serve = (answer: object) => { answers["GET /v1/packs/ziffr/saas-metrics/versions/1.2.0"] = () => ({ status: 200, body: JSON.stringify(answer) }); };
    const read = () => readMarketplacePack(w.actor(ann), "ziffr/saas-metrics", "1.2.0");
    // The signing key revoking the reserve key or itself, and a stranger revoking it: none counts.
    serve({ ...keys.version(V120), revocations: [keys.revokes(reserve.id), keys.revokes(keys.id), testKeys().revokes(keys.id), "nonsense"] });
    await expect(read()).resolves.toMatchObject({ ok: true });
    expect((await db().from("marketplace_revoked_keys").select("key_id").in("key_id", [keys.id, reserve.id])).data).toEqual([]);
    // The reserve key's revocation counts for the very answer it comes with.
    serve({ ...keys.version(V120), revocations: [reserve.revokes(keys.id)] });
    await expect(read()).rejects.toThrow("took out of use");
    // Kept: an answer that leaves it out changes nothing, and the reserve key signs now.
    serve(keys.version(V120));
    await expect(read()).rejects.toThrow("took out of use");
    serve(reserve.version(V120));
    await expect(read()).resolves.toMatchObject({ ok: true });
    await installFromMarketplace(w.actor(ann), "ziffr/saas-metrics", "1.2.0", { assistantTexts: true });
  });

  it("keeps a revocation that comes with the updates answer", async () => {
    const w = await ws(); const ann = await w.person("owner");
    await installFromMarketplace(w.actor(ann), "ziffr/saas-metrics", "1.2.0", { assistantTexts: true });
    answers["POST /v1/updates"] = () => ({ status: 200, body: JSON.stringify({ updates: [], revocations: [reserve.revokes(keys.id)] }) });
    await checkMarketplaceVersions(true);
    await expect(readMarketplacePack(w.actor(ann), "ziffr/saas-metrics", "1.3.0")).rejects.toThrow("took out of use");
  });

  it("asks for updates once for the whole Installation, with no Workspace or person in it, and updates from the Marketplace", async () => {
    const a = await ws("Alpha Corp"); const b = await ws("Beta Ltd"); const ann = await a.person("owner"); const zoe = await b.person("owner");
    await installFromMarketplace(a.actor(ann), "ziffr/saas-metrics", "1.2.0", { assistantTexts: true });
    await installFromMarketplace(b.actor(zoe), "ziffr/saas-metrics", "1.2.0", { assistantTexts: true });
    sent = [];
    // A page asks in the background; here the question is asked and awaited first, as a page's would have been.
    await checkMarketplaceVersions();
    const ups = await marketplaceUpdates(a.actor(ann));
    expect(ups).toEqual([{ installId: expect.any(Number), version: "1.3.0" }]);
    const posts = sent.filter((s) => s.method === "POST");
    expect(posts).toHaveLength(1);
    const body = JSON.parse(posts[0].body!);
    // Each Pack once, with the oldest version installed anywhere on the Installation.
    expect(body.installed.filter((p: { id: string }) => p.id === "ziffr/saas-metrics")).toHaveLength(1);
    expect(Object.keys(body).sort()).toEqual(["installed", "ziffr"]);
    for (const s of sent) for (const secret of [a.id, b.id, "Alpha", "Beta", ann, zoe]) expect(`${s.url} ${s.body ?? ""}`).not.toContain(secret);
    // Asked once a day: Beta's page asks nothing new.
    await checkMarketplaceVersions();
    expect(await marketplaceUpdates(b.actor(zoe))).toHaveLength(1);
    expect(sent.filter((s) => s.method === "POST")).toHaveLength(1);
    await updateFromMarketplace(a.actor(ann), ups[0].installId, "1.3.0", { assistantTexts: true });
    expect((await listInstalledPacks(a.actor(ann)))[0].version).toBe("1.3.0");
    expect(await marketplaceUpdates(a.actor(ann))).toEqual([]);
    // Updated again from an uploaded file, it is no longer shown as from the Marketplace.
    await updatePackFile(a.actor(ann), ups[0].installId, JSON.stringify({ ...NO_THEMES, version: "1.4.0" }), { unsigned: true, assistantTexts: true });
    expect((await listInstalledPacks(a.actor(ann)))[0]).toMatchObject({ version: "1.4.0", source: "upload", signed: false });
  });
});

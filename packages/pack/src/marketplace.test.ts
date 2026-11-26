// The Marketplace contract (spec 0059, #1192): answers a service may send, and a table of answers it may not, held to
// the check a service and Ziffr share; and the published schema, generated from the definitions the checks run.
// UPDATE_REFERENCE=1 writes it.
import { generateKeyPairSync, sign } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  checkMarketplaceAnswer, checkRevocation, marketplaceKeyId, marketplacePackPath, marketplaceReportPath, marketplaceVersionPath, MARKETPLACE_CONTRACT, MARKETPLACE_SCHEMA,
  packSha256, REVOCATION_FORMAT, STATEMENT_FORMAT, verifyPackStatement, type MarketplaceAnswerKind, type MarketplaceKeys,
} from "./marketplace.js";
import { run } from "./run.js";

/** A key pair as a Marketplace would hold one: the public key as readers take it, its id, and a way to sign a text. */
function keyPair() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const raw = publicKey.export({ format: "der", type: "spki" }).subarray(-32).toString("base64");
  return { raw, id: marketplaceKeyId(raw)!, sign: (text: string) => sign(null, Buffer.from(text, "utf8"), privateKey).toString("base64") };
}

const SIGNING = keyPair();
const RESERVE = keyPair();
const STRANGER = keyPair();
const KEYS: MarketplaceKeys = { signing: [SIGNING.raw], reserve: [RESERVE.raw] };

const PACK = {
  format: "ziffr.pack/1", id: "someone/shop", name: "Shop", version: "1.0.0", summary: "Orders and revenue.", author: { name: "Someone" }, license: "MIT",
  contents: { metrics: [{ key: "orders", metric: { format: "ziffr.metric/1", name: "Orders", period: "week", aggregation: "sum", polarity: "higher" } }] },
};
const FILE = JSON.stringify(PACK);
const ASKED = { id: "someone/shop", version: "1.0.0" };

/** A signed statement about FILE, with what a test changes. */
function signed(change: Record<string, unknown> = {}, key = SIGNING) {
  const statement = JSON.stringify({ format: STATEMENT_FORMAT, ...ASKED, sha256: packSha256(FILE), key: key.id, signed: "2026-11-26T09:00:00Z", reviewed: false, ...change });
  return { statement, signature: key.sign(statement) };
}
/** A revocation of `target`, signed by `by`. */
function revocation(target = SIGNING.id, by = RESERVE, change: Record<string, unknown> = {}) {
  const statement = JSON.stringify({ format: REVOCATION_FORMAT, key: target, signed: "2026-11-26T09:00:00Z", ...change });
  return { statement, signature: by.sign(statement) };
}

const LISTING = { id: "someone/shop", name: "Shop", summary: "Orders and revenue.", author: "Someone", license: "MIT", version: "1.0.0" };
const GOOD: [MarketplaceAnswerKind, string, unknown][] = [
  ["packs", "no Pack", { packs: [] }],
  ["packs", "a listing, with a new creator's mark and a field a reader does not know", { packs: [{ ...LISTING, newCreator: true, later: 1 }] }],
  ["version", "a signed file", { file: FILE, ...signed() }],
  ["version", "a file a moderator looked at", { file: FILE, ...signed({ reviewed: true }) }],
  ["version", "a file signed by the reserve key after it revoked the signing key", { file: FILE, ...signed({}, RESERVE), revocations: [revocation()] }],
  ["updates", "nothing newer", { updates: [] }],
  ["updates", "a newer version, a withdrawal and a revocation", { updates: [{ id: "someone/shop", version: "1.1.0" }], withdrawn: [{ id: "other/club", reason: "It copied another Pack." }], revocations: [revocation()] }],
  ["updatesRequest", "what an Installation sends", { ziffr: "0.50.0", installed: [ASKED] }],
];

const BAD: [MarketplaceAnswerKind, string, unknown, string][] = [
  ["packs", "no list", {}, "needs the field “packs”"],
  ["packs", "too many", { packs: Array.from({ length: MARKETPLACE_CONTRACT.results + 1 }, (_, n) => ({ ...LISTING, id: `a/b${n}` })) }, "at most 50"],
  ["packs", "an id that is a path", { packs: [{ ...LISTING, id: "../../etc/passwd" }] }, "packs[0].id"],
  ["packs", "markup in a name", { packs: [{ ...LISTING, name: "<script>alert(1)</script>" }] }, "packs[0].name"],
  ["packs", "an address in a summary", { packs: [{ ...LISTING, summary: "Go to evil.com now" }] }, "packs[0].summary"],
  ["packs", "a paid Pack", { packs: [{ ...LISTING, license: "Ziffr-Pack-1.0" }] }, "only free Packs"],
  ["packs", "a Pack listed twice", { packs: [LISTING, LISTING] }, "listed twice"],
  ["packs", "a mark that is not true or false", { packs: [{ ...LISTING, newCreator: "yes" }] }, "newCreator"],
  ["version", "only a file", { file: FILE }, "needs the field “statement”"],
  ["version", "the signature over the file, as before", { file: FILE, signature: SIGNING.sign(FILE) }, "needs the field “statement”"],
  ["version", "a file with half a character, signed as its replacement", { file: `${FILE}\uD800`, ...signed({ sha256: packSha256(`${FILE}\uFFFD`) }) }, "lone surrogate"],
  ["version", "a file that is no Pack", { file: "{}", ...signed({ sha256: packSha256("{}") }) }, "is not a Pack"],
  ["version", "another hash", { file: FILE, ...signed({ sha256: "0".repeat(64) }) }, "not the SHA-256"],
  ["version", "a statement about another version", { file: FILE, ...signed({ version: "2.0.0" }) }, "are not the file's"],
  ["version", "a statement of an unknown format", { file: FILE, ...signed({ format: "ziffr.pack-signature/2" }) }, "statement.format"],
  ["version", "a statement with a field of its own", { file: FILE, ...signed({ trusted: true }) }, "statement.trusted"],
  ["version", "a statement without a time", { file: FILE, ...signed({ signed: "yesterday" }) }, "statement.signed"],
  ["version", "a changed statement", { file: FILE, ...signed(), statement: signed({ reviewed: true }).statement }, "does not hold (signature)"],
  ["version", "another key", { file: FILE, ...signed({}, STRANGER) }, "does not hold (signature)"],
  ["version", "a statement naming another key", { file: FILE, ...signed({ key: RESERVE.id }) }, "does not hold (statement)"],
  ["version", "a revoked key", { file: FILE, ...signed(), revocations: [revocation()] }, "does not hold (revoked)"],
  ["version", "the reserve key before any revocation", { file: FILE, ...signed({}, RESERVE) }, "does not hold (reserve)"],
  ["updates", "a withdrawal without a reason", { updates: [], withdrawn: [{ id: "a/b", reason: "" }] }, "withdrawn[0].reason"],
  ["updates", "a reason too long", { updates: [], withdrawn: [{ id: "a/b", reason: "x".repeat(201) }] }, "at most 200"],
  ["updates", "a reason with a link", { updates: [], withdrawn: [{ id: "a/b", reason: "See https://evil.example" }] }, "withdrawn[0].reason"],
  ["updates", "an update for a withdrawn Pack", { updates: [{ id: "a/b", version: "2.0.0" }], withdrawn: [{ id: "a/b", reason: "Spam." }] }, "has none"],
  ["updates", "a revocation by the signing key", { updates: [], revocations: [revocation(RESERVE.id, SIGNING)] }, "signed by a reserve key"],
  ["updatesRequest", "a Workspace's name beside the list", { ziffr: "0.50.0", installed: [], workspace: "Acme" }, "workspace"],
  ["updatesRequest", "a Workspace beside a Pack", { ziffr: "0.50.0", installed: [{ ...ASKED, workspace: "Acme" }] }, "installed[0].workspace"],
];

describe("the Marketplace's answers", () => {
  it.each(GOOD)("%s: takes %s", (kind, _name, value) => {
    expect(checkMarketplaceAnswer(kind, JSON.stringify(value), KEYS)).toEqual({ ok: true, value });
  });
  it.each(BAD)("%s: refuses %s", (kind, _name, value, message) => {
    const res = checkMarketplaceAnswer(kind, JSON.stringify(value), KEYS);
    expect(res.ok ? "" : res.problems.map((p) => `${p.path} ${p.message}`).join("\n")).toContain(message);
  });
  it("refuses what is not JSON, too big, too deep or says a field twice", () => {
    for (const text of ["<html>", "x".repeat(MARKETPLACE_CONTRACT.listBytes + 1), `{"packs":${"[".repeat(20)}${"]".repeat(20)}}`, '{"packs":[],"packs":[]}']) expect(checkMarketplaceAnswer("packs", text).ok).toBe(false);
  });
});

describe("the signed statement", () => {
  const verify = (answer: { statement: string; signature: string }, keys = KEYS, revoked: { key: string; by: string }[] = [], file = FILE, asked = ASKED) => {
    const res = verifyPackStatement({ file, ...answer }, asked, keys, revoked);
    return res.ok ? "holds" : res.refusal;
  };
  it("holds for the file, id and version it names, signed by a trusted key", () => {
    expect(verify(signed())).toBe("holds");
  });
  it("fails for another file, id or version", () => {
    expect(verify(signed(), KEYS, [], `${FILE} `)).toBe("other-file");
    expect(verify(signed(), KEYS, [], FILE, { ...ASKED, id: "someone/other" })).toBe("other-file");
    expect(verify(signed(), KEYS, [], FILE, { ...ASKED, version: "1.0.1" })).toBe("other-file");
  });
  it("refuses a file that is not whole text before hashing it: it would share its hash with another file", () => {
    expect(packSha256(`${FILE}\uD800`)).toBe(packSha256(`${FILE}\uFFFD`));
    for (const half of ["\uD800", "\uDFFF"]) expect(verify(signed({ sha256: packSha256(`${FILE}\uFFFD`) }), KEYS, [], `${FILE}${half}`)).toBe("file");
    // A whole pair is one character, and counts as any other.
    expect(verify(signed({ sha256: packSha256(`${FILE}\u{1F600}`) }), KEYS, [], `${FILE}\u{1F600}`)).toBe("holds");
  });
  it("fails with no trusted key, and reads a statement only after its signature held", () => {
    expect(verify(signed(), { signing: [], reserve: [] })).toBe("signature");
    expect(verify({ statement: "not json", signature: SIGNING.sign("other") })).toBe("signature");
    expect(verify({ statement: "not json", signature: SIGNING.sign("not json") })).toBe("statement");
    expect(verify({ statement: signed().statement, signature: "x" })).toBe("signature");
  });
  it("takes the reserve key only once it revoked a signing key", () => {
    expect(verify(signed({}, RESERVE))).toBe("reserve");
    const done = [checkRevocation(revocation(), KEYS)!];
    expect(done).toEqual([{ key: SIGNING.id, by: RESERVE.id, signed: "2026-11-26T09:00:00Z" }]);
    expect(verify(signed({}, RESERVE), KEYS, done)).toBe("holds");
    expect(verify(signed(), KEYS, done)).toBe("revoked");
  });
});

describe("a revocation", () => {
  it("counts only from a reserve key, about a key that is not one", () => {
    expect(checkRevocation(revocation(SIGNING.id, SIGNING), KEYS)).toBeNull();
    expect(checkRevocation(revocation(SIGNING.id, STRANGER), KEYS)).toBeNull();
    expect(checkRevocation(revocation(RESERVE.id, RESERVE), KEYS)).toBeNull();
    expect(checkRevocation(revocation(SIGNING.id, RESERVE, { format: "ziffr.key-revocation/2" }), KEYS)).toBeNull();
    expect(checkRevocation({ ...revocation(), statement: revocation(STRANGER.id).statement }, KEYS)).toBeNull();
    // A statement about a Pack is never read as a revocation, whoever signed it.
    expect(checkRevocation(signed({}, RESERVE), KEYS)).toBeNull();
  });
});

describe("the addresses", () => {
  it("are built from checked parts only", () => {
    expect(marketplaceVersionPath("a/b", "1.0.0")).toBe("v1/packs/a/b/versions/1.0.0");
    expect(marketplacePackPath("a/b")).toBe("packs/a/b");
    expect(marketplaceReportPath("a/b", "1.0.0")).toBe("packs/a/b/report?version=1.0.0");
    for (const [id, version] of [["a/b/../c", "1.0.0"], ["//evil.example/x", "1.0.0"], ["a/b?x=1", "1.0.0"], ["a/b", "1.0.0&to=x"], ["a/b", "latest"]]) {
      expect(marketplaceVersionPath(id, version)).toBeNull();
      expect(marketplaceReportPath(id, version)).toBeNull();
    }
    expect(marketplacePackPath("a")).toBeNull();
  });
});

describe("ziffr-pack check-answer", () => {
  const answer = JSON.stringify({ file: FILE, ...signed() });
  it("checks one answer, with the keys given", () => {
    expect(run(["check-answer", "version", "v.json", "--key", SIGNING.raw], () => answer)).toEqual({ out: ["v.json: a valid version answer."], code: 0 });
    expect(run(["check-answer", "version", "v.json", "--key", STRANGER.raw], () => answer).code).toBe(1);
    expect(run(["check-answer", "packs", "v.json"], () => answer).out[0]).toContain("needs the field “packs”");
    expect(run(["check-answer", "constructor", "v.json"], () => answer).code).toBe(2);
    expect(run(["check-answer", "version", "v.json"], () => { throw new Error("ENOENT"); }).code).toBe(2);
  });
});

describe("the published schema", () => {
  it("docs/reference/marketplace.schema.json is the one the checks run", () => {
    const path = fileURLToPath(new URL("../../../docs/reference/marketplace.schema.json", import.meta.url));
    const generated = `${JSON.stringify(MARKETPLACE_SCHEMA, null, 2)}\n`;
    if (process.env.UPDATE_REFERENCE) writeFileSync(path, generated);
    expect(readFileSync(path, "utf8")).toBe(generated);
  });
});

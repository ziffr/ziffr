// The Marketplace contract (spec 0059, GLOSSARY: Marketplace, Pack, Signed Statement): what a Marketplace answers and
// what Ziffr takes, as JSON Schemas, with the one check of an answer that a service and Ziffr share. Node only (it
// hashes and verifies), so it is `@ziffr/pack/marketplace` and never part of the package's index.
// Security: every answer is untrusted. Each is held to a size, a depth and a shape before it is read; a signature is an
// Ed25519 signature of a statement's exact bytes; the statement names the file by id, version and SHA-256; only a
// reserve key revokes a signing key; web addresses are built here from checked parts and from nothing else.
import { createHash, createPublicKey, verify, type KeyObject } from "node:crypto";
import { plainText } from "./file-text.js";
import { checkSchema, parseJson, under, type FormatCheck, type Problem, type Schema } from "./json-check.js";
import { checkPack, PACK_LICENSES, PACK_LIMITS, PACK_SCHEMA } from "./pack.js";

/** The format of the statement a Marketplace signs about one file. */
export const STATEMENT_FORMAT = "ziffr.pack-signature/1";
/** The format of the statement that takes a signing key out of use. */
export const REVOCATION_FORMAT = "ziffr.key-revocation/1";

/** The limits of the contract: bytes of an answer, entries of a list, and characters of a text. */
export const MARKETPLACE_CONTRACT = {
  listBytes: 262_144,
  /** A version answer carries the file as a JSON text, where escaping can double its bytes, beside a few short fields. */
  versionBytes: (PACK_LIMITS.bytes + 4_096) * 2,
  statementBytes: 4_096,
  results: 50,
  installed: 5_000,
  updates: 500,
  revocations: 10,
  reason: 200,
  query: 100,
} as const;

/** The licenses a Marketplace offers until it takes payments: the free ones. */
export const FREE_LICENSES: readonly string[] = PACK_LICENSES.filter((l) => l !== "Ziffr-Pack-1.0");

const ID_RULE = PACK_SCHEMA.properties!.id;
const VERSION_RULE = PACK_SCHEMA.properties!.version;
const ID = new RegExp(ID_RULE.pattern!);
const VERSION = new RegExp(VERSION_RULE.pattern!);
const SIGNATURE: Schema = { type: "string", pattern: "^[A-Za-z0-9+/]{86}==$", description: "an Ed25519 signature in base64" };
const KEY_ID: Schema = { type: "string", pattern: "^[0-9a-f]{32}$", description: "a key's id: the first 32 hex characters of the SHA-256 of its 32 raw bytes" };
const MOMENT: Schema = { type: "string", maxLength: 30, pattern: "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\\.[0-9]{1,3})?Z$", description: "a moment in UTC, such as “2026-11-26T09:00:00Z”" };
// A statement travels as a text, so the bytes that were signed arrive unchanged; its own schema checks what it says.
const STATEMENT_TEXT: Schema = { type: "string", maxLength: MARKETPLACE_CONTRACT.statementBytes, description: "the exact text that was signed" };

const object = (properties: Record<string, Schema>, required: string[], extra: Partial<Schema> = {}): Schema => ({ type: "object", properties, required, ...extra });
const list = (items: Schema, maxItems: number, description: string): Schema => ({ type: "array", maxItems, items, description });
const NAMED_VERSION = object({ id: ID_RULE, version: VERSION_RULE }, ["id", "version"]);
const REVOCATION_ENTRY = object({ statement: STATEMENT_TEXT, signature: SIGNATURE }, ["statement", "signature"]);
const REVOCATIONS = list(REVOCATION_ENTRY, MARKETPLACE_CONTRACT.revocations, `Keys taken out of use, each a ${REVOCATION_FORMAT} statement signed by the reserve key.`);

const LISTING = object(
  {
    id: ID_RULE,
    name: { ...plainText(PACK_LIMITS.name), minLength: 1 },
    summary: plainText(PACK_LIMITS.summary),
    author: { ...plainText(PACK_LIMITS.author), minLength: 1 },
    license: { enum: [...PACK_LICENSES], description: "Only the free licenses are offered until a Marketplace takes payments." },
    version: VERSION_RULE,
    newCreator: { type: "boolean", description: "true while the creator is new (spec 0059)." },
  },
  ["id", "name", "summary", "author", "license", "version"],
);

const titled = (title: string, description: string, s: Schema): Schema => ({ title, description, ...s });

/** The JSON Schemas of the contract, by name: the one definition the checks run and docs/reference is generated from.
 * Answers may hold fields a reader does not know (it ignores them); the two signed statements may not. */
export const MARKETPLACE_SCHEMAS = {
  packs: titled("Marketplace: GET v1/packs", "The Packs that match a search, newest first; with an empty search, the newest of all.", object({ packs: list(LISTING, MARKETPLACE_CONTRACT.results, "Listings; Ziffr reads the first of them and drops one that does not pass.") }, ["packs"])),
  version: titled("Marketplace: GET v1/packs/{handle}/{slug}/versions/{version}", "One published version: the Pack's text, the statement about it and the statement's signature.", object({
    file: { type: "string", maxLength: PACK_LIMITS.bytes, description: "The Pack file's exact text, at most 1 MiB in UTF-8." },
    statement: STATEMENT_TEXT,
    signature: SIGNATURE,
    revocations: REVOCATIONS,
  }, ["file", "statement", "signature"])),
  updatesRequest: titled("Marketplace: POST v1/updates (request)", "What an Installation sends: Ziffr's version and the Packs it took from the Marketplace, each once, with its oldest installed version. Nothing else.", object({
    ziffr: { type: "string", maxLength: 40 },
    installed: list({ ...NAMED_VERSION, additionalProperties: false }, MARKETPLACE_CONTRACT.installed, "Packs installed from the Marketplace."),
  }, ["ziffr", "installed"], { additionalProperties: false })),
  updates: titled("Marketplace: POST v1/updates (answer)", "Which of the asked Packs have a newer version, and which were withdrawn.", object({
    updates: list(NAMED_VERSION, MARKETPLACE_CONTRACT.updates, "The newest version of each asked Pack that has a newer one."),
    withdrawn: list(object({ id: ID_RULE, reason: { ...plainText(MARKETPLACE_CONTRACT.reason), minLength: 1 } }, ["id", "reason"]), MARKETPLACE_CONTRACT.updates, "Every asked Pack that is withdrawn, with the reason. When the field is there it is the whole list: an asked Pack it does not name is not withdrawn."),
    revocations: REVOCATIONS,
  }, ["updates"])),
  statement: titled(`Marketplace: the signed statement (${STATEMENT_FORMAT})`, "What a Marketplace signs about one file. Ed25519 signs the statement's exact bytes.", object({
    format: { const: STATEMENT_FORMAT },
    id: ID_RULE,
    version: VERSION_RULE,
    sha256: { type: "string", pattern: "^[0-9a-f]{64}$", description: "the SHA-256 of the file's bytes, in hex" },
    key: KEY_ID,
    signed: MOMENT,
    reviewed: { type: "boolean", description: "true only when a moderator looked at this version" },
  }, ["format", "id", "version", "sha256", "key", "signed", "reviewed"], { additionalProperties: false })),
  revocation: titled(`Marketplace: a key revocation (${REVOCATION_FORMAT})`, "Takes a signing key out of use. Only the reserve key's signature counts.", object({
    format: { const: REVOCATION_FORMAT },
    key: KEY_ID,
    signed: MOMENT,
  }, ["format", "key", "signed"], { additionalProperties: false })),
} as const satisfies Record<string, Schema>;

/** The contract as one JSON Schema document, a definition for each answer and statement. */
export const MARKETPLACE_SCHEMA: Schema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://ziffr.net/schemas/marketplace.json",
  title: "Marketplace contract",
  description: "What a Marketplace answers, what Ziffr sends it, and what it signs (spec 0059). Check an answer against the definition of its kind.",
  $defs: MARKETPLACE_SCHEMAS,
};

/** A Pack as a Marketplace lists it. */
export type MarketplaceListing = { id: string; name: string; summary: string; author: string; license: string; version: string; newCreator?: boolean };
/** The signed statement about one file, as read from its text. */
export type PackStatement = { format: typeof STATEMENT_FORMAT; id: string; version: string; sha256: string; key: string; signed: string; reviewed: boolean };
/** A statement with its signature, as an answer carries a revocation. */
export type SignedText = { statement: string; signature: string };
/** The answer for one version of a Pack. */
export type VersionAnswer = { file: string; revocations?: SignedText[] } & SignedText;
/** A withdrawn Pack, with the reason in plain words. */
export type Withdrawal = { id: string; reason: string };
/** The answer to the updates question. */
export type UpdatesAnswer = { updates: { id: string; version: string }[]; withdrawn?: Withdrawal[]; revocations?: SignedText[] };
/** A revocation that holds: the key it takes out of use, and the reserve key that signed it. */
export type Revocation = { key: string; by: string; signed: string };
/** The public keys a reader trusts, each base64 of the raw 32 bytes, by its part. */
export type MarketplaceKeys = { signing: readonly string[]; reserve: readonly string[] };

// The raw key wrapped as SubjectPublicKeyInfo: the fixed Ed25519 prefix, then the 32 bytes.
const SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

/** A trusted key read: its id and the key to verify with, or null when it is not 32 bytes in base64. */
function readKey(base64: string): { id: string; key: KeyObject } | null {
  try {
    const raw = Buffer.from(base64, "base64");
    if (raw.length !== 32) return null;
    return { id: createHash("sha256").update(raw).digest("hex").slice(0, 32), key: createPublicKey({ key: Buffer.concat([SPKI_PREFIX, raw]), format: "der", type: "spki" }) };
  } catch {
    return null;
  }
}

/** Whether a text is whole: no half of a character (a lone surrogate), which UTF-8 cannot hold and hashing would
 * replace, so that two different texts would share one SHA-256. */
export const isWholeText = (text: string): boolean => !/\p{Cs}/u.test(text);

/** A public key's id, as statements name it, or null when the text is not a key. */
export const marketplaceKeyId = (publicKey: string): string | null => readKey(publicKey)?.id ?? null;

/** The SHA-256 of a Pack file's bytes, in hex, as a statement names it. */
export const packSha256 = (file: string): string => createHash("sha256").update(file, "utf8").digest("hex");

/** The key of `keys` whose signature of the text's exact bytes holds, or null. */
function signer(text: string, signature: string, keys: readonly string[]): string | null {
  if (typeof text !== "string" || typeof signature !== "string" || !new RegExp(SIGNATURE.pattern!).test(signature)) return null;
  const bytes = Buffer.from(text, "utf8");
  const sig = Buffer.from(signature, "base64");
  for (const k of keys.map(readKey)) {
    try { if (k && verify(null, bytes, k.key, sig)) return k.id; } catch { /* A key that cannot verify signs nothing. */ }
  }
  return null;
}

/** A signed statement's text read and held to its schema; a field given twice is refused, so one text says one thing. */
function readSigned<T>(text: string, s: Schema): FormatCheck<T> {
  const parsed = parseJson(text, { maxBytes: MARKETPLACE_CONTRACT.statementBytes, maxDepth: 3 });
  if (!parsed.ok) return parsed;
  const problems = checkSchema(s, parsed.value, parsed.lines);
  return problems.length ? { ok: false, problems } : { ok: true, value: parsed.value as T };
}

/** A revocation that holds: signed by a trusted reserve key, well formed, and naming a key that is not a reserve key.
 * Null for any other, a signing key's own revocation included. */
export function checkRevocation(entry: SignedText, keys: MarketplaceKeys): Revocation | null {
  const by = signer(entry?.statement, entry?.signature, keys.reserve);
  if (!by) return null;
  const read = readSigned<{ key: string; signed: string }>(entry.statement, MARKETPLACE_SCHEMAS.revocation);
  if (!read.ok || keys.reserve.some((k) => marketplaceKeyId(k) === read.value.key)) return null;
  return { key: read.value.key, by, signed: read.value.signed };
}

/** Why a signed file is not taken: the file is not whole text; no trusted key signed the statement; the key is revoked;
 * a reserve key signed before it took any key out of use; the statement is not one this reader knows; or it is about
 * another file. */
export type StatementRefusal = "file" | "signature" | "revoked" | "reserve" | "statement" | "other-file";

/** Whether a version answer's statement holds for its file: signed by a trusted key that may sign (a signing key not
 * revoked, or a reserve key that has revoked one), naming that key, the id and version asked for, and the file's hash. */
export function verifyPackStatement(answer: { file: string } & SignedText, asked: { id: string; version: string }, keys: MarketplaceKeys, revoked: readonly Pick<Revocation, "key" | "by">[]): { ok: true; statement: PackStatement } | { ok: false; refusal: StatementRefusal } {
  const refused = (refusal: StatementRefusal) => ({ ok: false as const, refusal });
  // Before anything is hashed.
  if (!isWholeText(answer.file)) return refused("file");
  const by = signer(answer.statement, answer.signature, [...keys.signing, ...keys.reserve]);
  if (!by) return refused("signature");
  if (revoked.some((r) => r.key === by)) return refused("revoked");
  if (!keys.signing.some((k) => marketplaceKeyId(k) === by) && !revoked.some((r) => r.by === by)) return refused("reserve");
  const read = readSigned<PackStatement>(answer.statement, MARKETPLACE_SCHEMAS.statement);
  if (!read.ok || read.value.key !== by) return refused("statement");
  const s = read.value;
  if (s.id !== asked.id || s.version !== asked.version || s.sha256 !== packSha256(answer.file)) return refused("other-file");
  return { ok: true, statement: s };
}

/** The path of a version's answer under the Marketplace's address, or null when the id or version is not one. */
export const marketplaceVersionPath = (id: string, version: string): string | null =>
  ID.test(id) && VERSION.test(version) ? `v1/packs/${id}/versions/${version}` : null;

/** The path of a Pack's web page under the Marketplace's address, or null when the id is not one. */
export const marketplacePackPath = (id: string): string | null => (ID.test(id) ? `packs/${id}` : null);

/** The path of the form that reports a Pack, with the version meant, or null when the id or version is not one. */
export const marketplaceReportPath = (id: string, version: string): string | null =>
  ID.test(id) && VERSION.test(version) ? `packs/${id}/report?version=${version}` : null;

/** The kinds of answers a service sends, and the request it receives. */
export type MarketplaceAnswerKind = "packs" | "version" | "updates" | "updatesRequest";

/** The problems of a version answer that a schema cannot say: the file is a free Pack Ziffr installs, and the statement
 * is about it; with trusted keys, also that its signature and every revocation hold. */
function versionProblems(v: VersionAnswer, keys: MarketplaceKeys | undefined, at: (path: string, message: string) => void): void {
  // Refused before anything is hashed: its SHA-256 would be another text's too.
  if (!isWholeText(v.file)) return at("file", "holds half a character (a lone surrogate), so it is not the text of a file.");
  if (Buffer.byteLength(v.file) > PACK_LIMITS.bytes) at("file", `is more than ${PACK_LIMITS.bytes.toLocaleString("en")} bytes.`);
  const pack = checkPack(v.file);
  if (!pack.ok) at("file", `is not a Pack Ziffr installs: ${pack.problems[0].path} ${pack.problems[0].message}`.trim());
  else if (!FREE_LICENSES.includes(pack.pack.license)) at("file", "is a paid Pack; only free ones are offered.");
  const read = readSigned<PackStatement>(v.statement, MARKETPLACE_SCHEMAS.statement);
  if (!read.ok) return read.problems.forEach((p) => at(under("statement", p).path, p.message));
  const s = read.value;
  if (s.sha256 !== packSha256(v.file)) at("statement.sha256", "is not the SHA-256 of the file.");
  if (pack.ok && (s.id !== pack.pack.id || s.version !== pack.pack.version)) at("statement.id", "and version are not the file's.");
  if (!keys) return;
  const revoked = (v.revocations ?? []).flatMap((r) => checkRevocation(r, keys) ?? []);
  const held = verifyPackStatement(v, s, keys, revoked);
  if (!held.ok && held.refusal !== "other-file") at("signature", `does not hold (${held.refusal}).`);
}

/** Holds one answer, or the updates request, to the contract: what a service runs on what it sends, so Ziffr takes it.
 * With `keys`, signatures and revocations are verified too. */
export function checkMarketplaceAnswer<T = unknown>(kind: MarketplaceAnswerKind, text: string, keys?: MarketplaceKeys): FormatCheck<T> {
  const maxBytes = kind === "version" ? MARKETPLACE_CONTRACT.versionBytes : MARKETPLACE_CONTRACT.listBytes;
  const parsed = parseJson(text, { maxBytes, maxDepth: 6 });
  if (!parsed.ok) return parsed;
  const problems: Problem[] = checkSchema(MARKETPLACE_SCHEMAS[kind], parsed.value, parsed.lines);
  if (problems.length) return { ok: false, problems };
  const at = (path: string, message: string) => void problems.push({ path, line: parsed.lines.get(path) ?? null, message });
  const once = (path: string, ids: string[]) => ids.forEach((id, n) => { if (ids.indexOf(id) !== n) at(`${path}[${n}].id`, `“${id}” is listed twice.`); });
  const value = parsed.value as { packs?: MarketplaceListing[]; installed?: { id: string }[] } & Partial<UpdatesAnswer>;
  if (kind === "packs") {
    once("packs", value.packs!.map((p) => p.id));
    value.packs!.forEach((p, n) => { if (!FREE_LICENSES.includes(p.license)) at(`packs[${n}].license`, "is a paid license; only free Packs are offered."); });
  } else if (kind === "version") {
    versionProblems(parsed.value as VersionAnswer, keys, at);
  } else if (kind === "updates") {
    once("updates", value.updates!.map((p) => p.id));
    once("withdrawn", (value.withdrawn ?? []).map((p) => p.id));
    for (const [n, w] of (value.withdrawn ?? []).entries()) if (value.updates!.some((u) => u.id === w.id)) at(`withdrawn[${n}].id`, "is offered an update too; a withdrawn Pack has none.");
    if (keys) for (const [n, r] of (value.revocations ?? []).entries()) if (!checkRevocation(r, keys)) at(`revocations[${n}]`, "is not a revocation signed by a reserve key.");
  } else {
    once("installed", value.installed!.map((p) => p.id));
  }
  return problems.length ? { ok: false, problems } : { ok: true, value: parsed.value as T };
}

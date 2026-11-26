// The Marketplace connection (spec 0030, GLOSSARY: Marketplace, Pack, Installation Settings): Ziffr's server, never a
// browser, asks the Marketplace for lists of Packs, a Pack's page, a version's file, and which installed Packs have
// newer versions. Off unless an Installation Admin turns it on (ZIFFR_MARKETPLACE).
// Security: what goes out is only what is asked for (a search, a Pack's id and version), the Installation's list of
// installed Packs (never by Workspace) and Ziffr's version; never a Workspace's name, id or data, nor a person. The
// address is https, never inside this server's own network (unless ZIFFR_ALLOW_PRIVATE_MARKETPLACE=1), the connection
// goes to the address that was checked, redirects are not followed, and every answer is held to a size, a time and a
// shape before it is used. A Pack's file must come with a Signed Statement about exactly that file by a key this Ziffr
// trusts and has not seen revoked (spec 0059; @ziffr/pack/marketplace), and is then checked in full like any Pack: the
// signature says where a file came from, the checks are the protection.
import { checkRevocation, isWholeText, marketplaceKeyId, marketplaceReportPath, marketplaceVersionPath, MARKETPLACE_CONTRACT, MARKETPLACE_SCHEMAS, verifyPackStatement, type MarketplaceKeys, type MarketplaceListing, type Revocation, type SignedText, type StatementRefusal } from "@ziffr/pack/marketplace";
import { db } from "./db";
import { Forbidden, type Actor } from "./actor";
import { settingsInEffect } from "./settings-in-effect";
import { checkSchema } from "./json-check";
import { checkPack, PACK_LIMITS, versionBelow } from "./pack";
import { assertManages, installPack, previewPack, type PackOrigin, type PackRead } from "./packs";
import { readPackUpdate, updatePack, type UpdatePlan } from "./pack-updates";
import { ZIFFR_VERSION } from "./ziffr-version";
import { privateMailHost } from "./mail-hosts";
import { outboundRequest, outboundTls, type OutboundAnswer } from "./outbound-request";
import { heldBack } from "./practice";

/** Ziffr's own Marketplace, where the connection goes unless the Installation names another. */
export const MARKETPLACE_DEFAULT_URL = "https://marketplace.ziffr.net";

/** A Marketplace Key's part (GLOSSARY: Marketplace Key): the signing key signs statements; the reserve key revokes it. */
export type MarketplaceKeyPart = "signing" | "reserve";

/** The Marketplace's public keys this Ziffr ships, each as base64 of the raw 32-byte Ed25519 key with its part.
 * PROTOTYPE: empty until Ziffr's Marketplace has keys (spec 0059, a later ticket ships them); the server may add its
 * own with ZIFFR_MARKETPLACE_PUBLIC_KEY, a self-hoster running their own Marketplace. Never set from a page. */
export const MARKETPLACE_PUBLIC_KEYS: readonly { part: MarketplaceKeyPart; key: string }[] = [];

/** How long one request to the Marketplace may take; every other limit is the contract's (MARKETPLACE_CONTRACT). */
export const MARKETPLACE_TIMEOUT_MS = 10_000;

/** How often the Installation asks for newer versions. */
const CHECK_EVERY_MS = 24 * 60 * 60 * 1000;

/** The connection as the settings make it: on or off, and where to, or why it cannot be made. */
export type MarketplaceConfig = { on: boolean; url: URL | null; problem: string | null };

/** Why an address cannot be the Marketplace's, or null: https, a host name or a public address, no user, no query. */
export function marketplaceUrlProblem(raw: string, env: Record<string, string | undefined> = process.env): string | null {
  let u: URL;
  try { u = new URL(raw); } catch { return "The Marketplace address is not an address."; }
  if (u.protocol !== "https:") return "The Marketplace address starts with https://.";
  if (u.username || u.password || u.search || u.hash) return "The Marketplace address has no user, password, ?query or #part.";
  if (privateMailHost(u.hostname) && env.ZIFFR_ALLOW_PRIVATE_MARKETPLACE !== "1") return "The Marketplace address is inside this server's own network.";
  return null;
}

/** The connection in effect: on only when ZIFFR_MARKETPLACE says on, to ZIFFR_MARKETPLACE_URL or Ziffr's own. */
export function marketplaceConfig(settings: Record<string, string | undefined>): MarketplaceConfig {
  const on = /^(on|1|true|yes)$/i.test((settings.ZIFFR_MARKETPLACE ?? "").trim());
  if (!on) return { on: false, url: null, problem: null };
  const raw = (settings.ZIFFR_MARKETPLACE_URL ?? "").trim() || MARKETPLACE_DEFAULT_URL;
  const problem = marketplaceUrlProblem(raw, settings);
  return problem ? { on: true, url: null, problem } : { on: true, url: new URL(raw.endsWith("/") ? raw : `${raw}/`), problem: null };
}

/** What one request gives back: its status and its body, cut at the limit given. */
type Answer = OutboundAnswer;

/** Certificates to trust besides the system's, for a test's own TLS server; never set by the app. */
export const marketplaceTls = outboundTls;

/** How a request is made; tests put a stub in, which records what would go out. */
export const marketplaceTransport = {
  /** Sends one request to an https address the core checked, and reads at most `maxBytes` of the answer. No redirect is
   * followed and the whole request ends within MARKETPLACE_TIMEOUT_MS (the shared rules: outbound-request.ts). */
  request: (url: URL, init: { method: "GET" | "POST"; body?: string; maxBytes: number; env: Record<string, string | undefined>; deadlineMs?: number }): Promise<Answer> =>
    outboundRequest(url, {
      method: init.method, body: init.body, maxBytes: init.maxBytes, deadlineMs: Math.min(init.deadlineMs ?? MARKETPLACE_TIMEOUT_MS, MARKETPLACE_TIMEOUT_MS),
      headers: { accept: "application/json", ...(init.body ? { "content-type": "application/json" } : {}) },
      allowPrivate: init.env.ZIFFR_ALLOW_PRIVATE_MARKETPLACE === "1",
    }),
};

/** Thrown when the Marketplace is off, cannot be reached, or answers what Ziffr does not take; its words are for people. */
export class MarketplaceUnavailable extends Error {
  constructor(message = "The Marketplace cannot be reached just now; try again later, or install a Pack from a file.") {
    super(message);
    this.name = "MarketplaceUnavailable";
  }
}

/** The connection in effect, or MarketplaceUnavailable when it is off or its address is refused. */
async function connection(): Promise<{ url: URL; env: Record<string, string | undefined> }> {
  const env = await settingsInEffect();
  const c = marketplaceConfig(env);
  if (!c.on) throw new MarketplaceUnavailable("The Marketplace connection is off on this Installation. An Installation Admin turns it on; a Pack can always be installed from a file.");
  if (!c.url) throw new MarketplaceUnavailable(`The Marketplace connection is not set up: ${c.problem}`);
  return { url: c.url, env };
}

/** Asks the Marketplace one thing and reads its JSON answer, refused when it is not 200, too big, slow or not JSON. */
async function ask(path: string, init: { method?: "GET" | "POST"; body?: unknown; maxBytes?: number } = {}): Promise<unknown> {
  const { url, env } = await connection();
  const target = new URL(path, url);
  let answer: Answer;
  try {
    answer = await marketplaceTransport.request(target, { method: init.method ?? "GET", body: init.body === undefined ? undefined : JSON.stringify(init.body), maxBytes: init.maxBytes ?? MARKETPLACE_CONTRACT.listBytes, env });
  } catch {
    throw new MarketplaceUnavailable();
  }
  if (answer.tooBig) throw new MarketplaceUnavailable("The Marketplace answered with more than Ziffr takes.");
  if (answer.status === 404) throw new MarketplaceUnavailable("The Marketplace does not know that Pack or version.");
  if (answer.status !== 200) throw new MarketplaceUnavailable();
  try {
    return JSON.parse(answer.body);
  } catch {
    throw new MarketplaceUnavailable("The Marketplace answered something Ziffr cannot read.");
  }
}

// The contract's own schemas, so Ziffr holds an answer to exactly what a service is checked against.
const LISTING = MARKETPLACE_SCHEMAS.packs.properties!.packs.items!;
const NAMED_VERSION = MARKETPLACE_SCHEMAS.updates.properties!.updates.items!;
const WITHDRAWAL = MARKETPLACE_SCHEMAS.updates.properties!.withdrawn.items!;

export type { MarketplaceListing };

/** A listing kept only when every field passes, and only its known fields: the Marketplace's words are untrusted. */
const listing = (x: unknown): MarketplaceListing | null => {
  if (checkSchema(LISTING, x).length) return null;
  const o = x as MarketplaceListing;
  return { id: o.id, name: o.name, summary: o.summary, author: o.author, license: o.license, version: o.version, ...(o.newCreator === true ? { newCreator: true } : {}) };
};

/** Free Packs only: a paid one needs a purchase this Ziffr cannot make yet. */
const free = (l: MarketplaceListing) => l.license !== "Ziffr-Pack-1.0";

/** Searches the Marketplace for free Packs (Owners and Admins), the newest ones when no word is given, in the order it
 * answers: the search words are all that is sent. */
export async function searchMarketplace(actor: Actor, query: string): Promise<MarketplaceListing[]> {
  assertManages(actor);
  const q = String(query ?? "").replace(/\s+/g, " ").trim().slice(0, MARKETPLACE_CONTRACT.query);
  const answer = await ask(`v1/packs?q=${encodeURIComponent(q)}`) as { packs?: unknown };
  const packs = Array.isArray(answer?.packs) ? answer.packs.slice(0, MARKETPLACE_CONTRACT.results) : [];
  return packs.map(listing).filter((l): l is MarketplaceListing => !!l && free(l));
}

/** The keys this Ziffr trusts, by part: the ones it ships, and the server's own (ZIFFR_MARKETPLACE_PUBLIC_KEY,
 * comma-separated: a key alone or after `signing:` is a signing key, after `reserve:` a reserve key), never a page's. */
export function trustedKeys(env: Record<string, string | undefined>): MarketplaceKeys {
  const own = String(env.ZIFFR_MARKETPLACE_PUBLIC_KEY ?? "").split(",").map((k) => k.trim()).filter(Boolean).map((entry) => {
    const [, part, key] = /^(?:(signing|reserve):)?([\s\S]*)$/.exec(entry)!;
    return { part: (part ?? "signing") as MarketplaceKeyPart, key: key.trim() };
  });
  const all = [...MARKETPLACE_PUBLIC_KEYS, ...own];
  const of = (part: MarketplaceKeyPart) => all.filter((k) => k.part === part).map((k) => k.key);
  return { signing: of("signing"), reserve: of("reserve") };
}

/** What is wrong with the trusted keys as set, or null; said in the server's log at start. A key named as both signing
 * and reserve cannot be taken out of use, and whoever steals it holds both parts. */
export function marketplaceKeyProblem(env: Record<string, string | undefined>): string | null {
  const { signing, reserve } = trustedKeys(env);
  const reserves = new Set(reserve.map(marketplaceKeyId));
  const both = signing.map(marketplaceKeyId).filter((id) => id !== null && reserves.has(id));
  return both.length ? `ZIFFR_MARKETPLACE_PUBLIC_KEY: the key ${both[0]} is listed as both signing and reserve. It cannot be taken out of use; make the reserve key a different one and keep it offline.` : null;
}

const NOT_KEPT = "Ziffr could not check the Marketplace's keys just now; nothing was shown or installed.";

/** Keeps every revocation of an answer that a reserve key signed, for the whole Installation and for good. Anything else
 * in the list is ignored, so neither a thief of the signing key nor whoever answers at the address revokes anything. */
async function keepRevocations(entries: unknown, keys: MarketplaceKeys): Promise<void> {
  if (!Array.isArray(entries)) return;
  const held = entries.slice(0, MARKETPLACE_CONTRACT.revocations).flatMap((e) => checkRevocation(e as SignedText, keys) ?? []);
  if (!held.length) return;
  const { error } = await db().from("marketplace_revoked_keys").upsert(held.map((r) => ({ key_id: r.key, revoked_by: r.by, signed_at: r.signed })), { onConflict: "key_id", ignoreDuplicates: true });
  if (error) throw new MarketplaceUnavailable(NOT_KEPT);
}

/** Every revocation kept; refuses to go on when they cannot be read, so a revoked key is never trusted by mistake. */
async function keptRevocations(): Promise<Pick<Revocation, "key" | "by">[]> {
  const { data, error } = await db().from("marketplace_revoked_keys").select("key_id, revoked_by");
  if (error) throw new MarketplaceUnavailable(NOT_KEPT);
  return (data ?? []).map((r) => ({ key: String(r.key_id), by: String(r.revoked_by) }));
}

const NOT_ITS = "The file's signature does not hold: it is not the Marketplace's. Nothing was shown or installed.";
const ANOTHER = "The Marketplace answered with another Pack than the one asked for, or a file other than the one it signed. Nothing was shown or installed.";
const NOT_A_FILE = "The Marketplace answered with a file Ziffr does not take.";
const REFUSED: Record<StatementRefusal, string> = {
  file: NOT_A_FILE,
  signature: NOT_ITS,
  statement: NOT_ITS,
  reserve: NOT_ITS,
  revoked: "The file is signed with a key the Marketplace took out of use. Nothing was shown or installed.",
  "other-file": ANOTHER,
};

/** A version's file from the Marketplace, its Signed Statement checked and the file checked to be the Pack and version
 * asked for. A file whose statement does not hold is refused (specs 0030 and 0059), whatever else it holds. `origin`
 * says what the statement proves, and whether a moderator looked. */
async function signedFile(packId: string, version: string): Promise<{ file: string; origin: PackOrigin }> {
  const path = marketplaceVersionPath(String(packId), String(version));
  if (!path) throw new Forbidden();
  const { env } = await connection();
  const answer = await ask(path, { maxBytes: MARKETPLACE_CONTRACT.versionBytes }) as { file?: unknown; statement?: unknown; signature?: unknown; revocations?: unknown } | null;
  const keys = trustedKeys(env);
  // Revocations first: one that comes with this very answer already counts for it.
  await keepRevocations(answer?.revocations, keys);
  const file = typeof answer?.file === "string" ? answer.file : "";
  // Refused before anything is hashed: a text with a lone surrogate would share its SHA-256 with another file.
  if (!file || !isWholeText(file) || Buffer.byteLength(file) > PACK_LIMITS.bytes) throw new MarketplaceUnavailable(NOT_A_FILE);
  const held = verifyPackStatement({ file, statement: String(answer!.statement ?? ""), signature: String(answer!.signature ?? "") }, { id: packId, version }, keys, await keptRevocations());
  if (!held.ok) throw new MarketplaceUnavailable(REFUSED[held.refusal]);
  // A file that fails the checks is returned as it is: preview and install check it again and refuse it with its
  // problems, which is where a person reads them. Never skip that second check.
  const res = checkPack(file);
  if (res.ok && (res.pack.id !== packId || res.pack.version !== version)) throw new MarketplaceUnavailable(ANOTHER);
  if (res.ok && res.pack.license === "Ziffr-Pack-1.0") throw new MarketplaceUnavailable("Paid Packs cannot be installed yet.");
  return { file, origin: { source: "marketplace", signed: true, reviewed: held.statement.reviewed } };
}

/** A Marketplace Pack's Preview, as for a file, shown as from the Marketplace (Owners and Admins), with the address of
 * its report form. Nothing is written. */
export async function readMarketplacePack(actor: Actor, packId: string, version: string): Promise<PackRead> {
  assertManages(actor);
  const { file, origin } = await signedFile(packId, version);
  const read = await previewPack(actor, file, origin);
  const { url } = await connection();
  return read.ok ? { ok: true, preview: { ...read.preview, report: reportAddress(url, packId, version) } } : read;
}

// The report form's address, from the checked address of the Marketplace and an id and version that are ones: a page the
// person's browser opens. Ziffr's server sends nothing.
const reportAddress = (base: URL, packId: string, version: string): string | null => {
  const path = marketplaceReportPath(packId, version);
  return path ? new URL(path, base).href : null;
};

/** "Report this Pack" for each of the Workspace's installs from the Marketplace, for whoever sees the installed Packs
 * (not Guests or keys), and only while the connection is on. Nothing is asked of the Marketplace. */
export async function marketplaceReportLinks(actor: Actor): Promise<{ installId: number; address: string }[]> {
  if ((actor as { key?: unknown }).key || actor.role === "guest") return [];
  const c = marketplaceConfig(await settingsInEffect());
  if (!c.on || !c.url || (await heldBack(actor.workspaceId, "marketplace_report"))) return [];
  const { data } = await db().from("pack_installs").select("id, pack_id, version").eq("workspace_id", actor.workspaceId).eq("source", "marketplace");
  return (data ?? []).flatMap((i) => {
    const address = reportAddress(c.url!, String(i.pack_id), String(i.version));
    return address ? [{ installId: Number(i.id), address }] : [];
  });
}

/** Installs a Pack from the Marketplace (Owners and Admins; Owners for one with Themes): its signature checked, then
 * every check of an upload; texts aimed at assistants only after they were read. Audited as from the Marketplace. */
export async function installFromMarketplace(actor: Actor, packId: string, version: string, confirmed: { assistantTexts: boolean }): Promise<number> {
  assertManages(actor);
  const { file, origin } = await signedFile(packId, version);
  return installPack(actor, file, origin, { unsigned: false, assistantTexts: confirmed?.assistantTexts === true });
}

/** The Marketplace id of one of this Workspace's installs, or Forbidden. */
async function installedId(actor: Actor, installId: number): Promise<string> {
  const { data } = await db().from("pack_installs").select("pack_id").eq("id", Number(installId)).eq("workspace_id", actor.workspaceId).maybeSingle();
  if (!data) throw new Forbidden();
  return String(data.pack_id);
}

/** What updating an installed Pack to a Marketplace version would do (Owners and Admins); nothing is written. */
export async function readMarketplaceUpdate(actor: Actor, installId: number, version: string) {
  assertManages(actor);
  const { file } = await signedFile(await installedId(actor, installId), version);
  return readPackUpdate(actor, Number(installId), file);
}

/** Updates an installed Pack to a Marketplace version, its signature checked (Owners and Admins). */
export async function updateFromMarketplace(actor: Actor, installId: number, version: string, confirmed: { assistantTexts: boolean }): Promise<UpdatePlan> {
  assertManages(actor);
  const { file, origin } = await signedFile(await installedId(actor, installId), version);
  return updatePack(actor, Number(installId), file, origin, { unsigned: false, assistantTexts: confirmed?.assistantTexts === true });
}

/** Asks the Marketplace which installed Packs have newer versions, for the whole Installation at once, at most once a
 * day unless `force`: what is sent is the list of Packs installed from the Marketplace on any Workspace, each once,
 * with its oldest installed version, and Ziffr's version. Keeps the answer for every Workspace to read. */
export async function checkMarketplaceVersions(force = false): Promise<void> {
  const c = marketplaceConfig(await settingsInEffect());
  if (!c.on || !c.url) return;
  const { data } = await db().from("pack_installs").select("pack_id, version").eq("source", "marketplace");
  const oldest = new Map<string, string>();
  for (const r of data ?? []) {
    const [id, v] = [String(r.pack_id), String(r.version)];
    const had = oldest.get(id);
    if (!had || versionBelow(v, had)) oldest.set(id, v);
  }
  // Nothing installed from the Marketplace: nothing to ask, and the day's question is kept for when there is.
  if (!oldest.size) return;
  // Claimed in one statement: of pages opened at the same moment, one asks.
  await db().from("marketplace_checks").upsert({ only_row: true, checked_at: new Date(0).toISOString() }, { ignoreDuplicates: true });
  const now = new Date();
  const claim = db().from("marketplace_checks").update({ checked_at: now.toISOString() }).eq("only_row", true);
  const { data: claimed } = await (force ? claim : claim.lt("checked_at", new Date(now.getTime() - CHECK_EVERY_MS).toISOString())).select("only_row");
  if (!claimed?.length) return;
  const answer = await ask("v1/updates", { method: "POST", body: { ziffr: ZIFFR_VERSION, installed: [...oldest].map(([id, version]) => ({ id, version })) } }) as { updates?: unknown; withdrawn?: unknown; revocations?: unknown } | null;
  await keepRevocations(answer?.revocations, trustedKeys(await settingsInEffect()));
  await keepWithdrawals(answer?.withdrawn, [...oldest.keys()]);
  const updates = (Array.isArray(answer?.updates) ? answer.updates : []).slice(0, MARKETPLACE_CONTRACT.updates)
    .filter((u): u is { id: string; version: string } => !checkSchema(NAMED_VERSION, u).length)
    .map((u) => ({ id: u.id, version: u.version }))
    .filter((u) => oldest.has(u.id));
  if (updates.length) await db().from("marketplace_versions").upsert(updates.map((u) => ({ pack_id: u.id, version: u.version, seen_at: new Date().toISOString() })));
}

/** Keeps which of the asked Packs the answer says are withdrawn. A `withdrawn` list is the whole list for what was
 * asked, so an asked Pack it no longer names is not withdrawn any more; an answer without the list (a Marketplace that
 * does not send it) changes nothing. Only asked Packs and reasons the contract allows are kept. */
async function keepWithdrawals(entries: unknown, asked: string[]): Promise<void> {
  if (!Array.isArray(entries)) return;
  const wanted = new Set(asked);
  const named = new Set<string>();
  const kept = new Map<string, string>();
  for (const e of entries.slice(0, MARKETPLACE_CONTRACT.updates) as { id?: unknown; reason?: unknown }[]) {
    const id = String(e?.id);
    if (!wanted.has(id)) continue;
    // Named at all, it stays as it was; only a withdrawal that passes the check replaces what is kept.
    named.add(id);
    if (!checkSchema(WITHDRAWAL, e).length) kept.set(id, e.reason as string);
  }
  const restored = asked.filter((id) => !named.has(id));
  if (restored.length) await db().from("marketplace_withdrawals").delete().in("pack_id", restored);
  if (!kept.size) return;
  const now = new Date().toISOString();
  await db().from("marketplace_withdrawals").upsert([...kept].map(([pack_id, reason]) => ({ pack_id, reason, seen_at: now })));
  // No update is offered for a withdrawn Pack, whatever an earlier answer said.
  await db().from("marketplace_versions").delete().in("pack_id", [...kept.keys()]);
}

/** The Workspace's installs of Packs the Marketplace withdrew, with its reason, for whoever sees the installed Packs
 * (not Guests or keys). What the last answer said, whether or not the connection is on now; nothing is asked here. */
export async function marketplaceWithdrawals(actor: Actor): Promise<{ installId: number; reason: string }[]> {
  if ((actor as { key?: unknown }).key || actor.role === "guest") return [];
  // Only Packs installed from the Marketplace: an uploaded file under the same id is not the Marketplace's Pack.
  const { data: installs } = await db().from("pack_installs").select("id, pack_id").eq("workspace_id", actor.workspaceId).eq("source", "marketplace");
  if (!installs?.length) return [];
  const { data: gone } = await db().from("marketplace_withdrawals").select("pack_id, reason").in("pack_id", installs.map((i) => String(i.pack_id)));
  const why = new Map((gone ?? []).map((g) => [String(g.pack_id), String(g.reason)]));
  return installs.flatMap((i) => {
    const reason = why.get(String(i.pack_id));
    return reason ? [{ installId: Number(i.id), reason }] : [];
  });
}

/** The newer Marketplace versions of this Workspace's installed Packs, by install, for Owners and Admins: what the Packs
 * page shows as an update to take. Asks the Marketplace first when the Installation has not asked today. */
export async function marketplaceUpdates(actor: Actor): Promise<{ installId: number; version: string }[]> {
  if ((actor as { key?: unknown }).key || (actor.role !== "owner" && actor.role !== "admin")) return [];
  // Asked in the background: the page shows what the last question found, and never waits on the Marketplace.
  void checkMarketplaceVersions().catch(() => undefined);
  // Only Packs installed from the Marketplace: an uploaded file under the same id is not the Marketplace's Pack.
  const { data: installs } = await db().from("pack_installs").select("id, pack_id, version").eq("workspace_id", actor.workspaceId).eq("source", "marketplace");
  if (!installs?.length) return [];
  const { data: newer } = await db().from("marketplace_versions").select("pack_id, version").in("pack_id", installs.map((i) => String(i.pack_id)));
  const latest = new Map((newer ?? []).map((n) => [String(n.pack_id), String(n.version)]));
  return installs.flatMap((i) => {
    const v = latest.get(String(i.pack_id));
    return v && versionBelow(String(i.version), v) ? [{ installId: Number(i.id), version: v }] : [];
  });
}

/** Whether the Marketplace connection is on and set up, for the Packs page. */
export async function marketplaceOn(): Promise<boolean> {
  const c = marketplaceConfig(await settingsInEffect());
  return c.on && !!c.url;
}


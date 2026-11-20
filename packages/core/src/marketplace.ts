// The Marketplace connection (spec 0030, GLOSSARY: Marketplace, Pack, Installation Settings): Ziffr's server, never a
// browser, asks the Marketplace for lists of Packs, a Pack's page, a version's file, and which installed Packs have
// newer versions. Off unless an Installation Admin turns it on (ZIFFR_MARKETPLACE).
// Security: what goes out is only what is asked for (a search, a Pack's id and version), the Installation's list of
// installed Packs (never by Workspace) and Ziffr's version; never a Workspace's name, id or data, nor a person. The
// address is https, never inside this server's own network (unless ZIFFR_ALLOW_PRIVATE_MARKETPLACE=1), the connection
// goes to the address that was checked, redirects are not followed, and every answer is held to a size, a time and a
// shape before it is used. A Pack's file must carry a valid Ed25519 signature of a key this Ziffr trusts, and is then
// checked in full like any Pack: the signature says where a file came from, the checks are the protection.
import { createPublicKey, verify, type KeyObject } from "node:crypto";
import { request } from "node:https";
import { version as ZIFFR_VERSION } from "../package.json";
import { db } from "./db";
import { Forbidden, type Actor } from "./actor";
import { settingsInEffect } from "./settings-in-effect";
import { checkSchema, type Schema } from "./json-check";
import { PLAIN } from "./file-text";
import { checkPack, PACK_LICENSES, PACK_LIMITS, versionBelow } from "./pack";
import { assertManages, installPack, previewPack, type PackRead } from "./packs";
import { readPackUpdate, updatePack, type UpdatePlan } from "./pack-updates";
import { mailHostResolver, privateAddress, privateMailHost } from "./mail-hosts";

/** Ziffr's own Marketplace, where the connection goes unless the Installation names another. */
export const MARKETPLACE_DEFAULT_URL = "https://marketplace.ziffr.app";

/** The Marketplace's public keys this Ziffr trusts, as base64 of the raw 32-byte Ed25519 key. PROTOTYPE: empty until
 * Ziffr Cloud's Marketplace signs its first Pack (spec 0030, the Marketplace service); the server may add its own
 * with ZIFFR_MARKETPLACE_PUBLIC_KEY, a self-hoster running their own Marketplace. Never set from a page. */
export const MARKETPLACE_PUBLIC_KEYS: readonly string[] = [];

/** The longest an answer of the Marketplace may be, in bytes, and how long it may take. */
export const MARKETPLACE_LIMITS = { listBytes: 262_144, fileBytes: PACK_LIMITS.bytes + 4_096, timeoutMs: 10_000, results: 50, versions: 50, query: 100 } as const;

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
type Answer = { status: number; body: string; tooBig: boolean };

/** Certificates to trust besides the system's, for a test's own TLS server; never set by the app. */
export const marketplaceTls: { ca?: string } = {};

/** How a request is made; tests put a stub in, which records what would go out. */
export const marketplaceTransport = {
  /** Sends one request to an https address the core checked, and reads at most `maxBytes` of the answer. */
  request: (url: URL, init: { method: "GET" | "POST"; body?: string; maxBytes: number; env: Record<string, string | undefined>; deadlineMs?: number }): Promise<Answer> => pinnedRequest(url, init),
};

/** One https request to the address checked: the name is looked up once, every address it has must be public, and the
 * connection goes only to those, with TLS checking the name. No redirect is followed, the answer is cut short, and the
 * whole request, however slowly it trickles, ends within MARKETPLACE_LIMITS.timeoutMs. An address written as an IP is
 * never looked up: marketplaceUrlProblem refused a private one before. */
function pinnedRequest(url: URL, init: { method: "GET" | "POST"; body?: string; maxBytes: number; env: Record<string, string | undefined>; deadlineMs?: number }): Promise<Answer> {
  const allowPrivate = init.env.ZIFFR_ALLOW_PRIVATE_MARKETPLACE === "1";
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (f: () => void) => { if (!settled) { settled = true; clearTimeout(deadline); f(); } };
    // The whole request, not only a pause between bytes (Node's `timeout` below): an answer that trickles in ends here.
    const deadline = setTimeout(() => { req.destroy(); done(() => reject(new Error("timeout"))); }, Math.min(init.deadlineMs ?? MARKETPLACE_LIMITS.timeoutMs, MARKETPLACE_LIMITS.timeoutMs));
    const req = request(url, {
      method: init.method,
      headers: { "user-agent": `Ziffr/${ZIFFR_VERSION}`, accept: "application/json", ...(init.body ? { "content-type": "application/json", "content-length": Buffer.byteLength(init.body) } : {}) },
      // A connection of its own each time: a pooled one would skip the lookup and its checks.
      agent: false,
      ...(marketplaceTls.ca ? { ca: marketplaceTls.ca } : {}),
      timeout: MARKETPLACE_LIMITS.timeoutMs,
      // Node asks for every address at once (`all`) when it may try IPv4 and IPv6; each one was checked either way.
      lookup: ((host: string, opts: { all?: boolean }, cb: (err: Error | null, address: string | { address: string; family: number }[], family?: number) => void) => {
        mailHostResolver.lookup(host).then((found) => {
          if (!found.length) return cb(new Error("no address"), "", 0);
          if (!allowPrivate && found.some((a) => privateAddress(a.address))) return cb(new Error("private address"), "", 0);
          if (opts?.all) return cb(null, found.map((a) => ({ address: a.address, family: a.family })));
          cb(null, found[0].address, found[0].family);
        }, (e) => cb(e, "", 0));
      }) as never,
    }, (res) => {
      const chunks: Buffer[] = [];
      let size = 0;
      res.on("data", (c: Buffer) => {
        size += c.length;
        if (size > init.maxBytes) { res.destroy(); done(() => resolve({ status: res.statusCode ?? 0, body: "", tooBig: true })); return; }
        chunks.push(c);
      });
      res.on("end", () => done(() => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8"), tooBig: false })));
      res.on("error", (e) => done(() => reject(e)));
      res.on("close", () => done(() => reject(new Error("the answer ended early"))));
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", (e) => done(() => reject(e)));
    if (init.body) req.write(init.body);
    req.end();
  });
}

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
    answer = await marketplaceTransport.request(target, { method: init.method ?? "GET", body: init.body === undefined ? undefined : JSON.stringify(init.body), maxBytes: init.maxBytes ?? MARKETPLACE_LIMITS.listBytes, env });
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

const ID = "^[a-z0-9][a-z0-9-]{0,38}/[a-z0-9][a-z0-9-]{0,59}$";
const VERSION = "^(?:0|[1-9][0-9]{0,5})\\.(?:0|[1-9][0-9]{0,5})\\.(?:0|[1-9][0-9]{0,5})$";
const text = (max: number): Schema => ({ type: "string", maxLength: max, pattern: PLAIN });
const LISTING: Schema = {
  type: "object",
  properties: {
    id: { type: "string", pattern: ID }, name: { ...text(80), minLength: 1 }, summary: text(300), author: { ...text(80), minLength: 1 },
    license: { enum: [...PACK_LICENSES] }, version: { type: "string", pattern: VERSION },
  },
  required: ["id", "name", "summary", "author", "license", "version"],
};

/** A Pack as the Marketplace lists it, after Ziffr checked every field. */
export type MarketplaceListing = { id: string; name: string; summary: string; author: string; license: string; version: string };

/** A listing kept only when every field passes, and only its known fields: the Marketplace's words are untrusted. */
const listing = (x: unknown): MarketplaceListing | null => {
  if (checkSchema(LISTING, x).length) return null;
  const o = x as MarketplaceListing;
  return { id: o.id, name: o.name, summary: o.summary, author: o.author, license: o.license, version: o.version };
};

/** Free Packs only: a paid one needs a purchase this Ziffr cannot make yet. */
const free = (l: MarketplaceListing) => l.license !== "Ziffr-Pack-1.0";

/** Searches the Marketplace for free Packs (Owners and Admins): the search words are all that is sent. */
export async function searchMarketplace(actor: Actor, query: string): Promise<MarketplaceListing[]> {
  assertManages(actor);
  const q = String(query ?? "").replace(/\s+/g, " ").trim().slice(0, MARKETPLACE_LIMITS.query);
  const answer = await ask(`v1/packs?q=${encodeURIComponent(q)}`) as { packs?: unknown };
  const packs = Array.isArray(answer?.packs) ? answer.packs.slice(0, MARKETPLACE_LIMITS.results) : [];
  return packs.map(listing).filter((l): l is MarketplaceListing => !!l && free(l));
}

/** The keys this Ziffr trusts: the ones it ships, and the server's own (ZIFFR_MARKETPLACE_PUBLIC_KEY), never a page's. */
function trustedKeys(env: Record<string, string | undefined>): KeyObject[] {
  const raw = [...MARKETPLACE_PUBLIC_KEYS, ...String(env.ZIFFR_MARKETPLACE_PUBLIC_KEY ?? "").split(",").map((k) => k.trim()).filter(Boolean)];
  return raw.flatMap((b64) => {
    try {
      const key = Buffer.from(b64, "base64");
      if (key.length !== 32) return [];
      // The raw key wrapped as SubjectPublicKeyInfo: the fixed Ed25519 prefix, then the 32 bytes.
      return [createPublicKey({ key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), key]), format: "der", type: "spki" })];
    } catch {
      return [];
    }
  });
}

/** Whether `signature` (base64) is a valid Ed25519 signature of `file`'s exact bytes by a key this Ziffr trusts. */
export function signedByMarketplace(file: string, signature: string, env: Record<string, string | undefined> = process.env): boolean {
  if (typeof file !== "string" || typeof signature !== "string" || !/^[A-Za-z0-9+/]{86}==$/.test(signature)) return false;
  const sig = Buffer.from(signature, "base64");
  return trustedKeys(env).some((k) => {
    try { return verify(null, Buffer.from(file, "utf8"), k, sig); } catch { return false; }
  });
}

/** A version's file from the Marketplace, its signature checked and the file checked to be the Pack and version asked
 * for. A file whose signature fails is refused (spec 0030), whatever else it holds. */
async function signedFile(packId: string, version: string): Promise<string> {
  if (!new RegExp(ID).test(String(packId)) || !new RegExp(VERSION).test(String(version))) throw new Forbidden();
  const { env } = await connection();
  const answer = await ask(`v1/packs/${packId}/versions/${version}`, { maxBytes: MARKETPLACE_LIMITS.fileBytes * 2 }) as { file?: unknown; signature?: unknown };
  const file = typeof answer?.file === "string" ? answer.file : "";
  if (!file || Buffer.byteLength(file) > PACK_LIMITS.bytes) throw new MarketplaceUnavailable("The Marketplace answered with a file Ziffr does not take.");
  if (!signedByMarketplace(file, String(answer.signature ?? ""), env)) throw new MarketplaceUnavailable("The file's signature does not hold: it is not the Marketplace's. Nothing was shown or installed.");
  // A file that fails the checks is returned as it is: preview and install check it again and refuse it with its
  // problems, which is where a person reads them. Never skip that second check.
  const res = checkPack(file);
  if (res.ok && (res.pack.id !== packId || res.pack.version !== version)) throw new MarketplaceUnavailable("The Marketplace answered with another Pack than the one asked for.");
  if (res.ok && res.pack.license === "Ziffr-Pack-1.0") throw new MarketplaceUnavailable("Paid Packs cannot be installed yet.");
  return file;
}

const SIGNED = { source: "marketplace", signed: true } as const;

/** A Marketplace Pack's Preview, as for a file, shown as from the Marketplace (Owners and Admins). Nothing is written. */
export async function readMarketplacePack(actor: Actor, packId: string, version: string): Promise<PackRead> {
  assertManages(actor);
  return previewPack(actor, await signedFile(packId, version), SIGNED);
}

/** Installs a Pack from the Marketplace (Owners and Admins; Owners for one with Themes): its signature checked, then
 * every check of an upload; texts aimed at assistants only after they were read. Audited as from the Marketplace. */
export async function installFromMarketplace(actor: Actor, packId: string, version: string, confirmed: { assistantTexts: boolean }): Promise<number> {
  assertManages(actor);
  return installPack(actor, await signedFile(packId, version), SIGNED, { unsigned: false, assistantTexts: confirmed?.assistantTexts === true });
}

/** What updating an installed Pack to a Marketplace version would do (Owners and Admins); nothing is written. */
export async function readMarketplaceUpdate(actor: Actor, installId: number, version: string) {
  assertManages(actor);
  const { data } = await db().from("pack_installs").select("pack_id").eq("id", Number(installId)).eq("workspace_id", actor.workspaceId).maybeSingle();
  if (!data) throw new Forbidden();
  return readPackUpdate(actor, Number(installId), await signedFile(String(data.pack_id), version));
}

/** Updates an installed Pack to a Marketplace version, its signature checked (Owners and Admins). */
export async function updateFromMarketplace(actor: Actor, installId: number, version: string, confirmed: { assistantTexts: boolean }): Promise<UpdatePlan> {
  assertManages(actor);
  const { data } = await db().from("pack_installs").select("pack_id").eq("id", Number(installId)).eq("workspace_id", actor.workspaceId).maybeSingle();
  if (!data) throw new Forbidden();
  return updatePack(actor, Number(installId), await signedFile(String(data.pack_id), version), SIGNED, { unsigned: false, assistantTexts: confirmed?.assistantTexts === true });
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
  const answer = await ask("v1/updates", { method: "POST", body: { ziffr: ZIFFR_VERSION, installed: [...oldest].map(([id, version]) => ({ id, version })) } }) as { updates?: unknown };
  const updates = (Array.isArray(answer?.updates) ? answer.updates : []).slice(0, 500)
    .filter((u): u is { id: string; version: string } => !!u && typeof u === "object" && new RegExp(ID).test(String((u as { id?: unknown }).id)) && new RegExp(VERSION).test(String((u as { version?: unknown }).version)))
    .filter((u) => oldest.has(u.id));
  if (updates.length) await db().from("marketplace_versions").upsert(updates.map((u) => ({ pack_id: u.id, version: u.version, seen_at: new Date().toISOString() })));
}

/** The newer Marketplace versions of this Workspace's installed Packs, by install, for Owners and Admins: what the Packs
 * page shows as an update to take. Asks the Marketplace first when the Installation has not asked today. */
export async function marketplaceUpdates(actor: Actor): Promise<{ installId: number; version: string }[]> {
  if ((actor as { key?: unknown }).key || (actor.role !== "owner" && actor.role !== "admin")) return [];
  await checkMarketplaceVersions().catch(() => undefined); // the page works without the Marketplace
  const { data: installs } = await db().from("pack_installs").select("id, pack_id, version").eq("workspace_id", actor.workspaceId);
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


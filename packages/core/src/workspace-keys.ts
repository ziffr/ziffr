// Workspace Keys (spec 0028, ticket #245; GLOSSARY: Workspace Key; ADR 0012): every Workspace's sensitive columns are
// sealed in Node with a key of its own (AES-256-GCM), bound to the Workspace, table, column and row, so a database
// dump, a backup or a read-only SQL leak holds ciphertext, and a sealed value copied anywhere else does not open.
// The key is stored only wrapped through a KeyWrapper; the open-source one uses a key derived from ZIFFR_SECRETS_KEY
// with HKDF under a label of its own, so it never shares bytes with what seals Slack tokens and Installation
// Settings. Security: no key, wrapped or not, ever leaves this module, and nothing here logs one.
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from "node:crypto";
import { db } from "./db";
import { previousSecretsKey, secretsKey } from "./secrets";
import { DEMO_WORKSPACE_ID } from "./team";

/** HKDF labels: each use of a key gets bytes of its own, so learning one derived key tells nothing of another. */
const LABEL = { wrap: "ziffr/workspace-key-wrap/v1", fingerprint: "ziffr/installation-key-id/v1", blind: "ziffr/blind-index/v1" } as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NAME = /^[a-z_][a-z0-9_]{0,62}$/;
const ROW = /^[A-Za-z0-9_-]{1,128}$/;
const PURPOSE = /^[a-z_][a-z0-9_]{0,62}\.[a-z_][a-z0-9_]{0,62}$/;
// "w1.<version>.<iv>.<ciphertext>.<tag>": 12 bytes of IV are 16 base64url characters, 16 bytes of tag 22. A plain
// value is only taken for a sealed one when it has exactly this shape, so ordinary text passes through untouched.
const SEALED = /^w1\.([1-9][0-9]{0,8})\.([A-Za-z0-9_-]{16})\.([A-Za-z0-9_-]*)\.([A-Za-z0-9_-]{22})$/;
const WRAPPED = /^k1\.([A-Za-z0-9_-]{16})\.([A-Za-z0-9_-]{43})\.([A-Za-z0-9_-]{22})$/;

/** Wraps and unwraps a Workspace Key (ADR 0012's extension point): the Installation's own wrapper here, a customer's
 * KMS in ee/ later. `under` names, without revealing it, which key wrapped it; `stale` says it should be wrapped again. */
export interface KeyWrapper {
  readonly name: string;
  wrap(workspaceId: string, version: number, key: Buffer): Promise<{ wrapped: string; under: string | null }>;
  unwrap(workspaceId: string, version: number, wrapped: string): Promise<{ key: Buffer; stale: boolean } | null>;
}

/** Where a sealed value lives: it opens only there (the additional data is `<workspace>:<table>:<column>:<row>`). */
export type SealedAt = { table: string; column: string; row: string | number };

/** Opens and seals one Workspace's values with its keys; made by workspaceCipher, holding the keys out of sight. */
export interface WorkspaceCipher {
  readonly workspaceId: string;
  /** False for the demo and on an Installation without ZIFFR_SECRETS_KEY: seal() then returns the plain value. */
  readonly sealing: boolean;
  /** The value sealed under the current key version, for this place only. */
  seal(at: SealedAt, plain: string): string;
  /** A sealed value opened, a plain one as it is (while old rows wait for the re-encryption job); null when it is
   * missing or cannot be opened: sealed for another place or Workspace, changed, or under a destroyed key. */
  open(at: SealedAt, stored: string | null | undefined): string | null;
  /** The blind index of a value under the current key, to store beside its sealed form; null when not sealing. */
  blindIndex(purpose: string, value: string): string | null;
  /** The blind index under every key version this Workspace still has, to find a row whichever version wrote it. */
  blindIndexes(purpose: string, value: string): string[];
}

/** Whether a stored value is in the sealed format (the re-encryption job and its done check ask this). */
export function isSealed(stored: string | null | undefined): boolean {
  return typeof stored === "string" && SEALED.test(stored);
}

/** A key derived from another under a label, 32 bytes (HKDF-SHA256, no salt: the input is already a random key). */
function derive(key: Buffer, label: string, length = 32): Buffer {
  return Buffer.from(hkdfSync("sha256", key, Buffer.alloc(0), label, length));
}

/** AES-256-GCM with a fresh 12-byte IV and the full 16-byte tag: [iv, ciphertext, tag]. */
function gcmSeal(key: Buffer, aad: string, plain: Buffer): [Buffer, Buffer, Buffer] {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ct = Buffer.concat([cipher.update(plain), cipher.final()]);
  return [iv, ct, cipher.getAuthTag()];
}

/** Opens what gcmSeal sealed; null when anything is wrong. Only the full tag counts: GCM takes shorter ones, which
 * are easier to forge. */
function gcmOpen(key: Buffer, aad: string, iv: Buffer, ct: Buffer, tag: Buffer): Buffer | null {
  if (iv.length !== 12 || tag.length !== 16) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
    decipher.setAAD(Buffer.from(aad, "utf8"));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]);
  } catch {
    return null;
  }
}

const b64 = (b: Buffer) => b.toString("base64url");
const unb64 = (s: string) => Buffer.from(s, "base64url");

/** Additional data for wrapping: the key opens only for its own Workspace and version. */
const wrapContext = (workspaceId: string, version: number) => `ziffr/workspace-key:${workspaceId.toLowerCase()}:${version}`;

/** A fingerprint of an Installation key, 8 bytes in hex, safe to store: derived under its own label, it tells which
 * key wrapped a Workspace Key and nothing about the key itself. */
export function installationKeyFingerprint(key: Buffer): string {
  return derive(key, LABEL.fingerprint, 8).toString("hex");
}

/** The open-source KeyWrapper: AES-256-GCM under a key derived from ZIFFR_SECRETS_KEY, opening with
 * ZIFFR_SECRETS_KEY_PREVIOUS too while the Installation's key is being changed (spec 0009). Reads the keys when
 * called, so a changed environment counts at once. */
export function installationKeyWrapper(keys: () => { current: Buffer | null; previous: Buffer | null } = () => ({ current: secretsKey(), previous: previousSecretsKey() })): KeyWrapper {
  return {
    name: "installation",
    async wrap(workspaceId, version, key) {
      const { current } = keys();
      if (!current) throw new Error("ZIFFR_SECRETS_KEY is not set, so no Workspace Key can be wrapped.");
      if (key.length !== 32) throw new Error("A Workspace Key is 32 bytes.");
      const [iv, ct, tag] = gcmSeal(derive(current, LABEL.wrap), wrapContext(workspaceId, version), key);
      return { wrapped: ["k1", b64(iv), b64(ct), b64(tag)].join("."), under: installationKeyFingerprint(current) };
    },
    async unwrap(workspaceId, version, wrapped) {
      const m = WRAPPED.exec(String(wrapped));
      if (!m) return null;
      const { current, previous } = keys();
      const tries: [Buffer | null, boolean][] = [[current, false], [previous, true]];
      for (const [installationKey, stale] of tries) {
        if (!installationKey) continue;
        const key = gcmOpen(derive(installationKey, LABEL.wrap), wrapContext(workspaceId, version), unb64(m[1]), unb64(m[2]), unb64(m[3]));
        if (key?.length === 32) return { key, stale };
      }
      return null;
    },
  };
}

const wrappers: Record<string, KeyWrapper> = { installation: installationKeyWrapper() };

/** The additional data of a sealed value, checked so that no two places can share it. */
function placeOf(workspaceId: string, at: SealedAt): string {
  // One spelling per row: a uuid in lower case, a number only while it is exact (a bigint read as a JSON number past
  // 2^53 would name another row). Otherwise a value sealed under one spelling would not open under another.
  if (typeof at.row === "number" && !(Number.isSafeInteger(at.row) && at.row >= 0)) throw new Error(`Not a row a value can be sealed at: ${at.table}.${at.column}.`);
  const row = UUID.test(String(at.row)) ? String(at.row).toLowerCase() : String(at.row);
  if (!NAME.test(at.table) || !NAME.test(at.column) || !ROW.test(row)) throw new Error(`Not a place a value can be sealed at: ${at.table}.${at.column}.`);
  return `${workspaceId.toLowerCase()}:${at.table}:${at.column}:${row}`;
}

/** The normal form a blind index is taken of: the same text however it was typed in case, spacing or Unicode form.
 * Lower case, not full case folding ("ß" and "SS" stay apart), as Postgres's lower() on addresses did. */
export function normaliseForIndex(value: string): string {
  return value.normalize("NFC").trim().toLowerCase();
}

/** A WorkspaceCipher over keys already unwrapped: `current` (by default the newest) seals, every version opens.
 * Pure; workspaceCipher loads the keys for it. An empty list makes one that does not seal. */
export function cipherFromKeys(workspaceId: string, keys: { version: number; key: Buffer }[], currentVersion?: number): WorkspaceCipher {
  if (!UUID.test(workspaceId)) throw new Error("Not a Workspace id.");
  // Copies held in this closure only: the object handed out has no property a log or inspect() could print a key from.
  const byVersion = new Map(keys.map(({ version, key }) => [version, Buffer.from(key)]));
  const blindKeys = new Map([...byVersion].map(([v, k]) => [v, derive(k, LABEL.blind)]));
  const current = currentVersion !== undefined && byVersion.has(currentVersion) ? currentVersion : byVersion.size ? Math.max(...byVersion.keys()) : null;
  const mac = (version: number, purpose: string, value: string) => {
    if (!PURPOSE.test(purpose)) throw new Error("A blind index is for a table.column.");
    const h = createHmac("sha256", blindKeys.get(version) as Buffer).update(`${purpose}\0${normaliseForIndex(value)}`, "utf8").digest();
    return `b1.${version}.${b64(h)}`;
  };
  return Object.freeze({
    workspaceId,
    sealing: current !== null,
    seal(at: SealedAt, plain: string) {
      const place = placeOf(workspaceId, at);
      if (current === null) return plain;
      const [iv, ct, tag] = gcmSeal(byVersion.get(current) as Buffer, place, Buffer.from(String(plain), "utf8"));
      return ["w1", String(current), b64(iv), b64(ct), b64(tag)].join(".");
    },
    open(at: SealedAt, stored: string | null | undefined) {
      const place = placeOf(workspaceId, at);
      if (stored === null || stored === undefined) return null;
      const m = SEALED.exec(stored);
      if (!m) return stored;
      const key = byVersion.get(Number(m[1]));
      const [iv, ct, tag] = [unb64(m[2]), unb64(m[3]), unb64(m[4])];
      // Only the one spelling of each part: base64url has spare bits, so another spelling of the same bytes would
      // otherwise open too, and a changed stored text would go unnoticed by anything comparing it.
      if (!key || b64(iv) !== m[2] || b64(ct) !== m[3] || b64(tag) !== m[4]) return null;
      return gcmOpen(key, place, iv, ct, tag)?.toString("utf8") ?? null;
    },
    blindIndex(purpose: string, value: string) {
      return current === null ? null : mac(current, purpose, value);
    },
    blindIndexes(purpose: string, value: string) {
      return [...blindKeys.keys()].sort((a, b) => b - a).map((v) => mac(v, purpose, value));
    },
  });
}

/** Unwrapped keys kept in memory per process: 10 minutes, at most 1,000 Workspaces, least recently used first out. */
export function keyCache(options: { ttlMs?: number; max?: number; now?: () => number } = {}) {
  const ttl = options.ttlMs ?? 10 * 60_000;
  const max = options.max ?? 1000;
  const now = options.now ?? Date.now;
  const entries = new Map<string, { cipher: WorkspaceCipher; until: number }>();
  return {
    /** The cached cipher of a Workspace, marked as just used; undefined when absent or expired. */
    get(workspaceId: string): WorkspaceCipher | undefined {
      const e = entries.get(workspaceId);
      if (!e) return undefined;
      entries.delete(workspaceId);
      if (e.until <= now()) return undefined;
      entries.set(workspaceId, e);
      return e.cipher;
    },
    /** Keeps a Workspace's cipher, dropping the least recently used one when full. */
    set(workspaceId: string, cipher: WorkspaceCipher) {
      entries.delete(workspaceId);
      // Expired keys go now, not only when their Workspace is asked for again.
      const t = now();
      for (const [id, e] of entries) if (e.until <= t) entries.delete(id);
      entries.set(workspaceId, { cipher, until: now() + ttl });
      while (entries.size > max) entries.delete(entries.keys().next().value as string);
    },
    /** Drops a Workspace's keys from this process at once (its key was destroyed or changed). */
    delete(workspaceId: string) {
      entries.delete(workspaceId);
    },
    /** How many Workspaces are cached. */
    get size() {
      return entries.size;
    },
  };
}

const cache = keyCache();

/** Drops a Workspace's unwrapped keys from this process's memory, so the next use reads them again. */
export function forgetWorkspaceKey(workspaceId: string): void {
  cache.delete(workspaceId.toLowerCase());
}

/** Times a Workspace's key was destroyed in this process: a load that started before keeps its result out of the
 * cache, so this process never opens a destroyed Workspace again from memory. */
const destroyed = new Map<string, number>();

/** Destroys every version of a Workspace's key (spec 0028, ticket #249): deleting a Workspace does this first, so
 * whatever of it is left anywhere, half-deleted rows or any copy made from now on, cannot be opened with what the
 * Installation keeps. In one locked database step it also marks the Workspace as keyed, so no new key is ever made
 * for it, and writes the Installation's audit line by its id. Only a Trial Workspace, checked in that step too: any other
 * is refused. This process forgets the key at once; others within
 * the 10 minutes their cache keeps it. Never undone. False when there is no such Workspace. */
export async function destroyWorkspaceKeys(workspaceId: string): Promise<boolean> {
  const id = workspaceId.toLowerCase();
  if (!UUID.test(id)) throw new Error("Not a Workspace id.");
  destroyed.set(id, (destroyed.get(id) ?? 0) + 1);
  forgetWorkspaceKey(id);
  const { data, error } = await db().rpc("destroy_workspace_keys", { p_workspace: id });
  if (error) throw new Error("The Workspace Key could not be destroyed.");
  forgetWorkspaceKey(id);
  return data === true;
}

type KeyRow = { version: number; wrapped: string; wrapper: string; retired_at: string | null };

/** Wraps a key again under the current Installation key, only if nobody changed its row since it was read. A failure
 * here leaves the old wrapping, which still opens with the previous key: it is tried again on the next load. */
async function rewrap(workspaceId: string, row: KeyRow, wrapper: KeyWrapper, key: Buffer): Promise<void> {
  try {
    const { wrapped, under } = await wrapper.wrap(workspaceId, row.version, key);
    // The job that re-wraps every key (ticket 6) counts the rows it swapped; here a miss is simply tried next time.
    await db().from("workspace_keys").update({ wrapped, wrapped_under: under }).eq("workspace_id", workspaceId).eq("version", row.version).eq("wrapped", row.wrapped);
  } catch {
    // Nothing logged: the message could only say the re-wrap failed, which the next load retries.
  }
}

async function keyRows(workspaceId: string): Promise<KeyRow[]> {
  const { data, error } = await db().from("workspace_keys").select("version, wrapped, wrapper, retired_at").eq("workspace_id", workspaceId).order("version");
  if (error) throw new Error("The Workspace Key could not be read.");
  return (data ?? []) as KeyRow[];
}

/** Makes a Workspace's first key if it has none and the Installation can wrap one; true when it has a key after.
 * Safe to call at once from several processes: only one first version is ever stored. The demo never gets one. */
export async function ensureWorkspaceKey(workspaceId: string): Promise<boolean> {
  const id = workspaceId.toLowerCase();
  if (!UUID.test(id)) throw new Error("Not a Workspace id.");
  if (id === DEMO_WORKSPACE_ID) return false;
  if ((await keyRows(id)).length) return true;
  if (await wasKeyed(id)) return true;
  if (!secretsKey()) return false;
  const key = randomBytes(32);
  const wrapper = wrappers.installation;
  const { wrapped, under } = await wrapper.wrap(id, 1, key);
  key.fill(0);
  // Stored and the Workspace marked as keyed in one step, so a key that later goes missing is never replaced.
  const { data, error } = await db().rpc("create_first_workspace_key", { p_workspace: id, p_wrapped: wrapped, p_wrapper: wrapper.name, p_under: under });
  if (error) throw new Error("The Workspace Key could not be stored.");
  if (data !== true) throw new Error(LOST);
  return true;
}

const LOST = "This Workspace's key is gone: it was destroyed, or its row was removed. Its sealed data cannot be opened, and no new key is made in its place.";

/** True when a Workspace was keyed and its key is there (made by another process meanwhile); throws when it had a key
 * and has none now: a destroyed key is never quietly replaced by a new one. */
async function wasKeyed(workspaceId: string): Promise<boolean> {
  const { data, error } = await db().from("workspaces").select("keyed_at").eq("id", workspaceId).maybeSingle();
  if (error) throw new Error("The Workspace Key could not be read.");
  // Keyed by another process since this one read no rows: its key is there now.
  if (!data?.keyed_at) return false;
  if (!(await keyRows(workspaceId)).length) throw new Error(LOST);
  return true;
}

/** The cipher for one Workspace: its keys unwrapped (from the cache when it has them), its first key made when it has
 * none yet. Throws when a stored key cannot be unwrapped, as when ZIFFR_SECRETS_KEY changed without
 * ZIFFR_SECRETS_KEY_PREVIOUS: then nothing is written in clear in its place, and no new key hides the old one. */
export async function workspaceCipher(workspaceId: string): Promise<WorkspaceCipher> {
  const id = workspaceId.toLowerCase();
  if (!UUID.test(id)) throw new Error("Not a Workspace id.");
  if (id === DEMO_WORKSPACE_ID) return cipherFromKeys(id, []);
  const cached = cache.get(id);
  if (cached) return cached;
  const generation = destroyed.get(id) ?? 0;
  let rows = await keyRows(id);
  if (!rows.length) {
    // An Installation without ZIFFR_SECRETS_KEY works as before, in clear (spec 0028); not cached, so the key is
    // made as soon as the Installation has one. A Workspace that had a key is refused in ensureWorkspaceKey.
    if (!(await ensureWorkspaceKey(id))) return cipherFromKeys(id, []);
    rows = await keyRows(id);
  }
  const keys: { version: number; key: Buffer }[] = [];
  for (const row of rows) {
    const wrapper = wrappers[row.wrapper];
    const opened = wrapper ? await wrapper.unwrap(id, row.version, row.wrapped) : null;
    if (!opened) throw new Error("This Workspace's key cannot be unwrapped. Was ZIFFR_SECRETS_KEY changed without ZIFFR_SECRETS_KEY_PREVIOUS?");
    // Opened only with ZIFFR_SECRETS_KEY_PREVIOUS: wrapped again under the current key at once, so the previous key
    // can go once every Workspace was used (spec 0009); the re-wrap job (ticket 6) catches the ones that were not.
    if (opened.stale) await rewrap(id, row, wrapper, opened.key);
    keys.push({ version: row.version, key: opened.key });
  }
  // The current version seals: the one not retired, else the newest. Another process may make a new version current
  // while this one still caches the old set for up to 10 minutes; changing a Workspace Key (ticket 6) has to allow
  // for that before it writes under the new version.
  const cipher = cipherFromKeys(id, keys, rows.find((r) => r.retired_at === null)?.version);
  for (const k of keys) k.key.fill(0);
  // Not kept when its key was destroyed while it loaded (see `destroyed`).
  if ((destroyed.get(id) ?? 0) === generation) cache.set(id, cipher);
  return cipher;
}

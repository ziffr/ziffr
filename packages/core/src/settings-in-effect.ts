// The settings in effect (spec 0025, ticket #197; GLOSSARY: Installation Settings): for every Installation Setting,
// the environment first, then the value an Installation Admin saved on the page, then the default (`<NAME>_DEFAULT`
// in the environment, which Docker sets for Mailpit). Everything that decides whether mail or replies work reads
// this, so the sign-in page, "What works here" and the queue keep saying the same thing. The environment is read on
// every call; the database at most every few seconds, so a saved value takes effect without a restart.
// It holds secrets: it stays on the server and is never handed to a page, a Connector or a browser.
import { db } from "./db";
import { INSTALLATION_SETTINGS } from "./installation-catalogue";
import { openSecretRotating, sealSecret } from "./secrets";

/** The environment as Ziffr's settings see it: process.env with the Installation Settings in effect put in. */
export type Settings = Record<string, string | undefined>;

/** Where a setting's value comes from: the server's environment, the page, the default, or nowhere. */
export type SettingSource = "server" | "page" | "default" | "none";

/** How long the database's values are kept in memory before they are read again. */
export const SETTINGS_CACHE_MS = 5_000;

/** The context a setting is sealed for: its own name, so a sealed value copied to another row does not open. */
export const settingContext = (name: string) => `installation-setting:${name}`;

const isSet = (v: string | undefined | null): v is string => typeof v === "string" && v.trim() !== "";

type Stored = { values: Map<string, string>; unreadable: Set<string>; at: number };
let cache: Stored | null = null;

/** Forgets what was read from the database, so the next read sees a change at once (after a save, in tests). */
export function forgetStoredSettings(): void {
  cache = null;
}

/** The values saved on the page, opened, and the names of sealed ones that no longer open (a lost or changed key).
 * A value only the previous key opens is sealed again under the current one. */
export async function storedSettings(): Promise<Omit<Stored, "at">> {
  if (cache && Date.now() - cache.at < SETTINGS_CACHE_MS) return cache;
  const values = new Map<string, string>();
  const unreadable = new Set<string>();
  const known = INSTALLATION_SETTINGS.map((s) => s.name);
  const { data, error } = await db().from("installation_settings").select("name, value, sealed").in("name", known);
  if (error) {
    // Before the migration ran, or the database is away for a moment: the environment alone, read again next time.
    console.error(`Installation Settings: could not be read (${error.code ?? "error"})`);
    return { values, unreadable };
  }
  for (const row of data ?? []) {
    const name = row.name as string;
    if (!row.sealed) { values.set(name, row.value as string); continue; }
    const opened = openSecretRotating(row.value as string, settingContext(name));
    if (!opened) { unreadable.add(name); continue; }
    values.set(name, opened.plain);
    if (opened.stale) {
      try {
        await db().from("installation_settings").update({ value: sealSecret(opened.plain, settingContext(name)) }).eq("name", name).eq("value", row.value as string);
      } catch {
        // Kept under the previous key; tried again on the next read.
      }
    }
  }
  cache = { values, unreadable, at: Date.now() };
  return cache;
}

/** The settings in effect: the environment, with each Installation Setting it leaves unset taken from the page,
 * else from its default. Server only: the result holds secrets. */
export async function settingsInEffect(env: Settings = process.env): Promise<Settings> {
  const { values } = await storedSettings();
  last = { values, at: Date.now() };
  const out: Settings = { ...env };
  for (const { name } of INSTALLATION_SETTINGS) {
    if (isSet(env[name])) continue;
    const v = values.get(name) ?? (isSet(env[`${name}_DEFAULT`]) ? env[`${name}_DEFAULT`] : undefined);
    if (v === undefined) delete out[name];
    else out[name] = v;
  }
  return out;
}

let last: { values: Map<string, string>; at: number } | null = null;

/** The settings in effect as last read, for code that cannot wait for the database (the words of an error made deep
 * in a call): the environment always, with what the page saved as of the last read a few seconds ago at most. */
export function settingsInEffectNow(env: Settings = process.env): Settings {
  const out: Settings = { ...env };
  for (const { name } of INSTALLATION_SETTINGS) {
    if (isSet(env[name])) continue;
    const v = (last && Date.now() - last.at < 60_000 ? last.values.get(name) : undefined) ?? (isSet(env[`${name}_DEFAULT`]) ? env[`${name}_DEFAULT`] : undefined);
    if (v === undefined) delete out[name];
    else out[name] = v;
  }
  return out;
}

/** Where each Installation Setting's value comes from now. */
export async function settingSources(env: Settings = process.env): Promise<Record<string, SettingSource>> {
  const { values } = await storedSettings();
  return Object.fromEntries(INSTALLATION_SETTINGS.map(({ name }) => [name,
    isSet(env[name]) ? "server" : values.has(name) ? "page" : isSet(env[`${name}_DEFAULT`]) ? "default" : "none"]));
}

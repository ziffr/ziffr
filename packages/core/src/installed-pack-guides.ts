// What Help has of the installed Packs (spec 0058, GLOSSARY: Pack Guide, Comes From, Pack): each one's guide, and what
// it brings with where its numbers come from. Every function takes the Actor first.
// Security: seen by exactly those who see the installed Packs (everyone in the Workspace but Guests, never an Access
// Key), and only of the actor's own Workspace. A guide and an overview are a stranger's words: they were checked when the
// Pack was installed, and are held to the same shapes again as they are read from the install, so a stored record that
// does not pass is not shown. Only they and the few words that name their Pack leave here, never the rest of the manifest.
import { db } from "./db";
import type { Actor } from "./actor";
import { checkSchema } from "./json-check";
import { checkGuide, PACK_GUIDE_SCHEMA, type PackGuide } from "@ziffr/pack/pack-guide";
import { readOverview, type KeptOverview } from "@ziffr/pack/comes-from";

/** The guide of a manifest as it may be shown: null when it has none, or none that passes the format's checks. */
export function safeGuide(manifest: unknown): PackGuide | null {
  const guide = (manifest as { guide?: unknown } | null | undefined)?.guide;
  if (guide === undefined || checkSchema(PACK_GUIDE_SCHEMA, guide).length) return null;
  let sound = true;
  checkGuide(guide as PackGuide, () => { sound = false; });
  return sound ? (guide as PackGuide) : null;
}

/** The overview of a manifest as it may be shown: null when it has none, or none of the right shape. */
export const safeOverview = (manifest: unknown): KeptOverview | null => readOverview((manifest as { overview?: unknown } | null | undefined)?.overview);

/** What Help has of an installed Pack: its guide, only where its numbers come from (when its creator said so for any),
 * or nothing. */
export type PackHelp = "guide" | "numbers" | null;

/** What Help has of the Pack an install's manifest describes. */
export function helpOf(manifest: unknown): PackHelp {
  if (safeGuide(manifest)) return "guide";
  return safeOverview(manifest)?.numbers.some((n) => n.by === "person" || n.by === "system") ? "numbers" : null;
}

/** An installed Pack that Help has something of, as Help lists it. */
export type InstalledGuideEntry = { installId: number; name: string; version: string };
/** An installed Pack's guide and overview, either of which it may lack, with whose words they are. */
export type InstalledGuide = InstalledGuideEntry & { author: string; guide: PackGuide | null; overview: KeptOverview | null };

/** Whether this actor sees the Workspace's installed Packs (spec 0030): a person who is not a Guest. */
const seesPacks = (actor: Actor) => !(actor as { key?: unknown }).key && actor.role !== "guest";

type Row = { id: unknown; version: unknown; manifest: unknown };
const entryOf = (r: Row): InstalledGuideEntry => ({ installId: Number(r.id), name: String((r.manifest as { name?: unknown } | null)?.name ?? ""), version: String(r.version) });

/** The installed Packs of the actor's Workspace that Help has something of, by name; empty for Guests and Access Keys. */
export async function listInstalledGuides(actor: Actor): Promise<InstalledGuideEntry[]> {
  if (!seesPacks(actor)) return [];
  const { data } = await db().from("pack_installs").select("id, version, manifest").eq("workspace_id", actor.workspaceId);
  return ((data ?? []) as Row[]).filter((r) => helpOf(r.manifest)).map(entryOf).sort((a, b) => a.name.localeCompare(b.name));
}

/** One installed Pack's guide and overview, or null when the actor does not see the installed Packs, the install is
 * not of their Workspace or Help has nothing of it: the answer does not say which. */
export async function readInstalledGuide(actor: Actor, installId: number): Promise<InstalledGuide | null> {
  if (!seesPacks(actor) || !Number.isSafeInteger(installId) || installId <= 0) return null;
  const { data } = await db().from("pack_installs").select("id, version, manifest").eq("id", installId).eq("workspace_id", actor.workspaceId).maybeSingle();
  if (!data || !helpOf(data.manifest)) return null;
  const author = String((data.manifest as { author?: { name?: unknown } }).author?.name ?? "");
  return { ...entryOf(data as Row), author, guide: safeGuide(data.manifest), overview: safeOverview(data.manifest) };
}

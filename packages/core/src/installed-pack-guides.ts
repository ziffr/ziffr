// The Pack Guides of the installed Packs (spec 0058, GLOSSARY: Pack Guide, Pack), read in Help. Every function takes the
// Actor first.
// Security: seen by exactly those who see the installed Packs (everyone in the Workspace but Guests, never an Access
// Key), and only of the actor's own Workspace. A guide is a stranger's text: it was checked when the Pack was installed,
// and it is held to the same checks again as it is read from the install, so a stored record that does not pass is not
// shown. Only the guide and the few words that name its Pack leave here, never the rest of the manifest.
import { db } from "./db";
import type { Actor } from "./actor";
import { checkSchema } from "./json-check";
import { checkGuide, PACK_GUIDE_SCHEMA, type PackGuide } from "@ziffr/pack/pack-guide";

/** The guide of a manifest as it may be shown: null when it has none, or none that passes the format's checks. */
export function safeGuide(manifest: unknown): PackGuide | null {
  const guide = (manifest as { guide?: unknown } | null | undefined)?.guide;
  if (guide === undefined || checkSchema(PACK_GUIDE_SCHEMA, guide).length) return null;
  let sound = true;
  checkGuide(guide as PackGuide, () => { sound = false; });
  return sound ? (guide as PackGuide) : null;
}

/** An installed Pack that has a guide, as Help lists it. */
export type InstalledGuideEntry = { installId: number; name: string; version: string };
/** An installed Pack's guide, with whose words it is. */
export type InstalledGuide = InstalledGuideEntry & { author: string; guide: PackGuide };

/** Whether this actor sees the Workspace's installed Packs (spec 0030): a person who is not a Guest. */
const seesPacks = (actor: Actor) => !(actor as { key?: unknown }).key && actor.role !== "guest";

type Row = { id: unknown; version: unknown; manifest: unknown };
const entryOf = (r: Row): InstalledGuideEntry => ({ installId: Number(r.id), name: String((r.manifest as { name?: unknown } | null)?.name ?? ""), version: String(r.version) });

/** The installed Packs of the actor's Workspace that have a guide, by name; empty for Guests and Access Keys. */
export async function listInstalledGuides(actor: Actor): Promise<InstalledGuideEntry[]> {
  if (!seesPacks(actor)) return [];
  const { data } = await db().from("pack_installs").select("id, version, manifest").eq("workspace_id", actor.workspaceId);
  return ((data ?? []) as Row[]).filter((r) => safeGuide(r.manifest)).map(entryOf).sort((a, b) => a.name.localeCompare(b.name));
}

/** One installed Pack's guide, or null when the actor does not see the installed Packs, the install is not of their
 * Workspace or it has no guide: the answer does not say which. */
export async function readInstalledGuide(actor: Actor, installId: number): Promise<InstalledGuide | null> {
  if (!seesPacks(actor) || !Number.isSafeInteger(installId) || installId <= 0) return null;
  const { data } = await db().from("pack_installs").select("id, version, manifest").eq("id", installId).eq("workspace_id", actor.workspaceId).maybeSingle();
  const guide = safeGuide((data as Row | null)?.manifest);
  if (!data || !guide) return null;
  const author = String((data.manifest as { author?: { name?: unknown } }).author?.name ?? "");
  return { ...entryOf(data as Row), author, guide };
}

// Ziffr's own Packs in the app (spec 0052, ticket 4; GLOSSARY: Pack, Preview, Sample Data): the thirteen Packs of the
// packs folder come with the release (included-packs.generated.ts, written by scripts/generate-included-packs.mjs), so a
// Workspace installs them from the Packs page on any Installation, with no Marketplace and no download.
// Security: the browser names a Pack only by its id, which is looked up in the list below and never used as a path or
// a query; the text installed is always the bundled text, checked in full by checkPack like any Pack's file (the build
// checks it too: included-packs.test.ts). Owners and Admins only, never an Access Key, never the demo; nothing installs
// without a person's call, and an update is offered, never applied by itself. Nothing here leaves the Installation.
import { db } from "./db";
import { Forbidden, type Actor } from "./actor";
import { checkPack, versionBelow, type Pack } from "./pack";
import { INCLUDED_PACK_FILES } from "./included-packs.generated";
import { assertManages, installPack, previewPack, safeLogo, type PackOrigin, type PackRead } from "./packs";
import { readPackUpdate, updatePack, type UpdatePlan } from "./pack-updates";
import { rankPacks, SUGGESTED, type RankAnswers, type Reason } from "./pack-ranking";
import { businessFunctions, myBusinessFunction, type BusinessFunction } from "./business-function";
import { workspaceProfile } from "./workspace-settings";
import { DEMO_WORKSPACE_ID } from "./team";

/** Where an install of one of Ziffr's own Packs is recorded: signed, because it is part of Ziffr's code. */
export const INCLUDED: PackOrigin = { source: "included", signed: true };

/** The order Ziffr ships its Packs in (and the Setup Guide ranks ties by): the five business Packs, the function Packs, the rest. */
export const INCLUDED_PACK_ORDER = [
  "ziffr/saas-metrics", "ziffr/online-shop", "ziffr/agency", "ziffr/sports-club", "ziffr/board-meeting",
  "ziffr/sales", "ziffr/sales-forecast", "ziffr/finance", "ziffr/people", "ziffr/customer-support", "ziffr/fulfilment",
  "ziffr/workspace-usage", "ziffr/ziffr-operations",
] as const;

/** One bundled Pack: its id, exact file text and the Pack checked from it. */
type Bundled = { id: string; text: string; pack: Pack };

let cache: Map<string, Bundled> | null = null;

/** The bundled Packs by id, in shipping order, each checked in full on first use; a file that fails the checks throws,
 * so a broken Pack cannot ship unnoticed (the test and the first call both say which). */
export function bundledPacks(): Map<string, Bundled> {
  if (cache) return cache;
  const rank = (id: string) => { const i = (INCLUDED_PACK_ORDER as readonly string[]).indexOf(id); return i < 0 ? INCLUDED_PACK_ORDER.length : i; };
  const found: Bundled[] = INCLUDED_PACK_FILES.map(([file, text]) => {
    const res = checkPack(text);
    if (!res.ok) throw new Error(`packs/${file}.pack.json is not a Pack Ziffr can install: ${res.problems[0]?.message ?? ""}`);
    if (res.pack.id !== `ziffr/${file}`) throw new Error(`packs/${file}.pack.json has the id “${res.pack.id}”, not “ziffr/${file}”.`);
    return { id: res.pack.id, text, pack: res.pack };
  }).sort((a, b) => rank(a.id) - rank(b.id) || a.id.localeCompare(b.id));
  cache = new Map(found.map((b) => [b.id, b]));
  return cache;
}

/** The bundled Pack for an id from outside, or a refusal: matched against the list, never used as a path. */
function bundled(id: unknown): Bundled {
  const b = typeof id === "string" ? bundledPacks().get(id) : undefined;
  if (!b) throw new Forbidden("Ziffr has no such Pack of its own.");
  return b;
}

/** What one of Ziffr's own Packs brings, by kind: how many and the first names. Taken from the Pack file only. */
export type IncludedBrings = { kind: "metric" | "dashboard" | "deck" | "workflow" | "view" | "theme" | "recipe"; count: number; names: string[] };

/** One of Ziffr's own Packs as the Packs page lists it. */
export type IncludedPackListing = {
  id: string; name: string; summary: string; version: string;
  /** The Pack's logo as a checked data address, or null; drawn in an `img` only. */
  logo: string | null;
  brings: IncludedBrings[];
  /** The install of this Pack in the Workspace, or null. */
  installed: { installId: number; version: string } | null;
  /** The bundled version when it is newer than the installed one (offered, never applied by itself), or null. */
  update: string | null;
  /** Installing it needs an Owner (it holds Themes). */
  needsOwner: boolean;
};

/** Counts and first names of what a Pack file brings. */
export function bringsOf(pack: Pack, names = 5): IncludedBrings[] {
  const c = pack.contents;
  const of = (kind: IncludedBrings["kind"], list: { name: string }[] | undefined): IncludedBrings[] => list?.length ? [{ kind, count: list.length, names: list.slice(0, names).map((x) => x.name) }] : [];
  return [
    ...of("metric", c.metrics?.map((m) => m.metric)),
    ...of("dashboard", c.dashboards?.map((d) => d.template)),
    ...of("deck", c.decks?.map((d) => d.template)),
    ...of("workflow", c.workflows?.map((w) => w.template)),
    ...of("view", c.views?.map((v) => v.design)),
    ...of("recipe", c.analyses?.map((a) => ({ name: a.recipe.name }))),
    ...of("theme", c.themes?.map((t) => t.theme)),
  ];
}

/** Ziffr's own Packs with what each brings and whether this Workspace has it (Owners and Admins; nothing for anyone
 * else, since they cannot install). Only manifest words and names from the bundled files, nothing of another Workspace. */
export async function listIncludedPacks(actor: Actor): Promise<IncludedPackListing[]> {
  if ((actor as { key?: unknown }).key || (actor.role !== "owner" && actor.role !== "admin")) return [];
  const { data } = await db().from("pack_installs").select("id, pack_id, version, source").eq("workspace_id", actor.workspaceId);
  const mine = new Map((data ?? []).map((r) => [String(r.pack_id), r]));
  return [...bundledPacks().values()].map(({ id, pack }) => {
    const row = mine.get(id);
    // Only an install made from the bundle is offered the bundled version: an uploaded file under the same id is not Ziffr's.
    const from = row && row.source === "included" ? String(row.version) : null;
    return {
      id, name: pack.name, summary: pack.summary, version: pack.version, logo: safeLogo(pack), brings: bringsOf(pack),
      installed: row ? { installId: Number(row.id), version: String(row.version) } : null,
      update: from !== null && versionBelow(from, pack.version) ? pack.version : null,
      needsOwner: (pack.contents.themes?.length ?? 0) > 0,
    };
  });
}

/** The Preview of one of Ziffr's own Packs, drawn later with Sample Data (Owners and Admins); nothing is written. */
export async function readIncludedPack(actor: Actor, packId: string): Promise<PackRead> {
  assertManages(actor);
  return previewPack(actor, bundled(packId).text, INCLUDED);
}

/** Installs one of Ziffr's own Packs (Owners and Admins; Owners for one with Themes; never in the demo) through the one
 * install path, as from `included`: no confirmation about the Marketplace, but the one about texts aimed at assistants
 * stays. Called only by a person's click; audited as `pack.installed` with source included. Returns the install's id. */
export async function installIncludedPack(actor: Actor, packId: string, confirmed: { assistantTexts?: boolean } = {}): Promise<number> {
  assertManages(actor);
  return installPack(actor, bundled(packId).text, INCLUDED, { unsigned: false, assistantTexts: confirmed?.assistantTexts === true });
}

/** The bundled file for an install made from the bundle, or a refusal: another source's install is not Ziffr's to update. */
async function includedInstall(actor: Actor, installId: number): Promise<Bundled> {
  if (!Number.isInteger(installId)) throw new Forbidden();
  const { data } = await db().from("pack_installs").select("pack_id, source").eq("id", installId).eq("workspace_id", actor.workspaceId).maybeSingle();
  if (!data || data.source !== "included") throw new Forbidden();
  return bundled(String(data.pack_id));
}

/** What updating an installed one of Ziffr's own Packs to the bundled version would do (Owners and Admins); nothing is written. */
export async function readIncludedUpdate(actor: Actor, installId: number) {
  assertManages(actor);
  return readPackUpdate(actor, Number(installId), (await includedInstall(actor, Number(installId))).text);
}

/** Updates an installed one of Ziffr's own Packs to the bundled version after the person saw what changes (Owners and
 * Admins). What the Workspace changed stays; the new version is offered beside it, as for any Pack. */
export async function updateIncludedPack(actor: Actor, installId: number, confirmed: { assistantTexts?: boolean } = {}): Promise<UpdatePlan> {
  assertManages(actor);
  return updatePack(actor, Number(installId), (await includedInstall(actor, Number(installId))).text, INCLUDED, { unsigned: false, assistantTexts: confirmed?.assistantTexts === true });
}

/** One of Ziffr's own Packs as the Setup Guide suggests it: what the Pack file says of itself and why it fits, nothing more. */
export type RecommendedPack = {
  id: string; name: string; summary: string;
  /** The Pack's logo as a checked data address, or null; drawn in an `img` only. */
  logo: string | null;
  /** What it brings, by kind: counts and the first names, from the Pack file. */
  brings: IncludedBrings[];
  /** Which parts of its audience matched the answers, best first; empty when none did. */
  because: Reason[];
  /** Among the first three with a match: the ones the guide puts on top. Every Pack is still in the list. */
  suggested: boolean;
  /** Already installed in this Workspace: shown as Installed, never offered again. */
  installed: boolean;
  /** The id of this Workspace's install, for the link to the installed Pack in the guide; null when not installed. */
  installId: number | null;
  /** Installing it needs an Owner (it holds Themes). */
  needsOwner: boolean;
};

/** Ziffr's own Packs in the order that fits this Workspace best, every one of them, for the Setup Guide's Starting point.
 * Owners and Admins only (they alone can install): a Member, a Guest, an Access Key and the demo get nothing. It reads the
 * Workspace Profile, the viewer's own Business Function and the functions of the Workspace's Owners and Admins (whom the
 * viewer may see them of anyway), and returns per Pack only the Pack file's own words, what it brings and the reasons as
 * keys: never a person, a function's owner or another Workspace's data. Computed on every call, never stored. */
export async function recommendedPacks(actor: Actor): Promise<RecommendedPack[]> {
  if ((actor as { key?: unknown }).key || (actor.role !== "owner" && actor.role !== "admin") || actor.workspaceId === DEMO_WORKSPACE_ID) return [];
  const [listing, profile, mine, all, { data: managers }] = await Promise.all([
    listIncludedPacks(actor), workspaceProfile(actor), myBusinessFunction(actor), businessFunctions(actor),
    db().from("memberships").select("user_id").eq("workspace_id", actor.workspaceId).in("role", ["owner", "admin"]),
  ]);
  if (listing.length === 0) return [];
  const managing = new Set((managers ?? []).map((m) => String(m.user_id)));
  const functions = new Set<BusinessFunction>(all.filter((f) => managing.has(f.personId)).map((f) => f.function));
  if (mine) functions.add(mine);
  const answers: RankAnswers = { industry: profile.industry, segment: profile.segment, country: profile.country, employeeBand: profile.employeeBand, revenueBand: profile.revenueBand, functions: [...functions] };
  const bundle = bundledPacks();
  const ranked = rankPacks(answers, listing.map((l) => ({ id: l.id, name: l.name, audience: bundle.get(l.id)?.pack.audience })), INCLUDED_PACK_ORDER);
  const byId = new Map(listing.map((l) => [l.id, l]));
  const top = new Set(ranked.filter((r) => r.score > 0).slice(0, SUGGESTED).map((r) => r.id));
  return ranked.map((r) => {
    const l = byId.get(r.id)!;
    return { id: l.id, name: l.name, summary: l.summary, logo: l.logo, brings: l.brings, because: r.because, suggested: top.has(r.id), installed: l.installed !== null, installId: l.installed?.installId ?? null, needsOwner: l.needsOwner };
  });
}

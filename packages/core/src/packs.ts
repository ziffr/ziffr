// Installing Packs from an uploaded file (spec 0030, GLOSSARY: Pack, Metric Catalog, Dashboard Template, Deck
// Template, Workflow Template, View Design, Analysis Recipe, Theme). Every function takes the Actor first.
// Security: a Pack is untrusted input. It is checked in full on the server (checkPack) before anything is shown or
// written, by Owners and Admins only (Owners for a Pack with Themes), never in the demo. Installing copies each item
// into the table it lives in today, in one database step, and creates no Metric, Workflow, dashboard or deck, sends
// nothing and changes nothing already in the Workspace. Items are matched by key through Maps, never as fields of a
// plain object, so a key such as "constructor" is only a key.
import { createHash } from "node:crypto";
import { db } from "./db";
import { Forbidden, type Actor } from "./actor";
import { audit } from "./audit-log";
import { canonical } from "./api-submissions";
import { checkPack, type Pack } from "./pack";
import { dashboardTemplateFromFile, templateSlots } from "./dashboard-template-file";
import { deckTemplateFromFile } from "./deck-template-file";
import { workflowTemplateFromFile } from "./workflow-template-file";
import { themeFromFile } from "./theme-file";
import { checkViewDesignValue, type ViewDesign } from "./view-design";
import { designWithRecipe } from "./design-files";
import { MAX_WORKSPACE_DESIGNS } from "./view-designs";
import type { DashboardTemplateBody, DeckTemplateBody, Slot, ThemeSlides, ThemeTokens, WorkflowTemplateBody } from "./types";

/** One item of a Pack as the Packs page lists it before installing, already in the form it would be stored in, so its
 * Preview draws exactly what installing adds (with Sample Data, never a Workspace's values). */
export type PackPreviewItem =
  | { kind: "metric"; key: string; name: string; description: string; period: string; unit: string; derived: boolean }
  | { kind: "dashboard"; key: string; name: string; description: string; slots: Slot[]; body: DashboardTemplateBody }
  | { kind: "deck"; key: string; name: string; description: string; slots: Slot[]; slides: number }
  | { kind: "workflow"; key: string; name: string; description: string; body: WorkflowTemplateBody }
  | { kind: "view"; key: string; name: string; description: string; body: ViewDesign }
  | { kind: "theme"; key: string; name: string; tokens: ThemeTokens };

/** What a person sees of a Pack before installing it: its manifest, every item, and what to know first. */
export type PackPreview = {
  manifest: Omit<Pack, "contents">;
  items: PackPreviewItem[];
  /** The file came from outside the Marketplace: shown as UNSIGNED_WARNING, and installing asks to confirm it. */
  unsigned: boolean;
  /** Texts that address an AI assistant, by where they are, for a person to read before installing. */
  assistantTexts: { path: string; text: string }[];
  /** Why this person cannot install it here, or null: a Pack with Themes needs an Owner, an installed Pack is not
   * installed twice. */
  blocked: string | null;
};

/** What reading a Pack file gives: its Preview, or every problem found, with its line. */
export type PackRead = { ok: true; preview: PackPreview } | { ok: false; problems: { path: string; line: number | null; message: string }[] };

// A person who manages the Workspace, not a program: Access Keys and Feeds install nothing.
/** Refuses anyone but a person who is an Owner or Admin of a Workspace that is not the demo. */
export function assertManages(actor: Actor) {
  if ((actor as { key?: unknown }).key) throw new Forbidden();
  if (actor.role !== "owner" && actor.role !== "admin") throw new Forbidden("Only Owners and Admins install Packs.");
}

/** The hash of an item as installed: of what is stored, with its fields in a fixed order, so an unchanged copy hashes
 * the same and a changed one does not (updating, #276). */
export const itemHash = (stored: unknown) => createHash("sha256").update(canonical(stored)).digest("hex");

/** Every item of a checked Pack as it would be stored, in the order of its kinds. View Designs, and Analysis Recipes
 * as View Designs that draw them (the Workspace keeps recipes inside designs), are checked again as they are stored. */
export function storedItems(pack: Pack) {
  const c = pack.contents;
  const designs = new Map<string, ViewDesign>((c.views ?? []).map((v) => [v.key, v.design]));
  const recipeDesigns = (c.analyses ?? []).map((a) => ({ key: a.key, body: designWithRecipe(a.recipe) }));
  for (const d of recipeDesigns) if (!checkViewDesignValue(d.body).ok) throw new Error(`The Analysis Recipe “${d.key}” cannot be drawn as a View Design.`);
  const catalog = (c.metrics ?? []).map(({ key, metric: m }) => {
    const row = {
      category: m.category ?? pack.name, name: m.name, description: m.description ?? "", unit: m.unit ?? "", unit_position: m.unitPosition ?? "after",
      format: m.valueFormat ?? "number", decimals: m.decimals ?? 0, period: m.period, submission_rule: m.submissionRule ?? "overwrite", polarity: m.polarity,
      target_min: m.targetMin ?? null, target_max: m.targetMax ?? null, sources: m.formula ? [] : (m.sources ?? ["web_form", "mail", "slack", "telegram", "api"]),
      aggregation: m.aggregation, industries: m.industries ?? null, segments: m.segments ?? null, formula: m.formula ?? null,
    };
    return { key, ...row, hash: itemHash(row) };
  });
  const template = (kind: "dashboard" | "deck" | "workflow", key: string, name: string, description: string, slots: Slot[], body: unknown, extra: Record<string, unknown> = {}) => {
    const row = { kind, name, description, slots, body };
    return { key, ...row, ...extra, hash: itemHash(row) };
  };
  const templates = [
    ...(c.dashboards ?? []).map(({ key, template: t }) => { const made = dashboardTemplateFromFile(t, designs); return template("dashboard", key, t.name, t.description ?? "", made.slots, made.body); }),
    ...(c.decks ?? []).map(({ key, template: t }) => template("deck", key, t.name, t.description ?? "", templateSlots(t.slots), deckTemplateFromFile(t, designs, null) as DeckTemplateBody, t.theme ? { theme_key: t.theme } : {})),
    ...(c.workflows ?? []).map(({ key, template: t }) => template("workflow", key, t.name, t.description ?? "", [], workflowTemplateFromFile(t))),
  ];
  const views = [...(c.views ?? []).map((v) => ({ key: v.key, body: v.design })), ...recipeDesigns].map(({ key, body }) => ({ key, name: body.name, body, hash: itemHash({ name: body.name, body }) }));
  const themes = (c.themes ?? []).map(({ key, theme }) => { const t = themeFromFile(theme); return { key, name: t.name, tokens: t.tokens, slides: t.slides as ThemeSlides, hash: itemHash(t) }; });
  return { catalog, templates, views, themes };
}

/** The keys of every item a Pack adds, so an update can tell what the Workspace removed since. */
export const itemKeys = (stored: ReturnType<typeof storedItems>) => [...stored.catalog, ...stored.templates, ...stored.views, ...stored.themes].map((x) => x.key);

/** Why this actor cannot install this Pack in their Workspace, or null. */
async function blockedFor(actor: Actor, pack: Pack): Promise<string | null> {
  if ((pack.contents.themes?.length ?? 0) > 0 && actor.role !== "owner") return "This Pack holds Themes, and only Owners change Themes: an Owner installs it.";
  const { data } = await db().from("pack_installs").select("version").eq("workspace_id", actor.workspaceId).eq("pack_id", pack.id).maybeSingle();
  if (data) return `${pack.name} ${data.version} is installed already. Updating an installed Pack comes in a later version of Ziffr.`;
  const views = (pack.contents.views?.length ?? 0) + (pack.contents.analyses?.length ?? 0);
  if (views) {
    const { count } = await db().from("view_designs").select("id", { count: "exact", head: true }).eq("workspace_id", actor.workspaceId);
    if ((count ?? 0) + views > MAX_WORKSPACE_DESIGNS) return `A Workspace keeps at most ${MAX_WORKSPACE_DESIGNS} View Designs; this Pack adds ${views}. Remove some first.`;
  }
  return null;
}

/** A Pack's manifest: everything but its contents. */
export const manifestOf = (p: Pack): Omit<Pack, "contents"> => {
  const { contents: _c, ...m } = p; // eslint-disable-line @typescript-eslint/no-unused-vars
  return m;
};

/** Where a Pack's file came from: an upload (never signed here), or the Marketplace with its signature checked. */
export type PackOrigin = { source: "upload" | "marketplace"; signed: boolean };
const UPLOAD: PackOrigin = { source: "upload", signed: false };

/** Reads an uploaded Pack file for its Preview (Owners and Admins): checked in full here, whatever the browser did.
 * Nothing is written. An uploaded file carries no Marketplace signature here, so it is always shown as unsigned. */
export async function readPackFile(actor: Actor, text: string): Promise<PackRead> {
  return previewPack(actor, text, UPLOAD);
}

/** A Pack's Preview, for a file from `origin` (the Marketplace module checks a signature before it calls this). */
export async function previewPack(actor: Actor, text: string, origin: PackOrigin): Promise<PackRead> {
  assertManages(actor);
  const res = checkPack(typeof text === "string" ? text : "");
  if (!res.ok) return res;
  const { pack } = res;
  const stored = storedItems(pack);
  const by = <T extends { key: string }>(xs: T[]) => new Map(xs.map((x) => [x.key, x]));
  const [views, templates] = [by(stored.views), by(stored.templates)];
  const items: PackPreviewItem[] = [
    ...(pack.contents.metrics ?? []).map(({ key, metric: m }): PackPreviewItem => ({ kind: "metric", key, name: m.name, description: m.description ?? "", period: m.period, unit: m.unit ?? "", derived: m.formula !== undefined })),
    ...(pack.contents.dashboards ?? []).map(({ key }): PackPreviewItem => { const t = templates.get(key)!; return { kind: "dashboard", key, name: t.name, description: t.description, slots: t.slots, body: t.body as DashboardTemplateBody }; }),
    ...(pack.contents.decks ?? []).map(({ key }): PackPreviewItem => { const t = templates.get(key)!; return { kind: "deck", key, name: t.name, description: t.description, slots: t.slots, slides: (t.body as DeckTemplateBody).slides.length }; }),
    ...(pack.contents.workflows ?? []).map(({ key }): PackPreviewItem => { const t = templates.get(key)!; return { kind: "workflow", key, name: t.name, description: t.description, body: t.body as WorkflowTemplateBody }; }),
    ...[...(pack.contents.views ?? []), ...(pack.contents.analyses ?? [])].map(({ key }): PackPreviewItem => { const v = views.get(key)!; return { kind: "view", key, name: v.name, description: v.body.description ?? "", body: v.body }; }),
    ...stored.themes.map((t): PackPreviewItem => ({ kind: "theme", key: t.key, name: t.name, tokens: t.tokens })),
  ];
  return { ok: true, preview: { manifest: manifestOf(pack), items, unsigned: !origin.signed, assistantTexts: res.assistantTexts.map(({ path, text: t }) => ({ path, text: t })), blocked: await blockedFor(actor, pack) } };
}

/** Installs an uploaded Pack file (Owners and Admins; Owners for one with Themes; never in the demo), after the person
 * confirmed the file did not come from the Marketplace, and, when it has any, that they read its texts aimed at
 * assistants. Checked again in full here. One database step: the Pack is installed whole or not at all. Audited. */
export async function installPackFile(actor: Actor, text: string, confirmed: { unsigned: boolean; assistantTexts: boolean }): Promise<number> {
  return installPack(actor, text, UPLOAD, confirmed);
}

/** Installs a Pack's file from `origin`: an unsigned one only after the person confirmed it; texts aimed at assistants
 * only after they were read. Everything else as for an upload. */
export async function installPack(actor: Actor, text: string, origin: PackOrigin, confirmed: { unsigned: boolean; assistantTexts: boolean }): Promise<number> {
  assertManages(actor);
  const res = checkPack(typeof text === "string" ? text : "");
  if (!res.ok) throw new Error(`The Pack cannot be installed: ${res.problems[0].path ? `${res.problems[0].path} ` : ""}${res.problems[0].message}`);
  const { pack } = res;
  if (!origin.signed && !confirmed?.unsigned) throw new Error("Confirm that you install a file the Marketplace did not check.");
  if (res.assistantTexts.length && !confirmed.assistantTexts) throw new Error("Confirm that you read the texts aimed at assistants first.");
  const blocked = await blockedFor(actor, pack);
  if (blocked) throw new Forbidden(blocked);
  const stored = storedItems(pack);
  const { data, error } = await db().rpc("install_pack", {
    p_workspace: actor.workspaceId,
    p_by: actor.personId,
    p_install: { pack_id: pack.id, version: pack.version, license: pack.license, source: origin.source, signed: origin.signed, manifest: manifestOf(pack), item_keys: itemKeys(stored) },
    p_catalog: stored.catalog,
    p_templates: stored.templates,
    p_designs: stored.views,
    p_themes: stored.themes,
  });
  // A Pack installed in the meantime breaks the unique install; anything else (a name its Workspace has already, the
  // View Design limit) leaves nothing behind either, and says no more than that.
  if (error || data === null) {
    const twice = error?.code === "23505" && /pack_installs_workspace_id_pack_id_key/.test(error.message ?? "");
    const named = error?.code === "23505" && /catalog_metrics_workspace_name_key/.test(error.message ?? "");
    throw new Error(twice ? `${pack.name} is installed already.` : named ? "This Workspace's Metric Catalog has an entry of the same name as one of this Pack's already; nothing was added." : "The Pack could not be installed; nothing was added.");
  }
  const id = Number(data);
  await audit(actor, { kind: "pack.installed", object: { type: "pack", id, name: pack.name }, details: { pack: pack.id, version: pack.version, source: origin.source, signed: origin.signed } });
  return id;
}

/** One installed Pack as the Packs page lists it, with what it added that is still marked as from it. */
export type InstalledPack = {
  id: number; packId: string; name: string; version: string; license: string; author: string; summary: string;
  source: "upload" | "marketplace"; signed: boolean; installedAt: string; installedBy: string | null;
  listing: { homepage?: string; support?: string };
  added: { kind: "metric" | "dashboard" | "deck" | "workflow" | "view" | "theme"; name: string }[];
};

/** The Workspace's installed Packs and what each added, for everyone in it but Guests (spec 0030: Members see them).
 * Only names and kinds of what was added: the items themselves are in the Workspace's own lists. */
export async function listInstalledPacks(actor: Actor): Promise<InstalledPack[]> {
  if ((actor as { key?: unknown }).key || actor.role === "guest") return [];
  const ws = actor.workspaceId;
  const { data } = await db().from("pack_installs").select("id, pack_id, version, license, source, signed, manifest, installed_by, installed_at").eq("workspace_id", ws).order("installed_at");
  if (!data?.length) return [];
  const ids = data.map((r) => r.id as number);
  const [cat, tpl, des, thm] = await Promise.all([
    db().from("catalog_metrics").select("name, pack_install_id").eq("workspace_id", ws).in("pack_install_id", ids),
    db().from("team_templates").select("kind, name, pack_install_id").eq("workspace_id", ws).in("pack_install_id", ids),
    db().from("view_designs").select("name, pack_install_id").eq("workspace_id", ws).in("pack_install_id", ids),
    db().from("themes").select("name, pack_install_id").eq("workspace_id", ws).in("pack_install_id", ids),
  ]);
  const added = new Map<number, InstalledPack["added"]>(ids.map((i) => [i, []]));
  const add = (rows: { name: unknown; pack_install_id: unknown; kind?: unknown }[] | null, kind: (r: { kind?: unknown }) => InstalledPack["added"][number]["kind"]) => {
    for (const r of rows ?? []) added.get(Number(r.pack_install_id))?.push({ kind: kind(r), name: String(r.name) });
  };
  add(cat.data, () => "metric");
  add(tpl.data, (r) => r.kind as "dashboard" | "deck" | "workflow");
  add(des.data, () => "view");
  add(thm.data, () => "theme");
  return data.map((r) => {
    const m = r.manifest as Omit<Pack, "contents">;
    return {
      id: Number(r.id), packId: String(r.pack_id), name: m.name, version: String(r.version), license: String(r.license), author: m.author?.name ?? "", summary: m.summary ?? "",
      source: r.source as "upload" | "marketplace", signed: Boolean(r.signed), installedAt: String(r.installed_at), installedBy: (r.installed_by as string | null) ?? null,
      listing: m.listing ?? {}, added: added.get(Number(r.id)) ?? [],
    };
  });
}

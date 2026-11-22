// Updating and uninstalling Packs (spec 0030, #276; GLOSSARY: Pack). Every function takes the Actor first; Owners and
// Admins only (Owners when Themes are involved), never in the demo.
// An item nobody changed is replaced by the new version; one the Workspace changed is kept as it is, with the new
// version waiting beside it until someone takes it. Uninstalling removes what nobody changed and nothing uses, and
// keeps the rest without its mark. What was made from a Pack (Metrics, dashboards, decks, Workflows) is never touched.
// Security: a new version is checked in full like any Pack file, and each step is one database step.
import { db } from "./db";
import { Forbidden, type Actor } from "./actor";
import { audit } from "./audit-log";
import { checkPack, versionBelow, type Pack } from "./pack";
import { cleanLogo, PACK_LOGO_MAX_BYTES } from "@ziffr/pack/logo";
import { assertManages, itemHash, packLogoOf, themeHashInput, itemKeys, manifestOf, PACK_CAPS, storedItems, type PackOrigin } from "./packs";
import { ensureBaseline, recordVersion } from "./versions";

/** Where an installed item lives. */
type Table = "catalog" | "templates" | "designs" | "themes";
const TABLE: Record<Table, string> = { catalog: "catalog_metrics", templates: "team_templates", designs: "view_designs", themes: "themes" };
const CATALOG_FIELDS = ["category", "name", "description", "unit", "unit_position", "format", "decimals", "period", "submission_rule", "polarity", "target_min", "target_max", "sources", "aggregation", "industries", "segments", "formula"] as const;

/** What a Pack item is, in the words the pages use. */
export type ItemKind = "metric" | "dashboard" | "deck" | "workflow" | "view" | "theme";

/** One copy of an installed item in the Workspace: where it is, the hash it was installed with, and its hash now. */
type Copy = { table: Table; id: number; key: string; kind: ItemKind; name: string; installedHash: string; currentHash: string; offer: unknown; updatedAt: string | null; };

/** What is hashed of a stored row: exactly what installing hashed (packs.ts storedItems), read back from the database. */
function stored(table: Table, r: Record<string, unknown>, ownThemes: ReadonlySet<number>, packLogo: string | null): unknown {
  if (table === "catalog") {
    const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
    const row = Object.fromEntries(CATALOG_FIELDS.map((f) => [f, f === "target_min" || f === "target_max" ? n(r[f]) : f === "decimals" ? Number(r[f]) : r[f] ?? null]));
    // As installing hashed it: the field is there only for an entry that brings Tags (packs.ts storedItems).
    return Array.isArray(r.tags) && r.tags.length ? { ...row, tags: r.tags } : row;
  }
  if (table === "templates") {
    // A Deck Template's Theme is the installed Theme's id, which the hash leaves out: it was not known when hashed. Any
    // other Theme is a change the Workspace made.
    const theme = (r.body as { themeId?: unknown } | null)?.themeId;
    const body = r.kind === "deck" && (theme === null || theme === undefined || ownThemes.has(Number(theme))) ? { ...(r.body as object), themeId: null } : r.body;
    return { kind: r.kind, name: r.name, description: r.description, slots: r.slots, body };
  }
  if (table === "designs") return { name: r.name, body: r.body };
  return themeHashInput(r.name, r.tokens, r.slides as Record<string, unknown> | null, packLogo);
}

const kindOf = (table: Table, r: Record<string, unknown>): ItemKind => (table === "catalog" ? "metric" : table === "designs" ? "view" : table === "themes" ? "theme" : (r.kind as ItemKind));

/** The install of this Workspace by id, or Forbidden. */
async function installOf(actor: Actor, installId: number) {
  if (!Number.isInteger(installId)) throw new Forbidden();
  const { data } = await db().from("pack_installs").select("id, pack_id, version, item_keys, manifest").eq("id", installId).eq("workspace_id", actor.workspaceId).maybeSingle();
  if (!data) throw new Forbidden();
  return data as { id: number; pack_id: string; version: string; item_keys: string[]; manifest: Omit<Pack, "contents"> };
}

/** Every copy still marked as from this install, with its hash as installed and now. */
async function copiesOf(actor: Actor, installId: number): Promise<Copy[]> {
  const cols: Record<Table, string> = {
    catalog: `id, pack_key, pack_hash, pack_offer, tags, ${CATALOG_FIELDS.join(", ")}`,
    templates: "id, pack_key, pack_hash, pack_offer, updated_at, kind, name, description, slots, body",
    designs: "id, pack_key, pack_hash, pack_offer, name, body",
    themes: "id, pack_key, pack_hash, pack_offer, updated_at, name, tokens, slides",
  };
  const out: Copy[] = [];
  const ownThemes = new Set<number>();
  // The Pack's logo as installed, from the install's own record, checked again as it is read.
  const { data: inst } = await db().from("pack_installs").select("manifest").eq("id", installId).eq("workspace_id", actor.workspaceId).maybeSingle();
  const kept = (inst?.manifest as { logo?: unknown } | null)?.logo;
  const packLogo = kept === undefined ? null : cleanLogo(kept, PACK_LOGO_MAX_BYTES);
  // Themes first: whether a Deck Template still uses the Theme installed with it depends on them.
  for (const table of ["themes", "catalog", "templates", "designs"] as Table[]) {
    const { data, error } = await db().from(TABLE[table]).select(cols[table]).eq("workspace_id", actor.workspaceId).eq("pack_install_id", installId);
    if (error) throw new Error("The Pack's items could not be read.");
    for (const r of (data ?? []) as unknown as Record<string, unknown>[]) {
      if (table === "themes") ownThemes.add(Number(r.id));
      out.push({ table, id: Number(r.id), key: String(r.pack_key), kind: kindOf(table, r), name: String(r.name), installedHash: String(r.pack_hash), currentHash: itemHash(stored(table, r, ownThemes, packLogo)), offer: r.pack_offer ?? null, updatedAt: (r.updated_at as string | null) ?? null });
    }
  }
  return out;
}

/** The Themes of the Workspace something uses: a dashboard's, a deck's, or the default. */
async function themesInUse(actor: Actor, ids: number[]): Promise<Set<number>> {
  if (!ids.length) return new Set();
  const ws = actor.workspaceId;
  const [d, k, t] = await Promise.all([
    db().from("dashboards").select("theme_id").eq("workspace_id", ws).in("theme_id", ids),
    db().from("decks").select("theme_id").eq("workspace_id", ws).in("theme_id", ids),
    db().from("themes").select("id").eq("workspace_id", ws).eq("is_default", true).in("id", ids),
  ]);
  return new Set([...(d.data ?? []).map((r) => Number(r.theme_id)), ...(k.data ?? []).map((r) => Number(r.theme_id)), ...(t.data ?? []).map((r) => Number(r.id))]);
}

/** One item of an update as the update page lists it: what the new version does to it, and what happens to the copy. */
export type UpdateItem = {
  key: string; kind: ItemKind; name: string;
  change: "added" | "changed" | "removed" | "same";
  /** The Workspace changed its copy since it was installed. */
  changedHere: boolean;
  /** add: added; replace: the copy becomes the new version; offer: the copy stays, the new version waits beside it;
   * delete: removed with the Pack; unmark: kept, no longer from the Pack; skip: removed here, not added again; none. */
  outcome: "add" | "replace" | "offer" | "delete" | "unmark" | "skip" | "none";
};

/** What updating to a file would do, before anything is written. */
export type UpdatePlan = {
  from: string; to: string; name: string;
  /** A new major version "may change how things look or work". */
  major: boolean;
  items: UpdateItem[];
  assistantTexts: { path: string; text: string }[];
  blocked: string | null;
};

type Ops = Record<Table, { insert: unknown[]; replace: unknown[]; offer: unknown[]; delete: number[]; unmark: number[] }> & { guard: Guard[] };
/** A template or Theme the step replaces or deletes, as it was read: changed since, the whole step stops, so an edit
 * made meanwhile is never overwritten or deleted. Catalog entries and View Designs cannot be changed in a Workspace. */
type Guard = { table: "templates" | "themes"; id: number; updated_at: string | null };
const guardOf = (c: Copy): Guard[] => (c.table === "templates" || c.table === "themes" ? [{ table: c.table, id: c.id, updated_at: c.updatedAt }] : []);

/** Why an update would push the Workspace past a Pack cap, or null. Friendly message only: update_pack counts again in the
 * database under the Workspace's lock, and that is what holds when two steps run at once. */
async function overCaps(actor: Actor, ops: Ops): Promise<string | null> {
  const [entries, templates] = await Promise.all([
    db().from("catalog_metrics").select("id", { count: "exact", head: true }).eq("workspace_id", actor.workspaceId),
    db().from("team_templates").select("id", { count: "exact", head: true }).eq("workspace_id", actor.workspaceId),
  ]);
  const grow = (t: Table) => ops[t].insert.length - ops[t].delete.length;
  const e = entries.count ?? 0, t = templates.count ?? 0;
  if (grow("catalog") > 0 && e + grow("catalog") > PACK_CAPS.entries) return `A Workspace keeps at most ${PACK_CAPS.entries} Metric Catalog entries from Packs; this update would pass that.`;
  if (grow("templates") > 0 && t + grow("templates") > PACK_CAPS.templates) return `A Workspace keeps at most ${PACK_CAPS.templates} templates; this update would pass that. Delete some first.`;
  return null;
}

/** Works out an update: the plan for the page and the operations for the database. */
async function planUpdate(actor: Actor, installId: number, text: string) {
  assertManages(actor);
  const install = await installOf(actor, installId);
  const res = checkPack(typeof text === "string" ? text : "");
  if (!res.ok) return { ok: false as const, problems: res.problems };
  const pack = res.pack;
  const copies = await copiesOf(actor, installId);
  const next = storedItems(pack);
  const nextItems: { table: Table; key: string; kind: ItemKind; name: string; hash: string; row: Record<string, unknown> }[] = [
    ...next.catalog.map((r) => ({ table: "catalog" as const, key: r.key, kind: "metric" as const, name: r.name, hash: r.hash, row: r as Record<string, unknown> })),
    ...next.templates.map((r) => ({ table: "templates" as const, key: r.key, kind: r.kind as ItemKind, name: r.name, hash: r.hash, row: r as Record<string, unknown> })),
    ...next.views.map((r) => ({ table: "designs" as const, key: r.key, kind: "view" as const, name: r.name, hash: r.hash, row: r as Record<string, unknown> })),
    ...next.themes.map((r) => ({ table: "themes" as const, key: r.key, kind: "theme" as const, name: r.name, hash: r.hash, row: r as Record<string, unknown> })),
  ];
  // By key, through Maps: a key is only ever a key.
  const byKey = new Map(copies.map((c) => [c.key, c]));
  const nextKeys = new Set(nextItems.map((i) => i.key));
  const wasInstalled = new Set(install.item_keys ?? []);
  const inUse = await themesInUse(actor, copies.filter((c) => c.table === "themes").map((c) => c.id));
  const ops: Ops = { ...Object.fromEntries((Object.keys(TABLE) as Table[]).map((t) => [t, { insert: [], replace: [], offer: [], delete: [], unmark: [] }])), guard: [] } as unknown as Ops;
  const items: UpdateItem[] = [];
  const leave = (c: Copy, change: UpdateItem["change"]) => {
    const changedHere = c.currentHash !== c.installedHash;
    const keep = changedHere || (c.table === "themes" && inUse.has(c.id));
    ops[c.table][keep ? "unmark" : "delete"].push(c.id);
    if (!keep) ops.guard.push(...guardOf(c));
    items.push({ key: c.key, kind: c.kind, name: c.name, change, changedHere, outcome: keep ? "unmark" : "delete" });
  };
  for (const n of nextItems) {
    const c = byKey.get(n.key);
    if (c && (c.table !== n.table || c.kind !== n.kind)) leave(c, "removed");
    if (!c || c.table !== n.table || c.kind !== n.kind) {
      if (c || !wasInstalled.has(n.key)) {
        ops[n.table].insert.push(n.row);
        items.push({ key: n.key, kind: n.kind, name: n.name, change: "added", changedHere: false, outcome: "add" });
      } else items.push({ key: n.key, kind: n.kind, name: n.name, change: "same", changedHere: true, outcome: "skip" });
      continue;
    }
    const changedHere = c.currentHash !== c.installedHash;
    if (n.hash === c.installedHash) {
      items.push({ key: n.key, kind: n.kind, name: c.name, change: "same", changedHere, outcome: "none" });
    } else if (!changedHere) {
      ops[n.table].replace.push({ ...n.row, id: c.id });
      ops.guard.push(...guardOf(c));
      items.push({ key: n.key, kind: n.kind, name: n.name, change: "changed", changedHere, outcome: "replace" });
    } else {
      ops[n.table].offer.push({ id: c.id, offer: n.row });
      items.push({ key: n.key, kind: n.kind, name: c.name, change: "changed", changedHere, outcome: "offer" });
    }
  }
  for (const c of copies) if (!nextKeys.has(c.key)) leave(c, "removed");
  const blocked = pack.id !== install.pack_id ? `This file is the Pack “${pack.id}”, not “${install.pack_id}”.`
    : !versionBelow(install.version, pack.version) ? `This file is version ${pack.version}; ${install.version} is installed. An update needs a higher version.`
      : (copies.some((c) => c.table === "themes") || next.themes.length) && actor.role !== "owner" ? "This Pack holds Themes, and only Owners change Themes: an Owner updates it."
        : await overCaps(actor, ops);
  const plan: UpdatePlan = { from: install.version, to: pack.version, name: pack.name, major: pack.version.split(".")[0] !== install.version.split(".")[0], items, assistantTexts: res.assistantTexts.map(({ path, text: t }) => ({ path, text: t })), blocked };
  return { ok: true as const, plan, ops, pack, stored: next };
}

/** What updating an installed Pack from a newer file would do (Owners and Admins); nothing is written. */
export async function readPackUpdate(actor: Actor, installId: number, text: string): Promise<{ ok: true; plan: UpdatePlan } | { ok: false; problems: { path: string; line: number | null; message: string }[] }> {
  const res = await planUpdate(actor, Number(installId), text);
  return res.ok ? { ok: true, plan: res.plan } : res;
}

/** Updates an installed Pack from a newer file, after the person confirmed the file did not come from the Marketplace
 * and, when it has any, that they read its texts aimed at assistants. One database step; audited. */
export async function updatePackFile(actor: Actor, installId: number, text: string, confirmed: { unsigned: boolean; assistantTexts: boolean }): Promise<UpdatePlan> {
  return updatePack(actor, installId, text, { source: "upload", signed: false }, confirmed);
}

/** Updates an installed Pack from a newer file from `origin`: an unsigned one only after the person confirmed it. */
export async function updatePack(actor: Actor, installId: number, text: string, origin: PackOrigin, confirmed: { unsigned: boolean; assistantTexts: boolean }): Promise<UpdatePlan> {
  const res = await planUpdate(actor, Number(installId), text);
  if (!res.ok) throw new Error(`The Pack cannot be updated: ${res.problems[0].path ? `${res.problems[0].path} ` : ""}${res.problems[0].message}`);
  if (res.plan.blocked) throw new Forbidden(res.plan.blocked);
  if (!origin.signed && !confirmed?.unsigned) throw new Error("Confirm that you install a file the Marketplace did not check.");
  if (res.plan.assistantTexts.length && !confirmed.assistantTexts) throw new Error("Confirm that you read the texts aimed at assistants first.");
  // The Audit Log notes that the logo was added, changed or removed, never its bytes.
  const before = await db().from("pack_installs").select("manifest").eq("id", Number(installId)).eq("workspace_id", actor.workspaceId).maybeSingle();
  const was = cleanLogo((before.data?.manifest as { logo?: unknown } | null)?.logo, PACK_LOGO_MAX_BYTES);
  const now = packLogoOf(res.pack);
  const logoChange = was === now ? "same" : !was ? "added" : !now ? "removed" : "changed";
  const { error } = await db().rpc("update_pack", {
    p_workspace: actor.workspaceId, p_install: Number(installId), p_by: actor.personId,
    p_install_row: { version: res.pack.version, license: res.pack.license, manifest: { ...manifestOf(res.pack), ...(res.pack.logo === undefined ? {} : { logo: packLogoOf(res.pack) }) }, item_keys: itemKeys(res.stored), source: origin.source, signed: origin.signed },
    p_ops: res.ops,
  });
  if (error?.code === "40001") throw new Error("Something of this Pack changed meanwhile; choose the file again to see what an update does now.");
  // Only which constraint failed chooses the words; the database's own text never reaches a person.
  const sameName = error?.code === "23505" && /catalog_metrics_workspace_name_key/.test(error.message ?? "");
  if (sameName) throw new Error("This Workspace's Metric Catalog has an entry of the same name as one this version adds; nothing was changed.");
  if (error) throw new Error("The Pack could not be updated; nothing was changed.");
  await audit(actor, { kind: "pack.updated", object: { type: "pack", id: Number(installId), name: res.pack.name }, details: { pack: res.pack.id, from: res.plan.from, version: res.plan.to, source: origin.source, ...(logoChange === "same" ? {} : { logo: logoChange }) } });
  return res.plan;
}

/** What uninstalling would remove and keep, and why each kept item stays. */
export type UninstallPlan = { name: string; version: string; remove: { kind: ItemKind; name: string }[]; keep: { kind: ItemKind; name: string; why: "changed" | "in use" }[]; blocked: string | null };

async function planUninstall(actor: Actor, installId: number) {
  assertManages(actor);
  const install = await installOf(actor, installId);
  const copies = await copiesOf(actor, installId);
  const inUse = await themesInUse(actor, copies.filter((c) => c.table === "themes").map((c) => c.id));
  const plan: UninstallPlan = { name: install.manifest.name, version: install.version, remove: [], keep: [], blocked: null };
  const del: Record<Table, number[]> & { guard: Guard[] } = { catalog: [], templates: [], designs: [], themes: [], guard: [] };
  for (const c of copies) {
    if (c.currentHash !== c.installedHash) plan.keep.push({ kind: c.kind, name: c.name, why: "changed" });
    else if (c.table === "themes" && inUse.has(c.id)) plan.keep.push({ kind: c.kind, name: c.name, why: "in use" });
    else { plan.remove.push({ kind: c.kind, name: c.name }); del[c.table].push(c.id); del.guard.push(...guardOf(c)); }
  }
  if (copies.some((c) => c.table === "themes") && actor.role !== "owner") plan.blocked = "This Pack holds Themes, and only Owners change Themes: an Owner uninstalls it.";
  return { plan, del, install };
}

/** What uninstalling an installed Pack would do (Owners and Admins); nothing is written. */
export async function readUninstall(actor: Actor, installId: number): Promise<UninstallPlan> {
  return (await planUninstall(actor, Number(installId))).plan;
}

/** Uninstalls a Pack: removes what nobody changed and nothing uses, keeps the rest without its mark. One database step;
 * audited. Metrics and everything else made from the Pack stay as they are. */
export async function uninstallPack(actor: Actor, installId: number): Promise<UninstallPlan> {
  const { plan, del, install } = await planUninstall(actor, Number(installId));
  if (plan.blocked) throw new Forbidden(plan.blocked);
  const { error } = await db().rpc("uninstall_pack", { p_workspace: actor.workspaceId, p_install: Number(installId), p_delete: del });
  if (error) throw new Error(error.code === "40001" ? "Something of this Pack changed meanwhile; look at what uninstalling does again." : "The Pack could not be uninstalled; nothing was changed.");
  await audit(actor, { kind: "pack.uninstalled", object: { type: "pack", id: Number(installId), name: plan.name }, details: { pack: install.pack_id, version: install.version, removed: plan.remove.length, kept: plan.keep.length } });
  return plan;
}

/** An item the Workspace changed, with a newer version of its Pack waiting beside it. */
export type OfferedItem = { table: "templates" | "themes"; id: number; kind: ItemKind; name: string; packName: string };

/** The items with a newer version waiting, for Owners and Admins. Only templates and Themes can be changed in a
 * Workspace, so only they are ever offered. */
export async function offeredItems(actor: Actor): Promise<OfferedItem[]> {
  if ((actor as { key?: unknown }).key || (actor.role !== "owner" && actor.role !== "admin")) return [];
  const ws = actor.workspaceId;
  const [t, h, i] = await Promise.all([
    db().from("team_templates").select("id, owner_id, kind, name, pack_install_id").eq("workspace_id", ws).not("pack_offer", "is", null),
    db().from("themes").select("id, name, pack_install_id").eq("workspace_id", ws).not("pack_offer", "is", null),
    db().from("pack_installs").select("id, manifest").eq("workspace_id", ws),
  ]);
  const names = new Map((i.data ?? []).map((r) => [Number(r.id), String((r.manifest as { name?: string }).name ?? "")]));
  return [
    ...(t.data ?? []).filter((r) => r.owner_id === actor.personId || actor.role === "owner").map((r) => ({ table: "templates" as const, id: Number(r.id), kind: r.kind as ItemKind, name: String(r.name), packName: names.get(Number(r.pack_install_id)) ?? "" })),
    ...(actor.role === "owner" ? h.data ?? [] : []).map((r) => ({ table: "themes" as const, id: Number(r.id), kind: "theme" as const, name: String(r.name), packName: names.get(Number(r.pack_install_id)) ?? "" })),
  ];
}

/** Takes the newer version waiting beside a changed item (Owners and Admins; Owners for a Theme): the copy becomes it,
 * and the copy as it was stays in its Versions, so it can be restored. */
export async function takeNewVersion(actor: Actor, table: "templates" | "themes", id: number): Promise<void> {
  assertManages(actor);
  if (table === "themes" && actor.role !== "owner") throw new Forbidden("Only Owners change Themes.");
  if (table !== "templates" && table !== "themes") throw new Forbidden();
  const { data } = await db().from(TABLE[table]).select(table === "templates" ? "id, owner_id, pack_install_id, pack_offer" : "id, pack_install_id, pack_offer").eq("id", Number(id)).eq("workspace_id", actor.workspaceId).maybeSingle();
  const row = data as { owner_id?: string; pack_install_id: number | null; pack_offer: unknown } | null;
  if (!row?.pack_offer || !row.pack_install_id) throw new Forbidden();
  // Only a template's creator changes it (or an Owner): an Admin does not overwrite someone else's edit.
  if (table === "templates" && row.owner_id !== actor.personId && actor.role !== "owner") throw new Forbidden("Only whoever installed the Pack, or an Owner, takes a new version of its templates.");
  const o = row.pack_offer as Record<string, unknown>;
  const type = table === "themes" ? "theme" : "template";
  await ensureBaseline(type, Number(id), actor.personId);
  let update: Record<string, unknown>;
  if (table === "themes") update = { name: o.name, tokens: o.tokens, slides: o.slides };
  else {
    let body = o.body as Record<string, unknown>;
    // A Deck Template's Theme, by its key in the Pack: the Theme installed with it, if the Workspace still has it.
    if (typeof o.theme_key === "string") {
      const { data: theme } = await db().from("themes").select("id").eq("workspace_id", actor.workspaceId).eq("pack_install_id", row.pack_install_id).eq("pack_key", o.theme_key).maybeSingle();
      body = { ...body, themeId: theme ? Number(theme.id) : null };
    }
    update = { name: o.name, description: o.description, slots: o.slots, body };
  }
  const { error } = await db().from(TABLE[table]).update({ ...update, pack_hash: o.hash, pack_offer: null, updated_at: new Date().toISOString() }).eq("id", Number(id)).eq("workspace_id", actor.workspaceId).eq("pack_install_id", row.pack_install_id).not("pack_offer", "is", null);
  if (error) throw new Error("The new version could not be taken.");
  await recordVersion(type, Number(id), actor.personId, { message: "Took the Pack's new version" });
}

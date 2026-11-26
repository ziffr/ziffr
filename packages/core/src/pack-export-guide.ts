// "Describe your Pack", the step of Export as Pack that writes its guide (spec 0058, GLOSSARY: Pack Guide, Pack): what
// the fields start with, and the guides of installed Packs offered again. Every function takes the Actor first.
// Security: the list of contents is made from the very Pack the export would write, so it names only what this person
// may put into a file and what goes into it. A guide is offered only from an install of their own Workspace that the
// pick or the id points at, to someone who may export (never a Guest, who sees no installed Pack, nor a Key).
import { db } from "./db";
import type { Actor } from "./actor";
import { gatherPack, seenMetrics, type ExportChoice, type ExportManifest } from "./pack-export";
import { contentsText, guideToText, type PackGuideText } from "./pack-guide-text";
import { safeGuide, safeOverview } from "./installed-pack-guides";
import type { PackComesFrom } from "@ziffr/pack/comes-from";

/** What the step starts with: the names of what goes into the file, and the guides of installed Packs the person may
 * take over (the one whose id the Pack has, first, then those the picked items came from). */
export type PackGuideDraft = {
  contents: string;
  /** The numbers of the file that someone or something sends, each by what was picked for it, with what the installed
   * Pack it came from says of it, if any. Where each comes from is the person's to say. */
  numbers: { ref: string; name: string; said: PackComesFrom | null }[];
  installed: { installId: number; name: string; version: string; text: PackGuideText }[];
};

const idsOf = (choice: ExportChoice, k: keyof ExportChoice) => (Array.isArray(choice?.[k]) ? choice[k]! : []).map(Number).filter(Number.isInteger).slice(0, 50);

/** What the installed Packs say of the numbers picked, by what was picked: an entry of a Pack, or a Metric the person
 * sees that was made from one. Only rows of the actor's Workspace. */
async function saidOfPicked(actor: Actor, refs: string[], installs: { id: unknown; manifest: unknown }[]): Promise<Map<string, PackComesFrom>> {
  const idsFor = (kind: string) => refs.filter((r) => r.startsWith(`${kind}:`)).map((r) => Number(r.slice(kind.length + 1)));
  const seen = idsFor("metric").length ? await seenMetrics(actor) : null;
  const entryOfRef = new Map<string, number>([
    ...idsFor("catalog").map((id): [string, number] => [`catalog:${id}`, id]),
    ...idsFor("metric").flatMap((id): [string, number][] => { const from = seen!.get(id)?.from_catalog_id; return from ? [[`metric:${id}`, from]] : []; }),
  ]);
  if (!entryOfRef.size) return new Map();
  const { data } = await db().from("catalog_metrics").select("id, pack_install_id, pack_key").eq("workspace_id", actor.workspaceId).in("id", [...new Set(entryOfRef.values())]);
  const rows = new Map((data ?? []).map((r) => [Number(r.id), r]));
  const numbers = new Map(installs.map((i) => [Number(i.id), new Map((safeOverview(i.manifest)?.numbers ?? []).map((n) => [n.key, n]))]));
  return new Map([...entryOfRef].flatMap(([ref, id]): [string, PackComesFrom][] => {
    const row = rows.get(id);
    const n = row ? numbers.get(Number(row.pack_install_id))?.get(String(row.pack_key)) : undefined;
    return n && (n.by === "person" || n.by === "system" || n.by === "target") ? [[ref, { by: n.by, ...(n.system ? { system: n.system } : {}), ...(n.note ? { note: n.note } : {}) }]] : [];
  }));
}

/** The installs the picked items came from: an entry, a template, a design or a Theme marked with it, or a Metric the
 * person sees that was made from one of its entries. Only rows of the actor's Workspace. */
async function installsOfPicked(actor: Actor, choice: ExportChoice): Promise<Set<number>> {
  const found = new Set<number>();
  const marked = async (table: string, ids: number[]) => {
    if (!ids.length) return;
    const { data } = await db().from(table).select("pack_install_id").eq("workspace_id", actor.workspaceId).in("id", ids).not("pack_install_id", "is", null);
    for (const r of data ?? []) found.add(Number(r.pack_install_id));
  };
  const seen = idsOf(choice, "metrics").length ? await seenMetrics(actor) : null;
  const entries = idsOf(choice, "metrics").flatMap((id) => seen!.get(id)?.from_catalog_id ?? []);
  await Promise.all([
    marked("catalog_metrics", [...idsOf(choice, "catalog"), ...entries]),
    marked("team_templates", [...idsOf(choice, "dashboards"), ...idsOf(choice, "decks"), ...idsOf(choice, "workflows")]),
    marked("view_designs", idsOf(choice, "designs")),
    marked("themes", idsOf(choice, "themes")),
  ]);
  return found;
}

/** A manifest not yet written: only the contents of the gathered Pack are read. */
const UNNAMED: ExportManifest = { id: "", name: "", version: "", summary: "", author: "", license: "" };

/** What "Describe your Pack" starts with for this pick (anyone who may export); nothing is written. */
export async function draftPackGuide(actor: Actor, packId: string, choice: ExportChoice): Promise<PackGuideDraft> {
  // The export's own gathering refuses who may not export, before anything else is read.
  const { pack, picked: refs } = await gatherPack(actor, UNNAMED, choice);
  const picked = await installsOfPicked(actor, choice);
  const { data } = await db().from("pack_installs").select("id, pack_id, version, manifest").eq("workspace_id", actor.workspaceId);
  const installed = (data ?? [])
    .filter((r) => r.pack_id === packId || picked.has(Number(r.id)))
    .sort((a, b) => Number(b.pack_id === packId) - Number(a.pack_id === packId))
    .flatMap((r) => {
      const guide = safeGuide(r.manifest);
      return guide ? [{ installId: Number(r.id), name: String((r.manifest as { name?: unknown }).name ?? ""), version: String(r.version), text: guideToText(guide) }] : [];
    });
  const sent = (pack.contents.metrics ?? []).filter((m) => m.metric.formula === undefined);
  const said = await saidOfPicked(actor, sent.map((m) => refs.get(m.key)!), data ?? []);
  const numbers = sent.map((m) => ({ ref: refs.get(m.key)!, name: m.metric.name, said: said.get(refs.get(m.key)!) ?? null }));
  return { contents: contentsText(pack.contents), numbers, installed };
}

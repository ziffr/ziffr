// "Describe your Pack", the step of Export as Pack that writes its guide and its set-up questions (specs 0058 and 0068,
// GLOSSARY: Pack Guide, Pack, Position, Repeat): what the fields start with, and the guides and set-up questions of
// installed Packs offered again. Every function takes the Actor first.
// Security: the list of contents is made from the very Pack the export would write, so it names only what this person
// may put into a file and what goes into it. A guide or a question is offered only from an install of their own
// Workspace that the pick or the id points at, to someone who may export (never a Guest, who sees no installed Pack,
// nor a Key), and is checked again as it is read. No field starts with anything of the Workspace, such as a person.
import { db } from "./db";
import type { Actor } from "./actor";
import { gatherPack, seenMetrics, type ExportChoice, type ExportManifest } from "./pack-export";
import { contentsText, guideToText, type PackGuideText } from "./pack-guide-text";
import { safeGuide, safeOverview } from "./installed-pack-guides";
import { readPlaces } from "./pack-places";
import { setUpWords } from "./pack-start-declarations";
import type { PackSetUpChoice } from "./pack-export-set-up";
import type { Pack } from "./pack";
import type { Period } from "./types";
import type { PackComesFrom } from "@ziffr/pack/comes-from";

/** What the step starts with: the names of what goes into the file, and the guides of installed Packs the person may
 * take over (the one whose id the Pack has, first, then those the picked items came from). */
export type PackGuideDraft = {
  contents: string;
  /** The numbers of the file that someone or something sends, each by what was picked for it, with what the installed
   * Pack it came from says of it, if any. Where each comes from is the person's to say. */
  numbers: { ref: string; name: string; period: Period; said: PackComesFrom | null }[];
  installed: { installId: number; name: string; version: string; text: PackGuideText }[];
  /** The Positions and Repeats of the file, each of which may have a question; left out when it has none. */
  positions?: { key: string; name: string }[];
  repeats?: { key: string; name: string }[];
  /** The set-up questions of those installed Packs, for what goes into this file; left out when none has any. */
  setUps?: { installId: number; name: string; version: string; setUp: PackSetUpChoice }[];
};

const idsOf = (choice: ExportChoice, k: keyof ExportChoice) => (Array.isArray(choice?.[k]) ? choice[k]! : []).map(Number).filter(Number.isInteger).slice(0, 50);

/** Which entry of which installed Pack stands behind each number picked, by what was picked: an entry of a Pack, or a
 * Metric the person sees that was made from one. Only rows of the actor's Workspace. */
async function entriesOfPicked(actor: Actor, refs: string[]): Promise<Map<string, { installId: number; key: string }>> {
  const idsFor = (kind: string) => refs.filter((r) => r.startsWith(`${kind}:`)).map((r) => Number(r.slice(kind.length + 1)));
  const seen = idsFor("metric").length ? await seenMetrics(actor) : null;
  const entryOfRef = new Map<string, number>([
    ...idsFor("catalog").map((id): [string, number] => [`catalog:${id}`, id]),
    ...idsFor("metric").flatMap((id): [string, number][] => { const from = seen!.get(id)?.from_catalog_id; return from ? [[`metric:${id}`, from]] : []; }),
  ]);
  if (!entryOfRef.size) return new Map();
  const { data } = await db().from("catalog_metrics").select("id, pack_install_id, pack_key").eq("workspace_id", actor.workspaceId).in("id", [...new Set(entryOfRef.values())]);
  const rows = new Map((data ?? []).map((r) => [Number(r.id), r]));
  return new Map([...entryOfRef].flatMap(([ref, id]): [string, { installId: number; key: string }][] => {
    const row = rows.get(id);
    return row?.pack_install_id ? [[ref, { installId: Number(row.pack_install_id), key: String(row.pack_key) }]] : [];
  }));
}

type Entries = Awaited<ReturnType<typeof entriesOfPicked>>;

/** What the installed Packs say of where the numbers picked come from, by what was picked. */
function saidOf(entries: Entries, installs: { id: unknown; manifest: unknown }[]): Map<string, PackComesFrom> {
  const numbers = new Map(installs.map((i) => [Number(i.id), new Map((safeOverview(i.manifest)?.numbers ?? []).map((n) => [n.key, n]))]));
  return new Map([...entries].flatMap(([ref, e]): [string, PackComesFrom][] => {
    const n = numbers.get(e.installId)?.get(e.key);
    return n && (n.by === "person" || n.by === "system" || n.by === "target") ? [[ref, { by: n.by, ...(n.system ? { system: n.system } : {}), ...(n.note ? { note: n.note } : {}) }]] : [];
  }));
}

/** The set-up questions one install declares for what goes into this file: its words, the questions of Positions and
 * Repeats the file has too, and what it asks for the numbers picked. Null when it declares none of them. */
function setUpOf(installId: number, manifest: unknown, entries: Entries, contents: Pick<Pack, "positions" | "repeats">): PackSetUpChoice | null {
  const m = (manifest ?? {}) as { setUp?: unknown; places?: unknown };
  const places = readPlaces(m.places);
  const some = <T>(list: [string, T][]) => (list.length ? Object.fromEntries(list) : undefined);
  const positions = some((contents.positions ?? []).flatMap((p): [string, { question?: string; hint?: string }][] => {
    const x = places?.positions.find((y) => y.key === p.key);
    return x?.question || x?.hint ? [[p.key, { ...(x.question ? { question: x.question } : {}), ...(x.hint ? { hint: x.hint } : {}) }]] : [];
  }));
  const repeats = some((contents.repeats ?? []).flatMap((r): [string, { question: string }][] => {
    const question = places?.repeats.find((y) => y.key === r.key)?.question;
    return question ? [[r.key, { question }]] : [];
  }));
  const asks = some([...entries].flatMap(([ref, e]) => {
    const ask = e.installId === installId ? places?.metrics.find((y) => y.key === e.key)?.ask : undefined;
    return ask ? [[ref, ask] as [string, typeof ask]] : [];
  }));
  const found: PackSetUpChoice = { ...setUpWords(m.setUp), ...(positions ? { positions } : {}), ...(repeats ? { repeats } : {}), ...(asks ? { asks } : {}) };
  return found.line || found.happens?.length || found.needs?.length || positions || repeats || asks ? found : null;
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
  const offering = (data ?? [])
    .filter((r) => r.pack_id === packId || picked.has(Number(r.id)))
    .sort((a, b) => Number(b.pack_id === packId) - Number(a.pack_id === packId))
    .map((r) => ({ manifest: r.manifest as unknown, from: { installId: Number(r.id), name: String((r.manifest as { name?: unknown }).name ?? ""), version: String(r.version) } }));
  const installed = offering.flatMap(({ manifest, from }) => {
    const guide = safeGuide(manifest);
    return guide ? [{ ...from, text: guideToText(guide) }] : [];
  });
  const sent = (pack.contents.metrics ?? []).filter((m) => m.metric.formula === undefined);
  const entries = await entriesOfPicked(actor, sent.map((m) => refs.get(m.key)!));
  const said = saidOf(entries, data ?? []);
  const numbers = sent.map((m) => ({ ref: refs.get(m.key)!, name: m.metric.name, period: m.metric.period, said: said.get(refs.get(m.key)!) ?? null }));
  const setUps = offering.flatMap(({ manifest, from }) => {
    const setUp = setUpOf(from.installId, manifest, entries, pack);
    return setUp ? [{ ...from, setUp }] : [];
  });
  const named = (list: { key: string; name: string }[] | undefined) => (list ?? []).map(({ key, name }) => ({ key, name }));
  const [positions, repeats] = [named(pack.positions), named(pack.repeats)];
  return { contents: contentsText(pack.contents), numbers, installed, ...(positions.length ? { positions } : {}), ...(repeats.length ? { repeats } : {}), ...(setUps.length ? { setUps } : {}) };
}

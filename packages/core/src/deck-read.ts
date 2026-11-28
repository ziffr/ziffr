// What one person reads of a deck Ziffr made (GLOSSARY: Deck, Deck Description, Share; spec 0069). The viewer, the PDF
// and the downloads are made from this answer and nothing else, so what is not in it reaches no screen and no file.
import type { DeckDescription } from "@ziffr/pack/deck-description";
import { getCanvasData, visibleDecks, type DeckAccess } from "./access";
import { Forbidden, Refused, type Actor } from "./actor";
import { db } from "./db";
import { describedDeck, describedMetricIds } from "./deck-form";
import { withoutUnseenInputs } from "./formula";
import { seenList } from "./total-lists";
import type { CanvasData } from "./types";

/** What a deck whose slides Ziffr does not read is refused with. */
export const NOT_A_MADE_DECK = "Ziffr cannot read this deck's slides as slides it makes.";

/** A made deck as one person gets it: the slides they are sent, the data of those slides' Metrics, and how many slides
 * are left out because they list a Metric the person does not see. */
export type ReadDeck = {
  deck: { id: number; name: string; role: DeckAccess["role"]; themeId: number | null; footer: string | null; description: DeckDescription };
  data: CanvasData;
  leftOut: number;
};

/** The entries of a by-Metric record that belong to these Metrics. */
const pick = <T>(record: Record<number, T>, ids: ReadonlySet<number>): Record<number, T> => Object.fromEntries(Object.entries(record).filter(([id]) => ids.has(Number(id)))) as Record<number, T>;

/** The person's data cut to the Metrics of the slides they are sent (rule 3): their numbers and the Theme, and nobody's
 * name, nothing to act on and nothing to place. Descriptions and Calculation Notes stay: the definitions slide shows
 * them to people inside the Workspace. */
function cutTo(full: CanvasData, ids: ReadonlySet<number>, themeId: number | null): CanvasData {
  const metrics = full.metrics.filter((m) => ids.has(m.id));
  const slugs = new Set(metrics.map((m) => m.slug));
  const series = Object.fromEntries(Object.entries(full.series).filter(([slug]) => slugs.has(slug)));
  const periodsOf = (id: number) => (series[metrics.find((m) => m.id === id)?.slug ?? ""] ?? []).map((p) => p.period);
  // A Total's list names only the Metrics these slides show.
  const lists = Object.entries(pick(full.totalLists ?? {}, ids)).map(([id, list]) => [id, seenList(list, (m) => ids.has(m), periodsOf)]);
  return {
    viewer: full.viewer,
    // A formula names no Metric the slides do not list: one it has gained since is not opened.
    metrics: withoutUnseenInputs(metrics, slugs),
    series,
    targets: pick(full.targets, ids),
    projections: pick(full.projections, ids),
    condensed: pick(full.condensed ?? {}, ids),
    breakdowns: pick(full.breakdowns, ids),
    pending: pick(full.pending, ids),
    locked: pick(full.locked, ids),
    ...(lists.length ? { totalLists: Object.fromEntries(lists) } : {}),
    themes: full.themes.filter((t) => t.id === themeId || t.is_default).map((t) => ({ ...t, owner_id: "" })),
    people: [],
    openActions: {},
    submitters: {},
    templates: [],
    designs: [],
    groups: [],
    canEditThemes: false,
    yearStart: full.yearStart,
    numberStyle: full.numberStyle,
    attainmentMethod: full.attainmentMethod,
  };
}

/** A made deck as the actor may read it. A slide goes out whole or not at all: unless the actor sees every Metric it
 * lists, none of its headline, answers or title leaves here. Hidden slides go only to the owner and Editors, whose form
 * shows them again. Refused for anyone without a role on the deck, and for a deck whose slides Ziffr does not read. */
export async function readDeck(actor: Actor, id: number): Promise<ReadDeck> {
  if (!Number.isSafeInteger(id)) throw new Forbidden();
  const role = (await visibleDecks(actor.workspaceId, actor.personId)).find((d) => d.id === id)?.role;
  if (!role) throw new Forbidden();
  const { data: row } = await db().from("decks").select("name, theme_id, footer, document, made").eq("id", id).eq("workspace_id", actor.workspaceId).maybeSingle();
  if (!row) throw new Forbidden();
  const description = describedDeck(row.document, row.made);
  if (!description) throw new Refused(NOT_A_MADE_DECK);
  const sent = description.slides.filter((s) => role !== "viewer" || !s.hidden);
  const listed = new Set(sent.flatMap((s) => s.metrics));
  const full = await getCanvasData(actor.workspaceId, actor.personId, { seriesOf: (visible) => visible.filter((m) => listed.has(m.id)).map((m) => m.id) });
  const seen = new Set(full.metrics.map((m) => m.id));
  const slides = sent.filter((s) => s.metrics.every((m) => seen.has(m)));
  const kept = { ...description, slides };
  const themeId = (row.theme_id as number | null) ?? null;
  return {
    deck: { id, name: String(row.name), role, themeId, footer: (row.footer as string | null) ?? null, description: kept },
    data: cutTo(full, new Set(describedMetricIds(kept)), themeId),
    leftOut: sent.length - slides.length,
  };
}

// Deck Templates (spec 0030, GLOSSARY: Deck Template, Slot): listing them and starting a deck from one. Every
// function takes the Actor first. A deck made from a template is the actor's own, independent copy, and every Metric
// that fills a Slot must be one the actor sees. Saving a deck as a template is in templates.ts.
import { db } from "./db";
import { assertCan, can, Forbidden, type Actor } from "./actor";
import { visibleMetricIds } from "./access";
import { createDeck, setDeckTheme } from "./decks";
import { metricChoices } from "./dashboard-templates";
import { assertSeesMetrics } from "./sharing";
import { fillsComplete, fromSlideLayout } from "./team-templates";
import { widgetMetricIds } from "./widget-metrics";
import { textMetricIds } from "./slide-text";
import { assertWidgetDesigns } from "./widget-designs";
import { getMetrics } from "./workspace-data";
import type { DeckTemplate, SlideBody, WidgetSettings } from "./types";

/** A Deck Template as a person picks one: its Slots with the suggested Metrics this person sees, and its slides, which
 * hold Slot numbers and never Metrics. */
export type DeckTemplateSummary = Pick<DeckTemplate, "id" | "owner_id" | "name" | "description" | "slots"> & { slides: number };

/** A Deck Template of the actor's Workspace by id, or null. */
async function deckTemplate(actor: Pick<Actor, "workspaceId" | "role">, id: number): Promise<DeckTemplate | null> {
  // A Guest creates nothing, so no team template is theirs to read, not even by id (rule 3).
  if (!Number.isInteger(id) || actor.role === "guest") return null;
  const { data } = await db().from("team_templates").select("id, owner_id, kind, name, description, view, slots, body, w, h, updated_at").eq("id", id).eq("workspace_id", actor.workspaceId).eq("kind", "deck").maybeSingle();
  return (data as DeckTemplate | null) ?? null;
}

/** The team's Deck Templates. A Slot's suggested Metrics are cut to the ones this person sees (rule 3). */
export async function listDeckTemplates(actor: Pick<Actor, "workspaceId" | "personId"> & Pick<Actor, "role">): Promise<DeckTemplateSummary[]> {
  // A Guest creates nothing, so the team's templates are not theirs to read (rule 3).
  if (actor.role === "guest") return [];
  const { data } = await db().from("team_templates").select("id, owner_id, name, description, slots, body").eq("workspace_id", actor.workspaceId).eq("kind", "deck").order("name");
  const rows = (data ?? []) as Pick<DeckTemplate, "id" | "owner_id" | "name" | "description" | "slots" | "body">[];
  if (!rows.length) return [];
  const seen = await visibleMetricIds(actor.workspaceId, actor.personId, await getMetrics(actor.workspaceId));
  return rows.map((t) => ({
    id: t.id, owner_id: t.owner_id, name: t.name, description: t.description, slides: t.body.slides.length,
    slots: t.slots.map((s) => ({ label: s.label, multiple: s.multiple, exampleIds: (s.exampleIds ?? []).filter((id) => seen.has(id)) })),
  }));
}

/** What starting a deck from a template offers: the team's Deck Templates, and the Metrics this person may fill Slots
 * with (id and name only). Nothing for a Guest, who creates nothing. */
export async function deckTemplateChoices(actor: Actor): Promise<{ templates: DeckTemplateSummary[]; metrics: { id: number; name: string }[] }> {
  if (!can(actor, "create")) return { templates: [], metrics: [] };
  const templates = await listDeckTemplates(actor);
  return { templates, metrics: templates.length ? (await metricChoices(actor)).choices : [] };
}

/** Reads the fills of a Deck Template's Slots, as they travel in a link: Metric ids, Slots apart by ";", ids by ",". */
export function readFills(text: unknown): number[][] {
  return String(text ?? "").slice(0, 2000).split(";").slice(0, 50).map((f) => f.split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 50));
}

/** Writes the fills of a template's Slots for a link; `readFills` reads them back. */
export const writeFills = (fills: number[][]) => fills.map((f) => f.join(",")).join(";");

/** The Deck Template and fills a deck imported from a Workspace Export waits to be laid out with (its document holds
 * only that, until the editor first saves it), or null for any other deck. Only whole numbers are read from it. */
export function importSeedOf(document: unknown): { template: number; fills: number[][] } | null {
  const seed = (document as { importSeed?: { template?: unknown; fills?: unknown } } | null)?.importSeed;
  if (!seed || !Number.isSafeInteger(seed.template) || (seed.template as number) <= 0 || !Array.isArray(seed.fills)) return null;
  return { template: seed.template as number, fills: seed.fills.slice(0, 50).map((f) => (Array.isArray(f) ? f.map(Number).filter(Number.isSafeInteger).slice(0, 50) : [])) };
}

/** Checks that every Metric a template's widgets and text boxes would draw, with these fills, is one the actor sees. */
async function checkedFills(actor: Actor, t: DeckTemplate, fills: number[][]) {
  if (!fillsComplete(t.slots, fills)) throw new Forbidden();
  const made = t.body.slides.flatMap((s) => fromSlideLayout(s, fills));
  const ids = made.flatMap(textMetricIds).concat(made.filter((sh) => sh.type === "ziffr-widget").flatMap((sh) => {
    let settings: WidgetSettings = {};
    try { settings = JSON.parse(String(sh.props.settings ?? "{}")); } catch { /* a template's own settings are written by the core */ }
    return widgetMetricIds((sh.props.metricIds as number[]) ?? [], settings);
  }));
  await assertSeesMetrics(actor, ids);
}

/** Makes an empty deck owned by the actor for a Deck Template, its Slots filled; it starts with the template's Theme
 * when the Workspace still has it. The deck's slides are laid out when it is first opened (`deckTemplateSeed`). */
export async function createDeckFromTemplate(actor: Actor, input: { template: number; name: string; fills: number[][] }): Promise<number> {
  assertCan(actor, "create");
  const t = await deckTemplate(actor, Number(input.template));
  if (!t) throw new Forbidden();
  const fills = Array.isArray(input.fills) ? input.fills.map((f) => (Array.isArray(f) ? f.map(Number).filter(Number.isInteger).slice(0, 50) : [])).slice(0, t.slots.length) : [];
  await checkedFills(actor, t, fills);
  const given = String(input.name ?? "").trim();
  // The template's own name was checked when it was saved (or is the seed's); a name typed here is a visitor's words.
  const id = await createDeck(actor, given || t.name, { derived: !given });
  if (t.body.themeId) await setDeckTheme(actor, id, t.body.themeId).catch(() => undefined); // a Theme removed since: the default
  return id;
}

/** What a new deck lays out from a Deck Template: its slides and the fills, once the template exists in the actor's
 * Workspace and every Metric is one the actor sees. Its words are filled each time a slide is shown. */
export async function deckTemplateSeed(actor: Actor, templateId: number, fills: number[][]): Promise<{ slides: SlideBody[]; fills: number[][] } | null> {
  const t = await deckTemplate(actor, Number(templateId));
  if (!t) return null;
  await checkedFills(actor, t, fills);
  // A template keeps its widgets' View Designs: checked again as they become a deck's, as a Dashboard Template's are.
  assertWidgetDesigns(t.body.slides);
  return { slides: t.body.slides, fills };
}

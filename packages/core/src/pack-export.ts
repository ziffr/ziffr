// Export as Pack (spec 0030, GLOSSARY: Pack, Metric Description, Metric Catalog): a Pack made of things a person picks
// in their Workspace, to share or to publish. Every function takes the Actor first.
// Security: a Pack is shown to whoever gets the file, so it holds only Metric Descriptions of Metrics the person sees
// (never a value, an owner, a Submitter or a Token), templates, View Designs and Themes of the Workspace, and every
// text is held to the Pack's plain-text rules: what does not fit is left out, and said so, never sent as it is.
import { db } from "./db";
import { can, Forbidden, type Actor } from "./actor";
import { ZIFFR_VERSION } from "./ziffr-version";
import { visibleMetricIds } from "./access";
import { tagSight } from "./tag-sight";
import { normaliseTagName, tagKey, tagNameProblem, TAGS_PER_ENTRY } from "./tag-names";
import { getMetrics } from "./workspace-data";
import { checkPack, PACK_FORMAT, PACK_FORMAT_2, PACK_LICENSES, type Pack } from "./pack";
import { guideFromText, type PackGuideText } from "./pack-guide-text";
import { comesFromOf, type ComesFromChoice } from "./pack-export-numbers";
import { setUpProblems, withSetUp, type PackSetUpChoice, type PackSetUpProblem } from "./pack-export-set-up";
import { PACK_GUIDE_SECTIONS } from "@ziffr/pack/pack-guide";
import { checkSchema, type Schema } from "./json-check";
import { PLAIN, SAVED_WORDS, WORDS, KEY } from "./file-text";
import { checkMetricFileValue, METRIC_FILE_LIMITS, type MetricFile } from "./metric-file";
import { checkDashboardTemplateFileValue, type DashboardTemplateFile, type WidgetSettingsFile } from "./dashboard-template-file";
import { checkDeckTemplateFileValue, DECK_TEMPLATE_FORMAT, DECK_TEMPLATE_FORMAT_2, DECK_TEMPLATE_FORMAT_3, type DeckTemplateFile } from "./deck-template-file";
import { elementSlots, mapElementWords, SLIDE_ELEMENT_LIMITS } from "./slide-element";
import { slideWords } from "./file-text";
import { checkWorkflowTemplateFileValue, type WorkflowTemplateFile } from "./workflow-template-file";
import { checkThemeFileValue, themeToFile } from "./theme-file";
import { checkViewDesignValue, type ViewDesign } from "./view-design";
import { canonical } from "./api-submissions";
import { TEMPLATE_VIEWS } from "@ziffr/pack/kinds";
import { cleanLogo, logoProblem, PACK_LOGO_MAX_BYTES } from "@ziffr/pack/logo";
import type { DashboardTemplateBody, DeckTemplateBody, Metric, SlideShape, Slot, ThemeSlides, ThemeTokens, WidgetSettings, WorkflowTemplateBody } from "./types";
import type { FormatCheck } from "./json-check";

/** Something the person may put into a Pack, as the Export dialog lists it. */
export type ExportOption = { id: number; name: string; detail: string; /** True for a Theme whose logo may be the Pack's (spec 0039); the picture itself is fetched with `themeLogoForExport` only when picked. */ hasLogo?: boolean };
/** What the Export dialog offers, by kind. */
export type ExportOptions = { metrics: ExportOption[]; catalog: ExportOption[]; dashboards: ExportOption[]; decks: ExportOption[]; workflows: ExportOption[]; designs: ExportOption[]; themes: ExportOption[] };
/** What the person picked, by kind, as ids. */
export type ExportChoice = Partial<Record<keyof ExportOptions, number[]>>;
/** The logo the person chose for the Pack (spec 0039): the logo of one of the Workspace's Themes, or a picture they
 * uploaded as a data address. Either is checked again by the server before it goes into the file. */
export type ExportLogo = { themeId: number } | { data: string };
/** The manifest the person writes for the Pack; the `author` is the publisher the logo is shown with. */
export type ExportManifest = { id: string; name: string; version: string; summary: string; author: string; license: string; logo?: ExportLogo };
/** The Pack's file and what could not go into it, with why. */
export type ExportResult = { text: string; fileName: string; leftOut: { name: string; why: string }[] };

/** How text is fitted into a file: a Pack keeps the Pack's plain-text rules; a Workspace Export (workspace-export.ts)
 * the app's own. Both say "does not fit" by an empty answer, and the caller says what was left out. */
export type TextFit = { plain: (s: unknown, max: number) => string | null; words: (s: unknown, max: number) => string | undefined; /** A paragraph of a slide's text or box that names no Slots (formats /1 and /2). */ saved: (s: unknown, max: number) => string | undefined; /** A Slide Element's words, spaces kept; empty when the file may not hold them. */ slide: (s: string) => string };

const plain = (s: unknown, max: number) => {
  const t = String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max);
  return checkSchema({ type: "string", pattern: PLAIN } as Schema, t).length ? null : t;
};
/** A Calculation Note as a Pack keeps it: on one line and whole. One the format does not take (too long, or holding such
 * a thing as a web address) is left out and said: half a definition would say something else. */
function packNote(s: unknown, name: string, leftOut: ExportResult["leftOut"]): string | undefined {
  const text = String(s ?? "").replace(/\s+/g, " ").trim();
  if (!text) return undefined;
  const fits = [...text].length <= METRIC_FILE_LIMITS.calculationNote ? plain(text, METRIC_FILE_LIMITS.calculationNote) : null;
  if (!fits) leftOut.push({ name, why: `Only how it is calculated was left out: a Pack keeps up to ${METRIC_FILE_LIMITS.calculationNote} characters of plain text, without markup or web addresses.` });
  return fits ?? undefined;
}
const fitting = (pattern: string) => (s: unknown, max: number) => {
  const t = String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max);
  return t && !checkSchema({ type: "string", pattern } as Schema, t).length ? t : undefined;
};
const wordsOk = fitting(WORDS);
/** A Pack's text rules. */
// An element's spaces are part of its layout, so nothing is collapsed: a text is kept whole or not at all.
const slideOk = (s: string) => (checkSchema(slideWords(SLIDE_ELEMENT_LIMITS.words), s).length ? "" : s);
const PACK_FIT: TextFit = { plain, words: wordsOk, saved: fitting(SAVED_WORDS), slide: slideOk };
const slug = (name: string) => {
  const s = name.toLowerCase().normalize("NFKD").replace(/\p{M}/gu, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 36);
  return /^[a-z]/.test(s) ? s : `x-${s || "item"}`.slice(0, 40);
};

// A person who may create, not a program or a Guest: they see the Workspace's templates, designs and Themes.
function assertMayExport(actor: Actor) {
  if ((actor as { key?: unknown }).key || !can(actor, "create")) throw new Forbidden();
}

/** The Metrics this person sees, by id. */
export async function seenMetrics(actor: Actor): Promise<Map<number, Metric>> {
  const all = await getMetrics(actor.workspaceId);
  const seen = await visibleMetricIds(actor.workspaceId, actor.personId, all);
  return new Map(all.filter((m) => seen.has(m.id)).map((m) => [m.id, m]));
}

/** What this person may put into a Pack (anyone but Guests): the Metrics they see, the Workspace's own Metric Catalog
 * entries, its Dashboard, Deck and Workflow Templates, View Designs and Themes. Names only. */
export async function exportOptions(actor: Actor): Promise<ExportOptions> {
  assertMayExport(actor);
  const ws = actor.workspaceId;
  const [metrics, cat, tpl, des, thm] = await Promise.all([
    seenMetrics(actor),
    db().from("catalog_metrics").select("id, name, category").eq("workspace_id", ws).order("name"),
    db().from("team_templates").select("id, kind, name").eq("workspace_id", ws).in("kind", ["dashboard", "deck", "workflow"]).order("name"),
    db().from("view_designs").select("id, name").eq("workspace_id", ws).order("name"),
    db().from("themes").select("id, name, slides").eq("workspace_id", ws).order("name"),
  ]);
  const opt = (rows: { id: unknown; name: unknown }[] | null, detail: (r: Record<string, unknown>) => string = () => "") => (rows ?? []).map((r) => ({ id: Number(r.id), name: String(r.name), detail: detail(r as Record<string, unknown>) }));
  const of = (kind: string) => (tpl.data ?? []).filter((r) => r.kind === kind);
  return {
    metrics: [...metrics.values()].sort((a, b) => a.name.localeCompare(b.name)).map((m) => ({ id: m.id, name: m.name, detail: m.total ? "Total" : m.formula ? "Derived Metric" : `by ${m.period}` })),
    catalog: opt(cat.data, (r) => String(r.category)),
    dashboards: opt(of("dashboard")), decks: opt(of("deck")), workflows: opt(of("workflow")),
    designs: opt(des.data),
    // Only a flag per Theme goes with the page: the picture comes through `themeLogoForExport` when one is picked.
    themes: (thm.data ?? []).map((r) => { const has = cleanLogo((r.slides as { logo?: unknown } | null)?.logo, PACK_LOGO_MAX_BYTES) !== null; return { id: Number(r.id), name: String(r.name), detail: has ? "has a logo" : "", ...(has ? { hasLogo: true } : {}) }; }),
  };
}

type Row = Record<string, unknown>;

/** The cleaned logo of one of the Workspace's Themes, for the Export dialog's preview, or null when there is none that
 * a Pack may hold. Only a Theme of the actor's Workspace is found. */
export async function themeLogoForExport(actor: Actor, themeId: number): Promise<string | null> {
  assertMayExport(actor);
  if (typeof themeId !== "number" || !Number.isInteger(themeId)) return null;
  const { data } = await db().from("themes").select("slides").eq("workspace_id", actor.workspaceId).eq("id", themeId).maybeSingle();
  return cleanLogo((data?.slides as { logo?: unknown } | null)?.logo, PACK_LOGO_MAX_BYTES);
}

/** What else the person chose about the file: `tags: false` leaves the Tags of Metrics out (they go in by default),
 * `guide` is what they wrote under "Describe your Pack", `comesFrom` where each number comes from, by what was
 * picked (a number it does not name is typed by a person; without it the file says nothing of numbers), and `setUp`
 * what they wrote under "Set-up questions". */
export type ExportOptionsChosen = { tags?: boolean; guide?: PackGuideText; comesFrom?: ComesFromChoice; setUp?: PackSetUpChoice };

// A manifest that passes, so that the checks which need the whole file are reached before the person's own is complete.
const CHECKED_AS: ExportManifest = { id: "check/set-up", name: "Check", version: "1.0.0", summary: "Check", author: "Check", license: "CC-BY-4.0" };

/** What a Pack may not hold of the set-up questions written for this pick, field by field (anyone who may export);
 * nothing is written. */
export async function checkExportSetUp(actor: Actor, choice: ExportChoice, setUp: PackSetUpChoice): Promise<PackSetUpProblem[]> {
  const { pack, picked } = await gatherPack(actor, CHECKED_AS, choice);
  return setUpProblems(pack, picked, setUp);
}

/** Makes a Pack of what the person picked: each item as its format writes it, keyed by its key in the Pack it came
 * from or by its name, in the order of their keys, so exporting what a Pack installed gives the same file again.
 * A guide the person wrote, and where each number comes from, go in with it and make the file ziffr.pack/2; set-up
 * questions make it ziffr.pack/3; without any of them it stays ziffr.pack/1.
 * Checked as any Pack before it is given out. */
export async function exportPack(actor: Actor, manifest: ExportManifest, choice: ExportChoice, chosen: ExportOptionsChosen = {}): Promise<ExportResult> {
  assertMayExport(actor);
  const { guide, problems } = guideFromText(chosen?.guide);
  if (problems.length) {
    const [p] = problems;
    const where = PACK_GUIDE_SECTIONS.find((s) => s.key === p.section)?.title;
    throw new Error(`The Pack cannot be made: ${where ? `in “${where}”${p.line ? `, line ${p.line}` : ""}: ` : ""}${p.message}`);
  }
  const { pack: made, leftOut, picked } = await gatherPack(actor, manifest, choice, chosen);
  const said = made.contents.metrics?.some((x) => x.comesFrom) ?? false;
  const asked = withSetUp(made, picked, chosen?.setUp);
  // Each format holds all the one before it holds: the newest one needed wins.
  const pack: Pack = {
    ...asked.pack,
    ...(!asked.used && (guide || said) ? { format: PACK_FORMAT_2 } : {}),
    ...(guide ? { guide } : {}),
  };
  const text = `${JSON.stringify(pack, null, 2)}\n`;
  const res = checkPack(text);
  if (!res.ok) throw new Error(`The Pack cannot be made: ${res.problems[0].path ? `${res.problems[0].path} ` : ""}${res.problems[0].message}`);
  return { text, fileName: `${pack.id.split("/").pop() || "pack"}.pack.json`, leftOut };
}

/** The Pack of what the person picked, as it would be written and before the whole of it is checked: only what they may
 * put into a file, what had to stay out, and for each Metric Catalog entry of it, by its key, what was picked for it
 * (“metric:12” or “catalog:7”). */
export async function gatherPack(actor: Actor, manifest: ExportManifest, choice: ExportChoice, chosen: ExportOptionsChosen = {}): Promise<{ pack: Pack; leftOut: ExportResult["leftOut"]; picked: Map<string, string> }> {
  assertMayExport(actor);
  const ws = actor.workspaceId;
  const ids = (k: keyof ExportOptions) => [...new Set((Array.isArray(choice?.[k]) ? choice[k]! : []).map(Number).filter(Number.isInteger))].slice(0, 50);
  const leftOut: ExportResult["leftOut"] = [];
  const used = new Set<string>();
  const keyFor = (preferred: unknown, name: string) => {
    let k = typeof preferred === "string" && new RegExp(KEY).test(preferred) ? preferred : slug(name);
    for (let n = 2; used.has(k); n++) k = `${k.slice(0, 36)}-${n}`;
    used.add(k);
    return k;
  };
  // Only rows of the actor's Workspace, by the ids picked: an id of another Workspace finds nothing.
  const rows = async (table: string, idList: number[], cols: string) => {
    if (!idList.length) return [] as Row[];
    const { data } = await db().from(table).select(cols).eq("workspace_id", ws).in("id", idList);
    return (data ?? []) as unknown as Row[];
  };
  const seen = await seenMetrics(actor);
  const installs = new Map(((await db().from("pack_installs").select("id, manifest").eq("workspace_id", ws)).data ?? []).map((r) => [Number(r.id), String((r.manifest as { name?: string }).name ?? "")]));

  // The Pack's one logo: a Theme's of this Workspace or an uploaded picture, held to the checks every logo meets.
  let logo: string | null = null;
  const wanted = manifest?.logo as { themeId?: unknown; data?: unknown } | undefined;
  if (wanted && typeof wanted === "object") {
    let raw: unknown;
    if (wanted.themeId !== undefined) raw = ((await rows("themes", (typeof wanted.themeId === "number" && Number.isInteger(wanted.themeId) ? [wanted.themeId] : []), "id, slides"))[0]?.slides as { logo?: unknown } | undefined)?.logo;
    else raw = wanted.data;
    logo = cleanLogo(raw, PACK_LOGO_MAX_BYTES);
    if (!logo) leftOut.push({ name: "Logo", why: logoProblem(raw, PACK_LOGO_MAX_BYTES) ?? "There is no picture to use." });
  }

  // Themes and View Designs first: templates name them by key.
  const themes = (await rows("themes", ids("themes"), "id, name, tokens, slides, pack_key")).map((r) => ({ r, key: keyFor(r.pack_key, String(r.name)) }));
  const themeKey = new Map(themes.map((t) => [Number(t.r.id), t.key]));
  const designs = (await rows("view_designs", ids("designs"), "id, name, body, pack_key")).map((r) => ({ r, key: keyFor(r.pack_key, String(r.name)) }));
  const designKey = new Map(designs.map((d) => [canonical(d.r.body), d.key]));

  // Metrics and catalog entries: the entries a Pack holds. A formula names others by their key in this Pack.
  const metricRows = ids("metrics").filter((id) => seen.has(id)).map((id) => seen.get(id)!);
  for (const id of ids("metrics")) if (!seen.has(id)) leftOut.push({ name: `Metric ${id}`, why: "You do not see it." });
  const catRows = await rows("catalog_metrics", ids("catalog"), "id, category, name, description, calculation_note, unit, unit_position, format, decimals, period, submission_rule, polarity, target_min, target_max, sources, aggregation, industries, segments, formula, tags, total, pack_key, pack_install_id");
  const entries = [
    ...metricRows.map((m) => ({ src: "metric" as const, m: m as unknown as Row, key: keyFor(null, m.name), slugOrKey: m.slug })),
    ...catRows.map((r) => ({ src: "catalog" as const, m: r, key: keyFor(r.pack_key, String(r.name)), slugOrKey: String(r.pack_key ?? "") })),
  ];
  // The Tags a Metric carries, as this person sees them (only Metrics they see are in the file, so only Tags they see through
  // one of those): never a Tag of a Metric that was not picked, and nothing of a Tag only hidden Metrics carry.
  const seenTags = chosen?.tags === false || !metricRows.length ? new Map<number, string[]>() : (await tagSight(actor)).namesByMetric;
  const keyOfInput = new Map(entries.map((e) => [e.slugOrKey, e.key]));
  const metrics: Pack["contents"]["metrics"] = [];
  const picked = new Map<string, string>();
  for (const e of entries) {
    const m = e.m;
    const name = plain(m.name, 120);
    if (!name) { leftOut.push({ name: String(m.name), why: "Its name holds something a Pack may not, such as a web address." }); continue; }
    if (m.total) { leftOut.push({ name, why: "A Total is not in a Pack yet." }); continue; }
    let formula: string | undefined;
    if (m.formula) {
      const inputs = [...String(m.formula).matchAll(/\{([a-z0-9-]+)\}/g)].map((x) => x[1]);
      const missing = inputs.filter((i) => !keyOfInput.has(i));
      if (missing.length) { leftOut.push({ name, why: "It is computed from Metrics that are not in the Pack: add them too." }); continue; }
      formula = String(m.formula).replace(/\{([a-z0-9-]+)\}/g, (_x, i: string) => `{${keyOfInput.get(i)}}`);
    }
    const description = plain(m.description, 1000);
    const note = packNote(m.calculation_note, name, leftOut);
    const unit = plain(m.unit, 20);
    const category = e.src === "catalog" && m.category !== installs.get(Number(m.pack_install_id)) ? plain(m.category, 60) : null;
    const tags = chosen?.tags === false ? [] : packTags(e.src === "metric" ? seenTags.get(Number(m.id)) : m.tags, name, leftOut);
    const file: MetricFile = {
      // The newer format only for an entry that says how it is calculated, so an older Ziffr reads every other (spec 0060).
      format: note ? "ziffr.metric/2" : "ziffr.metric/1", name,
      ...(description ? { description } : {}),
      ...(note ? { calculationNote: note } : {}),
      ...(category ? { category } : {}),
      ...(Array.isArray(m.industries) && m.industries.length ? { industries: m.industries as string[] } : {}),
      ...(Array.isArray(m.segments) && m.segments.length ? { segments: m.segments as string[] } : {}),
      ...(tags.length ? { tags } : {}),
      period: m.period as MetricFile["period"], aggregation: m.aggregation as MetricFile["aggregation"], polarity: m.polarity as MetricFile["polarity"],
      ...(unit ? { unit } : {}),
      unitPosition: m.unit_position as MetricFile["unitPosition"], valueFormat: m.format as MetricFile["valueFormat"], decimals: Number(m.decimals), submissionRule: m.submission_rule as MetricFile["submissionRule"],
      ...(m.target_min !== null && m.target_min !== undefined ? { targetMin: Number(m.target_min) } : {}),
      ...(m.target_max !== null && m.target_max !== undefined ? { targetMax: Number(m.target_max) } : {}),
      ...(m.attainment_method ? { attainmentMethod: m.attainment_method as MetricFile["attainmentMethod"] } : {}),
      ...(formula ? { formula } : { sources: m.sources as MetricFile["sources"] }),
    };
    if (!keep(file, checkMetricFileValue(file), name, leftOut)) continue;
    const ref = `${e.src}:${Number(m.id)}`;
    picked.set(e.key, ref);
    // A computed number's origin is its formula; every other one says where it comes from, when the file says it at all.
    metrics.push({ key: e.key, metric: file, ...(chosen?.comesFrom !== undefined && !formula ? { comesFrom: comesFromOf(chosen.comesFrom, ref, name) } : {}) });
  }
  const entryKeys = new Set(metrics.map((x) => x.key));
  const suggestFor = (s: Slot) => {
    if (s.suggests && entryKeys.has(s.suggests)) return s.suggests;
    const id = (s.exampleIds ?? []).find((x) => seen.has(x));
    const k = id === undefined ? undefined : keyOfInput.get(seen.get(id)!.slug);
    return k && entryKeys.has(k) ? k : undefined;
  };
  const slotsOf = (slots: Slot[]) => slots.map((s, i) => { const sg = suggestFor(s); return { label: plain(s.label, 60) || `Metric ${i + 1}`, ...(s.multiple ? { multiple: true } : {}), ...(sg ? { suggests: sg } : {}) }; });

  const tpl = await rows("team_templates", [...ids("dashboards"), ...ids("decks"), ...ids("workflows")], "id, kind, name, description, slots, body, pack_key");
  const dashboards: Pack["contents"]["dashboards"] = [];
  const decks: Pack["contents"]["decks"] = [];
  const workflows: Pack["contents"]["workflows"] = [];
  for (const r of tpl) {
    const name = plain(r.name, 80);
    if (!name) { leftOut.push({ name: String(r.name), why: "Its name holds something a Pack may not, such as a web address." }); continue; }
    const description = plain(r.description, 300);
    const head = { name, ...(description ? { description } : {}) };
    const key = keyFor(r.pack_key, name);
    if (r.kind === "dashboard" && ids("dashboards").includes(Number(r.id))) {
      const body = r.body as DashboardTemplateBody;
      const file: DashboardTemplateFile = {
        format: "ziffr.dashboard-template/1", ...head, slots: slotsOf(r.slots as Slot[]),
        widgets: body.widgets.filter((w) => (TEMPLATE_VIEWS as readonly string[]).includes(w.view)).map((w) => ({
          view: w.view as DashboardTemplateFile["widgets"][number]["view"], slots: w.metricSlots, ...titleOf(w.title), x: w.x, y: w.y, w: w.w, h: w.h, ...settingsOf(w.settings, designKey),
        })),
      };
      if (keep(file, checkDashboardTemplateFileValue(file), name, leftOut)) dashboards.push({ key, template: file });
    } else if (r.kind === "deck" && ids("decks").includes(Number(r.id))) {
      const body = r.body as DeckTemplateBody;
      const theme = body.themeId ? themeKey.get(Number(body.themeId)) : undefined;
      const file = deckFile({ ...head, slots: slotsOf(r.slots as Slot[]), ...(theme ? { theme } : {}), slides: body.slides.map((s) => ({ ...(s.cover ? { cover: true } : {}), shapes: s.shapes.flatMap((sh) => slideShapeOf(sh, designKey)) })) });
      if (keep(file, checkDeckTemplateFileValue(file), name, leftOut)) decks.push({ key, template: file });
    } else if (r.kind === "workflow" && ids("workflows").includes(Number(r.id))) {
      const b = r.body as WorkflowTemplateBody;
      const file: WorkflowTemplateFile = { format: "ziffr.workflow-template/1", ...head, dueWorkingDays: b.dueWorkingDays, steps: b.steps.map((s) => (s.type === "approve" ? { type: "approve", approvers: s.approvers, ...(s.values ? { values: s.values } : {}), ...(s.nobodyElse ? { nobodyElse: s.nobodyElse } : {}) } : s)) };
      if (keep(file, checkWorkflowTemplateFileValue(file), name, leftOut)) workflows.push({ key, template: file });
    }
  }
  const views: Pack["contents"]["views"] = [];
  for (const d of designs) if (keep(d.r.body, checkViewDesignValue(d.r.body).ok ? { ok: true, value: d.r.body } : { ok: false, problems: [] }, String(d.r.name), leftOut)) views.push({ key: d.key, design: d.r.body as ViewDesign });
  const themeFiles: Pack["contents"]["themes"] = [];
  for (const { r, key } of themes) {
    const own = (r.slides as { logo?: unknown } | null)?.logo;
    const usesPackLogo = logo !== null && cleanLogo(own, PACK_LOGO_MAX_BYTES) === logo;
    if (own && !usesPackLogo) leftOut.push({ name: String(r.name), why: "Its own logo stays out unless it is the Pack's one logo." });
    const file = themeToFile(r.name, r.tokens as ThemeTokens, r.slides as Partial<ThemeSlides> | null, usesPackLogo);
    if (keep(file, checkThemeFileValue(file, new Map(), logo ? "pack-with-logo" : "pack-without-logo"), file.name, leftOut)) themeFiles.push({ key, theme: file });
  }

  const byKey = <T extends { key: string }>(xs: T[]) => [...xs].sort((a, b) => a.key.localeCompare(b.key));
  const contents: Pack["contents"] = Object.fromEntries(Object.entries({ metrics, dashboards, decks, workflows, views, themes: themeFiles }).filter(([, xs]) => xs!.length).map(([k, xs]) => [k, byKey(xs as { key: string }[])]));
  const [major, minor] = ZIFFR_VERSION.split(".");
  const pack: Pack = {
    format: PACK_FORMAT, id: String(manifest?.id ?? ""), name: String(manifest?.name ?? "").trim(), version: String(manifest?.version ?? "").trim(),
    summary: String(manifest?.summary ?? "").replace(/\s+/g, " ").trim(), author: { name: String(manifest?.author ?? "").trim() },
    license: (PACK_LICENSES as readonly string[]).includes(String(manifest?.license)) ? (manifest.license as Pack["license"]) : "CC-BY-4.0",
    ...(logo ? { logo } : {}), ziffr: `>=${major}.${minor}`, contents,
  };
  return { pack, leftOut, picked };
}

/** Tags for an entry of a Pack: those that meet the Pack's rules (plain text, the Tag rules), at most 5; what stays out is said. */
function packTags(raw: unknown, name: string, leftOut: ExportResult["leftOut"]): string[] {
  const kept: string[] = [];
  const out: string[] = [];
  for (const r of Array.isArray(raw) ? raw : []) {
    const t = normaliseTagName(r);
    if (kept.some((k) => tagKey(k) === tagKey(t))) continue;
    if (tagNameProblem(t) || !plain(t, 128) || kept.length >= TAGS_PER_ENTRY) out.push(t);
    else kept.push(t);
  }
  if (out.length) leftOut.push({ name: `Tags of ${name}`, why: `A Pack entry carries at most ${TAGS_PER_ENTRY} Tags of plain words: ${out.map((t) => `“${t}”`).join(", ")} stayed out.` });
  return kept;
}

/** Whether an item passed its format's checks; if not, it is left out with the first problem. */
function keep(_file: unknown, res: FormatCheck<unknown>, name: string, leftOut: ExportResult["leftOut"]): boolean {
  if (res.ok) return true;
  leftOut.push({ name, why: res.problems[0] ? `${res.problems[0].path ? `${res.problems[0].path} ` : ""}${res.problems[0].message}` : "It does not fit the format." });
  return false;
}

/** A widget's title as a file keeps it: only when it fits. */
export const titleOf = (t: string | null | undefined, fit: TextFit = PACK_FIT) => { const w = fit.words(t, 200); return w ? { title: w } : {}; };

/** A widget's settings as a template file keeps them: only what the format has, words that fit, a View Design by its
 * key in the Pack when it is in it, written out otherwise. */
export function settingsOf(s: WidgetSettings | undefined, designKey: ReadonlyMap<string, string>, fit: TextFit = PACK_FIT): { settings?: WidgetSettingsFile } {
  if (!s) return {};
  const out: WidgetSettingsFile = {};
  if (s.window !== undefined) out.window = s.window;
  if (s.display) out.display = s.display;
  for (const k of ["showTarget", "showForecast", "fullPeriods"] as const) if (s[k] !== undefined) out[k] = s[k];
  if (s.rows !== undefined) out.rows = s.rows;
  if (s.compare?.length) out.compare = s.compare;
  for (const k of ["kicker", "headline", "subline", "footnote", "source"] as const) { const w = fit.words(s[k], 200); if (w) out[k] = w; }
  const callouts = (s.callouts ?? []).filter((c) => c.rule).map((c) => ({ rule: c.rule!, ...(fit.words(c.text, 200) ? { text: fit.words(c.text, 200) } : {}) }));
  if (callouts.length) out.callouts = callouts;
  if (s.panels?.length) out.panels = s.panels.map((p) => ({
    type: p.type, ...(p.slot !== undefined ? { slot: p.slot } : {}), ...(p.measure ? { measure: p.measure } : {}), ...(p.periods ? { periods: p.periods } : {}),
    ...(p.highlight === "last" || p.highlight === "projection" ? { highlight: p.highlight } : {}), ...(p.projections !== undefined ? { projections: p.projections } : {}), ...(p.sharedScale !== undefined ? { sharedScale: p.sharedScale } : {}),
    ...(p.refLine ? { refLine: { kind: p.refLine.kind, ...(p.refLine.value !== undefined ? { value: p.refLine.value } : {}), ...(fit.plain(p.refLine.label, 60) ? { label: fit.plain(p.refLine.label, 60)! } : {}) } } : {}),
    ...(p.bridge ? { bridge: { mode: p.bridge.mode } } : {}), ...(fit.words(p.title, 200) ? { title: fit.words(p.title, 200) } : {}),
    ...(p.annotations?.length ? { annotations: p.annotations.flatMap((a) => (a.anchor.type === "rule" ? [{ kind: a.kind, rule: a.anchor.rule, ...(fit.words(a.text, 200) ? { text: fit.words(a.text, 200) } : {}), ...(a.arrow !== undefined ? { arrow: a.arrow } : {}) }] : [])) } : {}),
  }));
  if (s.design?.body) out.design = designKey.get(canonical(s.design.body)) ?? s.design.body;
  return Object.keys(out).length ? { settings: out } : {};
}

/** A Deck Template file in the oldest format that holds it: /3 when a text or box shape names Slots or a gap table
 * reads a Total, else /2 when it has a Slide Element or a cover. */
export function deckFile(t: Omit<DeckTemplateFile, "format">): DeckTemplateFile {
  const live = t.slides.some((s) => s.shapes.some((sh) => ((sh.shape === "text" || sh.shape === "box") && sh.slots) || (sh.shape === "element" && sh.element.kind === "gap-table" && sh.element.total !== undefined)));
  const designed = t.slides.some((s) => s.cover || s.shapes.some((sh) => sh.shape === "element"));
  return { format: live ? DECK_TEMPLATE_FORMAT_3 : designed ? DECK_TEMPLATE_FORMAT_2 : DECK_TEMPLATE_FORMAT, ...t };
}

/** Paragraphs of a shape's words, from the rich text the deck editor keeps. `live`: the words of a box that names
 * Slots, which may hold a slide's Placeholders. */
function paragraphsOf(rich: unknown, fit: TextFit, live: boolean): string[] {
  const doc = rich as { content?: { content?: { text?: string }[] }[] } | undefined;
  return (doc?.content ?? []).map((p) => (p.content ?? []).map((t) => t.text ?? "").join("")).slice(0, 20).map((t) => (live ? fit.slide(t.slice(0, 300)) : fit.saved(t, 300) ?? "")).filter((t, i, all) => t || i < all.length - 1);
}

const COLORS = ["black", "grey", "light-violet", "violet", "blue", "light-blue", "yellow", "orange", "green", "light-green", "light-red", "red", "white"];
const GEOS = ["rectangle", "ellipse", "oval", "triangle", "diamond", "hexagon", "star"];
const clamp = (v: unknown, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(Number(v) || 0)));

/** A slide's shape as a Deck Template file keeps it: widgets, words and simple boxes; anything else stays behind. */
export function slideShapeOf(sh: SlideShape, designKey: ReadonlyMap<string, string>, fit: TextFit = PACK_FIT): DeckTemplateFile["slides"][number]["shapes"] {
  const p = sh.props as Record<string, unknown>;
  const x = clamp(sh.x, 0, 1279), y = clamp(sh.y, 0, 719);
  const color = COLORS.includes(String(p.color)) ? { color: p.color as "black" } : {};
  const element = sh.widget?.settings.element;
  if (sh.type === "ziffr-widget" && sh.widget && p.template === "slide") {
    // An element with a Slot still to pick stays behind: a file that holds it would be refused when read.
    if (!element || sh.widget.metricSlots.length < elementSlots(element).min) return [];
    // Words a file may not hold (an address, markup) are cut to nothing rather than keeping the whole slide out.
    return [{ shape: "element", slots: sh.widget.metricSlots, x, y, w: clamp(p.w, 4, 1280 - x), h: clamp(p.h, 4, 720 - y), element: mapElementWords(element, fit.slide) }];
  }
  if (sh.type === "ziffr-widget" && sh.widget && (TEMPLATE_VIEWS as readonly string[]).includes(String(p.template))) {
    return [{ shape: "widget", view: p.template as "line", slots: sh.widget.metricSlots, ...titleOf(sh.widget.title, fit), x, y, w: clamp(p.w, 40, 1280 - x), h: clamp(p.h, 40, 720 - y), ...settingsOf(sh.widget.settings, designKey, fit) }];
  }
  const slots = sh.textSlots ? { slots: sh.textSlots } : {};
  if (sh.type === "text") {
    const text = paragraphsOf(p.richText, fit, Boolean(sh.textSlots));
    if (!text.length) return [];
    return [{ shape: "text", x, y, w: clamp(p.w, 20, 1280 - x), ...slots, text, ...(["s", "m", "l", "xl"].includes(String(p.size)) ? { size: p.size as "m" } : {}), ...(typeof p.scale === "number" ? { scale: Math.min(4, Math.max(0.25, p.scale)) } : {}), ...(["start", "middle", "end"].includes(String(p.textAlign)) ? { align: p.textAlign as "start" } : {}), ...color }];
  }
  if (sh.type === "geo") {
    const text = paragraphsOf(p.richText, fit, Boolean(sh.textSlots));
    return [{ shape: "box", x, y, w: clamp(p.w, 4, 1280 - x), h: clamp(p.h, 4, 720 - y), geo: (GEOS.includes(String(p.geo)) ? p.geo : "rectangle") as "rectangle", ...(["none", "semi", "solid"].includes(String(p.fill)) ? { fill: p.fill as "none" } : {}), ...color, ...(text.length ? { text, ...slots } : {}) }];
  }
  return [];
}

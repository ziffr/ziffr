// The Workspace Export as the Owner (spec 0040, ticket 8; GLOSSARY: Workspace Export, Workspace Key): everything the
// format carries, read through the core as the person who exports and opened from its sealed columns, written as the
// stream of a file that Ziffr never stores. The format, its checks and its reader and writer are in @ziffr/pack and
// workspace-export-file.ts; this module is what fills them from a Workspace.
// Security: only the Workspace's Owner exports, after signing in within the last 10 minutes (asked of the sign-in
// service itself, never of the browser), never the demo and never through a key. What goes in is what the Owner may
// see (their Metrics, dashboards and decks, as everywhere in Ziffr: a Workspace Role grants no Metric), plus the people,
// Groups, Themes and Workflows of the Workspace; people are invitations, never accounts. Labels (m1, p1, ...) stand for
// rows, so no database or sign-in id is in the file; secrets, keys, Connector links and Webhooks have no record kind, and
// each record is held to the format's closed schema by the writer. What does not fit the format is left out and said,
// never cut short; the Audit Log records that it started and how it ended, never what it held.
import { can, Forbidden, type Actor } from "./actor";
import { db } from "./db";
import { audit, auditOrRefuse } from "./audit-log";
import { DEMO_WORKSPACE_ID } from "./team";
import { ZIFFR_VERSION } from "./ziffr-version";
import { allRows, getMetrics } from "./workspace-data";
import { getGroups, getRawShares, visibleDashboards, visibleDecks, visibleMetricIds } from "./access";
import { openNames, openRows } from "./sealed-columns";
import { tagSight } from "./tag-sight";
import { attainmentMethodOf, workspaceName } from "./workspace-settings";
import { yearStartOf } from "./fiscal-year";
import { knownTimeZone, workspaceClock } from "./workspace-clock";
import { openWorkflowRows } from "./workflow-rows";
import { mayReadItem } from "./checklist-rules";
import { NOT_IN_DASHBOARD_TEMPLATES, toDashboardTemplate, toDeckTemplate, toWorkflowTemplate } from "./team-templates";
import { cleanSlideShapes, storedCovers, storedSlides } from "./templates";
import { deckFile, settingsOf, slideShapeOf, titleOf, type TextFit } from "./pack-export";
import { themeToFile } from "./theme-file";
import { writeWorkspaceExport } from "./workspace-export-file";
import { exportDocumentProblem, exportNumbersProblem, WORKSPACE_EXPORT_FORMAT, WORKSPACE_EXPORT_LIMITS, type MetricRecord, type PersonRecord, type ProjectionRecord, type TargetRecord, type ValueRecord, type WorkspaceExportRecord } from "@ziffr/pack/workspace-export";
import { readParents } from "@ziffr/pack/breakdown-parents";
import { checkPackFormula, type FormulaEntry } from "@ziffr/pack/formula-check";
import { TEMPLATE_VIEWS } from "@ziffr/pack/kinds";
import type { DashboardTemplateFile } from "@ziffr/pack/dashboard-template-file";
import type { DeckTemplateFile } from "@ziffr/pack/deck-template-file";
import type { MetricFile } from "@ziffr/pack/metric-file";
import type { WorkflowTemplateFile } from "@ziffr/pack/workflow-template-file";
import type { Metric, SlideShape, Slot, WidgetSettings, WorkflowConfig, Widget } from "./types";

/** How recently the Owner must have signed in, in milliseconds: 10 minutes (spec 0040). */
export const SIGN_IN_WINDOW_MS = 10 * 60_000;
/** The most Workspace Exports one Workspace starts in an hour: a stolen session cannot pull everything again and again. */
export const WORKSPACE_EXPORTS_PER_HOUR = 5;

/** The Owner has not signed in within the last 10 minutes: they sign in again, then download. */
export class SignInTooOld extends Forbidden {
  constructor() {
    super("Sign in again to download a Workspace Export: it holds everything in the Workspace, so it asks for a sign-in from the last 10 minutes.");
    this.name = "SignInTooOld";
  }
}
/** The Workspace has started too many Workspace Exports this hour. */
export class WorkspaceExportLimit extends Error {
  constructor() {
    super(`A Workspace Export was started ${WORKSPACE_EXPORTS_PER_HOUR} times in the last hour. Try again later.`);
    this.name = "WorkspaceExportLimit";
  }
}

/** One thing the file does not carry, or carries in part, with what it is and why: said to the Owner, never silent. */
export type LeftOut = { what: string; name: string; why: string };

/** What the Owner is shown before the download: what the file will hold and what stays out of it. */
export type ExportPreview = { workspaceName: string; counts: Record<"group" | "theme" | "person" | "metric" | "dashboard" | "deck" | "workflow" | "share", number>; leftOut: LeftOut[] };

// -----------------------------------------------------------------------------------------------------------------------
// Text that fits.

// The characters the file's text rule refuses (control characters, line and paragraph separators, direction marks and
// invisible characters), as in the format's `looseText`. They are removed; a line break is a space.
const REFUSED = /[\p{Cc}\p{Cs}\u00AD\u200B\u2060\uFEFF\u{E0000}-\u{E007F}\u2028\u2029\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/gu;

/** The text rule of a Workspace Export: what a person typed, minus the characters the file refuses, line breaks as spaces.
 * Never shortened: text that is too long is reported through `over` and does not fit. */
function looseFit(over: (what: string) => void): TextFit {
  const plain = (s: unknown, max: number): string | null => {
    const text = String(s ?? "").replace(/[\r\n\t\u2028\u2029]+/g, " ").replace(REFUSED, "").replace(/ {2,}/g, " ").trim();
    if ([...text].length > max) {
      over(`its text has ${[...text].length} characters; the file holds at most ${max}`);
      return null;
    }
    return text;
  };
  // A Slide Element's words were checked by the app's rules when they were saved: they travel as they are.
  return { plain, words: (s, max) => plain(s, max) || undefined, slide: (s) => s };
}

const fitsLabel = (s: unknown, max: number): string | null => {
  const text = String(s ?? "").replace(/\s+/g, " ").replace(REFUSED, "").trim();
  return text && [...text].length <= max ? text : null;
};

// -----------------------------------------------------------------------------------------------------------------------
// Who may export.

/** Checks the person may export: the Workspace's Owner, a person (not a key), not in the demo, and still its Owner. */
async function assertOwner(actor: Actor): Promise<void> {
  if ((actor as { key?: unknown }).key || actor.role !== "owner" || !can(actor, "billing") || actor.workspaceId === DEMO_WORKSPACE_ID) throw new Forbidden("Only the Workspace's Owner downloads a Workspace Export.");
  // The role in the actor is what the caller believed a moment ago; the membership is what holds now.
  const { data } = await db().from("memberships").select("role").eq("workspace_id", actor.workspaceId).eq("user_id", actor.personId).maybeSingle();
  if (data?.role !== "owner") throw new Forbidden("Only the Workspace's Owner downloads a Workspace Export.");
}

/** When the person last signed in, asked of the sign-in service by their account (never from the browser); null if
 * unknown, which counts as too long ago. */
async function lastSignIn(personId: string): Promise<Date | null> {
  const { data: profile } = await db().from("profiles").select("auth_user_id").eq("id", personId).maybeSingle();
  if (!profile?.auth_user_id) return null;
  const { data, error } = await db().auth.admin.getUserById(profile.auth_user_id as string);
  const at = error ? null : data?.user?.last_sign_in_at;
  const when = at ? new Date(at) : null;
  return when && !Number.isNaN(when.getTime()) ? when : null;
}

/** Whether the Owner has signed in recently enough to download now, for the page that then offers the download or asks
 * them to sign in again. Owner only; the download itself checks again. */
export async function workspaceExportState(actor: Actor, options: { sessionStartedAt?: Date | null } = {}): Promise<{ signedInRecently: boolean }> {
  await assertOwner(actor);
  const recent = (at: Date | null | undefined) => Boolean(at) && Date.now() - at!.getTime() <= SIGN_IN_WINDOW_MS;
  return { signedInRecently: recent(await lastSignIn(actor.personId)) && (options.sessionStartedAt === undefined || recent(options.sessionStartedAt)) };
}

// -----------------------------------------------------------------------------------------------------------------------
// What goes into the file besides the numbers.

/** The plan of a file: its records up to the shares, what stays out, and what is needed to stream the numbers. */
type Plan = {
  records: WorkspaceExportRecord[];
  leftOut: LeftOut[];
  workspaceName: string;
  yearStart: number;
  /** The Metrics whose numbers follow, by label in the order the file lists them (code units). */
  metrics: { label: string; id: number; period: Metric["period"]; polarity: Metric["polarity"]; derived: boolean; name: string }[];
};

const MAX_TAGS = WORKSPACE_EXPORT_LIMITS.tags;
const KEY = /^[a-z][a-z0-9-]{0,39}$/;
const EMAIL = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
const SOURCES = new Set(["web_form", "mail", "slack", "telegram", "api"]);

/** A widget's settings as the template made them, with the View Design and Comparisons of the widget it was made from. */
function withSource(templated: WidgetSettings, source: WidgetSettings | undefined): WidgetSettings {
  return { ...templated, ...(source?.compare?.length ? { compare: source.compare } : {}), ...(source?.design ? { design: source.design } : {}) };
}
/** The settings of a widget shape on a slide, which the editor keeps as JSON text. */
function sourceSettings(shape: SlideShape | undefined): WidgetSettings | undefined {
  try {
    return typeof shape?.props.settings === "string" ? (JSON.parse(shape.props.settings || "{}") as WidgetSettings) : undefined;
  } catch {
    return undefined;
  }
}

/** What the sections of the plan share: where records and notes go, the labels handed out so far, and what was read once. */
type Ctx = {
  actor: Actor;
  ws: string;
  records: WorkspaceExportRecord[];
  skip: (what: string, name: string, why: string) => void;
  fit: TextFit;
  over: string[];
  plainOrSkip: (what: string, name: string, text: unknown, max: number) => string | null;
  allMetrics: Metric[];
  yearStart: number;
  groupsAll: Awaited<ReturnType<typeof getGroups>>;
  rawShares: Awaited<ReturnType<typeof getRawShares>>;
  groupLabel: Map<number, string>;
  themeLabel: Map<number, string>;
  personLabel: Map<string, string>;
  metricLabel: Map<number, string>;
  metrics: Plan["metrics"];
  labelOf: { dashboard: Map<number, string>; deck: Map<number, string>; workflow: Map<number, string> };
  filled: (slots: Slot[]) => string[][] | null;
  slotFiles: (slots: Slot[]) => { label: string; multiple?: true }[];
  shownDashboards: number;
};

/** The header, Groups, Themes and people. */
async function groupsThemesPeople(c: Ctx): Promise<void> {
  const { ws, records, skip, fit, over, plainOrSkip, groupsAll, groupLabel, themeLabel, personLabel } = c;
  // Groups: Everyone is the Workspace itself, so it is no Group of the file.
  for (const g of groupsAll.filter((x) => !x.everyone)) {
    const name = plainOrSkip("Group", g.name, g.name, 80);
    if (!name) continue;
    const label = `g${groupLabel.size + 1}`;
    groupLabel.set(g.id, label);
    records.push({ kind: "group", id: label, name });
  }
  const groupsOf = new Map<string, string[]>();
  for (const g of groupsAll) for (const u of g.members) if (groupLabel.has(g.id)) (groupsOf.get(u) ?? groupsOf.set(u, []).get(u)!).push(groupLabel.get(g.id)!);

  // Themes: colours, fonts and slide settings; a logo and a background image stay behind.
  const { data: themeRows } = await db().from("themes").select("id, name, tokens, slides").eq("workspace_id", ws).order("id");
  for (const t of themeRows ?? []) {
    over.length = 0;
    const file = themeToFile(t.name, t.tokens, t.slides, false, (s, max) => fit.plain(s, max));
    const problem = exportDocumentProblem("theme", file);
    if (problem) { skip("Theme", String(t.name), `Left out: ${problem}`); continue; }
    if ((t.slides as { logo?: unknown; background_image?: unknown } | null)?.logo || (t.slides as { background_image?: unknown } | null)?.background_image) skip("Theme", file.name, "Its logo and background image stay behind: the file holds no images.");
    const label = `t${themeLabel.size + 1}`;
    themeLabel.set(t.id as number, label);
    records.push({ kind: "theme", id: label, theme: file });
  }

  // People, as invitations: members only; never an id, a sign-in or a Contact's details.
  const { data: members } = await db().from("memberships").select("user_id, role").eq("workspace_id", ws).order("user_id");
  const { data: profileRows } = (members ?? []).length ? await db().from("profiles").select("id, name, email").in("id", (members ?? []).map((m) => m.user_id as string)) : { data: [] };
  const profiles = new Map((await openNames(ws, profileRows ?? [])).map((p) => [String(p.id), p] as const));
  const emails = new Set<string>();
  const people = (members ?? []).map((m) => ({ m, p: profiles.get(m.user_id as string) })).sort((a, b) => String(a.p?.name ?? "").localeCompare(String(b.p?.name ?? "")) || String(a.m.user_id).localeCompare(String(b.m.user_id)));
  for (const { m, p } of people) {
    const name = fitsLabel(p?.name, WORKSPACE_EXPORT_LIMITS.name) ?? "";
    const email = String(p?.email ?? "").trim();
    const shownName = String(p?.name ?? "") || "A person";
    if (!name) { skip("Person", shownName, "Left out: no name that fits the file."); continue; }
    if (!email || !EMAIL.test(email) || email.length > WORKSPACE_EXPORT_LIMITS.email) { skip("Person", shownName, "Left out: no email address on file to invite them with."); continue; }
    if (emails.has(email.toLowerCase())) { skip("Person", shownName, "Left out: another person has the same email address."); continue; }
    emails.add(email.toLowerCase());
    const label = `p${personLabel.size + 1}`;
    personLabel.set(m.user_id as string, label);
    const groups = (groupsOf.get(m.user_id as string) ?? []).slice(0, WORKSPACE_EXPORT_LIMITS.groupsOfPerson);
    const person: PersonRecord = { kind: "person", id: label, name, email, role: m.role === "owner" ? "admin" : (m.role as PersonRecord["role"]), ...(groups.length ? { groups } : {}) };
    records.push(person);
  }

}

/** The Metrics the actor sees, with their documents, Tags, owners and Submitters. */
async function metricRecords(c: Ctx): Promise<void> {
  const { actor, ws, records, skip, fit, over, allMetrics, personLabel, metricLabel, metrics } = c;
  // Metrics: those the Owner sees. Labels follow the order of their ids.
  const seen = await visibleMetricIds(ws, actor.personId, allMetrics);
  const hidden = allMetrics.filter((m) => !seen.has(m.id)).length;
  if (hidden) skip("Metrics", `${hidden} Metric${hidden === 1 ? "" : "s"}`, `${hidden === 1 ? "It is" : "They are"} not in the file because ${hidden === 1 ? "it is" : "they are"} shared only with others: ask ${hidden === 1 ? "its owner" : "their owners"} to share ${hidden === 1 ? "it" : "them"} with you before you export. A Workspace Export holds what you may see.`);
  const tags = (await tagSight(actor)).namesByMetric;
  const { data: tokenRows } = await db().from("tokens").select("metric_id, submitter_id").eq("workspace_id", ws).is("stands_in_for", null);
  const submittersOf = new Map<number, string[]>();
  for (const t of tokenRows ?? []) (submittersOf.get(t.metric_id as number) ?? submittersOf.set(t.metric_id as number, []).get(t.metric_id as number)!).push(t.submitter_id as string);
  const candidates = allMetrics.filter((m) => seen.has(m.id)).sort((a, b) => a.id - b.id);
  // A Metric's key is its slug when that is a key of the file; formulas name Metrics by it.
  const keyOf = new Map<number, string>();
  const keyTaken = new Set<string>();
  for (const m of candidates) {
    let key = KEY.test(m.slug) ? m.slug : `metric-${m.id}`.slice(0, 40);
    while (keyTaken.has(key)) key = `${key.slice(0, 34)}-${keyTaken.size}`;
    keyTaken.add(key);
    keyOf.set(m.id, key);
  }
  const bySlug = new Map(candidates.map((m) => [m.slug, m] as const));
  const files = new Map<number, MetricFile>();
  for (const m of candidates) {
    over.length = 0;
    const name = fit.plain(m.name, 120);
    const description = fit.plain(m.description, WORKSPACE_EXPORT_LIMITS.metricDescription);
    const note = fit.plain(m.calculation_note, WORKSPACE_EXPORT_LIMITS.metricCalculationNote);
    const unit = fit.plain(m.unit, 20);
    if (!name || description === null || note === null || unit === null) { skip("Metric", m.name || "(unnamed)", `Left out: ${over[0] ?? "it has no name"}.`); continue; }
    let formula: string | undefined;
    if (m.formula) formula = m.formula.replace(/\{([a-z0-9-]+)\}/g, (all, slug: string) => (bySlug.has(slug) ? `{${keyOf.get(bySlug.get(slug)!.id)}}` : all));
    const file: MetricFile = {
      // The newer format only for a Metric that has a Calculation Note, so an older Ziffr reads every other (spec 0060).
      format: note ? "ziffr.metric/2" : "ziffr.metric/1", name, ...(description ? { description } : {}), ...(note ? { calculationNote: note } : {}), period: m.period, aggregation: m.aggregation, polarity: m.polarity,
      ...(unit ? { unit } : {}), unitPosition: m.unit_position, valueFormat: m.format, decimals: m.decimals, submissionRule: m.submission_rule,
      ...(m.target_min !== null && m.target_min !== undefined ? { targetMin: Number(m.target_min) } : {}), ...(m.target_max !== null && m.target_max !== undefined ? { targetMax: Number(m.target_max) } : {}),
      ...(m.attainment_method ? { attainmentMethod: m.attainment_method } : {}),
      ...(formula ? { formula } : { sources: (m.sources ?? []).filter((s) => SOURCES.has(s)) as MetricFile["sources"] }),
    };
    const problem = exportDocumentProblem("metric", file);
    if (problem) { skip("Metric", name, `Left out: ${problem}`); continue; }
    files.set(m.id, file);
  }
  // A Derived Metric stays only while the Metrics its formula names do (and its formula holds): drop until nothing changes.
  for (let again = true; again;) {
    again = false;
    const entries = new Map<string, FormulaEntry>([...files].map(([id, f]) => [keyOf.get(id)!, { key: keyOf.get(id)!, name: f.name, period: f.period, aggregation: f.aggregation, derived: f.formula !== undefined }] as const));
    for (const [id, f] of files) {
      if (f.formula === undefined) continue;
      const why = checkPackFormula(f.formula, entries, { key: keyOf.get(id)!, period: f.period });
      if (why) { skip("Metric", f.name, `Left out: ${why}`); files.delete(id); again = true; break; }
    }
  }
  let contactSubmitters = 0;
  for (const m of candidates) {
    const file = files.get(m.id);
    if (!file) continue;
    const label = `m${metricLabel.size + 1}`;
    metricLabel.set(m.id, label);
    metrics.push({ label, id: m.id, period: m.period, polarity: m.polarity, derived: m.formula !== null, name: file.name });
    const seenTag = new Set<string>();
    const names = (tags.get(m.id) ?? []).filter((t) => {
      const key = t.toLowerCase();
      const ok = [...t].length <= WORKSPACE_EXPORT_LIMITS.tag && fitsLabel(t, WORKSPACE_EXPORT_LIMITS.tag) === t && !seenTag.has(key);
      seenTag.add(key);
      if (!ok) skip("Tag", t, `Left out of “${file.name}”: a Tag of the file has at most ${WORKSPACE_EXPORT_LIMITS.tag} characters, no control or direction characters, and is listed once.`);
      return ok;
    });
    if (names.length > MAX_TAGS) skip("Tags", file.name, `Only ${MAX_TAGS} of its ${names.length} Tags are in the file.`);
    const subs = [...new Set(submittersOf.get(m.id) ?? [])];
    const submitters = subs.filter((p) => personLabel.has(p)).map((p) => personLabel.get(p)!).slice(0, WORKSPACE_EXPORT_LIMITS.submitters);
    contactSubmitters += subs.filter((p) => !personLabel.has(p)).length;
    const owner = personLabel.get(m.owner_id);
    const rec: MetricRecord = { kind: "metric", id: label, key: keyOf.get(m.id)!, metric: file, ...(names.length ? { tags: names.slice(0, MAX_TAGS) } : {}), ...(owner ? { owner } : {}), ...(submitters.length ? { submitters } : {}) };
    records.push(rec);
  }
  if (contactSubmitters) skip("Submitters", `${contactSubmitters} Contact${contactSubmitters === 1 ? "" : "s"} or people without an email address`, "Not in the file as Submitters: a Contact's details never travel, and a person without an address cannot be invited.");

}

/** Dashboards, as templates whose Slots are filled with Metrics of the file. */
async function dashboardRecords(c: Ctx): Promise<void> {
  const { actor, ws, records, skip, fit, plainOrSkip, allMetrics, labelOf, filled, slotFiles } = c;
  // Dashboards, decks and Workflows, as templates whose Slots are filled with the Metrics of the file.

  const dashboards = await visibleDashboards(ws, actor.personId);
  const { data: widgetRows }: { data: Record<string, unknown>[] | null } = dashboards.length ? await db().from("widgets").select("id, dashboard_id, template, metric_ids, settings, title, x, y, w, h").eq("workspace_id", ws).in("dashboard_id", dashboards.map((d) => d.id)) : { data: [] };
  const { data: kindRows } = dashboards.length ? await db().from("dashboards").select("id, kind").eq("workspace_id", ws).in("id", dashboards.map((d) => d.id)) : { data: [] };
  const kindOf = new Map((kindRows ?? []).map((r) => [r.id as number, r.kind as string]));
  const widgetsOf = new Map<number, Pick<Widget, "template" | "metric_ids" | "settings" | "title" | "x" | "y" | "w" | "h">[]>();
  for (const w of await openRows("widgets", ws, widgetRows)) {
    const rest: Record<string, unknown> = { ...w };
    delete rest.id;
    (widgetsOf.get(w.dashboard_id as number) ?? widgetsOf.set(w.dashboard_id as number, []).get(w.dashboard_id as number)!).push(rest as unknown as Widget);
  }
  for (const d of [...dashboards].sort((a, b) => a.id - b.id)) {
    const name = plainOrSkip("Dashboard", d.name, d.name, 80);
    if (!name) continue;
    if (kindOf.get(d.id) === "story") { skip("Dashboard", name, "Left out: a story is not carried by the file."); continue; }
    const widgets = widgetsOf.get(d.id) ?? [];
    const t = toDashboardTemplate(widgets, allMetrics);
    // The template keeps a widget's words and views but not its View Design or Comparisons, which a file of a whole
    // Workspace must: the source widgets are in the same order as the template's (free layouts left out of both).
    const sources = [...widgets].sort((a, b) => a.y - b.y || a.x - b.x).filter((w) => !NOT_IN_DASHBOARD_TEMPLATES.includes(w.template));
    const doc: DashboardTemplateFile = {
      format: "ziffr.dashboard-template/1", name, slots: slotFiles(t.slots) as DashboardTemplateFile["slots"],
      widgets: t.body.widgets.flatMap((w, i) => (TEMPLATE_VIEWS as readonly string[]).includes(w.view) ? [{
        view: w.view as DashboardTemplateFile["widgets"][number]["view"], slots: w.metricSlots, ...titleOf(w.title, fit), x: w.x, y: w.y, w: w.w, h: w.h, ...settingsOf(withSource(w.settings, sources[i]?.settings), new Map(), fit),
      }] : []),
    };
    const fills = filled(t.slots);
    const why = !doc.widgets.length ? "nothing on it can be carried" : !fills ? "it draws a Metric that is not in the file" : exportDocumentProblem("dashboard", doc);
    if (why) { skip("Dashboard", name, `Left out: ${why}`); continue; }
    const carried = doc.widgets.length;
    const lost = widgets.length - carried;
    if (lost > 0) skip("Dashboard", name, `${lost} widget${lost === 1 ? "" : "s"} stay behind: free layouts and views the file does not know.`);
    if (t.notices.length) skip("Dashboard", name, t.notices.join(" "));
    if (d.intro && String(d.intro).trim()) skip("Dashboard", name, "Its introduction stays behind: the file holds no dashboard introductions.");
    const label = `d${labelOf.dashboard.size + 1}`;
    labelOf.dashboard.set(d.id, label);
    records.push({ kind: "dashboard", id: label, dashboard: doc, slots: fills! });
  }

  c.shownDashboards = dashboards.length;
}

/** Decks, as templates whose Slots are filled with Metrics of the file. */
async function deckRecords(c: Ctx): Promise<void> {
  const { actor, ws, records, skip, fit, plainOrSkip, allMetrics, themeLabel, labelOf, filled, slotFiles, shownDashboards } = c;
  const decks = await visibleDecks(ws, actor.personId);
  for (const [what, table, shown] of [["Dashboards", "dashboards", shownDashboards], ["Decks", "decks", decks.length]] as const) {
    const { count } = await db().from(table).select("id", { count: "exact", head: true }).eq("workspace_id", ws);
    const unseen = (count ?? 0) - shown;
    if (unseen > 0) skip(what, `${unseen} of them`, `Not in the file because ${unseen === 1 ? "it is" : "they are"} shared only with others: ask their owners to share ${unseen === 1 ? "it" : "them"} with you before you export.`);
  }
  const { data: deckRows } = decks.length ? await db().from("decks").select("id, name, theme_id").eq("workspace_id", ws).in("id", decks.map((d) => d.id)) : { data: [] };
  for (const row of [...(deckRows ?? [])].sort((a, b) => (a.id as number) - (b.id as number))) {
    // One deck's document at a time: a document may be megabytes.
    const d = { ...row, document: (await db().from("decks").select("document").eq("id", row.id as number).eq("workspace_id", ws).maybeSingle()).data?.document };
    const name = plainOrSkip("Deck", String(d.name), d.name, 80);
    if (!name) continue;
    try {
      const raw = storedSlides(d.document);
      if (!raw.length) throw new Error("it has no slides");
      const total = raw.reduce((n, s) => n + s.length, 0);
      const cleaned = raw.map(cleanSlideShapes);
      const t = toDeckTemplate(cleaned.map((c) => c.shapes), allMetrics, {}, [], storedCovers(d.document));
      const doc = deckFile({
        name, slots: slotFiles(t.slots) as DeckTemplateFile["slots"],
        slides: t.body.slides.map((s, i) => ({ ...(s.cover ? { cover: true } : {}), shapes: s.shapes.flatMap((sh: SlideShape, j) => slideShapeOf(sh.widget ? { ...sh, widget: { ...sh.widget, settings: withSource(sh.widget.settings, sourceSettings(cleaned[i]?.shapes[j])) } } : sh, new Map(), fit)) })),
      });
      const kept = doc.slides.reduce((n, s) => n + s.shapes.length, 0);
      const fills = filled(t.slots);
      const why = !fills ? "it draws a Metric that is not in the file" : exportDocumentProblem("deck", doc);
      if (why) throw new Error(why);
      if (kept < total) skip("Deck", name, `${total - kept} shape${total - kept === 1 ? "" : "s"} stay behind: images, arrows, lines, notes and drawings are not in the file.`);
      if (t.notices.length) skip("Deck", name, t.notices.join(" "));
      const theme = d.theme_id ? themeLabel.get(d.theme_id as number) : undefined;
      const label = `k${labelOf.deck.size + 1}`;
      labelOf.deck.set(d.id as number, label);
      records.push({ kind: "deck", id: label, deck: doc, slots: fills!, ...(theme ? { theme } : {}) });
    } catch (e) {
      skip("Deck", name, `Left out: ${(e as Error).message}`);
    }
  }

}

/** Workflows, as templates with the Metrics that use them. */
async function workflowRecords(c: Ctx): Promise<void> {
  const { actor, ws, records, skip, plainOrSkip, metricLabel, labelOf } = c;
  const { data: flowRows } = await db().from("workflows").select("id, name, owner_id, config").eq("workspace_id", ws).order("id");
  const { data: usage } = await db().from("metrics").select("id, workflow_id").eq("workspace_id", ws).not("workflow_id", "is", null);
  for (const w of await openWorkflowRows(ws, flowRows)) {
    const name = plainOrSkip("Workflow", String(w.name), w.name, 80);
    if (!name) continue;
    // The file holds only what the Owner who exports may see: items whose words they may not read stay behind, counted and never named.
    const full = w.config as WorkflowConfig;
    const mine = { id: actor.personId, role: actor.role, groupIds: c.groupsAll.filter((g) => g.members.includes(actor.personId)).map((g) => g.id) };
    const config = { ...full, steps: full.steps.filter((s) => s.type !== "checklist" || mayReadItem(s, mine, String(w.owner_id))) };
    const hidden = full.steps.length - config.steps.length;
    const body = toWorkflowTemplate(config);
    const asked = (usage ?? []).filter((u) => u.workflow_id === w.id).map((u) => metricLabel.get(u.id as number)).filter((l): l is string => Boolean(l)).slice(0, WORKSPACE_EXPORT_LIMITS.workflowMetrics);
    const doc: WorkflowTemplateFile = { format: "ziffr.workflow-template/1", name, dueWorkingDays: body.dueWorkingDays, steps: body.steps as WorkflowTemplateFile["steps"] };
    const why = !asked.length ? "no Metric of the file uses it" : exportDocumentProblem("workflow", doc);
    if (why) { skip("Workflow", name, `Left out: ${why}`); continue; }
    const lost = [config.steps.some((s) => s.type === "tell") && "its Tell steps", config.steps.some((s) => s.type === "approve") && "who approves", config.steps.some((s) => s.type === "checklist" && s.readGroup !== undefined) && "the Group a checklist item is kept to (its words come along)", config.steps.some((s) => s.type === "checklist") && "who its checklist items go to", config.steps.some((s) => s.type === "send_snapshot") && "the dashboard and the people its Send Snapshot step sends to", hidden > 0 && `${hidden} checklist item${hidden === 1 ? "" : "s"} you may not read`, config.asking && "its own asking days and hour", config.lockSummary && "its lock summary"].filter(Boolean);
    if (lost.length) skip("Workflow", name, `Stays behind: ${lost.join(", ")}. The file holds how many Approvers there are, never who.`);
    const label = `w${labelOf.workflow.size + 1}`;
    labelOf.workflow.set(w.id as number, label);
    records.push({ kind: "workflow", id: label, workflow: doc, metrics: asked });
  }

}

/** Shares of what is in the file with who is in the file. */
async function shareRecords(c: Ctx): Promise<void> {
  const { records, skip, rawShares, groupLabel, personLabel, metricLabel, labelOf } = c;
  // Shares: of what is in the file, with who is in the file.
  const seenShare = new Set<string>();
  let lostShares = 0;
  let downgraded = 0;
  for (const s of rawShares) {
    const of = s.object_type === "metric" ? metricLabel.get(s.object_id) : s.object_type === "dashboard" ? labelOf.dashboard.get(s.object_id) : s.object_type === "deck" ? labelOf.deck.get(s.object_id) : undefined;
    const withWho = s.user_id ? personLabel.get(s.user_id) : s.group_id !== null && s.group_id !== undefined ? groupLabel.get(s.group_id) : undefined;
    if (!of || !withWho || !(s.object_type === "metric" || s.object_type === "dashboard" || s.object_type === "deck")) { lostShares++; continue; }
    const key = `${s.object_type}:${of}>${s.user_id ? "person" : "group"}:${withWho}`;
    if (seenShare.has(key)) continue;
    seenShare.add(key);
    if (s.role !== "viewer") downgraded++;
    records.push({ kind: "share", of: { kind: s.object_type, id: of }, with: { kind: s.user_id ? "person" : "group", id: withWho } });
  }
  if (lostShares) skip("Shares", `${lostShares} Share${lostShares === 1 ? "" : "s"}`, "Not in the file: they are of something that is not in it, or with someone or a Group that is not in it.");
  if (downgraded) skip("Shares", `${downgraded} Share${downgraded === 1 ? "" : "s"}`, "In the file as plain Shares: the file holds who sees a thing, not who may change it.");

}

/** Reads everything but the numbers into records, as the actor, and says what does not fit. */
async function plan(actor: Actor): Promise<Plan> {
  const ws = actor.workspaceId;
  const leftOut: LeftOut[] = [];
  const skip = (what: string, name: string, why: string) => void leftOut.push({ what, name, why });
  const records: WorkspaceExportRecord[] = [];
  const over: string[] = [];
  const fit = looseFit((what) => over.push(what));
  /** A text that fits or null, noting why on the item when it does not. */
  const plainOrSkip = (what: string, name: string, text: unknown, max: number): string | null => {
    over.length = 0;
    const t = fit.plain(text, max);
    if (t === null) skip(what, name || "(unnamed)", `Left out: ${over[0]}.`);
    return t;
  };
  const [wsName, yearStart, attainment, clock, groupsAll, rawShares, allMetrics] = await Promise.all([workspaceName(actor), yearStartOf(ws), attainmentMethodOf(ws), workspaceClock(actor), getGroups(ws), getRawShares(ws), getMetrics(ws)]);
  const headerName = fitsLabel(wsName, 80) ?? "Workspace";
  records.push({ kind: "header", format: WORKSPACE_EXPORT_FORMAT, ziffr: ZIFFR_VERSION, exportedAt: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"), workspace: { name: headerName, ...(/^[A-Za-z][A-Za-z0-9_+/-]{0,63}$/.test(clock.timeZone) && knownTimeZone(clock.timeZone) ? { timeZone: clock.timeZone } : {}), yearStart, attainmentMethod: attainment } });
  if (headerName !== wsName) skip("Workspace", wsName, "Its name is saved in the file as \u201cWorkspace\u201d, as it has line breaks or is too long for the file.");
  const metricLabel = new Map<number, string>();
  const metrics: Plan["metrics"] = [];
  const c: Ctx = {
    actor, ws, records, skip, fit, over, plainOrSkip, allMetrics, yearStart, groupsAll, rawShares, metricLabel, metrics,
    groupLabel: new Map(), themeLabel: new Map(), personLabel: new Map(),
    labelOf: { dashboard: new Map(), deck: new Map(), workflow: new Map() },
    filled: (slots) => {
      const out: string[][] = [];
      for (const s of slots) {
        const labels = (s.exampleIds ?? []).map((id) => metricLabel.get(id));
        if (!labels.length || labels.some((l) => l === undefined)) return null;
        out.push(labels as string[]);
      }
      return out;
    },
    slotFiles: (slots) => slots.map((s, i) => {
      const first = (s.exampleIds ?? []).map((id) => metrics.find((x) => x.id === id)?.name).find(Boolean);
      const label = first ? fitsLabel(s.multiple && (s.exampleIds ?? []).length > 1 ? `${first} and more` : first, 60) : null;
      return { label: label ?? `Metric ${i + 1}`, ...(s.multiple ? { multiple: true as const } : {}) };
    }),
    shownDashboards: 0,
  };
  await groupsThemesPeople(c);
  await metricRecords(c);
  await dashboardRecords(c);
  await deckRecords(c);
  await workflowRecords(c);
  await shareRecords(c);
  // More of a kind than the format holds is refused now, before a byte goes out, not found by the writer half way.
  const kinds = new Map<string, number>();
  for (const r of records) kinds.set(r.kind, (kinds.get(r.kind) ?? 0) + 1);
  for (const [kind, max] of Object.entries(WORKSPACE_EXPORT_LIMITS.perKind)) if ((kinds.get(kind) ?? 0) > max) throw new Error(`This Workspace has more ${kind} records than a Workspace Export holds (${max.toLocaleString("en")}).`);
  return { records, leftOut, workspaceName: headerName, yearStart, metrics };
}

/** What the file will hold, apart from the numbers, and what stays out of it: for the page before the download. Owner only. */
export async function previewWorkspaceExport(actor: Actor): Promise<ExportPreview> {
  await assertOwner(actor);
  const p = await plan(actor);
  const counts = { group: 0, theme: 0, person: 0, metric: 0, dashboard: 0, deck: 0, workflow: 0, share: 0 };
  for (const r of p.records) if (r.kind in counts) counts[r.kind as keyof typeof counts]++;
  return { workspaceName: p.workspaceName, counts, leftOut: p.leftOut };
}

// -----------------------------------------------------------------------------------------------------------------------
// The numbers, in batches.

const BATCH = 1000;

/** The records of the numbers of one Metric: its Target Series, Projections and values. */
async function* numbersOf(actor: Actor, m: Plan["metrics"][number], yearStart: number, names: (ids: string[]) => Promise<Map<string, string>>, tally: { values: number; leftOut: number }): AsyncGenerator<TargetRecord | ProjectionRecord | ValueRecord> {
  const ws = actor.workspaceId;
  // Series: the Target Series first, then Projections, each by period. A Target Series point is one number: the upper
  // end of the range for a Metric where lower is better, the lower end otherwise (compare.ts, targetFor).
  const series = await allRows<Record<string, unknown>>((from, to) => db().from("series_values").select("id, kind, period_start, value, value_sealed").eq("workspace_id", ws).eq("metric_id", m.id).order("kind").order("period_start").order("id").range(from, to));
  for (const r of (await openRows("series_values", ws, series.map((s) => ({ ...s, metric_id: m.id })))) as unknown as { kind: string; period_start: string; value: unknown }[]) {
    if (typeof r.value !== "number") { tally.leftOut++; continue; }
    const record: TargetRecord | ProjectionRecord = r.kind === "target"
      ? { kind: "target", metric: m.label, period: r.period_start, ...(m.polarity === "lower" ? { max: r.value } : { min: r.value }) }
      : { kind: "projection", metric: m.label, period: r.period_start, value: r.value };
    if (exportNumbersProblem(record, m.period, yearStart)) tally.leftOut++;
    else yield record;
  }
  if (m.derived) return;
  // Values, in the order they were recorded; a Breakdown with each, its labels opened.
  for (let after = 0; ; ) {
    const { data } = await db().from("observations").select("id, period_start, value, value_sealed, submitter_id, entered_by, submitted_by_name, entered_by_name, source, imported, created_at").eq("workspace_id", ws).eq("metric_id", m.id).gt("id", after).order("id").limit(BATCH);
    if (!data?.length) return;
    after = data[data.length - 1].id as number;
    const rows = await openRows("observations", ws, data);
    const ids = rows.map((r) => r.id as number);
    const parts = new Map<number, { id: number; parent: number | null; label: string; value: number }[]>();
    for (let i = 0; i < ids.length; i += 200) {
      const { data: b } = await db().from("breakdown_rows").select("id, observation_id, parent_id, label, value, value_sealed, position").eq("workspace_id", ws).in("observation_id", ids.slice(i, i + 200)).order("observation_id").order("position").order("id");
      for (const r of await openRows("breakdown_rows", ws, b)) if (typeof r.value === "number" && typeof r.label === "string") (parts.get(r.observation_id as number) ?? parts.set(r.observation_id as number, []).get(r.observation_id as number)!).push({ id: r.id as number, parent: (r.parent_id as number | null) ?? null, label: r.label, value: r.value });
    }
    const who = await names([...new Set(rows.flatMap((r) => [r.submitter_id, r.entered_by]).filter((x): x is string => typeof x === "string"))]);
    for (const r of rows) {
      if (typeof r.value !== "number" || !Number.isFinite(r.value)) { tally.leftOut++; continue; }
      // An imported value has no person, only the sealed name it came with (spec 0040): exported as that name again.
      const keptName = (v: unknown) => (typeof v === "string" ? fitsLabel(v, WORKSPACE_EXPORT_LIMITS.name) ?? undefined : undefined);
      const submittedBy = (r.submitter_id ? who.get(String(r.submitter_id)) : undefined) || keptName(r.submitted_by_name);
      // Who entered a Filled-in Value for the submitter, as a name like the submitter (spec 0046).
      const enteredBy = (r.entered_by ? who.get(String(r.entered_by)) : undefined) || keptName(r.entered_by_name);
      const source = r.imported ? "import" : SOURCES.has(String(r.source)) ? (String(r.source) as ValueRecord["source"]) : undefined;
      const at = new Date(String(r.created_at));
      const kept = exportedBreakdown(parts.get(r.id as number) ?? []);
      const breakdown = kept.rows;
      if (kept.left) tally.leftOut++;
      const base: ValueRecord = { kind: "value", metric: m.label, period: String(r.period_start), value: r.value, ...(Number.isNaN(at.getTime()) ? {} : { recordedAt: at.toISOString() }), ...(source ? { source } : {}), ...(submittedBy ? { submittedBy } : {}), ...(enteredBy ? { enteredBy } : {}) };
      // A Breakdown that does not fit (too many rows, a repeated label) is left off the value, never the value itself.
      const withBreakdown: ValueRecord = breakdown.length && breakdown.length <= WORKSPACE_EXPORT_LIMITS.breakdown ? { ...base, breakdown } : base;
      if (!exportNumbersProblem(withBreakdown, m.period, yearStart)) { tally.values++; yield withBreakdown; }
      else if (withBreakdown !== base && !exportNumbersProblem(base, m.period, yearStart)) { tally.values++; tally.leftOut++; yield base; }
      else tally.leftOut++;
    }
    if (data.length < BATCH) return;
  }
}

/** A value's Breakdown rows as the file has them: each label that fits, a part naming its parent's label (spec 0041, ticket 12). A Breakdown with parents in which a name does not fit, or that the file's own reader would refuse (a repeated name a flat Breakdown allowed, a label that did not open), is left off whole, and `left` says so, so the export counts it as left out: a part must never be written as a row at the top, and nothing is dropped without being counted. */
export function exportedBreakdown(rows: { id: number; parent: number | null; label: string; value: number }[]): { rows: { label: string; value: number; parent?: string }[]; left: boolean } {
  const named = rows.map((b) => ({ ...b, fits: fitsLabel(b.label, WORKSPACE_EXPORT_LIMITS.label) }));
  if (!named.some((b) => b.parent !== null)) return { rows: named.flatMap((b) => (b.fits ? [{ label: b.fits, value: b.value }] : [])), left: false };
  // A row at the top has no parent (null), which no id matches.
  const label = new Map(named.map((b) => [b.id, b.fits]));
  const out = named.map((b) => ({ label: b.fits, value: b.value, parent: label.get(b.parent as number) }));
  const whole = out.every((b, i) => b.label && (named[i].parent === null || b.parent));
  if (!whole) return { rows: [], left: true };
  const listed = out.map((b) => ({ label: b.label as string, value: b.value, ...(b.parent ? { parent: b.parent } : {}) }));
  return readParents(listed).ok ? { rows: listed, left: false } : { rows: [], left: true };
}

/** Every record of the file after its header, in the order the format needs, as an async stream. */
async function* recordsOf(actor: Actor, p: Plan, tally: { values: number; leftOut: number }): AsyncGenerator<WorkspaceExportRecord> {
  yield* p.records;
  // The names of the people who submitted values, read once each and opened; "" where one has none that fits.
  const known = new Map<string, string>();
  const names = async (ids: string[]) => {
    const need = ids.filter((id) => !known.has(id));
    for (let i = 0; i < need.length; i += 200) {
      const { data } = await db().from("profiles").select("id, name").in("id", need.slice(i, i + 200));
      for (const r of await openNames(actor.workspaceId, data ?? [])) known.set(String(r.id), fitsLabel(r.name, WORKSPACE_EXPORT_LIMITS.name) ?? "");
    }
    return new Map(ids.flatMap((id) => (known.get(id) ? [[id, known.get(id)!] as const] : [])));
  };
  // Labels are compared by JavaScript code units, the order the format wants for its Target Series and Projections.
  for (const m of [...p.metrics].sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0))) yield* numbersOf(actor, m, p.yearStart, names, tally);
}

// -----------------------------------------------------------------------------------------------------------------------
// The download.

/** A Workspace Export being downloaded: the file's name, and its bytes as a stream. */
export type WorkspaceExportDownload = { filename: string; stream: AsyncGenerator<Uint8Array>; leftOut: LeftOut[] };

/**
 * Starts a Workspace Export for the Workspace's Owner: checks who asks and when they signed in, records that it started,
 * and hands back the stream of the file (gzipped), built while it is read and never stored. The caller sends the stream
 * as it is and, if it throws, ends the response with an error rather than a short file. When the stream ends, or is cut,
 * the Audit Log records how many bytes and values it held and whether it was complete. `now` is for tests.
 */
export async function exportWorkspace(actor: Actor, options: { now?: Date; gzip?: boolean; sessionStartedAt?: Date | null } = {}): Promise<WorkspaceExportDownload> {
  await assertOwner(actor);
  const now = options.now ?? new Date();
  const recent = (at: Date | null | undefined) => Boolean(at) && now.getTime() - at!.getTime() <= SIGN_IN_WINDOW_MS;
  // The account's last sign-in, and, when the caller knows it, the start of this very session: a session that was
  // signed in long ago does not become fresh because the Owner signed in on another device a moment ago.
  if (!recent(await lastSignIn(actor.personId)) || (options.sessionStartedAt !== undefined && !recent(options.sessionStartedAt))) throw new SignInTooOld();
  // The start is recorded before the limit is counted, so requests that arrive together count each other.
  await auditOrRefuse(actor, { kind: "export.workspace", object: { type: "workspace", id: actor.workspaceId }, details: { format: WORKSPACE_EXPORT_FORMAT, gzip: options.gzip !== false } });
  const { count } = await db().from("audit_events").select("id", { count: "exact", head: true }).eq("workspace_id", actor.workspaceId).eq("kind", "export.workspace").gte("at", new Date(now.getTime() - 3_600_000).toISOString());
  if ((count ?? 0) > WORKSPACE_EXPORTS_PER_HOUR) throw new WorkspaceExportLimit();
  const p = await plan(actor);
  const gzip = options.gzip !== false;
  const tally = { values: 0, leftOut: 0 };
  let bytes = 0;
  let complete = false;
  async function* counted() {
    try {
      for await (const chunk of writeWorkspaceExport(recordsOf(actor, p, tally), { gzip })) {
        bytes += chunk.byteLength;
        yield chunk;
      }
      complete = true;
    } finally {
      // However it ended: finished, failed or cut off by the person closing the download.
      await audit(actor, { kind: "export.workspace_finished", object: { type: "workspace", id: actor.workspaceId }, details: { complete, bytes, values: tally.values, numbers_left_out: tally.leftOut, left_out: p.leftOut.length } }).catch(() => {});
    }
  }
  return { filename: `ziffr-workspace-${new Date().toISOString().slice(0, 10)}.jsonl${gzip ? ".gz" : ""}`, stream: counted(), leftOut: p.leftOut };
}

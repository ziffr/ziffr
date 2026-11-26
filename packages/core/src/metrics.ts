// Creating Metrics and uploading their Target Series and Projections (GLOSSARY: Metric, Token, Target Series,
// Projection). Every function takes the Actor first and works only inside the actor's Workspace.
import { closeForSystem } from "./system-closes";
import { randomBytes } from "node:crypto";
import { db } from "./db";
import { openNames, openOne, openRows, reserveIds, sealRow, sealedPatch } from "./sealed-columns";
import { CONNECTORS } from "./connectors/index";
import type { FirstAsk } from "./asked-message";
import { assertCan, Forbidden, Refused, type Actor } from "./actor";
import { parseSeriesLine } from "./series-lines";
import { assertSeesMetrics } from "./sharing";
import type { Aggregation, Format, MetricDescription, Period, Polarity, SourceId, SubmissionRule } from "./types";
import { recordVersion } from "./versions";
import { tagMetricFromEntry } from "./pack-tags";
import { deliverPrompt, type PromptOutcome } from "./deliveries";
import { audit } from "./audit-log";
import { formulaInputs } from "./formula";
import { widgetMetricIds } from "./widget-metrics";
import { allDeckMetricIds } from "./visibility";
import { allRows, getMetrics } from "./workspace-data";
import { keepForSnapshots, readersNow } from "./deleted-metrics";
import { getShares } from "./access";
import { feedIdsAmong } from "./feed-people";
import { periodStart } from "./periods";
import { yearStartFor } from "./fiscal-year";
import { moneyUnit, UNIT_POSITIONS } from "./units";
import { workspaceProfile } from "./workspace-settings";
import { isAttainmentMethod } from "./attainment-method";
import { limitReachedFrom, syncDefaultLimit } from "./workspace-limits";
import { trialLimitMessage } from "./trials";
import { assertKeepsTotals } from "./total-parts";
import { announceDefaultRetention, assertRetentionFits, defaultRetentionFor } from "./retention-setting";
import { chargeNewRows } from "./demo-creation";
import { DemoTextRefused, inDemoVisit, visitorOptionalText, visitorText } from "./demo-visitor-words";
import { visitorMembersOnly, visitorNumber, visitorSeries, visitorSlug } from "./demo-visitor-metrics";
import { DEMO_METRIC_WORDS } from "./demo-words";
import { calculationNoteFrom } from "./calculation-note";

const FORMATS: Format[] = ["number", "currency", "percent"];
const PERIODS: Period[] = ["day", "week", "month", "quarter", "year"];
const RULES: SubmissionRule[] = ["reject", "overwrite", "add", "keep_both"];
const POLARITIES: Polarity[] = ["higher", "lower", "target"];
const AGGREGATIONS = ["sum", "average", "last", "none"];
const SOURCES: SourceId[] = ["slack", "mail", "web_form", "api", "telegram"];
const ALL_SOURCES: string[] = SOURCES;

/** A new Metric as described in the form, before it is checked. */
export type MetricInput = {
  name: string; description?: string; calculationNote?: string | null; unit?: string; unitPosition?: string; format?: string; decimals?: number; period?: string; submissionRule?: string;
  polarity?: string; aggregation?: string; targetMin?: number | null; targetMax?: number | null; sources?: string[]; submitters?: string[];
  fromCatalogId?: number | null;
  /** "ratio" or "distance" for an Attainment method of its own; anything else follows the Workspace. */
  attainmentMethod?: string | null;
  /** The Workflow its values take; must be one of the workspace's. */
  workflowId?: number | null;
  /** The Metric this one duplicates; the actor must see it. */
  duplicateOf?: number | null;
};

/** What creating a Metric sets off: its first version, and a first Prompt to each submitter. */
export type MetricEffects = {
  /** Records the first version of the Metric's description. */
  recordCreated: (metricId: number, by: string, message: string) => Promise<void>;
  /** Sends a submitter their first Prompt. */
  promptSubmitter: (metricId: number, submitterId: string, by: string) => Promise<void | false | PromptOutcome>;
};

const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);
// An Attainment method of the Metric's own, or null to follow the Workspace: nothing else is stored.
const methodOrNull = (v: unknown) => (isAttainmentMethod(v) ? v : null);
const numOrNull = (v: unknown) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Refuses anyone who is neither a member nor a Contact of the actor's workspace (submitters and stand-ins). */
export async function assertSubmittersIn(actor: Actor, personIds: string[]) {
  const ids = [...new Set(personIds.map(String))];
  if (!ids.length) return;
  const [{ data: m }, { data: c }] = await Promise.all([
    db().from("memberships").select("user_id").eq("workspace_id", actor.workspaceId).in("user_id", ids),
    db().from("contacts").select("person_id").eq("workspace_id", actor.workspaceId).in("person_id", ids),
  ]);
  const known = new Set([...(m ?? []).map((x) => x.user_id as string), ...(c ?? []).map((x) => x.person_id as string)]);
  if (!ids.every((id) => known.has(id))) throw new Forbidden("Submitters must be members or Contacts of this workspace.");
}

/** Thrown when an Access Key created as many Metrics as it may in 24 hours (the database keeps the count). */
export class TooManyMetrics extends Error {
  constructor() {
    super("This key created as many Metrics as it may in 24 hours.");
    this.name = "TooManyMetrics";
  }
}

/** Creates a Metric owned by the actor, with a random Token and a first Prompt for each submitter. Guests create
 * nothing; every field is checked against what Ziffr knows, never passed through. `accessKeyId` names the key a
 * program created it with (spec 0003); the database then holds the key to its daily limit. */
export async function createMetric(actor: Actor, input: MetricInput, effects: MetricEffects = metricEffects, origin: { accessKeyId?: number } = {}): Promise<{ id: number; slug: string; submitters: number; asked: FirstAsk[]; tagsLeftOut: string[] }> {
  assertCan(actor, "create");
  // A visitor of the demo (spec 0051, ticket 11): every text passes the text rules, the people asked are the demo's made-up Members, no
  // Workflow takes the Metric (the showcase Workflow's period stays as it is), and a target is a reasonable number. Nothing outside a visit.
  const name = visitorText(actor, String(input.name ?? ""), "name").trim().slice(0, 120);
  if (!name) throw new Error("Give the Metric a name.");
  const submitters = [...new Set((input.submitters ?? []).map(String))];
  await visitorMembersOnly(actor, submitters);
  visitorNumber(actor, numOrNull(input.targetMin));
  visitorNumber(actor, numOrNull(input.targetMax));
  const description = String(visitorOptionalText(actor, String(input.description ?? ""), "description"));
  const note = calculationNoteFrom(visitorOptionalText(actor, String(input.calculationNote ?? ""), "description"));
  const unitText = input.unit === undefined ? undefined : String(visitorOptionalText(actor, String(input.unit ?? ""), "name"));
  if (inDemoVisit(actor) && numOrNull(input.workflowId) !== null) throw new DemoTextRefused(DEMO_METRIC_WORDS.workflow);
  await assertSubmittersIn(actor, submitters);
  const workflowId = numOrNull(input.workflowId);
  if (workflowId !== null && !(await db().from("workflows").select("id").eq("id", workflowId).eq("workspace_id", actor.workspaceId).maybeSingle()).data) throw new Forbidden();
  // A duplicate names its original in the first Version, so only someone who sees the original may claim it.
  const duplicateOf = numOrNull(input.duplicateOf);
  const original = duplicateOf === null ? null : await duplicable(actor, duplicateOf);
  // A catalog entry is named only when this Workspace has it: one every Workspace has, or its own from a Pack.
  const catalogId = original ? null : numOrNull(input.fromCatalogId);
  const fromCatalog = catalogId === null ? null : (await db().from("catalog_metrics").select("id, workspace_id, tags").eq("id", catalogId).maybeSingle()).data;
  const fromCatalogId = fromCatalog && (fromCatalog.workspace_id === null || fromCatalog.workspace_id === actor.workspaceId) ? catalogId : null;
  let slug = slugify(name) || "metric";
  if (inDemoVisit(actor)) slug = visitorSlug(slug, randomBytes(3).toString("hex"));
  const { data: clash } = await db().from("metrics").select("id").eq("slug", slug).eq("workspace_id", actor.workspaceId);
  if (clash?.length) slug = `${slug}-${Date.now().toString(36)}`;
  const format = pick(input.format, FORMATS, "number");
  // A unit left out (a program may) is the one the form proposes: the workspace's currency for money, % for a percent.
  const unit = unitText !== undefined ? { unit: unitText.slice(0, 20), unit_position: pick(input.unitPosition, UNIT_POSITIONS, "after") }
    : format === "currency" ? moneyUnit((await workspaceProfile(actor)).currency)
    : { unit: format === "percent" ? "%" : "", unit_position: pick(input.unitPosition, UNIT_POSITIONS, "after") };
  // The trigger checks the Workspace Limit against the Installation's default in effect.
  await syncDefaultLimit();
  const period = pick(input.period, PERIODS, "month");
  const aggregation = pick(input.aggregation, AGGREGATIONS, "sum") as Aggregation;
  // The Workspace's default Retention is copied in, waiting its 7 days like any confirmed one (spec 0033).
  const retentionPending = await defaultRetentionFor(actor.workspaceId, actor.personId, { period, aggregation });
  // The description is sealed for its row, so the row's id is taken first (spec 0028).
  const [metricId] = await reserveIds("metrics", 1);
  // The name and the Target Range are sealed with it, for the same row (ticket #248).
  const words = await sealRow("metrics", actor.workspaceId, { id: metricId, name, description: description.slice(0, 2000), calculation_note: note, target_min: numOrNull(input.targetMin), target_max: numOrNull(input.targetMax) });
  const { data: metric, error } = await db().from("metrics").insert({
    id: metricId, slug, name: words.name, workspace_id: actor.workspaceId, owner_id: actor.personId, retention_pending: retentionPending,
    description: words.description,
    calculation_note: words.calculation_note,
    ...unit,
    format,
    decimals: Math.min(6, Math.max(0, Math.round(Number(input.decimals) || 0))),
    period,
    submission_rule: pick(input.submissionRule, RULES, "overwrite"),
    polarity: pick(input.polarity, POLARITIES, "higher"),
    aggregation,
    target_min: words.target_min, target_max: words.target_max, target_min_sealed: words.target_min_sealed, target_max_sealed: words.target_max_sealed,
    attainment_method: methodOrNull(input.attainmentMethod),
    // Left out, every Source, as the new-Metric form offers: a Metric no way is open for would never be asked or answered.
    sources: [...new Set((input.sources ?? ALL_SOURCES).filter((s): s is SourceId => SOURCES.includes(s as SourceId)))],
    from_catalog_id: fromCatalogId,
    workflow_id: workflowId,
    access_key_id: Number.isInteger(origin.accessKeyId) ? origin.accessKeyId : null,
  }).select("id, slug, from_catalog_id").single();
  if (error?.code === "ZF429") throw new TooManyMetrics();
  if (error?.code === "ZF430") throw new Error(trialLimitMessage("ZF430")!);
  const reached = await limitReachedFrom(error, actor.workspaceId);
  if (reached) throw reached;
  if (error || !metric) throw new Error("The Metric could not be created.");
  if (retentionPending) await announceDefaultRetention(actor, { id: metric.id, slug: metric.slug, name, owner_id: actor.personId }, retentionPending);
  await effects.recordCreated(metric.id, actor.personId, original ? `Duplicated from “${original.name}”` : metric.from_catalog_id ? "Created from the Metric Catalog" : "Created");
  await audit(actor, { kind: "metric.created", object: { type: "metric", id: metric.id, name }, accessKeyId: Number.isInteger(origin.accessKeyId) ? origin.accessKeyId : null, details: { submitters: submitters.length, from_catalog: Boolean(metric.from_catalog_id), duplicated: Boolean(original) } });
  const outcomes: ({ personId: string } & PromptOutcome)[] = [];
  if (submitters.length) {
    // A Token code opens the submission form without signing in: random, never derived from names.
    await db().from("tokens").insert(submitters.map((s) => ({ code: `tk-${randomBytes(18).toString("base64url")}`, metric_id: metric.id, submitter_id: s })));
    // Every submitter gets a first Prompt, so the loop can continue right away.
    for (const s of submitters) {
      const r = await effects.promptSubmitter(metric.id, s, actor.personId);
      if (r) outcomes.push({ personId: s, ...r });
    }
  }
  // Who was really asked, by which way and with what result: only these people, whom the creator just named.
  const people = outcomes.length ? await openNames(actor.workspaceId, (await db().from("profiles").select("id, name").in("id", outcomes.map((o) => o.personId))).data) : [];
  const asked = outcomes.map((o) => ({ personId: o.personId, name: String(people.find((p) => p.id === o.personId)?.name ?? "Someone"), connector: o.connector, label: CONNECTORS[o.connector].label, state: o.state }));
  // A Metric made from a Pack's entry gets the entry's Tags; a limit leaves words out and says which (spec 0038).
  const tagsLeftOut = fromCatalog && fromCatalogId !== null ? await tagMetricFromEntry(actor, metric.id, fromCatalog.tags) : [];
  return { id: metric.id, slug: metric.slug, submitters: submitters.length, asked, tagsLeftOut };
}

/** What a duplicate of a Metric starts from (GLOSSARY: Metric Description): its description, Workflow and Submitters. */
export type MetricDraft = MetricDescription & { original: string; workflow: { id: number; name: string } | null; submitters: string[]; duplicateOf: number };

/** The Metric to duplicate, if the actor may: someone who creates (not a Guest) and sees it. A Derived Metric's
 * formula cannot be copied into a plain Metric, so it is refused. */
async function duplicable(actor: Actor, metricId: number) {
  assertCan(actor, "create");
  const m = await openOne("metrics", actor.workspaceId, (await db().from("metrics").select("*").eq("id", metricId).eq("workspace_id", actor.workspaceId).maybeSingle()).data);
  if (!m) throw new Forbidden();
  await assertSeesMetrics(actor, [m.id]);
  if (m.formula) throw new Forbidden("A Derived Metric cannot be duplicated.");
  return m;
}

/** A Metric's description, Workflow and Submitters, prefilled for a duplicate the actor reviews before saving.
 * Never its values, Shares, Target Series, Projections or history: those stay with the original. */
export async function metricDraftFrom(actor: Actor, metricId: number): Promise<MetricDraft> {
  const m = await duplicable(actor, metricId);
  // Only the regular Submitters: a stand-in's Token covers one absence, not the Metric.
  const [{ data: tokens }, { data: workflow }] = await Promise.all([
    db().from("tokens").select("submitter_id").eq("metric_id", m.id).is("stands_in_for", null),
    m.workflow_id ? db().from("workflows").select("id, name").eq("id", m.workflow_id).eq("workspace_id", actor.workspaceId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  // A Feed is not copied as a Submitter: it is the workspace's, chosen per Metric by its owner (spec 0012).
  const feeds = await feedIdsAmong((tokens ?? []).map((t) => t.submitter_id as string));
  return {
    original: m.name,
    name: `${m.name} (copy)`.slice(0, 120), description: m.description, calculation_note: m.calculation_note ?? null, unit: m.unit, unit_position: m.unit_position, format: m.format, decimals: m.decimals, period: m.period,
    submission_rule: m.submission_rule, polarity: m.polarity, aggregation: m.aggregation,
    target_min: m.target_min === null ? null : Number(m.target_min), target_max: m.target_max === null ? null : Number(m.target_max),
    attainment_method: methodOrNull(m.attainment_method),
    sources: m.sources, workflow: workflow ? { id: workflow.id as number, name: workflow.name as string } : null, submitters: [...new Set((tokens ?? []).map((t) => t.submitter_id as string))].filter((s) => !feeds.has(s)), duplicateOf: m.id,
  };
}

/** The core's own effects of a new Metric. */
export const metricEffects: MetricEffects = {
  /** Records the description as the first version. */
  recordCreated: async (metricId, by, message) => { await recordVersion("metric", metricId, by, { message }); },
  /** Sends the first Prompt. */
  promptSubmitter: (metricId, submitterId, by) => deliverPrompt({ metricId, submitterId, senderId: by }),
};

/** Reading series lines is pure and lives in series-lines, so the browser can preview with the same rules. */
export { parseSeriesLine };

/** Why a Metric is not deleted: its name was not repeated, or something still uses it. Its message is for people. */
export class MetricKept extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MetricKept";
  }
}

/** Deletes a Metric with its values, Tokens, Prompts, Actions, targets and Locks, for its owner only. The owner types
 * its name to confirm. Refused while anything else uses it (a Derived Metric's formula, a widget, a deck, a View Link
 * that still works), so nothing people built breaks or silently shows less; in the demo too, which every visitor shares.
 * Past Snapshots keep their copy for who sees the Metric now (spec 0065); `origin.keptFor` names them instead when the
 * core saw them before it took the Metric off dashboards (metric-delete.ts), and never comes from a browser or a program.
 * The Audit Log keeps who deleted it and its name. Returns how many values went with it. */
export async function deleteMetric(actor: Actor, metricId: number, confirmName: string, origin: { accessKeyId?: number; keptFor?: readonly string[] } = {}): Promise<{ values: number }> {
  if (actor.key || !Number.isInteger(metricId)) throw new Forbidden();
  const ws = actor.workspaceId;
  const m = await openOne("metrics", ws, (await db().from("metrics").select("id, slug, name, owner_id, total_opened_at").eq("id", metricId).eq("workspace_id", ws).maybeSingle()).data);
  if (!m || m.owner_id !== actor.personId) throw new Forbidden("Only the Metric's owner deletes it.");
  if (String(confirmName ?? "").trim() !== m.name) throw new MetricKept("Type the Metric's name to delete it.");
  const today = new Date().toISOString().slice(0, 10);
  const [{ data: derived }, { data: widgets }, { data: decks }, { data: links }] = await Promise.all([
    db().from("metrics").select("id, name, formula").eq("workspace_id", ws).not("formula", "is", null),
    db().from("widgets").select("metric_ids, settings").eq("workspace_id", ws),
    db().from("decks").select("document").eq("workspace_id", ws),
    db().from("view_links").select("metric_ids").eq("workspace_id", ws).is("revoked_at", null).gte("expires_at", today),
  ]);
  // Names of what blocks it only where the owner may see them: Derived Metrics are named, other things only counted.
  const usedBy = (await openRows("metrics", ws, derived)).filter((d) => formulaInputs(String(d.formula)).includes(m.slug)).map((d) => d.name as string);
  if (usedBy.length) throw new MetricKept(`Other Metrics are computed from it (${usedBy.length}). Change their formulas first.`);
  // A Total keeps the Metrics it adds up, past ones too: deleting one would change what past totals were.
  const { count: addedUp, error: unread } = await db().from("total_parts").select("total_id", { count: "exact", head: true }).eq("workspace_id", ws).eq("part_id", m.id);
  if (unread) throw new Error("The Metric could not be deleted. Try again in a moment.");
  if (addedUp) throw new MetricKept(`Totals add it up (${addedUp}). Remove it from them first.`);
  const inWidgets = (widgets ?? []).filter((w) => widgetMetricIds(w.metric_ids ?? [], w.settings).includes(metricId)).length;
  const inDecks = (decks ?? []).filter((d) => allDeckMetricIds(d.document).includes(metricId)).length;
  if (inWidgets || inDecks) throw new MetricKept(`It is shown in ${inWidgets} widget${inWidgets === 1 ? "" : "s"} and ${inDecks} deck${inDecks === 1 ? "" : "s"}. Take it out of them first.`);
  if ((links ?? []).some((l) => (l.metric_ids ?? []).map(Number).includes(metricId))) throw new MetricKept("A View Link that still works shows it. Revoke the link first.");
  const { count } = await db().from("observations").select("id", { count: "exact", head: true }).eq("workspace_id", ws).eq("metric_id", metricId);
  const readers = origin.keptFor ?? (await readersNow(ws, await getMetrics(ws), [metricId])).get(metricId) ?? [];
  await keepForSnapshots(ws, { id: metricId, totalOpen: Boolean(m.total_opened_at) }, readers);
  // Its open Actions are closed first, with their events sent now: the send rows would go with the Metric.
  await closeForSystem(ws, { metricId, statuses: ["open", "answered"] }, "metric_deleted", { beforeDelete: true });
  // The intake log keeps what arrived, without the Metric it was for.
  await db().from("intake_log").update({ metric_id: null }).eq("workspace_id", ws).eq("metric_id", metricId);
  await db().from("shares").delete().eq("workspace_id", ws).eq("object_type", "metric").eq("object_id", metricId);
  await db().from("access_requests").delete().eq("workspace_id", ws).eq("object_type", "metric").eq("object_id", metricId);
  await removeValuesAndHistory(ws, metricId);
  const { data: gone, error } = await db().from("metrics").delete().eq("id", metricId).eq("workspace_id", ws).select("id");
  if (error || !gone?.length) throw new Error("The Metric could not be deleted.");
  await audit(actor, { kind: "metric.deleted", object: { type: "metric", id: metricId, name: m.name }, accessKeyId: Number.isInteger(origin.accessKeyId) ? origin.accessKeyId : null, details: { values: count ?? 0 } });
  return { values: count ?? 0 };
}

/** Removes a Metric's values, Breakdowns and their history, while the Metric still exists. Deleting the Metric first
 * would cascade to them, and the history triggers, which find a row's workspace through its Metric, would then file
 * that history under the default workspace (the demo). Here every row is removed explicitly, in its own workspace. */
async function removeValuesAndHistory(ws: string, metricId: number): Promise<void> {
  const live = await allRows<{ id: number }>((from, to) => db().from("observations").select("id").eq("workspace_id", ws).eq("metric_id", metricId).order("id").range(from, to));
  const replaced = await allRows<{ observation_id: number }>((from, to) => db().from("observation_history").select("observation_id").eq("workspace_id", ws).eq("metric_id", metricId).order("observation_id").range(from, to));
  const ids = [...new Set([...live.map((o) => o.id), ...replaced.map((o) => o.observation_id)])];
  const must = (r: { error: unknown }) => { if (r.error) throw new Error("The Metric could not be deleted."); };
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    // Breakdown rows first (their history is written with their value's workspace), then that history.
    must(await db().from("breakdown_rows").delete().eq("workspace_id", ws).in("observation_id", chunk));
    must(await db().from("breakdown_history").delete().eq("workspace_id", ws).in("observation_id", chunk));
  }
  must(await db().from("observations").delete().eq("workspace_id", ws).eq("metric_id", metricId));
  must(await db().from("observation_history").delete().eq("workspace_id", ws).eq("metric_id", metricId));
}

/** The Metric owner saves Target Series or Projection rows edited in a table, as period start and value. Rows with a
 * period or value that cannot be read are refused as a whole, since the table checked them already. */
export async function saveSeriesRows(actor: Actor, metricId: number, kind: "target" | "projection", rows: unknown, note: string) {
  const m = await seriesOwnerMetric(actor, metricId, kind);
  // A visitor of the demo saves at most 60 rows, within two years of today, of reasonable numbers; the note is words (spec 0051, ticket 11).
  visitorSeries(actor, rows);
  note = String(visitorOptionalText(actor, String(note ?? ""), "name"));
  // Rows come from a browser: check the shape, the size and every value before anything is written.
  if (!Array.isArray(rows) || rows.length > 2000) throw new Error("Send at most 2,000 rows.");
  const ys = await yearStartFor(actor.workspaceId, m.period as Period);
  const read = rows.map((r) => {
    const period = typeof r?.period === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.period) ? r.period : null;
    const value = typeof r?.value === "number" && Number.isFinite(r.value) ? r.value : null;
    if (!period || value === null || Number.isNaN(new Date(`${period}T00:00:00`).getTime())) throw new Error("Every row needs a period and a number.");
    // A day inside the period counts as that period, as in pasted lines.
    return { period: periodStart(new Date(`${period}T00:00:00`), m.period as Period, ys), value };
  });
  // In a demo visit only the NEW periods use the visitor's share of rows (final review): a period that already has a value costs nothing.
  // `read` is at most 60 rows here (`visitorSeries`), so this is one count, never a long loop.
  if (inDemoVisit(actor)) {
    const days = [...new Set(read.map((r) => r.period))];
    const { data: have, error } = await db().from("series_values").select("period_start").eq("metric_id", metricId).eq("kind", kind).in("period_start", days);
    if (error) throw new Error("The series could not be saved.");
    const set = new Set((have ?? []).map((h) => String(h.period_start)));
    await chargeNewRows(actor, "series_rows", days.filter((d) => !set.has(d)).length);
  }
  return { saved: await upsertSeries(actor.workspaceId, metricId, kind, read, note) };
}

/** The Metric owner removes Target Series or Projection values for some periods (period starts). Returns how many
 * were removed; a period without a value is left alone. */
export async function removeSeriesRows(actor: Actor, metricId: number, kind: "target" | "projection", periods: unknown) {
  await seriesOwnerMetric(actor, metricId, kind);
  visitorSeries(actor, periods);
  // Periods come from a browser: only real days, at most 2,000; never a filter built from a string.
  if (!Array.isArray(periods) || periods.length > 2000) throw new Error("Send at most 2,000 periods.");
  const days = periods.map((p) => (typeof p === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p) && !Number.isNaN(Date.parse(`${p}T00:00:00Z`)) ? p : null));
  if (days.some((d) => d === null)) throw new Error("Every period must be a day.");
  if (!days.length) return { removed: 0 };
  const { data, error } = await db().from("series_values").delete().eq("metric_id", metricId).eq("kind", kind).in("period_start", days as string[]).select("id");
  if (error) throw new Error("The series could not be changed.");
  return { removed: data?.length ?? 0 };
}

/** The metric, when the actor owns it in their workspace; only its owner sets targets and projections. */
async function seriesOwnerMetric(actor: Actor, metricId: number, kind: string) {
  if (kind !== "target" && kind !== "projection") throw new Forbidden("Unknown series.");
  const m = await editableMetric(actor, metricId, "targets and projections");
  if (kind === "target" && m.total_targets === "parts") throw new Refused("Its target is the targets of the Metrics it adds up. Choose its own target first.");
  return m;
}

/** The Metric when the actor may change it (its targets, description and Sources): its owner, or a member it is
 * shared with as Editor, directly or through a Group. Never a Guest or a key. Deleting and sharing stay the owner's. */
export async function editableMetric(actor: Actor, metricId: number, what = "it") {
  if (actor.key || !Number.isInteger(metricId)) throw new Forbidden();
  const m = await openOne("metrics", actor.workspaceId, (await db().from("metrics").select("*").eq("id", metricId).eq("workspace_id", actor.workspaceId).maybeSingle()).data);
  if (!m) throw new Forbidden();
  if (m.owner_id === actor.personId) return m;
  const editor = actor.role !== "guest" && (await getShares(actor.workspaceId)).some((s) =>
    s.workspace_id === actor.workspaceId && s.object_type === "metric" && s.object_id === metricId && s.user_id === actor.personId && s.role === "editor");
  if (!editor) throw new Forbidden(`Only the Metric's owner and its Editors change ${what}.`);
  return m;
}

/** Writes rows, one value per period: a later row for the same period wins. Returns how many periods were saved. */
async function upsertSeries(ws: string, metricId: number, kind: "target" | "projection", rows: { period: string; value: number }[], note: string) {
  const ok = [...new Map(rows.map((r) => [r.period, r])).values()];
  if (ok.length) {
    const { error } = await db().rpc("set_series_values", { p_metric: metricId, p_kind: kind, p_saves: await sealedSeriesSaves(ws, metricId, kind, ok), p_removes: [], p_note: String(note ?? "").slice(0, 120) });
    if (error) throw new Error("The series could not be saved.");
  }
  return ok.length;
}

/** Series points as set_series_values takes them: each value sealed with the Workspace Key for its place (Metric, kind
 * and period), or plain where the Workspace does not seal. */
export async function sealedSeriesSaves(ws: string, metricId: number, kind: "target" | "projection", points: { period: string; value: number }[]): Promise<{ period: string; value: number | null; sealed: string | null }[]> {
  return Promise.all(points.map(async (p) => {
    const row = await sealRow("series_values", ws, { metric_id: metricId, kind, period_start: p.period, value: p.value });
    return { period: p.period, value: (row.value as number | null) ?? null, sealed: (row.value_sealed as string | null) ?? null };
  }));
}

/** Most Submitters one change adds or removes: each one added gets a first Prompt, so a change never floods people. */
export const SUBMITTERS_PER_CHANGE = 20;

/** Person ids as a browser or a program sends them: strings, each once, at most SUBMITTERS_PER_CHANGE. */
function submitterIds(ids: unknown): string[] {
  if (!Array.isArray(ids) || ids.length > SUBMITTERS_PER_CHANGE || !ids.every((x) => typeof x === "string" && x.length > 0 && x.length <= 64)) {
    throw new Error(`Name 1 to ${SUBMITTERS_PER_CHANGE} people.`);
  }
  return [...new Set(ids as string[])];
}

/** Makes people Submitters of a Metric, for its owner and its Editors (GLOSSARY: Submitter): Members, Guests or
 * Contacts of the workspace, each with a Token and a first Prompt, as when a Metric is created with them. Someone who
 * already submits is left alone. Feeds are added with addFeedToMetric. Returns who was added. */
export async function addSubmitters(actor: Actor, metricId: number, personIds: unknown, effects: MetricEffects = metricEffects): Promise<string[]> {
  const m = await editableMetric(actor, metricId, "who submits");
  if (m.formula) throw new Error("A Derived Metric is computed; it takes no values.");
  const ids = submitterIds(personIds);
  await assertSubmittersIn(actor, ids);
  const { data: has } = await db().from("tokens").select("submitter_id").eq("metric_id", m.id).eq("workspace_id", actor.workspaceId).in("submitter_id", ids).is("stands_in_for", null);
  const already = new Set((has ?? []).map((t) => t.submitter_id as string));
  const added = ids.filter((id) => !already.has(id));
  if (!added.length) return [];
  // A Token code opens the submission form without signing in: random, never derived from names.
  const { error } = await db().from("tokens").insert(added.map((s) => ({ code: `tk-${randomBytes(18).toString("base64url")}`, metric_id: m.id, submitter_id: s })));
  if (error) throw new Error("The Submitters could not be added.");
  for (const s of added) await effects.promptSubmitter(m.id, s, actor.personId);
  await recordVersion("metric", m.id, actor.personId, { message: added.length === 1 ? "Added a Submitter" : `Added ${added.length} Submitters` });
  return added;
}

/** Stops people submitting to a Metric, for its owner and its Editors: their Tokens go, and those of anyone standing
 * in for them on it. Their earlier values stay. Returns who was removed. */
export async function removeSubmitters(actor: Actor, metricId: number, personIds: unknown): Promise<string[]> {
  const m = await editableMetric(actor, metricId, "who submits");
  const ids = submitterIds(personIds);
  const { data: gone } = await db().from("tokens").delete().eq("metric_id", m.id).eq("workspace_id", actor.workspaceId).in("submitter_id", ids).is("stands_in_for", null).select("submitter_id");
  await db().from("tokens").delete().eq("metric_id", m.id).eq("workspace_id", actor.workspaceId).in("stands_in_for", ids);
  const removed = [...new Set((gone ?? []).map((t) => t.submitter_id as string))];
  if (removed.length) await recordVersion("metric", m.id, actor.personId, { message: removed.length === 1 ? "Removed a Submitter" : `Removed ${removed.length} Submitters` });
  return removed;
}

/** The ways values of a Metric may arrive (its Sources), for its owner and its Editors: any of web form, email, Slack and the API (programs and Feeds), at least
 * one. A Derived Metric has none (it is computed). Values arriving another way are refused from then on. */
export async function setMetricSources(actor: Actor, metricId: number, sources: unknown): Promise<SourceId[]> {
  const m = await editableMetric(actor, metricId, "how its values arrive");
  if (m.formula) throw new Error("A Derived Metric is computed; values do not arrive for it.");
  // From a browser: only known Sources count, each once.
  const chosen = Array.isArray(sources) ? [...new Set(sources.filter((s): s is SourceId => SOURCES.includes(s as SourceId)))] : [];
  if (!chosen.length) throw new Error("Pick at least one way for values to arrive.");
  const { error } = await db().from("metrics").update({ sources: chosen }).eq("id", metricId).eq("workspace_id", actor.workspaceId);
  if (error) throw new Error("The change could not be saved.");
  await recordVersion("metric", metricId, actor.personId, { message: "Changed how values arrive" });
  return chosen;
}

/** The parts of a Metric's description its owner may change later. Each one left out stays as it is. */
export type MetricDetails = {
  name?: string; description?: string;
  /** How it is calculated (GLOSSARY: Calculation Note); empty or null takes it away. */
  calculationNote?: string | null; unit?: string; unitPosition?: string; format?: string; decimals?: number; period?: string; submissionRule?: string;
  polarity?: string; aggregation?: string; targetMin?: number | null; targetMax?: number | null;
  /** "ratio" or "distance" for an Attainment method of its own; null (or anything else) follows the Workspace. */
  attainmentMethod?: string | null;
};

/** Changes a Metric's description, for its owner and its Editors: name, description, Calculation Note, unit and its side, format, decimals, Polarity, Submission
 * Rule, Aggregation, the target range, the Attainment method, and the period while it has no values yet (later its values would sit in the
 * wrong periods). The slug stays, so links and programs keep finding it. Each change is a Version. */
export async function updateMetricDetails(actor: Actor, metricId: number, patch: MetricDetails): Promise<void> {
  const ws = actor.workspaceId;
  const m = await editableMetric(actor, metricId, "its description");
  const p = (patch && typeof patch === "object" ? patch : {}) as MetricDetails;
  const update: Record<string, unknown> = {};
  // A visitor of the demo (spec 0051, ticket 11): a word that is changed passes the text rules (one sent back as it was stays as it
  // is, since the form sends them all), and a target is a reasonable number. The database holds the seed's words as well.
  const changedWord = (next: unknown, now: unknown, kind: "name" | "description") => (String(next ?? "") === String(now ?? "") ? String(next ?? "") : String(visitorOptionalText(actor, String(next ?? ""), kind)));
  visitorNumber(actor, numOrNull(p.targetMin));
  visitorNumber(actor, numOrNull(p.targetMax));
  if (p.name !== undefined) {
    const name = changedWord(p.name, m.name, "name").trim().slice(0, 120);
    if (!name) throw new Error("Give the Metric a name.");
    update.name = name;
  }
  if (p.description !== undefined) update.description = changedWord(p.description, m.description, "description").slice(0, 2000);
  if (p.calculationNote !== undefined) {
    // Written only when it changes, so the history says "how it is calculated" exactly when the definition changed.
    const now = calculationNoteFrom(m.calculation_note);
    const sent = calculationNoteFrom(p.calculationNote);
    if (sent !== now) update.calculation_note = calculationNoteFrom(visitorOptionalText(actor, sent ?? "", "description"));
  }
  if (p.unit !== undefined) update.unit = changedWord(p.unit, m.unit, "name").slice(0, 20);
  if (p.unitPosition !== undefined) update.unit_position = pick(p.unitPosition, UNIT_POSITIONS, m.unit_position);
  if (p.format !== undefined) update.format = pick(p.format, FORMATS, m.format);
  if (p.decimals !== undefined) update.decimals = Math.min(6, Math.max(0, Math.round(Number(p.decimals) || 0)));
  if (p.submissionRule !== undefined) update.submission_rule = pick(p.submissionRule, RULES, m.submission_rule);
  if (p.polarity !== undefined) update.polarity = pick(p.polarity, POLARITIES, m.polarity);
  if (p.aggregation !== undefined) update.aggregation = pick(p.aggregation, AGGREGATIONS, m.aggregation);
  if (p.targetMin !== undefined) update.target_min = numOrNull(p.targetMin);
  if (p.targetMax !== undefined) update.target_max = numOrNull(p.targetMax);
  if (p.attainmentMethod !== undefined) update.attainment_method = methodOrNull(p.attainmentMethod);
  const lo = (update.target_min ?? m.target_min) as number | null;
  const hi = (update.target_max ?? m.target_max) as number | null;
  if (lo !== null && hi !== null && Number(lo) > Number(hi)) throw new Error("The lower target is above the upper one.");
  if (p.period !== undefined && p.period !== m.period) {
    const period = pick(p.period, PERIODS, m.period);
    const [{ count }, { count: series }] = await Promise.all([
      db().from("observations").select("id", { count: "exact", head: true }).eq("workspace_id", ws).eq("metric_id", metricId),
      // A Target Series or Projection is kept by period too: a month's target would not start a quarter.
      db().from("series_values").select("id", { count: "exact", head: true }).eq("metric_id", metricId),
    ]);
    if (count) throw new Error("The period cannot change once the Metric has values: they would sit in the wrong periods. Duplicate it instead.");
    if (series) throw new Error("The period cannot change while the Metric has targets or projections by period: remove them first.");
    update.period = period;
  }
  if (!Object.keys(update).length) return;
  // A change of period or Aggregation that its Retention could not do is refused (a rate cannot be condensed), checked
  // against the final values, after the period above is settled.
  assertRetentionFits(m, { period: (update.period ?? m.period) as Period, aggregation: (update.aggregation ?? m.aggregation) as Aggregation });
  await assertKeepsTotals(ws, m, update);
  // Name, description, Calculation Note and Target Range are sealed for the row; a Target set to null clears both its columns.
  const { error } = await db().from("metrics").update(await sealedPatch("metrics", ws, metricId, update)).eq("id", metricId).eq("workspace_id", ws);
  if (error) throw new Error("The change could not be saved.");
  await recordVersion("metric", metricId, actor.personId, { message: changeMessage(m, update) });
}

/** What the Version of a change says: whether how the Metric is calculated changed, so a reader of its history sees when
 * the definition changed (spec 0060). */
function changeMessage(before: Record<string, unknown>, update: Record<string, unknown>): string {
  if (!("calculation_note" in update)) return "Changed its description";
  // The edit form sends every field, so only the ones that differ count.
  const other = Object.entries(update).some(([k, v]) => k !== "calculation_note" && String(v ?? "") !== String(before[k] ?? ""));
  return other ? "Changed how it is calculated and its description" : "Changed how it is calculated";
}

/** Whether the actor may change the Metric (see editableMetric), for showing the controls; the core checks again. */
export async function canEditMetric(actor: Actor, metricId: number): Promise<boolean> {
  return editableMetric(actor, metricId).then(() => true, () => false);
}

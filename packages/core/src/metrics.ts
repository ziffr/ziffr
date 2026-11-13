// Creating Metrics and uploading their Target Series and Projections (GLOSSARY: Metric, Token, Target Series,
// Projection). Every function takes the Actor first and works only inside the actor's Workspace.
import { randomBytes } from "node:crypto";
import { db } from "./db";
import { assertCan, Forbidden, type Actor } from "./actor";
import { periodStart } from "./format";
import type { Format, Period, Polarity, SourceId, SubmissionRule } from "./types";

const FORMATS: Format[] = ["number", "currency", "percent"];
const PERIODS: Period[] = ["day", "week", "month"];
const RULES: SubmissionRule[] = ["reject", "overwrite", "add", "keep_both"];
const POLARITIES: Polarity[] = ["higher", "lower", "target"];
const AGGREGATIONS = ["sum", "average", "last", "none"];
const SOURCES: SourceId[] = ["slack", "mail", "web_form"];

/** A new Metric as described in the form, before it is checked. */
export type MetricInput = {
  name: string; description?: string; unit?: string; format?: string; decimals?: number; period?: string; submissionRule?: string;
  polarity?: string; aggregation?: string; targetMin?: number | null; targetMax?: number | null; sources?: string[]; submitters?: string[];
  fromCatalogId?: number | null;
};

/** What creating a Metric sets off outside the core. PROTOTYPE: Versions and Deliveries move into the core later. */
export type MetricEffects = {
  /** Records the first version of the Metric's description. */
  recordCreated: (metricId: number, by: string, message: string) => Promise<void>;
  /** Sends a submitter their first Prompt. */
  promptSubmitter: (metricId: number, submitterId: string, by: string) => Promise<void>;
};

const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);
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

/** Creates a Metric owned by the actor, with a random Token and a first Prompt for each submitter. Guests create
 * nothing; every field is checked against what Ziffr knows, never passed through. */
export async function createMetric(actor: Actor, input: MetricInput, effects: MetricEffects): Promise<{ id: number; slug: string }> {
  assertCan(actor, "create");
  const name = String(input.name ?? "").trim().slice(0, 120);
  if (!name) throw new Error("Give the Metric a name.");
  const submitters = [...new Set((input.submitters ?? []).map(String))];
  await assertSubmittersIn(actor, submitters);
  let slug = slugify(name) || "metric";
  const { data: clash } = await db().from("metrics").select("id").eq("slug", slug).eq("workspace_id", actor.workspaceId);
  if (clash?.length) slug = `${slug}-${Date.now().toString(36)}`;
  const { data: metric, error } = await db().from("metrics").insert({
    slug, name, workspace_id: actor.workspaceId, owner_id: actor.personId,
    description: String(input.description ?? "").slice(0, 2000),
    unit: String(input.unit ?? "").slice(0, 20),
    format: pick(input.format, FORMATS, "number"),
    decimals: Math.min(6, Math.max(0, Math.round(Number(input.decimals) || 0))),
    period: pick(input.period, PERIODS, "month"),
    submission_rule: pick(input.submissionRule, RULES, "overwrite"),
    polarity: pick(input.polarity, POLARITIES, "higher"),
    aggregation: pick(input.aggregation, AGGREGATIONS, "sum"),
    target_min: numOrNull(input.targetMin), target_max: numOrNull(input.targetMax),
    sources: [...new Set((input.sources ?? []).filter((s): s is SourceId => SOURCES.includes(s as SourceId)))],
    from_catalog_id: numOrNull(input.fromCatalogId),
  }).select("id, slug, from_catalog_id").single();
  if (error || !metric) throw new Error("The Metric could not be created.");
  await effects.recordCreated(metric.id, actor.personId, metric.from_catalog_id ? "Created from the Metric Catalog" : "Created");
  if (submitters.length) {
    // A Token code opens the submission form without signing in: random, never derived from names.
    await db().from("tokens").insert(submitters.map((s) => ({ code: `tk-${randomBytes(18).toString("base64url")}`, metric_id: metric.id, submitter_id: s })));
    // Every submitter gets a first Prompt, so the loop can continue right away.
    for (const s of submitters) await effects.promptSubmitter(metric.id, s, actor.personId);
  }
  return { id: metric.id, slug: metric.slug };
}

/** "2026-12 140000", "2026-12-01;140.000", "12/2026 140000" → period start and value. */
export function parseSeriesLine(line: string, period: Period): { period: string; value: number } | null {
  const m = line.trim().match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?[\s;,\t]+(-?[\d.,' ]+)$/) ?? line.trim().match(/^(\d{1,2})\/(\d{4})[\s;,\t]+(-?[\d.,' ]+)$/);
  if (!m) return null;
  const [y, mo, d, raw] = m.length === 5 && m[1].length === 4 ? [Number(m[1]), Number(m[2]), Number(m[3] ?? 1), m[4]] : [Number(m[2]), Number(m[1]), 1, m[3]];
  let num = raw.replace(/[' ]/g, "");
  if (/,\d{1,2}$/.test(num)) num = num.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(num)) num = num.replace(/\./g, "");
  else num = num.replace(/,/g, "");
  const value = Number(num);
  if (!Number.isFinite(value) || mo < 1 || mo > 12) return null;
  return { period: periodStart(new Date(y, mo - 1, d), period), value };
}

/** The Metric owner uploads a Target Series or Projection, one "period value" line each; lines that cannot be read
 * are skipped and counted. */
export async function uploadSeries(actor: Actor, metricId: number, kind: "target" | "projection", text: string, note: string) {
  if (kind !== "target" && kind !== "projection") throw new Forbidden("Unknown series.");
  const { data: m } = await db().from("metrics").select("owner_id, period").eq("id", metricId).eq("workspace_id", actor.workspaceId).maybeSingle();
  if (!m || m.owner_id !== actor.personId) throw new Forbidden("Only the metric owner can upload targets and projections.");
  const lines = String(text ?? "").split(/\r?\n/).filter((l) => l.trim()).slice(0, 2000);
  const read = lines.map((l) => parseSeriesLine(l, m.period as Period)).filter((r): r is { period: string; value: number } => r !== null);
  // One value per period: a later line for the same period wins.
  const ok = [...new Map(read.map((r) => [r.period, r])).values()];
  if (ok.length) {
    const { error } = await db().from("series_values").upsert(
      ok.map((r) => ({ metric_id: metricId, kind, period_start: r.period, value: r.value, note: String(note ?? "").slice(0, 120) || null })),
      { onConflict: "metric_id,kind,period_start" },
    );
    if (error) throw new Error("The series could not be saved.");
  }
  return { saved: ok.length, skipped: lines.length - ok.length };
}

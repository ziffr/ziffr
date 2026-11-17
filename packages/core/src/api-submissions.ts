// Values from programs (spec 0002, ticket #49; GLOSSARY: Access Key, Source, Submission Rule, Lock, Approval). A key
// submits through its creator's own Token and the same submitValue as a form or Slack, so a program meets every rule a
// person meets; the value names the key. Idempotency keys and the daily limit on values live here too, in Postgres.
import { createHash } from "node:crypto";
import { assertScope, Forbidden, type Actor, type KeyActor, type FeedActor } from "./actor";
import { visibleMetricIds } from "./access";
import { db } from "./db";
import { submitValue, submissionEffects, type SubmissionEffects } from "./submissions";
import { getMetrics } from "./workspace-data";
import { JANUARY, periodStart } from "./periods";

/** Refusals in words that hold nothing but the rule, for keys that may not read values (and Feeds, which never do). */
export const REFUSED: Record<string, string> = {
  rejected_duplicate: "This period already has a value, and the Metric's rule rejects a second one.",
  rejected_derived: "This is a Derived Metric: it is computed, never submitted.",
  rejected_source: "This Metric does not take values from the API.",
  rejected_period: "That is not the first day of one of this Metric's periods, or it is in the future.",
  rejected_no_value: "The value is not a number.",
};

/** Values one key may submit in any 24 hours. */
export const VALUES_PER_DAY = 1000;
/** How long an idempotency key's first answer is kept. */
export const IDEMPOTENCY_HOURS = 24;

/** What a program sends: a value, optionally its period (first day; default the current one) and a Breakdown. */
export type ApiSubmissionInput = { value: number; period?: string | null; breakdown?: { label: string; value: number }[] | null };

/** What became of a program's value (for a key without metrics:read: the value it sent, and words that hold no
 * earlier value or Metric name): recorded (published, or awaiting Approval as an Unusual Value), or refused
 * because the period is locked (it went to the Metric's owner as a proposed Correction), because the key's creator
 * does not submit to the Metric, or by another rule (the Submission Rule, a Derived Metric, a bad period). */
export type ApiSubmissionResult =
  | { ok: true; status: "recorded" | "awaiting_approval"; period: string; value: number; detail: string }
  | { ok: false; reason: "locked" | "not_submitter" | "refused"; detail: string };

/** Submits a value for the Metric with this slug (scope values:submit). A Metric the key's creator does not see is
 * Forbidden, like one that does not exist. */
export async function submitObservation(actor: Actor | KeyActor, slug: string, input: ApiSubmissionInput, effects: SubmissionEffects = submissionEffects): Promise<ApiSubmissionResult> {
  assertScope(actor, "values:submit");
  const metrics = await getMetrics(actor.workspaceId);
  const metric = metrics.find((m) => m.slug === String(slug));
  if (!metric || !(await visibleMetricIds(actor.workspaceId, actor.personId, metrics)).has(metric.id)) throw new Forbidden();
  // The creator's own Token, not one they hold as a Stand-in: a key acts as its creator only.
  const { data: tokens } = await db().from("tokens").select("code").eq("workspace_id", actor.workspaceId).eq("metric_id", metric.id).eq("submitter_id", actor.personId).is("stands_in_for", null).order("id").limit(1);
  // A key that may only submit learns nothing it could not send: not which Metrics its creator sees, not a value
  // already there. Its answers name no Metric and no earlier value (they are the submitter's own words otherwise).
  const reads = !actor.key || actor.key.scopes.includes("metrics:read");
  if (!tokens?.length) {
    if (!reads) throw new Forbidden();
    return { ok: false, reason: "not_submitter", detail: `You do not submit values for ${metric.name}.` };
  }
  const value = Number(input.value);
  const breakdown = (input.breakdown ?? []).map((r) => ({ label: String(r.label).slice(0, 200), value: Number(r.value) }));
  const period = input.period ?? periodStart(new Date(), metric.period, JANUARY);
  const result = await submitValue({
    source: "api", sender: tokens[0].code, text: JSON.stringify({ value, period, breakdown: breakdown.length ? breakdown : undefined }).slice(0, 4000),
    value: { value, breakdown }, period: input.period ?? undefined, accessKeyId: actor.key ? Number(actor.key.id) : undefined, workspaceId: actor.workspaceId,
  }, effects);
  if (result.outcome === "proposed_locked") return { ok: false, reason: "locked", detail: reads ? result.detail : "The period is locked; the value went to the Metric's owner as a proposed correction." };
  if (!result.ok) return { ok: false, reason: result.outcome === "rejected_no_token" ? "not_submitter" : "refused", detail: reads ? result.detail : REFUSED[result.outcome] ?? "The Metric's rules refused the value." };
  const { data: state } = await db().from("period_states").select("state").eq("metric_id", metric.id).eq("period_start", period).maybeSingle();
  const { data: latest } = await db().from("observations").select("value").eq("metric_id", metric.id).eq("period_start", period).order("created_at", { ascending: false }).limit(1);
  const status = state?.state === "approval" ? "awaiting_approval" : "recorded";
  if (!reads) return { ok: true, status, period, value, detail: status === "recorded" ? "Recorded." : "Recorded; it waits for Approval." };
  return { ok: true, status, period, value: Number(latest?.[0]?.value ?? value), detail: result.detail };
}

/** Whether the key may submit another value now; if not, the seconds until it may (scope values:submit). Counted from
 * the Access Log's submitted values of the last 24 hours. */
export async function admitValues(actor: KeyActor, count = 1): Promise<{ ok: true } | { ok: false; retryAfter: number }> {
  const since = Date.now() - 86_400_000;
  const { data } = await db().from("access_log").select("at, submitted").eq("key_id", Number(actor.key.id)).gt("submitted", 0).gt("at", new Date(since).toISOString()).order("at", { ascending: true }).limit(VALUES_PER_DAY + 1);
  const rows = data ?? [];
  let total = rows.reduce((a, r) => a + Number(r.submitted), 0);
  if (total + count <= VALUES_PER_DAY) return { ok: true };
  // The limit frees up as the oldest submissions pass 24 hours.
  let at = Date.now();
  for (const r of rows) {
    total -= Number(r.submitted);
    at = new Date(r.at).getTime();
    if (total + count <= VALUES_PER_DAY) break;
  }
  return { ok: false, retryAfter: Math.max(1, Math.ceil((at + 86_400_000 - Date.now()) / 1000)) };
}

/** A stored answer: its HTTP status and body. `keep: false` answers once without storing (a refusal for the limit,
 * which a retry should get past). */
export type StoredAnswer = { status: number; body: unknown; keep?: boolean };

/** Runs `answer` once per idempotency key of this key: a repeat with the same body within 24 hours gets the first
 * answer back (`replayed`), a repeat with another body, or while the first is still running, is a conflict. */
export async function once(actor: KeyActor | FeedActor, idempotencyKey: string, body: unknown, answer: () => Promise<StoredAnswer>): Promise<StoredAnswer & { replayed?: boolean } | { conflict: "different_body" | "in_progress" }> {
  const keyId = Number(actor.key.id);
  const idem = String(idempotencyKey).slice(0, 200);
  const hash = createHash("sha256").update(canonical(body)).digest("hex");
  await db().from("api_idempotency").delete().lt("created_at", new Date(Date.now() - IDEMPOTENCY_HOURS * 3_600_000).toISOString());
  const { error } = await db().from("api_idempotency").insert({ key_id: keyId, idempotency_key: idem, body_hash: hash });
  if (error) {
    if (error.code !== "23505") throw new Error("The idempotency key could not be stored.");
    const { data: first } = await db().from("api_idempotency").select("body_hash, status, response").eq("key_id", keyId).eq("idempotency_key", idem).maybeSingle();
    if (!first || first.body_hash !== hash) return { conflict: "different_body" };
    if (first.status === null) return { conflict: "in_progress" };
    return { status: first.status, body: first.response, replayed: true };
  }
  try {
    const result = await answer();
    if (result.keep === false) await db().from("api_idempotency").delete().eq("key_id", keyId).eq("idempotency_key", idem);
    else await db().from("api_idempotency").update({ status: result.status, response: result.body }).eq("key_id", keyId).eq("idempotency_key", idem);
    return result;
  } catch (e) {
    // Nothing was answered, so a retry may try again.
    await db().from("api_idempotency").delete().eq("key_id", keyId).eq("idempotency_key", idem);
    throw e;
  }
}

/** JSON with sorted keys, so the same body hashes the same whatever order its fields came in. */
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(v ?? null);
}

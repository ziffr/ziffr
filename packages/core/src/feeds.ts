// Feeds (spec 0012, ADR 0006, GLOSSARY: Feed, Feed Key, Import): programs outside Ziffr that bring in values for some
// Metrics from another system, such as a CRM or a data warehouse. A Feed belongs to the Workspace, is a Submitter of
// its own (a person row, like a Contact) and uses Feed Keys. Owners and Admins make and remove Feeds and their keys;
// a Metric's owner and Editors choose an existing Feed as a Submitter. A Feed Key can only record values for its
// Feed's Metrics and learn which periods already have one: never a value, a person, or another Metric.
import { openWorkflowRows } from "./workflow-rows";
import { randomBytes, randomUUID } from "node:crypto";
import { db } from "./db";
import { sendingLimit } from "./sending-limit";
import { sendingLimitDefault } from "./sending-limits";
import { openRows } from "./sealed-columns";
import { FEED_SCOPE, Forbidden, type Actor, type FeedActor } from "./actor";
import { insertKey } from "./internal/key-store";
import { REFUSED } from "./api-submissions";
import { audit } from "./audit-log";
import { normalizeMetric } from "./metric-row";
import { editableMetric } from "./metrics";
import { submissionEffects, submitValue, type SubmissionEffects } from "./submissions";
import { trialLimitMessage } from "./trials";
import { syncTrialLimits } from "./trial-limits-in-effect";
import { recordVersion } from "./versions";
import type { Metric, Period } from "./types";
import { periodStart, type YearStart } from "./periods";
import { yearStartFor, yearStartOf } from "./fiscal-year";
import { refuseInDemo } from "./demo";

/** Values one Feed may record in any 24 hours, across all its keys. */
export const FEED_VALUES_PER_DAY = sendingLimitDefault("valuesPerFeed");
/** Items one batch may hold. */
export const FEED_BATCH_MAX = 500;
/** Periods with a value a Feed is told about per Metric: the latest ones, enough for years of daily history. */
export const FEED_FILLED_MAX = 1_000;

const DAY = 86_400_000;
const today = () => new Date().toISOString().slice(0, 10);
const cleanName = (name: unknown) => String(name ?? "").trim().replace(/\s+/g, " ").slice(0, 80);

/** A Feed as the workspace's Owners and Admins see it on the Team page, with its keys and how it is doing. */
export type FeedInfo = {
  id: string;
  name: string;
  created_at: string;
  keys: { id: number; name: string; prefix: string; expires_on: string; revoked: boolean; last_used_at: string | null }[];
  metrics: { id: number; name: string }[];
  /** The last call with any of its keys. */
  last_call: string | null;
  /** Values recorded and refused in the last 24 hours. */
  recorded_today: number;
  refused_today: number;
};

/** Refuses anyone but a signed-in Owner or Admin, and the demo (whose made-up people are anyone's). */
function assertManagesFeeds(actor: Actor) {
  if (actor.key) throw new Forbidden("A key cannot manage Feeds.");
  if (actor.role !== "owner" && actor.role !== "admin") throw new Forbidden("Only Owners and Admins manage Feeds.");
  // A Feed's person is made before the Feed, outside the demo's rows: refused before it.
  refuseInDemo(actor);
}

/** A Feed of the workspace that is not deleted, or Forbidden. The caller checks who may ask first. */
export async function liveFeed(workspaceId: string, feedId: string) {
  const { data } = await db().from("feeds").select("person_id, name").eq("workspace_id", workspaceId).eq("person_id", String(feedId)).is("deleted_at", null).maybeSingle();
  if (!data) throw new Forbidden();
  return data as { person_id: string; name: string };
}

/** Creates a Feed (Owners and Admins). It is a person row nobody signs in as, so its values and history work as anyone's. */
export async function createFeed(actor: Actor, name: string): Promise<{ id: string }> {
  assertManagesFeeds(actor);
  const clean = cleanName(name);
  if (!clean) throw new Error("Give the Feed a name, such as the system it brings values from.");
  const id = `feed-${randomUUID()}`;
  await syncTrialLimits();
  // No email and no Slack handle: nothing can recognise a message as coming from a Feed, only its key.
  const { error } = await db().from("profiles").insert({ id, name: clean, role: "Feed", color: "#64748b", email: null, slack_handle: null });
  if (error) throw new Error("The Feed could not be created.");
  const { error: e2 } = await db().from("feeds").insert({ person_id: id, workspace_id: actor.workspaceId, name: clean, created_by: actor.personId });
  if (e2) {
    await db().from("profiles").delete().eq("id", id);
    throw new Error(trialLimitMessage(e2.code) ?? "The Feed could not be created.");
  }
  await audit(actor, { kind: "feed.created", object: { type: "feed", id, name: clean } });
  return { id };
}

/** Renames a Feed (Owners and Admins); its values show the new name. */
export async function renameFeed(actor: Actor, feedId: string, name: string): Promise<void> {
  assertManagesFeeds(actor);
  const feed = await liveFeed(actor.workspaceId, feedId);
  const clean = cleanName(name);
  if (!clean) throw new Error("Give the Feed a name.");
  await db().from("feeds").update({ name: clean }).eq("person_id", feed.person_id).eq("workspace_id", actor.workspaceId);
  await db().from("profiles").update({ name: clean }).eq("id", feed.person_id);
  await audit(actor, { kind: "feed.renamed", object: { type: "feed", id: feed.person_id, name: clean }, details: { from: feed.name } });
}

/** Deletes a Feed (Owners and Admins): its keys stop at once and it submits to nothing any more. Its values stay, with
 * its name, so a Metric's history still says where they came from. */
export async function deleteFeed(actor: Actor, feedId: string): Promise<void> {
  assertManagesFeeds(actor);
  const feed = await liveFeed(actor.workspaceId, feedId);
  const now = new Date().toISOString();
  await db().from("access_keys").update({ revoked_at: now }).eq("feed_id", feed.person_id).eq("workspace_id", actor.workspaceId).is("revoked_at", null);
  await db().from("tokens").delete().eq("workspace_id", actor.workspaceId).eq("submitter_id", feed.person_id);
  await db().from("feeds").update({ deleted_at: now }).eq("person_id", feed.person_id).eq("workspace_id", actor.workspaceId);
  await audit(actor, { kind: "feed.deleted", object: { type: "feed", id: feed.person_id, name: feed.name } });
}

/** The workspace's Feeds with their keys, Metrics and health (Owners and Admins). Metric names only for the Metrics a
 * Feed submits to; an Owner or Admin sees those names here because they decide what the Feed may write to. */
export async function listFeeds(actor: Actor): Promise<FeedInfo[]> {
  assertManagesFeeds(actor);
  const ws = actor.workspaceId;
  const { data: feeds } = await db().from("feeds").select("person_id, name, created_at").eq("workspace_id", ws).is("deleted_at", null).order("created_at");
  if (!feeds?.length) return [];
  const ids = feeds.map((f) => f.person_id as string);
  const since = new Date(Date.now() - DAY).toISOString();
  const [{ data: keys }, { data: tokens }, { data: intake }] = await Promise.all([
    db().from("access_keys").select("id, name, prefix, expires_on, revoked_at, last_used_at, feed_id").eq("workspace_id", ws).in("feed_id", ids).order("id", { ascending: false }),
    db().from("tokens").select("submitter_id, metric_id").eq("workspace_id", ws).in("submitter_id", ids).is("stands_in_for", null),
    db().from("intake_log").select("sender_id, outcome").eq("workspace_id", ws).eq("source", "api").in("sender_id", ids).gt("at", since).limit((await sendingLimit("valuesPerFeed")) * 2),
  ]);
  // The Metrics' names are sealed: read on their own and opened, never embedded in the Tokens.
  const metricIds = [...new Set((tokens ?? []).map((t) => t.metric_id as number))];
  const named = new Map((await openRows("metrics", ws, metricIds.length ? (await db().from("metrics").select("id, name").eq("workspace_id", ws).in("id", metricIds)).data : [])).map((m) => [m.id as number, m.name as string]));
  return feeds.map((f) => {
    const own = (keys ?? []).filter((k) => k.feed_id === f.person_id);
    const outcomes = (intake ?? []).filter((r) => r.sender_id === f.person_id).map((r) => String(r.outcome));
    const recorded = outcomes.filter((o) => !o.startsWith("rejected_") && o !== "proposed_locked").length;
    return {
      id: f.person_id, name: f.name, created_at: f.created_at,
      keys: own.map((k) => ({ id: k.id, name: k.name, prefix: k.prefix, expires_on: k.expires_on, revoked: Boolean(k.revoked_at), last_used_at: k.last_used_at })),
      metrics: (tokens ?? []).filter((t) => t.submitter_id === f.person_id).map((t) => ({ id: t.metric_id as number, name: named.get(t.metric_id as number) ?? "" })),
      last_call: own.map((k) => k.last_used_at as string | null).filter(Boolean).sort().at(-1) ?? null,
      recorded_today: recorded,
      refused_today: outcomes.length - recorded,
    };
  });
}

/** The live Feeds' ids and names, for choosing one as a Metric's Submitter: anyone who may change a Metric needs the
 * names, nothing more (Guests and keys get none). */
export async function feedChoices(actor: Actor): Promise<{ id: string; name: string }[]> {
  if (actor.key || actor.role === "guest") return [];
  const { data } = await db().from("feeds").select("person_id, name").eq("workspace_id", actor.workspaceId).is("deleted_at", null).order("name");
  return (data ?? []).map((f) => ({ id: f.person_id, name: f.name }));
}

/** The names of the Feeds among these person ids, deleted ones too, so a value's history keeps saying where it came
 * from. Only the ids a page already shows (its Submitters and its values' submitters): names, nothing more. */
export async function feedNames(actor: Actor, ids: readonly string[]): Promise<Record<string, string>> {
  if (actor.key) throw new Forbidden();
  const wanted = [...new Set(ids.filter(Boolean))];
  if (!wanted.length) return {};
  const { data } = await db().from("feeds").select("person_id, name").eq("workspace_id", actor.workspaceId).in("person_id", wanted);
  return Object.fromEntries((data ?? []).map((f) => [f.person_id, f.name]));
}

/** Makes a Feed a Submitter of a Metric, for the Metric's owner and Editors, and turns its API Source on, since a
 * Feed sends nothing else. A Derived Metric takes no values. */
export async function addFeedToMetric(actor: Actor, metricId: number, feedId: string): Promise<void> {
  const m = await editableMetric(actor, Number(metricId), "who submits");
  if (m.formula) throw new Error("A Derived Metric is computed; it takes no values.");
  const feed = await liveFeed(actor.workspaceId, feedId);
  const { data: existing } = await db().from("tokens").select("id").eq("metric_id", m.id).eq("submitter_id", feed.person_id).is("stands_in_for", null).maybeSingle();
  if (!existing) {
    // A Token code is never shown for a Feed: its key is what it presents.
    const { error } = await db().from("tokens").insert({ code: `tk-${randomBytes(18).toString("base64url")}`, metric_id: m.id, submitter_id: feed.person_id });
    if (error) throw new Error("The Feed could not be added.");
  }
  const sources = (m.sources ?? []) as string[];
  if (!sources.includes("api")) await db().from("metrics").update({ sources: [...sources, "api"] }).eq("id", m.id).eq("workspace_id", actor.workspaceId);
  await recordVersion("metric", m.id, actor.personId, { message: `Takes values from the Feed “${feed.name}”` });
}

/** Stops a Feed submitting to a Metric, for the Metric's owner and Editors. Its earlier values stay. */
export async function removeFeedFromMetric(actor: Actor, metricId: number, feedId: string): Promise<void> {
  const m = await editableMetric(actor, Number(metricId), "who submits");
  const { data: feed } = await db().from("feeds").select("person_id, name").eq("workspace_id", actor.workspaceId).eq("person_id", String(feedId)).maybeSingle();
  if (!feed) throw new Forbidden();
  await db().from("tokens").delete().eq("metric_id", m.id).eq("workspace_id", actor.workspaceId).eq("submitter_id", feed.person_id);
  await recordVersion("metric", m.id, actor.personId, { message: `No longer takes values from the Feed “${feed.name}”` });
}

/** Creates a Feed Key (Owners and Admins), working through the end of a day within a year. It acts for the Feed, not
 * for its creator, and keeps working after they leave. Returns the secret, which is shown this once. */
export async function createFeedKey(actor: Actor, feedId: string, input: { name: string; expiresOn: string }): Promise<{ id: number; secret: string }> {
  assertManagesFeeds(actor);
  const feed = await liveFeed(actor.workspaceId, feedId);
  const latest = new Date(Date.now() + 365 * DAY).toISOString().slice(0, 10);
  const expires = String(input?.expiresOn ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expires) || expires <= today() || expires > latest) throw new Error("Pick an end date within a year.");
  const name = cleanName(input?.name) || `${feed.name} key`;
  const key = await insertKey({ workspace_id: actor.workspaceId, created_by: actor.personId, feed_id: feed.person_id, name, scopes: [FEED_SCOPE], expires_on: expires });
  await audit(actor, { kind: "feed.key_created", object: { type: "feed", id: feed.person_id, name: feed.name }, details: { key: name, expires_on: key.expires_on } });
  return { id: key.id, secret: key.secret };
}

/** Revokes a Feed Key (Owners and Admins); it stops at once. */
export async function revokeFeedKey(actor: Actor, keyId: number): Promise<void> {
  assertManagesFeeds(actor);
  const { data } = await db().from("access_keys").update({ revoked_at: new Date().toISOString() }).eq("id", Number(keyId)).eq("workspace_id", actor.workspaceId).not("feed_id", "is", null).is("revoked_at", null).select("id, name, feed_id");
  if (!data?.length) throw new Forbidden();
  const { data: feed } = await db().from("feeds").select("name").eq("person_id", data[0].feed_id).maybeSingle();
  await audit(actor, { kind: "feed.key_revoked", object: { type: "feed", id: data[0].feed_id, name: feed?.name ?? null }, details: { key: data[0].name } });
}

/** A Metric as its Feed sees it: enough to know what to fetch and what is still missing, never a value. */
export type FeedMetric = {
  slug: string; name: string; period: Period; unit: string; format: string; decimals: number;
  /** The current period's first day as Ziffr counts it, so a Feed elsewhere in the world asks for the same one. */
  current: string;
  /** Working days after a period ends by which its value is due, if the Metric's Workflow sets one. */
  due_working_days: number | null;
  /** The periods that already have a value (their first days), oldest first: at most the latest FEED_FILLED_MAX. */
  filled: string[];
};

/** The Metrics a Feed submits to and that take API values, by id. */
async function feedMetricRows(feed: FeedActor): Promise<{ metric: Metric; token: string; workflowId: number | null }[]> {
  const { data: tokens } = await db().from("tokens").select("code, metric_id").eq("workspace_id", feed.workspaceId).eq("submitter_id", feed.feedId).is("stands_in_for", null);
  if (!tokens?.length) return [];
  const { data: sealedRows } = await db().from("metrics").select("*").eq("workspace_id", feed.workspaceId).in("id", tokens.map((t) => t.metric_id)).order("id");
  const rows = await openRows("metrics", feed.workspaceId, sealedRows);
  return rows.map((r) => ({ metric: normalizeMetric(r) as Metric, workflowId: (r.workflow_id as number | null) ?? null, token: tokens.find((t) => t.metric_id === r.id)!.code as string }))
    // A Metric whose API Source is off, or a Derived one, is none of the Feed's business.
    .filter((x) => !x.metric.formula && x.metric.sources.includes("api"));
}

/** The Feed's name and its Metrics, a page at a time after the Metric id `after` (GET /api/v1/feed). */
export async function feedOverview(feed: FeedActor, page: { after?: number | null; limit: number }): Promise<{ name: string; yearStartMonth: YearStart; metrics: { items: FeedMetric[]; next: number | null } }> {
  const { data: f } = await db().from("feeds").select("name").eq("person_id", feed.feedId).eq("workspace_id", feed.workspaceId).is("deleted_at", null).maybeSingle();
  if (!f) throw new Forbidden();
  const limit = Math.min(Math.max(Math.trunc(page.limit) || 1, 1), 100);
  const after = Number.isInteger(page.after) ? (page.after as number) : 0;
  const rest = (await feedMetricRows(feed)).filter((x) => x.metric.id > after);
  const items = rest.slice(0, limit);
  const workflowIds = [...new Set(items.map((x) => x.workflowId).filter((w): w is number => w !== null))];
  const { data: sealedFlows } = workflowIds.length ? await db().from("workflows").select("id, config").in("id", workflowIds).eq("workspace_id", feed.workspaceId) : { data: [] as { id: number; config: unknown }[] };
  const flows = await openWorkflowRows(feed.workspaceId, sealedFlows);
  const due = new Map((flows ?? []).map((w) => [w.id as number, Number((w.config as { dueWorkingDays?: number })?.dueWorkingDays ?? NaN)]));
  const out: FeedMetric[] = [];
  for (const { metric: m, workflowId } of items) {
    // Only which periods have a value: the Feed decides what to fetch from that, and learns no number.
    const { data: obs } = await db().from("observations").select("period_start").eq("workspace_id", feed.workspaceId).eq("metric_id", m.id).order("period_start", { ascending: false }).limit(FEED_FILLED_MAX * 2);
    const filled = [...new Set((obs ?? []).map((o) => o.period_start as string))].slice(0, FEED_FILLED_MAX).reverse();
    const d = workflowId !== null ? due.get(workflowId) : undefined;
    out.push({ slug: m.slug, name: m.name, period: m.period, unit: m.unit, format: m.format, decimals: m.decimals, current: periodStart(new Date(), m.period, await yearStartFor(feed.workspaceId, m.period)), due_working_days: Number.isFinite(d) ? (d as number) : null, filled });
  }
  // The month the workspace's year starts in, so a Feed knows which months a quarter or year spans.
  return { name: f.name, yearStartMonth: await yearStartOf(feed.workspaceId), metrics: { items: out, next: rest.length > limit ? items[items.length - 1].metric.id : null } };
}

/** One value in a Feed's batch: a Metric's slug, a period's first day (the current period if left out), the value,
 * and its Breakdown if any. Shapes are checked by the API before they get here; this checks them again. */
export type FeedItem = { metric: string; period?: string | null; value: number; breakdown?: { label: string; value: number }[] | null };

/** What became of one item, in words that hold no earlier value: recorded (or awaiting Approval), locked (it went to
 * the Metric's owner as a proposed Correction), or refused with a stable code. `imported` marks an Import. */
export type FeedItemResult =
  | { metric: string; period: string | null; status: "recorded" | "awaiting_approval"; imported: boolean; detail: string }
  | { metric: string; period: string | null; status: "locked"; detail: string }
  | { metric: string; period: string | null; status: "refused"; code: string; detail: string };

/** Words for what the Submission Rule did, without the numbers: a Feed may not read values. */
const DONE: Record<string, string> = {
  recorded: "Recorded.", overwritten: "Replaced the period's value.", added: "Added to the period's value.", kept_both: "Kept beside the period's earlier values.",
};

/** A claimed batch, or why it may not run now and the seconds until it may. */
export type BatchClaim = { ok: true; batchId: number } | { ok: false; reason: "busy" | "limit"; retryAfter: number; limit: number };

/** Claims a batch of `count` values for the Feed, in one locked database step (claim_feed_batch): refused while
 * another batch of the Feed runs, or when it would cross FEED_VALUES_PER_DAY in 24 hours. Counted per Feed, over all
 * its keys, and before anything runs, so parallel requests cannot pass the limit together. */
export async function claimFeedBatch(feed: FeedActor, count: number): Promise<BatchClaim> {
  const perDay = await sendingLimit("valuesPerFeed");
  const { data, error } = await db().rpc("claim_feed_batch", { p_feed: feed.feedId, p_items: Math.trunc(count), p_limit: perDay });
  if (error) throw new Error("The batch could not be claimed.");
  const id = Number(data);
  if (id > 0) return { ok: true, batchId: id };
  if (id === -1) return { ok: false, reason: "busy", retryAfter: 10, limit: perDay };
  // The limit frees up as the oldest batches pass 24 hours.
  const { data: rows } = await db().from("feed_batches").select("started_at, items, taken").eq("feed_id", feed.feedId).gt("started_at", new Date(Date.now() - DAY).toISOString()).order("started_at");
  let total = (rows ?? []).reduce((a, r) => a + Number(r.taken ?? r.items), 0);
  let at = Date.now();
  for (const r of rows ?? []) {
    total -= Number(r.taken ?? r.items);
    at = new Date(r.started_at).getTime();
    if (total + count <= perDay) break;
  }
  return { ok: false, reason: "limit", retryAfter: Math.max(1, Math.ceil((at + DAY - Date.now()) / 1000)), limit: perDay };
}

/** Ends a claimed batch with the number of items that count towards the day's limit: the route passes every item
 * it claimed, so nothing a batch wrote (values, proposed Corrections) goes uncounted. */
export async function finishFeedBatch(feed: FeedActor, batchId: number, taken: number): Promise<void> {
  await db().from("feed_batches").update({ taken: Math.max(0, Math.trunc(taken)), finished_at: new Date().toISOString() }).eq("id", batchId).eq("feed_id", feed.feedId);
}

/** Records a Feed's batch, item by item, each through the same path as any value (Submission Rule, Locks, Approvals),
 * so one bad item does not stop the rest. A value for a past period that has none yet is an Import and skips the
 * Unusual Value check (spec 0012); the current period and anything that replaces a value are checked as usual. */
export async function submitFeedObservations(feed: FeedActor, items: FeedItem[], effects: SubmissionEffects = submissionEffects): Promise<FeedItemResult[]> {
  if (!Array.isArray(items) || items.length > FEED_BATCH_MAX) throw new Error(`A batch holds 1 to ${FEED_BATCH_MAX} items.`);
  const mine = new Map((await feedMetricRows(feed)).map((x) => [x.metric.slug, x]));
  const results: FeedItemResult[] = [];
  for (const raw of items) {
    const slug = String(raw?.metric ?? "");
    const named = raw?.period ? String(raw.period) : null;
    const target = mine.get(slug);
    // A Metric of another workspace, one the Feed does not feed and one whose API is off all read the same.
    if (!target) { results.push({ metric: slug, period: named, status: "refused", code: "not_found", detail: "This Feed does not submit values to that Metric." }); continue; }
    const value = Number(raw.value);
    const breakdown = (Array.isArray(raw.breakdown) ? raw.breakdown : []).slice(0, 500).map((r) => ({ label: String(r?.label ?? "").slice(0, 200), value: Number(r?.value) }));
    const period = named ?? periodStart(new Date(), target.metric.period, await yearStartFor(feed.workspaceId, target.metric.period));
    const r = await submitValue({
      source: "api", sender: target.token, workspaceId: feed.workspaceId, accessKeyId: Number(feed.key.id), import: true,
      text: JSON.stringify({ value, period, breakdown: breakdown.length ? breakdown : undefined }).slice(0, 4000),
      value: { value, breakdown }, period: named ?? undefined,
    }, effects);
    if (r.outcome === "proposed_locked") { results.push({ metric: slug, period, status: "locked", detail: "The period is locked; the value went to the Metric's owner as a proposed correction." }); continue; }
    if (!r.ok) { results.push({ metric: slug, period, status: "refused", code: r.outcome.replace(/^rejected_/, ""), detail: REFUSED[r.outcome] ?? "The Metric's rules refused the value." }); continue; }
    const { data: state } = await db().from("period_states").select("state").eq("metric_id", target.metric.id).eq("period_start", period).maybeSingle();
    const waiting = state?.state === "approval";
    results.push({ metric: slug, period, status: waiting ? "awaiting_approval" : "recorded", imported: Boolean(r.imported), detail: r.imported ? "Imported." : waiting ? `${DONE[r.outcome] ?? "Recorded."} It waits for Approval.` : DONE[r.outcome] ?? "Recorded." });
  }
  return results;
}

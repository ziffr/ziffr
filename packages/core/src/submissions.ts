// Submitting values (GLOSSARY: Observation, Submission Rule, Token, Lock, Correction, Contact, Feed, Import). Values arrive
// by Slack, mail, a personal form link, a program with an Access Key or a Feed, and are recorded under their sender,
// members, Contacts and Feeds alike; a Metric owner
// accepts or declines Corrections. Every lookup stays inside one Workspace.
import { db } from "./db";
import { formatValue, SOURCE_LABEL } from "./format";
import { normalizeMetric } from "./metric-row";
import { parseBreakdown } from "./parse";
import { peopleOf, recogniseSender, type ContactRow } from "./people";
import { tokenValid } from "./tokens";
import { Forbidden, type Actor } from "./actor";
import { deliver } from "./deliveries";
import { onValue } from "./workflow-engine";
import { audit } from "./audit-log";
import type { Metric, Profile, SourceId, Token } from "./types";
import { JANUARY, periodLabel, periodStart, shiftPeriod } from "./periods";

/** A value as it arrived: who sent it on which Source, the text, and the Prompt it answers if any. */
export type SubmissionInput = {
  source: SourceId;
  /** Slack handle, mail address, or (web form and API) the token code. */
  sender: string;
  text: string;
  promptId?: number;
  /** A program's value as it sent it, instead of a number found in `text` (source "api" only). */
  value?: { value: number; breakdown?: { label: string; value: number }[] };
  /** The period a program names; otherwise the current one, or the Prompt's (source "api" only). */
  period?: string;
  /** The Access Key a program submits with (source "api" only); the value names it. */
  accessKeyId?: number;
  /** Set only by a Feed's batch (feeds.ts), never from what a program sends: a value for a past period that has none
   * yet is then an Import and skips the Unusual Value check (spec 0012). Ignored unless the sender is a Feed. */
  import?: boolean;
  /** The workspace the message is meant for. A form link's Token says it itself; Slack and mail need it, since the
   * same handle or address may be known in several workspaces. */
  workspaceId?: string;
};

/** What became of a submission, in words for the sender. */
export type SubmissionResult = { outcome: string; detail: string; ok: boolean; metricSlug?: string; imported?: boolean };

/** What a submission sets off: the owner hears about a late value, a new value goes to its Workflow. Tests pass
 * their own; everyone else gets the core's. */
export type SubmissionEffects = {
  /** Tells the Metric owner about a late value proposed as a Correction. */
  notifyCorrection: (e: { actionId: number; senderId: string; ownerId: string; value: number }) => Promise<void>;
  /** Hands a new value to the Metric's Workflow; returns what it did, in words. An Import skips the check. */
  afterValue: (metricId: number, period: string, submitterId: string, opts?: { imported?: boolean }) => Promise<string[]>;
};

/** Pulls the first number out of a message: "we closed 3 today" → 3, "126,657 €" → 126657. */
export function parseValue(text: string): number | null {
  const m = text.replace(/(\d)[ ,](?=\d{3}\b)/g, "$1").match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

async function writeRows(observationId: number, rows: { label: string; value: number }[], mode: "replace" | "add") {
  if (mode === "replace") {
    await db().from("breakdown_rows").delete().eq("observation_id", observationId);
    await db().from("breakdown_rows").insert(rows.map((r, i) => ({ observation_id: observationId, label: r.label, value: r.value, position: i })));
    return;
  }
  const { data: existing } = await db().from("breakdown_rows").select("*").eq("observation_id", observationId).order("position");
  const merged = [...(existing ?? []).map((r) => ({ label: r.label as string, value: Number(r.value) }))];
  for (const r of rows) {
    const hit = merged.find((m) => m.label.toLowerCase() === r.label.toLowerCase());
    if (hit) hit.value += r.value;
    else merged.push(r);
  }
  await writeRows(observationId, merged, "replace");
}

/** Takes a value that arrived by Slack, mail or a personal form link (GLOSSARY: Submission Rule, Token, Lock).
 * There is no signed-in Actor: the sender is known by their Token or their identity on the Source, which may be a
 * Contact without a login. Everything is looked up in one workspace only: the Token's, or the one given for Slack
 * and mail. `provenSenderId` is for a Connector that proved who wrote (Slack signs it, spec 0007): the sender is then
 * that person of the workspace, not whoever `sender` names. It is never taken from what a browser sends. */
export async function submitValue(input: SubmissionInput, effects: SubmissionEffects = submissionEffects, provenSenderId?: string): Promise<SubmissionResult> {
  let workspaceId = input.workspaceId;
  const log = async (r: SubmissionResult & { senderId?: string | null; metricId?: number | null; token?: string | null; observationId?: number | null }) => {
    // Logged in the workspace it was meant for; a link that matches no Token belongs to none and is not logged.
    if (workspaceId) await db().from("intake_log").insert({
      workspace_id: workspaceId,
      source: input.source,
      sender: input.sender,
      sender_id: r.senderId ?? null,
      raw: input.text,
      metric_id: r.metricId ?? null,
      token_code: r.token ?? null,
      outcome: r.outcome,
      detail: r.detail,
      observation_id: r.observationId ?? null,
    });
    return { outcome: r.outcome, detail: r.detail, ok: r.ok, metricSlug: r.metricSlug, ...(r.imported ? { imported: true } : {}) };
  };

  // 1. Who sent it? The Token is implied by the sender's identity on this Source.
  // Everything is looked up inside one workspace only, so a message can never land in another one.
  const byToken = input.source === "web_form" || input.source === "api";
  if (byToken) {
    const { data: t } = await db().from("tokens").select("workspace_id").eq("code", input.sender).maybeSingle();
    if (!t) return log({ ok: false, outcome: "rejected_no_token", detail: "This form link doesn’t match any Token." });
    workspaceId = t.workspace_id;
  }
  if (!workspaceId) throw new Error("Intake needs the workspace the message is meant for.");
  // Members and Contacts of that workspace (GLOSSARY: Contact): both submit, Contacts without a login.
  const [profiles, { data: tokens }, { data: metricRows }] = await Promise.all([
    peopleIn(workspaceId, { contactDetails: true }),
    db().from("tokens").select("*").eq("workspace_id", workspaceId),
    db().from("metrics").select("*").eq("workspace_id", workspaceId),
  ]);
  const metrics = (metricRows ?? []).map(normalizeMetric) as Metric[];
  const live = (tokens ?? []).filter((t) => tokenValid(t, tokens ?? []));
  const metricById = Object.fromEntries(metrics.map((m) => [m.id, m]));
  let sender: Profile | undefined;
  let feed: Profile | null = null;
  let candidates: Token[] = [];
  if (byToken) {
    const t = live.find((t) => t.code === input.sender);
    if (!t) return log({ ok: false, outcome: "rejected_no_token", detail: "This form link doesn’t match any Token." });
    sender = profiles.find((p) => p.id === t.submitter_id);
    // A Feed is nobody's colleague, so it is not among the people above; only a program reaches it, by its key.
    if (!sender && input.source === "api") {
      feed = await liveFeed(workspaceId, t.submitter_id);
      sender = feed ?? undefined;
    }
    // A link of someone who is no longer a member or Contact here records nothing.
    if (!sender) return log({ ok: false, outcome: "rejected_no_token", detail: "This form link is no longer in use." });
    candidates = [t];
  } else {
    sender = provenSenderId ? profiles.find((p) => p.id === provenSenderId) : recogniseSender(profiles, input.source === "slack" ? "slack" : "mail", input.sender);
    if (!sender) return log({ ok: false, outcome: "rejected_unknown_sender", detail: `${input.sender} isn’t a known ${SOURCE_LABEL[input.source]} identity of any user.` });
    candidates = live.filter((t) => t.submitter_id === sender!.id);
  }
  const senderId = sender?.id ?? null;
  if (candidates.length === 0) return log({ ok: false, senderId, outcome: "rejected_no_token", detail: `${sender?.name} has no Token for any metric, so nothing can be recorded.` });

  // 2. Which metric? Prompt reply > metric named in the message (among the sender's own Tokens) > the only Token.
  let token: Token | undefined;
  let prompt: { id: number; metric_id: number; period_start: string } | null = null;
  let how = "";
  if (input.promptId) {
    const { data } = await db().from("prompts").select("*").eq("id", input.promptId).eq("workspace_id", workspaceId).maybeSingle();
    prompt = data;
    if (!prompt) return log({ ok: false, senderId, outcome: "rejected_no_token", detail: "That Prompt is not known here." });
    token = candidates.find((t) => t.metric_id === prompt?.metric_id);
    if (!token) return log({ ok: false, senderId, metricId: prompt.metric_id, outcome: "rejected_no_token", detail: `${sender?.name} has no Token for ${metricById[prompt.metric_id]?.name ?? "that metric"}.` });
    how = "reply to a Prompt";
  } else {
    // Only among the sender's own Tokens: a metric matches if a distinctive word of its name appears ("2 more deals" → Deals closed).
    const words = new Set(input.text.toLowerCase().match(/[a-z]+/g) ?? []);
    const stem = (w: string) => w.replace(/s$/, "");
    const named = candidates.filter((t) =>
      (metricById[t.metric_id]?.name.toLowerCase().match(/[a-z]+/g) ?? []).some((w) => w.length >= 4 && [...words].some((x) => stem(x) === stem(w))),
    );
    if (named.length === 1) {
      token = named[0];
      how = "metric named in the message";
    } else if (candidates.length === 1) {
      token = candidates[0];
      how = input.source === "web_form" ? "personal form link" : input.source === "api" ? (feed ? "Feed" : "Access Key") : "sender’s only Token";
    } else {
      const names = candidates.map((t) => metricById[t.metric_id]?.name).join(", ");
      return log({ ok: false, senderId, outcome: "rejected_ambiguous", detail: `${sender?.name} has Tokens for ${names}. Reply to a Prompt or name the metric.` });
    }
  }
  const metric = metricById[token.metric_id];
  const base = { senderId, metricId: metric.id, token: token.code, metricSlug: metric.slug };

  if (metric.formula) return log({ ...base, ok: false, outcome: "rejected_derived", detail: `${metric.name} is a Derived Metric and is computed, never submitted.` });
  // The API is a Source of its own (spec 0012): a Metric takes programs' and Feeds' values only where it says so.
  if (!metric.sources.includes(input.source))
    return log({ ...base, ok: false, outcome: "rejected_source", detail: `${metric.name} doesn’t accept values from ${SOURCE_LABEL[input.source]}.` });

  // 3. What value, for which period? A breakdown's total (or the sum of its rows) is the value.
  const sent = input.source === "api" ? input.value : undefined;
  const breakdown = sent ? (sent.breakdown?.length ? { rows: sent.breakdown, total: sent.value } : null) : parseBreakdown(input.text);
  const rowsSum = breakdown ? breakdown.rows.reduce((a, r) => a + r.value, 0) : 0;
  const value = sent ? (Number.isFinite(sent.value) ? sent.value : null) : breakdown ? (breakdown.total ?? rowsSum) : parseValue(input.text);
  if (value === null) return log({ ...base, ok: false, outcome: "rejected_no_value", detail: "Couldn’t find a number in the message." });
  const named = input.source === "api" && input.period ? input.period : null;
  if (named && periodStart(new Date(`${named}T00:00:00`), metric.period, JANUARY) !== named)
    return log({ ...base, ok: false, outcome: "rejected_period", detail: `${named} is not the first day of a ${metric.period} of ${metric.name}.` });
  if (named && named > periodStart(new Date(), metric.period, JANUARY)) return log({ ...base, ok: false, outcome: "rejected_period", detail: `${named} is in the future.` });
  const period = named ?? prompt?.period_start ?? periodStart(new Date(), metric.period, JANUARY);
  const fv = (v: number) => formatValue(metric, v);
  const when = periodLabel(period, metric.period, JANUARY);

  // A locked period takes no more values: a late one becomes a proposal for the metric owner (GLOSSARY: Lock).
  if (await isLocked(metric.id, period)) {
    // It proposes a change to the value already there (GLOSSARY: Correction), so accepting it replaces that value.
    const { data: current } = await db().from("observations").select("id").eq("metric_id", metric.id).eq("period_start", period).order("created_at", { ascending: false }).limit(1);
    const { data: a } = await db().from("actions").insert({
      metric_id: metric.id, period_start: period, observation_id: current?.[0]?.id ?? null, asker_id: senderId, assignee_id: metric.owner_id, kind: "question", purpose: "approval",
      question: `${metric.name} for ${when} is locked. ${sender?.name.split(" ")[0]} sent ${fv(value)} late: accept it as a correction?`,
    }).select("id").single();
    if (a) {
      await db().from("thread_messages").insert({ action_id: a.id, author_id: senderId, body: "Late value for a locked period.", correction_value: value, correction_status: "proposed" });
      if (senderId) await effects.notifyCorrection({ actionId: a.id, senderId, ownerId: metric.owner_id, value });
    }
    return log({ ...base, ok: false, outcome: "proposed_locked", detail: `${metric.name}, ${when} is locked. ${fv(value)} went to ${metric.owner_id === senderId ? "you" : "the metric owner"} as a proposed correction.` });
  }

  // 4. Submission Rule
  const { data: existing } = await db().from("observations").select("*").eq("metric_id", metric.id).eq("period_start", period).order("created_at", { ascending: false });
  const prev = existing?.[0];
  const row = { metric_id: metric.id, period_start: period, submitter_id: senderId, source: input.source, access_key_id: input.source === "api" ? (input.accessKeyId ?? null) : null };
  // An Import: a Feed's value for a past period with no value yet. Only a Feed, only the past, only an empty period:
  // the current period and anything that replaces a value are checked as anyone's.
  const current = periodStart(new Date(), metric.period, JANUARY);
  const imported = Boolean(input.import && feed && !prev && period < current && period >= importFloor(current, metric.period));
  let result: SubmissionResult & { observationId?: number };
  if (!prev) {
    const { data } = await db().from("observations").insert({ ...row, value, imported }).select("id").single();
    result = { ok: true, outcome: "recorded", detail: `${fv(value)} ${imported ? "imported" : "recorded"} for ${metric.name}, ${when} (via ${how}).`, observationId: data?.id, imported };
  } else if (metric.submission_rule === "reject") {
    result = { ok: false, outcome: "rejected_duplicate", detail: `${metric.name} already has ${fv(Number(prev.value))} for ${when}, and its rule rejects a second value.` };
  } else if (metric.submission_rule === "overwrite") {
    await db().from("observations").update({ ...row, value, created_at: new Date().toISOString() }).eq("id", prev.id);
    result = { ok: true, outcome: "overwritten", detail: `Replaced ${fv(Number(prev.value))} with ${fv(value)} for ${metric.name}, ${when}.`, observationId: prev.id };
  } else if (metric.submission_rule === "add") {
    const sum = Number(prev.value) + value;
    await db().from("observations").update({ value: sum }).eq("id", prev.id);
    result = { ok: true, outcome: "added", detail: `${fv(Number(prev.value))} + ${fv(value)} = ${fv(sum)} for ${metric.name}, ${when}.`, observationId: prev.id };
  } else {
    const { data } = await db().from("observations").insert({ ...row, value }).select("id").single();
    result = { ok: true, outcome: "kept_both", detail: `Kept ${fv(value)} alongside ${existing!.length} earlier value(s) for ${metric.name}, ${when}.`, observationId: data?.id };
  }
  if (breakdown && result.ok && result.observationId) {
    await writeRows(result.observationId, breakdown.rows, result.outcome === "added" ? "add" : "replace");
    const off = breakdown.total !== null && Math.abs(rowsSum - breakdown.total) > Math.abs(breakdown.total) * 0.001;
    result.detail += ` With a breakdown of ${breakdown.rows.length} rows.${off ? ` The rows add up to ${fv(rowsSum)}, the total says ${fv(breakdown.total!)}; the total counts.` : ""}`;
  }
  if (prompt && result.ok) await db().from("prompts").update({ answered_at: new Date().toISOString() }).eq("id", prompt.id);
  // The metric's Workflow takes it from here: check, approval, publish.
  if (result.ok && senderId) {
    const next = await effects.afterValue(metric.id, period, senderId, { imported });
    if (next.length) result.detail += ` Workflow: ${next.join("; ")}.`;
  }
  return log({ ...base, ...result });
}

/** The people of a Workspace: members, then Contacts (flagged `contact`). A Contact's email, Slack handle and phone
 * are only loaded with `contactDetails`, for intake, Prompts and owners or admins; never for pages every member sees. */
export async function peopleIn(ws: string, { contactDetails = false } = {}): Promise<Profile[]> {
  // The details are not even loaded unless asked for, so they cannot slip into a page.
  const columns: string = contactDetails ? "workspace_id, person_id, email, slack_handle, phone" : "workspace_id, person_id";
  const [{ data: members }, { data: contacts }] = await Promise.all([
    db().from("memberships").select("user_id").eq("workspace_id", ws),
    db().from("contacts").select(columns).eq("workspace_id", ws),
  ]);
  const rows = ((contacts ?? []) as unknown as Partial<ContactRow>[]).map((c) => ({ email: null, slack_handle: null, phone: null, ...c }) as ContactRow);
  const ids = [...(members ?? []).map((m) => m.user_id as string), ...rows.map((c) => c.person_id)];
  if (!ids.length) return [];
  const { data } = await db().from("profiles").select("*").in("id", ids).order("name");
  const memberIds = new Set((members ?? []).map((m) => m.user_id as string));
  const profiles = (data ?? []) as Profile[];
  return peopleOf(ws, profiles.filter((p) => memberIds.has(p.id)), rows, profiles);
}

/** The oldest period an Import may fill: 1,000 periods back (about 33 months of days, 19 years of weeks, 83 years of
 * months), what a Feed is told about. Further back, a Feed's value is checked like anyone's. */
function importFloor(current: string, period: Metric["period"]): string {
  return shiftPeriod(current, period, -1000);
}

/** A Feed of this workspace that is not deleted, as the person it is (GLOSSARY: Feed), or null. */
async function liveFeed(ws: string, personId: string): Promise<Profile | null> {
  const { data: f } = await db().from("feeds").select("person_id").eq("workspace_id", ws).eq("person_id", personId).is("deleted_at", null).maybeSingle();
  if (!f) return null;
  const { data: p } = await db().from("profiles").select("*").eq("id", f.person_id).maybeSingle();
  return (p as Profile | null) ?? null;
}

/** Whether a Metric's period is locked and takes no more values (GLOSSARY: Lock). */
export async function isLocked(metricId: number, period: string): Promise<boolean> {
  const { data } = await db().from("period_states").select("state").eq("metric_id", metricId).eq("period_start", period).maybeSingle();
  return data?.state === "locked";
}

/** What deciding a Correction sets off: the proposer hears the decision, an accepted value goes to the Workflow. */
export type CorrectionEffects = {
  /** Tells whoever proposed it what the owner decided. */
  notifyDecision: (e: { actionId: number; ownerId: string; authorId: string; accepted: boolean }) => Promise<void>;
  /** Hands the corrected value to the Metric's Workflow again. */
  afterValue: (metricId: number, period: string, submitterId: string) => Promise<string[]>;
};

/** The Metric owner accepts or declines a proposed Correction (GLOSSARY: Correction). An accepted one replaces the
 * value (the first value is kept as the original) and goes through the Workflow again, so a locked period unlocks
 * for re-approval. Refuses anyone but the owner, and anything outside the actor's workspace. */
export async function decideCorrection(actor: Actor, messageId: number, accept: boolean, effects: CorrectionEffects = correctionEffects): Promise<void> {
  const { data: msg } = await db().from("thread_messages").select("*, actions(*, metrics(owner_id))").eq("id", messageId).eq("workspace_id", actor.workspaceId).maybeSingle();
  if (!msg || msg.actions?.metrics?.owner_id !== actor.personId) throw new Forbidden();
  // Decided once only: the status changes first and only if it was still proposed, so a second click does nothing.
  const { data: claimed } = await db().from("thread_messages").update({ correction_status: accept ? "accepted" : "declined" }).eq("id", messageId).eq("workspace_id", actor.workspaceId).eq("correction_status", "proposed").select("id");
  if (!claimed?.length) return;
  const act = msg.actions as { metric_id: number; period_start: string; observation_id: number | null };
  if (accept) {
    if (act.observation_id) {
      // Only the value of this Metric in this workspace is changed.
      const { data: obs } = await db().from("observations").select("value, original_value").eq("id", act.observation_id).eq("workspace_id", actor.workspaceId).eq("metric_id", act.metric_id).maybeSingle();
      if (!obs) throw new Forbidden();
      await db().from("observations").update({ value: msg.correction_value, original_value: obs.original_value ?? obs.value }).eq("id", act.observation_id).eq("workspace_id", actor.workspaceId).eq("metric_id", act.metric_id);
    } else {
      await db().from("observations").insert({ metric_id: act.metric_id, period_start: act.period_start, value: msg.correction_value, submitter_id: msg.author_id, source: "web_form", workspace_id: actor.workspaceId });
    }
  }
  if (accept) {
    await db().from("period_states").update({ state: "submitted" }).eq("metric_id", act.metric_id).eq("period_start", act.period_start);
    await effects.afterValue(act.metric_id, act.period_start, msg.author_id);
  }
  // Who decided, about which period, once it took effect: never the proposed or the old value.
  const { data: m } = await db().from("metrics").select("name").eq("id", act.metric_id).eq("workspace_id", actor.workspaceId).maybeSingle();
  await audit(actor, { kind: accept ? "correction.accepted" : "correction.declined", object: { type: "metric", id: act.metric_id, name: m?.name ?? null }, details: { period: act.period_start, proposed_by: msg.author_id } });
  await effects.notifyDecision({ actionId: msg.action_id, ownerId: actor.personId, authorId: msg.author_id, accepted: accept });
}

/** The core's own effects of a submission. */
export const submissionEffects: SubmissionEffects = {
  /** Tells the owner through their Connector. */
  notifyCorrection: ({ actionId, senderId, ownerId, value }) =>
    deliver({ kind: "correction", actionId, senderId, recipientId: ownerId, correction: value, text: "Late value for a locked period." }),
  afterValue: onValue,
};

/** The core's own effects of a decided Correction. */
export const correctionEffects: CorrectionEffects = {
  /** Tells the proposer through their Connector. */
  notifyDecision: ({ actionId, ownerId, authorId, accepted }) =>
    deliver({ kind: "decision", actionId, senderId: ownerId, recipientId: authorId, text: accepted ? "accepted" : "declined" }),
  afterValue: onValue,
};

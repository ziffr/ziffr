// Submitting values (GLOSSARY: Observation, Submission Rule, Token, Lock, Correction, Contact, Feed, Import). Values arrive
// by Slack, mail, a personal form link, a program with an Access Key or a Feed, and are recorded under their sender,
// members, Contacts and Feeds alike; a Metric owner
// accepts or declines Corrections. Every lookup stays inside one Workspace.
import { db } from "./db";
import { insertSealed, openNames, openRows } from "./sealed-columns";
import { formatValue, SOURCE_LABEL } from "./format";
import { isArchived, normalizeMetric } from "./metric-row";
import { readAnswer, type AnswerReading } from "./numbers";
import { answerReadingOf, numberStyleOf } from "./workspace-settings";
import { parseBreakdown } from "./parse";
import { peopleOf, recogniseSender, type ContactRow } from "./people";
import { tokenValid } from "./tokens";
import { Forbidden, type Actor } from "./actor";
import { deliver } from "./deliveries";
import { onValue } from "./workflow-engine";
import { audit } from "./audit-log";
import { ARCHIVED_CODE, ARCHIVED_REFUSAL } from "./archived-metrics";
import type { Metric, Profile, SourceId, Token } from "./types";
import { JANUARY, periodLabel, periodStart, shiftPeriod, type Span, type YearStart } from "./periods";
import { yearStartOf } from "./fiscal-year";

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
  /** Set only by recordPastedValues (paste-values.ts), never from what a browser sends: the value is a cell of a
   * paste (spec 0026), already read into `value` and `period`, and `text` is the cell as it was. With `import`, its
   * Metric Owner or an Owner or Admin chose to record it as history: for a past period with no value yet it is an
   * Import. Honoured on the web form only, the Source a signed-in person's own values arrive on. */
  paste?: { import?: boolean };
  /** The workspace the message is meant for. A form link's Token says it itself; Slack and mail need it, since the
   * same handle or address may be known in several workspaces. */
  workspaceId?: string;
};

/** What became of a submission, in words for the sender. */
export type SubmissionResult = { outcome: string; detail: string; ok: boolean; metricSlug?: string; imported?: boolean };

/** What the intake log marks a value with: `paste` for a cell of a paste, and `import` beside it when it was recorded
 * as history (spec 0026). Read by the Metric's history and the intake log. */
export type IntakeMark = "paste" | "import";

/** What a submission sets off: the owner hears about a late value, a new value goes to its Workflow. Tests pass
 * their own; everyone else gets the core's. */
export type SubmissionEffects = {
  /** Tells the Metric owner about a late value proposed as a Correction. */
  notifyCorrection: (e: { actionId: number; senderId: string; ownerId: string; value: number }) => Promise<void>;
  /** Hands a new value to the Metric's Workflow; returns what it did, in words. An Import skips the check. */
  afterValue: (metricId: number, period: string, submitterId: string, opts?: { imported?: boolean }) => Promise<string[]>;
};

/** Takes a value that arrived by Slack, mail or a personal form link (GLOSSARY: Submission Rule, Token, Lock).
 * There is no signed-in Actor: the sender is known by their Token or their identity on the Source, which may be a
 * Contact without a login. Everything is looked up in one workspace only: the Token's, or the one given for Slack
 * and mail. `provenSenderId` is for a Connector that proved who wrote (Slack signs it, spec 0007): the sender is then
 * that person of the workspace, not whoever `sender` names. It is never taken from what a browser sends. */
export function submitValue(input: SubmissionInput, effects: SubmissionEffects = submissionEffects, provenSenderId?: string): Promise<SubmissionResult> {
  return takeValue(input, effects, provenSenderId, false, recordObservation);
}

/** What submitValue would do with a value, saving nothing: no value, no log entry, no proposal, no Workflow step.
 * For the demo's simulated channels, where nothing a visitor does is saved (#271). */
export function previewValue(input: SubmissionInput): Promise<SubmissionResult> {
  return takeValue(input, { notifyCorrection: async () => {}, afterValue: async () => [] }, undefined, true, previewObservation);
}

/** A Prompt answered by a value: it asks no more. Not for a preview, which saves nothing. */
async function markAnswered(promptId: number, preview: boolean): Promise<void> {
  if (!preview) await db().from("prompts").update({ answered_at: new Date().toISOString() }).eq("id", promptId);
}

async function takeValue(input: SubmissionInput, effects: SubmissionEffects, provenSenderId: string | undefined, preview: boolean, record: Recording): Promise<SubmissionResult> {
  let workspaceId = input.workspaceId;
  // A paste arrives on the web form only; anywhere else the field is ignored, as `import` is for anyone but a Feed.
  const pasted = input.source === "web_form" && input.paste ? input.paste : null;
  const log = async (r: SubmissionResult & { senderId?: string | null; metricId?: number | null; token?: string | null; observationId?: number | null }) => {
    const marks: IntakeMark[] = pasted ? (r.imported ? ["paste", "import"] : ["paste"]) : [];
    // Logged in the workspace it was meant for; a link that matches no Token belongs to none and is not logged.
    // Sealed (spec 0028): the sender's address and what they wrote are a Workspace's words.
    if (workspaceId && !preview) await insertSealed("intake_log", workspaceId, [{
      source: input.source,
      sender: input.sender,
      sender_id: r.senderId ?? null,
      raw: input.text,
      metric_id: r.metricId ?? null,
      token_code: r.token ?? null,
      outcome: r.outcome,
      detail: r.detail,
      observation_id: r.observationId ?? null,
      marks,
    }]);
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
      how = viaWords(input.source, pasted !== null, feed !== null);
    } else {
      const names = candidates.map((t) => metricById[t.metric_id]?.name).join(", ");
      return log({ ok: false, senderId, outcome: "rejected_ambiguous", detail: `${sender?.name} has Tokens for ${names}. Reply to a Prompt or name the metric.` });
    }
  }
  const metric = metricById[token.metric_id];
  const base = { senderId, metricId: metric.id, token: token.code, metricSlug: metric.slug };

  const closed = closedTo(metric, input.source);
  if (closed) return log({ ...base, ok: false, ...closed });

  // 3. What value, for which period? A program names both; a breakdown's total (or the sum of its rows) is the value
  // for the Prompt's or the current period; any other text is read as an answer (numbers.ts, spec 0022).
  const [style, workspaceYearStart, reading] = await Promise.all([numberStyleOf(workspaceId), yearStartOf(workspaceId), answerReadingOf(workspaceId)]);
  // A day, week or month is the same whatever the year start; quarters and years follow the workspace's.
  const ys: YearStart = metric.period === "quarter" || metric.period === "year" ? workspaceYearStart : JANUARY;
  const current = periodStart(new Date(), metric.period, ys);
  // A program names its value and period; so does a paste, whose cells the paste reader has read already.
  const given = input.source === "api" || pasted !== null;
  const sent = given ? input.value : undefined;
  const breakdown = sent ? (sent.breakdown?.length ? { rows: sent.breakdown, total: sent.value } : null) : parseBreakdown(input.text, style);
  const rowsSum = breakdown ? breakdown.rows.reduce((a, r) => a + r.value, 0) : 0;
  let value: number | null;
  let period: string;
  if (sent || breakdown) {
    value = sent ? (Number.isFinite(sent.value) ? sent.value : null) : breakdown ? (breakdown.total ?? rowsSum) : null;
    if (value === null) return log({ ...base, ok: false, outcome: "rejected_no_value", detail: "Couldn’t find a number in the message." });
    const named = given && input.period ? input.period : null;
    if (named && periodStart(new Date(`${named}T00:00:00`), metric.period, ys) !== named)
      return log({ ...base, ok: false, outcome: "rejected_period", detail: `${named} is not the first day of a ${metric.period} of ${metric.name}.` });
    if (named && named > current) return log({ ...base, ok: false, outcome: "rejected_period", detail: `${named} is in the future.` });
    period = named ?? prompt?.period_start ?? current;
  } else {
    // Period words are read with the workspace's Fiscal Year even for a monthly Metric, so the reply names "Q3"
    // rightly when it says that is not one of its periods.
    const answer = readAnswer(input.text, { style, today: new Date(), period: metric.period, yearStart: workspaceYearStart, promptPeriod: prompt?.period_start ?? null, ...reading });
    if (!answer.ok) return log({ ...base, ok: false, ...askBack(answer, metric, workspaceYearStart, prompt?.period_start ?? current) });
    value = answer.value;
    period = answer.period;
  }
  // The reply writes values the way the workspace does, so a misreading shows at once.
  const fv = (v: number) => formatValue(metric, v, style);
  const when = midSentence(periodLabel(period, metric.period, ys));

  // A locked period takes no more values: a late one becomes a proposal for the metric owner (GLOSSARY: Lock).
  if (await isLocked(metric.id, period)) {
    if (preview) return log({ ...base, ok: false, outcome: "proposed_locked", detail: `${metric.name}, ${when} is locked. ${fv(value)} would go to ${metric.owner_id === senderId ? "you" : "the metric owner"} as a proposed correction.` });
    // It proposes a change to the value already there (GLOSSARY: Correction), so accepting it replaces that value.
    const { data: latest } = await db().from("observations").select("id").eq("metric_id", metric.id).eq("period_start", period).order("created_at", { ascending: false }).limit(1);
    const [a] = await insertSealed("actions", workspaceId, [{
      metric_id: metric.id, period_start: period, observation_id: latest?.[0]?.id ?? null, asker_id: senderId, assignee_id: metric.owner_id, kind: "question", purpose: "approval",
      question: `${metric.name} for ${when} is locked. ${sender?.name.split(" ")[0]} sent ${fv(value)} late: accept it as a correction?`,
    }]) as { id: number }[];
    if (a) {
      await insertSealed("thread_messages", workspaceId, [{ action_id: a.id, author_id: senderId, body: "Late value for a locked period.", correction_value: value, correction_status: "proposed" }]);
      if (senderId) await effects.notifyCorrection({ actionId: a.id, senderId, ownerId: metric.owner_id, value });
    }
    return log({ ...base, ok: false, outcome: "proposed_locked", detail: `${metric.name}, ${when} is locked. ${fv(value)} went to ${metric.owner_id === senderId ? "you" : "the metric owner"} as a proposed correction.` });
  }

  // 4. Submission Rule, applied in one call to the database with the breakdown's rows (spec 0022, #111 and #126):
  // two values arriving together wait for each other there, so both count under "add", the second is rejected under
  // "reject" and replaces the first under "overwrite", and no Breakdown row is lost or mixed with another value's.
  const row = { submitter_id: senderId, source: input.source, access_key_id: input.source === "api" ? (input.accessKeyId ?? null) : null };
  // An Import: a Feed's value, or a paste recorded as history, for a past period with no value yet. Only those, only
  // the past, only an empty period (the database checks that one): the current period and anything that replaces a
  // value are checked as anyone's. Who may record a paste as history is checked before (paste-values.ts).
  // A paste as history is checked here again, not only by its caller: its sender owns the Metric or is an Owner or
  // Admin of the Workspace (spec 0026).
  const historyAllowed = pasted?.import ? await mayRecordHistory(workspaceId, senderId, metric) : false;
  const mayImport = importable(Boolean((input.import && feed) || historyAllowed), period, current, metric.period);
  const rows = (breakdown?.rows ?? []).map((r) => ({ label: r.label, value: r.value }));
  const { data, error } = await record(metric, period, value, row, mayImport, rows);
  // Archived between the check above and the write: the database refuses it the same way.
  if (error?.code === ARCHIVED_CODE) return log({ ...base, ok: false, outcome: "rejected_archived", detail: ARCHIVED_REFUSAL });
  // The database's own words stay in the server log: they name tables and constraints, not anything a person can act on.
  if (error || !data) {
    console.error("record_observation failed:", error?.message ?? "no row");
    throw new Error("The value could not be recorded. Try again in a moment.");
  }
  const imported = mayImport && data.outcome === "recorded";
  const before = data.before === null ? null : Number(data.before);
  const result: SubmissionResult = (() => {
    switch (data.outcome) {
      case "recorded": return { ok: true, outcome: "recorded", detail: `${fv(value)} ${imported ? "imported" : "recorded"} for ${metric.name}, ${when} (via ${how}).`, imported };
      case "added": return { ok: true, outcome: "added", detail: `${fv(before!)} + ${fv(value)} = ${fv(Number(data.after))} for ${metric.name}, ${when}.`, imported: false };
      case "overwritten": return { ok: true, outcome: "overwritten", detail: `Replaced ${fv(before!)} with ${fv(value)} for ${metric.name}, ${when}.` };
      case "kept_both": return { ok: true, outcome: "kept_both", detail: `Kept ${fv(value)} alongside ${data.earlier} earlier value(s) for ${metric.name}, ${when}.` };
      default: return { ok: false, outcome: "rejected_duplicate", detail: `${metric.name} already has ${fv(before!)} for ${when}, and its rule rejects a second value.` };
    }
  })();
  if (breakdown && result.ok) {
    const off = breakdown.total !== null && Math.abs(rowsSum - breakdown.total) > Math.abs(breakdown.total) * 0.001;
    result.detail += ` With a breakdown of ${breakdown.rows.length} rows.${off ? ` The rows add up to ${fv(rowsSum)}, the total says ${fv(breakdown.total!)}; the total counts.` : ""}`;
  }
  if (prompt && result.ok) await markAnswered(prompt.id, preview);
  // The metric's Workflow takes it from here: check, approval, publish.
  if (result.ok && senderId) {
    const next = await effects.afterValue(metric.id, period, senderId, { imported });
    if (next.length) result.detail += ` Workflow: ${next.join("; ")}.`;
  }
  // The value it became, so the intake log and the Metric's history can say how it arrived.
  return log({ ...base, ...result, observationId: result.ok ? data.observation_id : null });
}

/** How a value with the sender's only Token arrived, in words for the reply. */
function viaWords(source: SourceId, pasted: boolean, feed: boolean): string {
  if (pasted) return "paste";
  if (source === "web_form") return "personal form link";
  if (source === "api") return feed ? "Feed" : "Access Key";
  return "sender’s only Token";
}

/** Whether a person may record a paste as history for a Metric: its Metric Owner, or an Owner or Admin. */
async function mayRecordHistory(ws: string, personId: string | null, metric: Metric): Promise<boolean> {
  if (!personId) return false;
  if (metric.owner_id === personId) return true;
  const { data } = await db().from("memberships").select("role").eq("workspace_id", ws).eq("user_id", personId).maybeSingle();
  return data?.role === "owner" || data?.role === "admin";
}

/** Whether a value asked to be an Import may be one: for a past period, at most 1,000 periods back. */
function importable(asked: boolean, period: string, current: string, span: Metric["period"]): boolean {
  return asked && period < current && period >= importFloor(current, span);
}

/** Why a Metric takes no value from this Source at all, or null when it may: a Derived Metric is computed, an
 * Archived Metric takes none by any Source (a Feed's other Metrics go on), and the API is a Source of its own (spec
 * 0012), so a Metric takes programs' and Feeds' values only where it says so. */
function closedTo(metric: Metric, source: SourceId): { outcome: string; detail: string } | null {
  if (metric.formula) return { outcome: "rejected_derived", detail: `${metric.name} is a Derived Metric and is computed, never submitted.` };
  if (isArchived(metric)) return { outcome: "rejected_archived", detail: ARCHIVED_REFUSAL };
  if (!metric.sources.includes(source)) return { outcome: "rejected_source", detail: `${metric.name} doesn’t accept values from ${SOURCE_LABEL[source]}.` };
  return null;
}

type Recorded = { observation_id: number; outcome: string; before: number | string | null; after: number | string; earlier: number };
type Recording = (metric: Metric, period: string, value: number, row: { submitter_id: string | null; source: string; access_key_id: number | null }, imported: boolean, rows: { label: string; value: number }[]) => Promise<{ data: Recorded | null; error: { message: string; code?: string } | null }>;

/** Records a value under its Metric's Submission Rule, in one call to the database. */
const recordObservation: Recording = async (metric, period, value, row, imported, rows) =>
  db().rpc("record_observation", {
    p_metric: metric.id, p_period: period, p_rule: metric.submission_rule, p_value: value, p_submitter: row.submitter_id, p_source: row.source,
    p_access_key: row.access_key_id, p_imported: imported, p_rows: rows,
  }).single<Recorded>();

/** What record_observation would answer for a value under its Metric's Submission Rule, read without writing (see the
 * migration 20261212090000_breakdown_rows_atomic.sql, whose rules this follows). For the demo, which saves nothing. */
const previewObservation: Recording = async (metric, period, value) => {
  const { data } = await db().from("observations").select("id, value").eq("metric_id", metric.id).eq("period_start", period).order("created_at", { ascending: false }).order("id", { ascending: false });
  const found = data ?? [];
  if (!found.length) return { data: { observation_id: 0, outcome: "recorded", before: null, after: value, earlier: 0 }, error: null };
  const before = Number(found[0].value);
  const at = (outcome: string, after: number) => ({ data: { observation_id: Number(found[0].id), outcome, before, after, earlier: found.length }, error: null });
  const rule = metric.submission_rule;
  if (rule === "keep_both") return { data: { observation_id: 0, outcome: "kept_both", before, after: value, earlier: found.length }, error: null };
  if (rule === "reject") return at("rejected_duplicate", before);
  if (rule === "overwrite") return at("overwritten", value);
  return at("added", Math.round((before + value) * 1e6) / 1e6);
};

/** A period's name inside a sentence: "week of 9 Nov 2026". */
function midSentence(label: string): string {
  return label.replace(/^Week of/, "week of");
}

const SPAN_NOUN: Record<Span, string> = { day: "day", week: "week", month: "month", quarter: "quarter", half: "half-year", year: "year" };

/** "“2”", "“2” and “1”", "“2”, “1” and “3”": what an answer held, as the sender wrote it. */
function listed(items: string[]): string {
  const q = items.map((t) => `“${t.trim()}”`);
  return q.length < 2 ? q.join("") : `${q.slice(0, -1).join(", ")} and ${q[q.length - 1]}`;
}

/** Why an answer recorded nothing, as an outcome and a reply that asks back, naming what was found (spec 0022:
 * a wrong number recorded quietly is worse than a question). */
function askBack(a: Exclude<AnswerReading, { ok: true }>, metric: Metric, yearStart: YearStart, fallback: string): { outcome: string; detail: string } {
  const label = (start: string, span: Span) => midSentence(periodLabel(start, span, yearStart));
  const forNow = label(fallback, metric.period);
  switch (a.reason) {
    case "no_number":
      return { outcome: "rejected_no_value", detail: "Couldn’t find a number in the message." };
    case "unreadable_number":
      return { outcome: "rejected_no_value", detail: `Couldn’t read ${listed([a.text])} as a number. Nothing was recorded.` };
    case "several_numbers":
      return { outcome: "rejected_several_numbers", detail: `Found several numbers: ${listed(a.numbers)}. Nothing was recorded: send the value for ${metric.name} alone.` };
    case "year_or_value": {
      const period = a.named.text.slice(0, -a.year.length).trim();
      return { outcome: "rejected_several_numbers", detail: `${listed([a.year])} after ${listed([period])} could be its year or the value. Nothing was recorded: send the value with the period, such as “${period}: ${a.year}”, or the period with the value, such as “${a.named.text}: 12”.` };
    }
    case "several_periods":
      return { outcome: "rejected_several_periods", detail: `Found several periods: ${listed(a.named.map((w) => w.text))}. Nothing was recorded: name one, or send the value alone for ${forNow}.` };
    case "no_such_period":
      return { outcome: "rejected_period", detail: `${listed([a.named.text])} is no ${SPAN_NOUN[a.named.span]} there is. Nothing was recorded.` };
    case "not_a_period_of_metric":
      return { outcome: "rejected_not_a_period", detail: `${metric.name} counts by ${SPAN_NOUN[metric.period]}, and ${listed([a.named.text])} is ${label(a.named.start, a.named.span)}. Nothing was recorded: name a ${SPAN_NOUN[metric.period]}, or send the value alone for ${forNow}.` };
    case "other_period": {
      const asked = label(a.promptPeriod, metric.period);
      const said = label(a.period, metric.period);
      return { outcome: "rejected_other_period", detail: `This Prompt asks for ${asked}, but ${listed([a.named.text])} is ${said}. Nothing was recorded: for ${asked}, reply with the value alone; for ${said}, send it as a new message.` };
    }
    case "future_period":
      return { outcome: "rejected_period", detail: `${listed([a.named.text])} is ${label(a.period, metric.period)}, which has not begun yet. Nothing was recorded.` };
  }
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
  // A Contact's details are sealed (spec 0028): opened here, the one place they are loaded.
  const opened = contactDetails ? await openRows("contacts", ws, (contacts ?? []) as unknown as Record<string, unknown>[]) : (contacts ?? []);
  const rows = (opened as unknown as Partial<ContactRow>[]).map((c) => ({ email: null, slack_handle: null, phone: null, ...c }) as ContactRow);
  const ids = [...(members ?? []).map((m) => m.user_id as string), ...rows.map((c) => c.person_id)];
  if (!ids.length) return [];
  const { data } = await db().from("profiles").select("*").in("id", ids);
  const memberIds = new Set((members ?? []).map((m) => m.user_id as string));
  // Sorted here, not by the database: a Contact's name is sealed, so its order there means nothing.
  const profiles = ((await openNames(ws, (data ?? []) as Profile[])) as Profile[]).sort((a, b) => a.name.localeCompare(b.name));
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
  const { data: msg } = await db().from("thread_messages").select("*, actions(*, metrics(owner_id, archived_at))").eq("id", messageId).eq("workspace_id", actor.workspaceId).maybeSingle();
  if (!msg || msg.actions?.metrics?.owner_id !== actor.personId) throw new Forbidden();
  // An Archived Metric takes no values, a Correction neither; it stays proposed for when the Metric is brought back.
  if (accept && msg.actions?.metrics?.archived_at) throw new Error(ARCHIVED_REFUSAL);
  // Decided once only: the status changes first and only if it was still proposed, so a second click does nothing.
  const { data: claimed } = await db().from("thread_messages").update({ correction_status: accept ? "accepted" : "declined" }).eq("id", messageId).eq("workspace_id", actor.workspaceId).eq("correction_status", "proposed").select("id");
  if (!claimed?.length) return;
  const act = msg.actions as { metric_id: number; period_start: string; observation_id: number | null };
  if (accept) {
    let written: { error: { code?: string } | null };
    if (act.observation_id) {
      // Only the value of this Metric in this workspace is changed.
      const { data: obs } = await db().from("observations").select("value, original_value").eq("id", act.observation_id).eq("workspace_id", actor.workspaceId).eq("metric_id", act.metric_id).maybeSingle();
      if (!obs) throw new Forbidden();
      written = await db().from("observations").update({ value: msg.correction_value, original_value: obs.original_value ?? obs.value }).eq("id", act.observation_id).eq("workspace_id", actor.workspaceId).eq("metric_id", act.metric_id);
    } else {
      written = await db().from("observations").insert({ metric_id: act.metric_id, period_start: act.period_start, value: msg.correction_value, submitter_id: msg.author_id, source: "web_form", workspace_id: actor.workspaceId });
    }
    // The value was not written (archived in the meantime, or the database refused it): the Correction stays proposed.
    if (written.error) {
      // The database's own words stay in the server log; the person gets Ziffr's.
      if (written.error.code !== ARCHIVED_CODE) console.error("Accepting a Correction failed:", (written.error as { message?: string }).message ?? written.error.code);
      await db().from("thread_messages").update({ correction_status: "proposed" }).eq("id", messageId).eq("workspace_id", actor.workspaceId).eq("correction_status", "accepted");
      throw new Error(written.error.code === ARCHIVED_CODE ? ARCHIVED_REFUSAL : "The Correction could not be saved. Try again in a moment.");
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

// Submitting values (GLOSSARY: Observation, Submission Rule, Token, Lock, Correction, Contact, Feed, Import). Values arrive
// by Slack, mail, a personal form link, a program with an Access Key or a Feed, and are recorded under their sender,
// members, Contacts and Feeds alike; a Metric owner
// accepts or declines Corrections. Every lookup stays inside one Workspace.
import { decideProposedNote, notesAfterValue, noteWithProposal, type NoteArriving, type NoteSaved } from "./value-note-store";
import { announceNewAction } from "./action-state";
import { askedPeriods } from "./asked-periods";
import { db } from "./db";
import { insertSealed, openNames, openOne, openRows, reserveIds, sealRow } from "./sealed-columns";
import { formatValue, SOURCE_LABEL } from "./format";
import { answeredMeanwhile, LINK_PERIOD_REFUSED } from "./form-link-rules";
import { isArchived, normalizeMetric } from "./metric-row";
import { readAnswer, type AnswerReading } from "./numbers";
import { NUMBER_STYLE_MARKS, type NumberStyle } from "./number-style";
import { answerReadingOf, numberStyleOf } from "./workspace-settings";
import { readParents } from "@ziffr/pack/breakdown-parents";
import { BREAKDOWN_REFUSED, BREAKDOWN_REFUSED_EXISTING, recordObservation, type BreakdownInput, type Recording } from "./record-value";
import { addUp } from "./adding-up";
import { parseBreakdown } from "./parse";
import { peopleOf, recogniseSender, type ContactRow } from "./people";
import { tokenValid } from "./tokens";
import { Forbidden, type Actor } from "./actor";
import { deliver } from "./deliveries";
import { onValue } from "./workflow-engine";
import { settlePrompts } from "./prompt-ways";
import { audit } from "./audit-log";
import { ownerFillStage, standInFillStage, standInLateRefusal, type Filled } from "./fill-in-check";
import { enteredByWords, settleFilled } from "./fill-in-tell";
import { personBlocked } from "./user-block";
import { ARCHIVED_CODE, ARCHIVED_REFUSAL } from "./archived-metrics";
import { CONDENSED_CODE, condensedOn, condensedRefusal, condensedWords } from "./condensed-values";
import type { Metric, Profile, SourceId, Token } from "./types";
import { JANUARY, periodLabel, periodStart, shiftPeriod, type Span, type YearStart } from "./periods";
import { yearStartOf } from "./fiscal-year";
import { visitHeaders } from "./demo-visit-scope";
import { demoValuePeriodRefusal } from "./demo-values";

/** A value as it arrived: who sent it on which Source, the text, and the Prompt it answers if any. */
export type SubmissionInput = {
  source: SourceId;
  /** Slack handle, mail address, or (web form and API) the token code. */
  sender: string;
  text: string;
  promptId?: number;
  /** A note sent with the value (GLOSSARY: Value Note; spec 0064), untrusted: checked where it is saved, after the
   * value, which it never blocks. A program's longer note is not saved; any other is cut. */
  valueNote?: unknown;
  /** A program's value as it sent it, instead of a number found in `text` (source "api", and the values named below). */
  value?: { value: number; breakdown?: BreakdownInput[] };
  /** The period a program names; otherwise the current one, or the Prompt's (source "api", and the values named below). */
  period?: string;
  /** Set only by a reply that took an offer (prompt-reply.ts), never from what anyone sends: the number the person was
   * offered and said "yes" to, in `value` and `period`, instead of a number read from `text`. */
  offered?: boolean;
  /** Set only by the reply reading (prompt-reply.ts): why the reply gives no value. Everything is checked as for any
   * answer, nothing is recorded, and the sender is asked back in these terms. */
  unread?: Exclude<AnswerReading, { ok: true }>;
  /** The first day of the period picked on the personal form link, as the browser sent it: untrusted. Honoured on the web
   * form only, and only for the running period or one this Token was asked for and still owes (asked-periods.ts). */
  formPeriod?: string;
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
  /** Set only by recordOwnValue (record-own-value.ts), never from what a browser sends: the value and period were typed
   * on the Metric's own page by a signed-in Submitter and are already read into `value` and `period`. Honoured on the
   * web form only. Unlike `paste`, it marks nothing and gives no right to record history. */
  typed?: boolean;
  /** Set only by fillInValue (fill-in.ts), never from what a browser sends: the Metric's owner or the Workflow's owner
   * `by` enters this value for the person whose Token `sender` is (spec 0046, GLOSSARY: Filled-in Value). Honoured on the
   * web form only, with a value read already; the core checks again, for this person and this period, that `by` may. */
  filledIn?: { by: string };
  /** The workspace the message is meant for. A form link's Token says it itself; Slack and mail need it, since the
   * same handle or address may be known in several workspaces. */
  workspaceId?: string;
};

/** What became of a submission, in words for the sender. */
export type SubmissionResult = { outcome: string; detail: string; ok: boolean; metricSlug?: string; imported?: boolean; /** What became of the note sent with the value; absent when none was sent. */ valueNote?: NoteSaved };

/** What the intake log marks a value with: `paste` for a cell of a paste, and `import` beside it when it was recorded
 * as history (spec 0026). Read by the Metric's history and the intake log. */
export type IntakeMark = "paste" | "import";

/** What a submission sets off: the owner hears about a late value, a new value goes to its Workflow. Tests pass
 * their own; everyone else gets the core's. */
export type SubmissionEffects = {
  /** Tells the Metric owner about a late value proposed as a Correction. */
  notifyCorrection: (e: { actionId: number; senderId: string; ownerId: string; value: number }) => Promise<void>;
  /** Hands a new value to the Metric's Workflow; returns what it did, in words. An Import skips the check. With
   * `withoutDetails` the words give no reason and name nobody. */
  afterValue: (metricId: number, period: string, submitterId: string, opts?: { imported?: boolean; withoutDetails?: boolean }) => Promise<string[]>;
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
    return { outcome: r.outcome, detail: r.detail, ok: r.ok, metricSlug: r.metricSlug, ...(r.imported ? { imported: true } : {}), ...(r.valueNote ? { valueNote: r.valueNote } : {}) };
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
  const metrics = (await openRows("metrics", workspaceId, metricRows)).map(normalizeMetric) as Metric[];
  const live = (tokens ?? []).filter((t) => tokenValid(t, tokens ?? []));
  const metricById = Object.fromEntries(metrics.map((m) => [m.id, m]));
  const found = await findSender(input, workspaceId, provenSenderId, profiles, live);
  if ("refused" in found) return log({ ok: false, ...found.refused });
  const { sender, feed, candidates } = found;
  const senderId: string = sender.id;
  // A Blocked User records nothing, by any way in (spec 0066). A value someone else enters for them is that person's act.
  if (!feed && !input.filledIn && (await personBlocked(senderId))) return log({ ok: false, senderId, outcome: "rejected_no_token", detail: "This account is blocked, so nothing was recorded." });
  if (candidates.length === 0) return log({ ok: false, senderId, outcome: "rejected_no_token", detail: `${sender?.name} has no Token for any metric, so nothing can be recorded.` });

  // 2. Which metric? Prompt reply > metric named in the message (among the sender's own Tokens) > the only Token.
  const chosen = await chooseToken(input, workspaceId, sender, candidates, metricById, pasted !== null, feed !== null);
  if ("refused" in chosen) return log({ ok: false, senderId: sender.id, ...chosen.refused });
  const { token, prompt, how } = chosen;
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
  // A program names its value and period; so does a paste, whose cells the paste reader has read already, and a value typed on the Metric's page.
  const given = valueIsGiven(input, pasted !== null);
  const byLink = typedOnLink(input.source, given);
  const sent = given ? input.value : undefined;
  // The period the value answers when it names none itself: the one picked on the form link, else the Prompt's.
  const form = await formPick(input, { byLink, ws: workspaceId, metric, token, current, yearStart: ys, promptPeriod: prompt?.period_start ?? null });
  if ("refused" in form) return log({ ...base, ok: false, ...form.refused });
  const breakdown = breakdownOf(input, sent, style);
  // Rows that are parts of others (spec 0041, ticket 12) are checked before anything is looked up or written: a list that
  // is refused is refused whole, in words, whichever way it came in (a program, a form, a message, a Feed).
  const parents = breakdown ? readParents(breakdown.rows) : null;
  if (parents && !parents.ok) return log({ ...base, ok: false, outcome: "rejected_breakdown", detail: parents.problem });
  // Only the top-level rows add up to the whole: a part is already counted in the row it is a part of.
  const rowsSum = breakdown ? breakdown.rows.reduce((a, r) => (typeof r.parent === "string" && r.parent.trim() !== "" ? a : a + r.value), 0) : 0;
  let value: number | null;
  let period: string;
  if (sent || breakdown) {
    value = sent ? (Number.isFinite(sent.value) ? sent.value : null) : breakdown ? (breakdown.total ?? rowsSum) : null;
    if (value === null) return log({ ...base, ok: false, outcome: "rejected_no_value", detail: "Couldn’t find a number in the message." });
    const named = given && input.period ? input.period : null;
    if (named && periodStart(new Date(`${named}T00:00:00`), metric.period, ys) !== named)
      return log({ ...base, ok: false, outcome: "rejected_period", detail: `${named} is not the first day of a ${metric.period} of ${metric.name}.` });
    if (named && named > current) return log({ ...base, ok: false, outcome: "rejected_period", detail: `${named} is in the future.` });
    period = named ?? form.asked ?? current;
  } else {
    // Period words are read with the workspace's Fiscal Year even for a monthly Metric, so the reply names "Q3"
    // rightly when it says that is not one of its periods.
    // A period picked on the form holds like a Prompt's: words naming another one record nothing.
    const answer = input.unread ?? readAnswer(input.text, { style, today: new Date(), period: metric.period, yearStart: workspaceYearStart, promptPeriod: form.asked, ...reading });
    if (!answer.ok) return log({ ...base, ok: false, ...unread(byLink, answer, metric, workspaceYearStart, form.asked ?? current, input.source === "web_form" ? style : null, form.picked) });
    value = answer.value;
    period = answer.period;
  }
  const may = await periodStage({ byLink, preview, ws: workspaceId, metric, token, period, current, yearStart: ys });
  if ("refused" in may) return log({ ...base, ok: false, ...may.refused });
  // The reply writes values the way the workspace does, so a misreading shows at once.
  const fv = (v: number) => formatValue(metric, v, style);
  const when = midSentence(periodLabel(period, metric.period, ys));

  // A value entered for the submitter (spec 0046, GLOSSARY: Filled-in Value): by the Metric's or the Workflow's owner
  // (fillInValue, on the web form), or by a Stand-in answering a Prompt sent in someone's place. Whom it is for and who
  // entered it are decided here from what the core knows, never from what the sender wrote. A Guest who is a Stand-in
  // keeps recording their own value, as before: a Guest cannot fill in for someone.
  const ownerFill = await ownerFillStage(workspaceId, metric, period, { by: input.filledIn?.by, source: input.source, given, preview }, senderId, token);
  if (ownerFill && "refused" in ownerFill) return log({ ...base, ok: false, outcome: "rejected_fill_in", detail: ownerFill.refused });
  let filled: Filled | null = ownerFill?.filled ?? null;

  // A condensed period takes no more values, as if locked for good, and no proposal either: the originals are gone
  // (spec 0033). It is refused with the day it was condensed, whatever the Source.
  const condensedDay = await condensedOn(workspaceId, metric.id, period);
  if (condensedDay) return log({ ...base, ok: false, outcome: "rejected_period_condensed", detail: condensedRefusal(condensedDay) });

  // A locked period takes no more values: a late one becomes a proposal for the metric owner (GLOSSARY: Lock).
  if (await isLocked(metric.id, period)) return log({ ...base, ...(await lateValue({ ws: workspaceId, metric, period, value, note: noteOf(input, senderId), senderName: sender?.name, senderId, preview, fv, when, notify: effects.notifyCorrection }, { filled: Boolean(filled || ownerFill), source: input.source, token, prompt })) });

  // A Stand-in's answer to a Prompt sent in someone's place is the submitter's value, entered by the Stand-in; asked after
  // the Lock, so a late one is still proposed as a Correction, as any late value is.
  const standFill = filled || ownerFill ? null : await standInFillStage(workspaceId, metric, period, { source: input.source, preview }, senderId, token.stands_in_for ?? prompt?.stands_in_for ?? null);
  if (standFill && "refused" in standFill) return log({ ...base, ok: false, outcome: "rejected_fill_in", detail: standFill.refused });
  filled = standFill?.filled ?? filled;

  // 4. Submission Rule, applied in one call to the database with the breakdown's rows (spec 0022, #111 and #126):
  // two values arriving together wait for each other there, so both count under "add", the second is rejected under
  // "reject" and replaces the first under "overwrite", and no Breakdown row is lost or mixed with another value's.
  const submitterId = filled ? filled.forId : senderId;
  const row = { submitter_id: submitterId, entered_by: filled?.by ?? null, source: input.source, access_key_id: input.source === "api" ? (input.accessKeyId ?? null) : null };
  // An Import: a Feed's value, or a paste recorded as history, for a past period with no value yet. Only those, only
  // the past, only an empty period (the database checks that one): the current period and anything that replaces a
  // value are checked as anyone's. Who may record a paste as history is checked before (paste-values.ts).
  // A paste as history is checked here again, not only by its caller: its sender owns the Metric or is an Owner or
  // Admin of the Workspace (spec 0026).
  const historyAllowed = pasted?.import ? await mayRecordHistory(workspaceId, senderId, metric) : false;
  // A Filled-in Value is never an Import, so it never skips the Unusual Value check (spec 0046).
  const mayImport = !filled && importable(Boolean((input.import && feed) || historyAllowed), period, current, metric.period);
  // The core applies the rule and seals what it writes; the database only checks and stores (record-value.ts, spec 0028).
  const { data, error } = await record(workspaceId, may.rules, period, value, row, mayImport, breakdown?.rows ?? []);
  // Archived between the check above and the write: the database refuses it the same way.
  // Condensed in between (spec 0033): the database refuses it the same way.
  const raced = await refusedByDatabase(error, workspaceId, metric.id, period);
  if (raced) return log({ ...base, ok: false, ...raced });
  // The database's own words stay in the server log: they name tables and constraints, not anything a person can act on.
  if (error || !data) {
    console.error("recording a value failed:", error?.message ?? "no row");
    throw new Error("The value could not be recorded. Try again in a moment.");
  }
  const imported = mayImport && data.outcome === "recorded";
  const before = data.before === null ? null : Number(data.before);
  // A Filled-in Value the submitter replaces with their own says so: who had entered it (a Guest is told "a colleague").
  const replacedBy = data.replacedFilledIn ? await enteredByWords(workspaceId, submitterId, data.replacedFilledIn, profiles) : null;
  const result = outcomeWords(data, { metric, when, value, before, imported, how, replacedBy, fv, earlierByLink: may.earlierByLink });
  if (breakdown && result.ok) result.detail += breakdownWords(breakdown, rowsSum, fv);
  // The first accepted value closes the Prompt, by whichever way it arrived (prompt-ways.ts); one that comes second says so.
  if (result.ok && !preview) result.detail += await settlePrompts({ ws: workspaceId, prompt, metricId: metric.id, senderId, source: input.source, period, said: `${fv(value)} for ${metric.name}, ${when}.` });
  // A Filled-in Value closes every open Prompt of its Metric and period, the submitter's and the Stand-in's (spec 0046),
  // is recorded in the Audit Log, and tells the submitter. None of it can fail the value.
  if (result.ok && !preview && filled) result.detail = await settleFilled(workspaceId, { metric, period, value: fv(value), when, forId: filled.forId, by: filled.by, as: filled.as, awayBy: filled.awayBy, observationId: Number(data.observation_id), source: input.source, forName: profiles.find((p) => p.id === filled!.forId)?.name, detail: result.detail });
  // The period's notes follow the value (spec 0064): a replaced value's notes become history, and its own is added.
  const valueNote = await notesOfRecorded(workspaceId, input, { result, preview, filled, submitterId, metricId: metric.id, period, before, data });
  // The metric's Workflow takes it from here: check, approval, publish.
  if (result.ok && submitterId) {
    const next = await effects.afterValue(metric.id, period, submitterId, afterOptions(byLink, imported));
    if (next.length) result.detail += ` Workflow: ${next.join("; ")}.`;
  }
  // The value it became, so the intake log and the Metric's history can say how it arrived.
  return log({ ...base, ...result, valueNote, observationId: result.ok ? data.observation_id : null });
}

/** Who sent a submission and which Tokens of theirs it may use: the Token a form link or a key names, or the Tokens of the
 * person a Slack or mail identity belongs to (proven by the Connector where it signs). Or why it records nothing. */
async function findSender(input: SubmissionInput, ws: string, provenSenderId: string | undefined, profiles: Profile[], live: Token[]): Promise<{ sender: Profile; feed: Profile | null; candidates: Token[] } | { refused: { outcome: string; detail: string } }> {
  if (input.source === "web_form" || input.source === "api") {
    const t = live.find((t) => t.code === input.sender);
    if (!t) return { refused: { outcome: "rejected_no_token", detail: "This form link doesn’t match any Token." } };
    let sender = profiles.find((p) => p.id === t.submitter_id);
    let feed: Profile | null = null;
    // A Feed is nobody's colleague, so it is not among the people above; only a program reaches it, by its key.
    if (!sender && input.source === "api") {
      feed = await liveFeed(ws, t.submitter_id);
      sender = feed ?? undefined;
    }
    // A link of someone who is no longer a member or Contact here records nothing.
    if (!sender) return { refused: { outcome: "rejected_no_token", detail: "This form link is no longer in use." } };
    return { sender, feed, candidates: [t] };
  }
  const sender = provenSenderId ? profiles.find((p) => p.id === provenSenderId) : recogniseSender(profiles, input.source === "slack" ? "slack" : "mail", input.sender);
  if (!sender) return { refused: { outcome: "rejected_unknown_sender", detail: `${input.sender} isn’t a known ${SOURCE_LABEL[input.source]} identity of any user.` } };
  return { sender, feed: null, candidates: live.filter((t) => t.submitter_id === sender.id) };
}

/** The Prompt a submission answers, as stored. */
type AnsweredPrompt = { id: number; metric_id: number; period_start: string; submitter_id: string; answered_at: string | null; answered_source: string | null; stands_in_for: string | null };

/** Which of the sender's Tokens, and so which Metric, a submission is for: a reply to a Prompt, else the Metric named in the
 * message among the sender's own, else their only Token. Or why it records nothing. */
async function chooseToken(input: SubmissionInput, ws: string, sender: Profile, candidates: Token[], metricById: Record<number, Metric>, pasted: boolean, isFeed: boolean): Promise<{ token: Token; prompt: AnsweredPrompt | null; how: string } | { refused: { metricId?: number; outcome: string; detail: string } }> {
  if (input.promptId) {
    const { data } = await db().from("prompts").select("*").eq("id", input.promptId).eq("workspace_id", ws).maybeSingle();
    const prompt = data as AnsweredPrompt | null;
    // A Prompt is answered by the person it asked only (a Stand-in has Prompts of their own): its id is no key to another's.
    if (!prompt || prompt.submitter_id !== sender.id) return { refused: { outcome: "rejected_no_token", detail: "That Prompt is not known here." } };
    // A Prompt sent in someone's place is answered by the Token of that Stand-in, whatever other Tokens they hold: the
    // answer records under the right name (spec 0046). An older Prompt without it takes whichever Token fits.
    const forMetric = candidates.filter((t) => t.metric_id === prompt.metric_id);
    const token = prompt.stands_in_for ? forMetric.find((t) => t.stands_in_for === prompt.stands_in_for) : (forMetric.find((t) => !t.stands_in_for) ?? forMetric[0]);
    if (!token) return { refused: { metricId: prompt.metric_id, outcome: "rejected_no_token", detail: `${sender.name} has no Token for ${metricById[prompt.metric_id]?.name ?? "that metric"}.` } };
    return { token, prompt, how: "reply to a Prompt" };
  }
  // Only among the sender's own Tokens: a metric matches if a distinctive word of its name appears ("2 more deals" → Deals closed).
  const words = new Set(input.text.toLowerCase().match(/[a-z]+/g) ?? []);
  const stem = (w: string) => w.replace(/s$/, "");
  const named = candidates.filter((t) =>
    (metricById[t.metric_id]?.name.toLowerCase().match(/[a-z]+/g) ?? []).some((w) => w.length >= 4 && [...words].some((x) => stem(x) === stem(w))),
  );
  if (named.length === 1) return { token: named[0], prompt: null, how: "metric named in the message" };
  if (candidates.length === 1) return { token: candidates[0], prompt: null, how: viaWords(input.source, pasted, isFeed) };
  const names = candidates.map((t) => metricById[t.metric_id]?.name).join(", ");
  return { refused: { outcome: "rejected_ambiguous", detail: `${sender.name} has Tokens for ${names}. Reply to a Prompt or name the metric.` } };
}

/** What a recording answers the sender, in words (the intake's reply). */
function outcomeWords(data: { outcome: string; after: number | string; earlier: number }, c: { metric: Metric; when: string; value: number; before: number | null; imported: boolean; how: string; replacedBy: string | null; fv: (v: number) => string; earlierByLink: boolean }): SubmissionResult {
  const { metric, when, value, before, fv } = c;
  // An earlier period taken from a form link has its own words, should it be answered in the meantime (form-link-rules.ts).
  if (c.earlierByLink && before !== null) return answeredMeanwhile(data.outcome, `${fv(value)} recorded for ${metric.name}, ${when}.`);
  switch (data.outcome) {
    case "recorded": return { ok: true, outcome: "recorded", detail: `${fv(value)} ${c.imported ? "imported" : "recorded"} for ${metric.name}, ${when} (via ${c.how}).`, imported: c.imported };
    case "added": return { ok: true, outcome: "added", detail: `${fv(before!)} + ${fv(value)} = ${fv(Number(data.after))} for ${metric.name}, ${when}.`, imported: false };
    // A Filled-in Value the submitter replaced says who had entered it (spec 0046).
    case "overwritten": return { ok: true, outcome: "overwritten", detail: c.replacedBy ? `Replaced ${fv(before!)}, entered by ${c.replacedBy} for you, with ${fv(value)} for ${metric.name}, ${when}.` : `Replaced ${fv(before!)} with ${fv(value)} for ${metric.name}, ${when}.` };
    case "kept_both": return { ok: true, outcome: "kept_both", detail: `Kept ${fv(value)} alongside ${data.earlier} earlier value(s) for ${metric.name}, ${when}.` };
    default: return { ok: false, outcome: "rejected_duplicate", detail: `${metric.name} already has ${fv(before!)} for ${when}, and its rule rejects a second value.` };
  }
}

/** Whether a value is text typed on a personal form link: on the web form, and not read already by the core (a paste,
 * Record a value, a Filled-in Value). A form link has rules of its own for the periods it records and for its reply. */
function typedOnLink(source: SourceId, given: boolean): boolean {
  return source === "web_form" && !given;
}

/** Why text recorded nothing (askBack); a form link naming a period still to come gets its one fixed refusal. */
function unread(byLink: boolean, ...args: Parameters<typeof askBack>): { outcome: string; detail: string } {
  return byLink && args[0].reason === "future_period" ? LINK_PERIOD_REFUSED : askBack(...args);
}

/** Whether a value may be recorded for its period. A form link records the running period, or one asked of its Token
 * that is still due (asked-periods.ts). Such an earlier period is asked for as a first value, so it is written under
 * "reject". A visitor of the demo (spec 0051) enters values for the last two years up to the current period only, whichever way the value came in
 * (the form, a paste, a filled-in value, an answer in a simulated channel). The seed is never a visit. */
async function periodStage(i: { byLink: boolean; preview: boolean; ws: string; metric: Metric; token: Token; period: string; current: string; yearStart: YearStart }): Promise<{ refused: { outcome: string; detail: string } } | { earlierByLink: boolean; rules: Metric }> {
  const earlierByLink = i.byLink && i.period !== i.current;
  if (earlierByLink && !(await askedPeriods(i.ws, i.metric, i.token, i.current, i.yearStart)).includes(i.period)) return { refused: LINK_PERIOD_REFUSED };
  const outside = !i.preview && visitHeaders() ? demoValuePeriodRefusal(i.period, i.current, new Date()) : null;
  if (outside) return { refused: { outcome: "rejected_period", detail: outside } };
  return { earlierByLink, rules: earlierByLink ? { ...i.metric, submission_rule: "reject" } : i.metric };
}

/** What the Workflow is told with a new value: a form link's reply takes its short words. */
function afterOptions(byLink: boolean, imported: boolean): { imported: boolean; withoutDetails?: boolean } {
  return byLink ? { imported, withoutDetails: true } : { imported };
}

/** The words added to the reply for a value with a Breakdown, saying when its rows and its total disagree. */
function breakdownWords(breakdown: { rows: BreakdownInput[]; total: number | null }, rowsSum: number, fv: (v: number) => string): string {
  const off = breakdown.total !== null && Math.abs(rowsSum - breakdown.total) > Math.abs(breakdown.total) * 0.001;
  return ` With a breakdown of ${breakdown.rows.length} rows.${off ? ` The rows add up to ${fv(rowsSum)}, the total says ${fv(breakdown.total!)}; the total counts.` : ""}`;
}

/** A value for a locked period: refused for a Stand-in outside what their Token is narrowed to (spec 0046: no Access Key,
 * only the periods they were asked about), otherwise proposed as a Correction as any late value is. A Filled-in Value
 * already decided on (by the Metric's or the Workflow's owner) is not a Stand-in's answer and goes straight to the proposal. */
async function lateValue(i: Parameters<typeof proposeLate>[0], by: { filled: boolean; source: SourceId; token: Token; prompt: AnsweredPrompt | null }): ReturnType<typeof proposeLate> {
  const standsFor = by.token.stands_in_for ?? by.prompt?.stands_in_for ?? null;
  const refused = by.filled ? null : await standInLateRefusal(i.ws, i.metric, i.period, { source: by.source }, i.senderId, standsFor);
  if (refused) return { ok: false, outcome: "rejected_fill_in", detail: refused };
  return proposeLate(i);
}

// The note that came with a value, by who sent it; nothing when none came or nobody is known to have sent it.
function noteOf(input: SubmissionInput, authorId: string | null | undefined): NoteArriving | undefined {
  if (input.valueNote === undefined || input.valueNote === null || !authorId) return undefined;
  return { words: input.valueNote, authorId, source: input.source, tooLong: input.source === "api" ? "refuse" : "cut" };
}

// What a recorded value does to its period's notes; nothing for a preview, a value that was not taken, or one that
// brings no note and replaces nothing. The author is who entered the value, also for someone else.
async function notesOfRecorded(ws: string, input: SubmissionInput, v: { result: { ok: boolean }; preview: boolean; filled?: { by: string } | null; submitterId: string | null | undefined; metricId: number; period: string; before: number | null; data: { observation_id: unknown; outcome: string; after: unknown; replacedFilledIn?: unknown } }): Promise<NoteSaved | undefined> {
  const note = noteOf(input, v.filled?.by ?? v.submitterId);
  const replaces = v.data.outcome === "overwritten";
  if (!v.result.ok || v.preview || !(note || replaces)) return undefined;
  return notesAfterValue(ws, { metricId: v.metricId, period: v.period, observationId: Number(v.data.observation_id), before: v.before, after: Number(v.data.after), replaces, replacedFilledIn: Boolean(v.data.replacedFilledIn) }, note);
}

/** A value for a locked period (GLOSSARY: Lock, Correction): it changes nothing; it becomes a proposal for the Metric's owner,
 * or, in a preview, says that it would. Returns the intake's outcome and words. */
async function proposeLate(i: { ws: string; metric: Metric; period: string; value: number; senderName: string | undefined; senderId: string | null; note?: NoteArriving; preview: boolean; fv: (v: number) => string; when: string; notify: SubmissionEffects["notifyCorrection"] }): Promise<{ ok: false; outcome: string; detail: string; valueNote?: NoteSaved }> {
  let valueNote: NoteSaved | undefined;
  const { ws, metric, period, value, senderId, fv, when } = i;
  const owner = metric.owner_id === senderId ? "you" : "the metric owner";
  if (i.preview) return { ok: false, outcome: "proposed_locked", detail: `${metric.name}, ${when} is locked. ${fv(value)} would go to ${owner} as a proposed correction.` };
  // It proposes a change to the value already there (GLOSSARY: Correction), so accepting it replaces that value.
  const { data: latest } = await db().from("observations").select("id").eq("metric_id", metric.id).eq("period_start", period).order("created_at", { ascending: false }).limit(1);
  const [a] = await insertSealed("actions", ws, [{
    metric_id: metric.id, period_start: period, observation_id: latest?.[0]?.id ?? null, asker_id: senderId, assignee_id: metric.owner_id, kind: "question", purpose: "approval",
    question: `${metric.name} for ${when} is locked. ${i.senderName?.split(" ")[0]} sent ${fv(value)} late: accept it as a correction?`,
  }]) as { id: number }[];
  if (a) {
    await announceNewAction(a.id, { type: "system" });
    const [message] = await insertSealed("thread_messages", ws, [{ action_id: a.id, author_id: senderId, body: "Late value for a locked period.", correction_value: value, correction_status: "proposed" }]);
    // Its note waits with the proposal and becomes the period's only if the Correction is accepted.
    if (i.note) valueNote = await noteWithProposal(ws, { messageId: Number(message!.id), metricId: metric.id, period, value }, i.note);
    if (senderId) await i.notify({ actionId: a.id, senderId, ownerId: metric.owner_id, value });
  }
  return { ok: false, outcome: "proposed_locked", detail: `${metric.name}, ${when} is locked. ${fv(value)} went to ${owner} as a proposed correction.`, ...(valueNote ? { valueNote } : {}) };
}

/** What a sender is told when rows cannot be added to the Breakdown already recorded, whatever the reason. */
const GENERIC_BREAKDOWN = "These rows cannot be added to this Breakdown.";

/** The outcome and words for a value the database refused because the Metric was archived or the period condensed after
 * the checks before the write, or null when it refused for no such reason. */
async function refusedByDatabase(error: { code?: string; message?: string } | null, ws: string, metricId: number, period: string): Promise<{ outcome: string; detail: string } | null> {
  // A value entered for someone else met a value in between (it came first), or a rule that combines people's values.
  if (error?.code === "ZF450") return { outcome: "rejected_fill_in", detail: "This period already has a value: a Correction changes it." };
  if (error?.code === "ZF452") return { outcome: "rejected_fill_in", detail: "This Metric adds up or keeps the values of several people, so nobody can fill in for someone else." };
  // Rows that cannot stand where they were put. Words made of the submitted rows alone go back to the sender; anything that
  // depends on rows already recorded (a name, a count, a level there) is never said to the sender, who may not read them: the
  // same generic answer whatever the stored rows are (that a value is refused at all still tells a prober that rows are there; accepted).
  if (error?.code === BREAKDOWN_REFUSED) return { outcome: "rejected_breakdown", detail: error.message ?? GENERIC_BREAKDOWN };
  if (error?.code === BREAKDOWN_REFUSED_EXISTING || /^ZF46[0-2]$/.test(error?.code ?? "")) return { outcome: "rejected_breakdown", detail: GENERIC_BREAKDOWN };
  if (error?.code === ARCHIVED_CODE) return { outcome: "rejected_archived", detail: ARCHIVED_REFUSAL };
  if (error?.code === CONDENSED_CODE) return { outcome: "rejected_period_condensed", detail: await condensedWords(ws, metricId, period) };
  return null;
}

/** The period a value answers when it names none itself, and whether it was picked on the form link. A pick counts for a
 * form link only, as the browser sent it (untrusted): the running period, or one asked of this Token that is still due
 * (asked-periods.ts). Any other gets the link's one refusal before it is used for anything. Without a pick it is the
 * Prompt's. */
async function formPick(input: SubmissionInput, at: { byLink: boolean; ws: string; metric: Metric; token: Token; current: string; yearStart: YearStart; promptPeriod: string | null }): Promise<{ refused: { outcome: string; detail: string } } | { asked: string | null; picked: boolean }> {
  const sent = at.byLink ? input.formPeriod : undefined;
  if (sent === undefined) return { asked: at.promptPeriod, picked: false };
  if (sent !== at.current && !(await askedPeriods(at.ws, at.metric, at.token, at.current, at.yearStart)).includes(sent)) return { refused: LINK_PERIOD_REFUSED };
  return { asked: sent, picked: true };
}

/** The Breakdown a submission carries: the rows given beside a value read already, else what its text holds; none for a
 * reply that gives no value. */
function breakdownOf(input: SubmissionInput, sent: SubmissionInput["value"], style: NumberStyle): { rows: BreakdownInput[]; total: number | null } | null {
  if (sent) return sent.breakdown?.length ? { rows: sent.breakdown, total: sent.value } : null;
  return input.unread ? null : parseBreakdown(input.text, style, { parents: input.source === "web_form" });
}

/** Whether the value and period come read already: a program's, a paste's, or one typed on the Metric's own page. */
function valueIsGiven(input: SubmissionInput, pasted: boolean): boolean {
  return input.source === "api" || pasted || input.offered === true || (input.typed === true && input.source === "web_form");
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

/** What recording would answer for a value under its Metric's Submission Rule, read without writing (the rules of
 * record-value.ts). For the demo, which saves nothing. */
const previewObservation: Recording = async (workspaceId, metric, period, value) => {
  const { data } = await db().from("observations").select("id, value, value_sealed").eq("workspace_id", workspaceId).eq("metric_id", metric.id).eq("period_start", period).order("created_at", { ascending: false }).order("id", { ascending: false });
  const found = await openRows("observations", workspaceId, (data ?? []) as Record<string, unknown>[]);
  if (!found.length) return { data: { observation_id: 0, outcome: "recorded", before: null, after: value, earlier: 0 }, error: null };
  const before = Number(found[0].value);
  const at = (outcome: string, after: number) => ({ data: { observation_id: Number(found[0].id), outcome, before, after, earlier: found.length }, error: null });
  const rule = metric.submission_rule;
  if (rule === "keep_both") return { data: { observation_id: 0, outcome: "kept_both", before, after: value, earlier: found.length }, error: null };
  if (rule === "reject") return at("rejected_duplicate", before);
  if (rule === "overwrite") return at("overwritten", value);
  return at("added", addUp(before, value));
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

/** Two examples of a number written in a Number Style, for a form's error. */
function numberExample(style: NumberStyle): string {
  return `88 or 1${NUMBER_STYLE_MARKS[style].group}250`;
}

/** Why an answer recorded nothing, as an outcome and a reply that asks back, naming what was found (spec 0022:
 * a wrong number recorded quietly is worse than a question). */
function askBack(a: Exclude<AnswerReading, { ok: true }>, metric: Metric, yearStart: YearStart, fallback: string, formStyle: NumberStyle | null, picked: boolean): { outcome: string; detail: string } {
  const label = (start: string, span: Span) => midSentence(periodLabel(start, span, yearStart));
  const forNow = label(fallback, metric.period);
  switch (a.reason) {
    case "no_number":
      // The form link shows this at its field, so it says how to fix it; a chat reply speaks of the message.
      return { outcome: "rejected_no_value", detail: formStyle ? `Type a number, such as ${numberExample(formStyle)}.` : "Couldn’t find a number in the message." };
    case "unreadable_number":
      return { outcome: "rejected_no_value", detail: formStyle ? `${listed([a.text])} is not a number. Type one, such as ${numberExample(formStyle)}.` : `Couldn’t read ${listed([a.text])} as a number. Nothing was recorded.` };
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
      if (picked) return { outcome: "rejected_other_period", detail: `The form is set to ${asked}, but ${listed([a.named.text])} is ${said}. Nothing was recorded: type the number alone, or pick another period under “For”.` };
      return { outcome: "rejected_other_period", detail: `This Prompt asks for ${asked}, but ${listed([a.named.text])} is ${said}. Nothing was recorded: for ${asked}, reply with the value alone; for ${said}, send it as a new message.` };
    }
    case "future_period":
      return { outcome: "rejected_period", detail: `${listed([a.named.text])} is ${label(a.period, metric.period)}, which has not begun yet. Nothing was recorded.` };
  }
}

/** The people of a Workspace: members, then Contacts (flagged `contact`). Anyone's email, Slack handle and phone,
 * member or Contact, are only loaded with `contactDetails`, for intake, Prompts and owners or admins; never for pages
 * every member sees. What a person may be shown of these is peopleFor's (access.ts). */
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
  // Security (AGENTS.md rule 3): pages hand these profiles to the browser, so a member's email, Slack handle and phone,
  // and the sign-in account behind them, are not loaded unless `contactDetails` asks for them (intake, Prompts).
  const named = (data ?? []).map((p) => contactDetails
    ? { id: p.id, name: p.name, role: p.role, color: p.color, email: p.email, slack_handle: p.slack_handle, phone: p.phone ?? null }
    : { id: p.id, name: p.name, role: p.role, color: p.color, email: "", slack_handle: "", phone: null });
  // Sorted here, not by the database: a Contact's name is sealed, so its order there means nothing.
  const profiles = ((await openNames(ws, named as Profile[])) as Profile[]).sort((a, b) => a.name.localeCompare(b.name));
  return peopleOf(ws, profiles.filter((p) => memberIds.has(p.id)), rows, profiles);
}

/** Everyone whose name may sit in a Workspace's words, to hide it: the people (Members, Guests, Contacts) with their
 * contact details, and those who left but whose names remain in values, threads, Versions, Snapshots and questions
 * (ticket #598). Only for finding names in text to hide (hide-names.ts): never sent to a browser, a Connector or a
 * View Link, and never used to show a person. */
export async function peopleToHide(ws: string): Promise<Profile[]> {
  const [people, { data: ids, error }] = await Promise.all([peopleIn(ws, { contactDetails: true }), db().rpc("former_person_ids", { ws })]);
  // Fails closed: a text that cannot be checked for names is not sent, rather than sent with them.
  if (error) throw new Error("former people could not be listed");
  const known = new Set(people.map((p) => p.id));
  const former = ((ids ?? []) as { person_id: string }[]).map((r) => r.person_id).filter((id) => !known.has(id));
  if (!former.length) return people;
  const { data, error: profilesError } = await db().from("profiles").select("id, name, role, color, email, slack_handle, phone").in("id", former);
  if (profilesError) throw new Error("former people could not be read");
  const named = (await openNames(ws, (data ?? []).map((p) => ({ ...p, phone: p.phone ?? null })) as Profile[])) as Profile[];
  return [...people, ...named.map((p) => ({ ...p, contact: false }))];
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
  // A Filled-in Value's Correction is not decided, either way, by the person who entered it: someone else decides, so a
  // Correction cannot be declined to keep their number (spec 0046, ticket #800).
  if (msg.actions?.observation_id) {
    const { data: entered } = await db().from("observations").select("entered_by").eq("id", msg.actions.observation_id).eq("workspace_id", actor.workspaceId).maybeSingle();
    if (entered?.entered_by && entered.entered_by === actor.personId) throw new Error("You entered this value, so someone else decides its Correction: hand the Metric over to someone else first.");
  }
  // Decided once only: the status changes first and only if it was still proposed, so a second click does nothing.
  const { data: claimed } = await db().from("thread_messages").update({ correction_status: accept ? "accepted" : "declined" }).eq("id", messageId).eq("workspace_id", actor.workspaceId).eq("correction_status", "proposed").select("id");
  if (!claimed?.length) return;
  const act = msg.actions as { metric_id: number; period_start: string; observation_id: number | null };
  if (accept) {
    let written: { error: { code?: string } | null };
    let writtenTo = act.observation_id;
    let before: number | null = null;
    // The proposed value is sealed in the message; it is opened here and sealed again for the value's row.
    const [opened] = await openRows("thread_messages", actor.workspaceId, [msg as Record<string, unknown>]);
    const proposed = opened.correction_value;
    if (typeof proposed !== "number") throw new Error("The Correction could not be read.");
    if (act.observation_id) {
      // Only the value of this Metric in this workspace is changed.
      const { data: obs } = await db().from("observations").select("id, value, value_sealed, original_value, original_value_sealed, submitter_id").eq("id", act.observation_id).eq("workspace_id", actor.workspaceId).eq("metric_id", act.metric_id).maybeSingle();
      if (!obs) throw new Forbidden();
      const [was] = await openRows("observations", actor.workspaceId, [obs as Record<string, unknown>]);
      const original = was.original_value ?? was.value;
      if (typeof was.value === "number") before = was.value;
      if (typeof original !== "number") throw new Error("The Correction could not be saved. Try again in a moment.");
      const sealedNow = await sealRow("observations", actor.workspaceId, { id: act.observation_id, value: proposed, original_value: original });
      delete sealedNow.id;
      // The submitter's own Correction is their number: it no longer counts as entered by someone else.
      if (msg.author_id === obs.submitter_id) sealedNow.entered_by = null;
      written = await db().from("observations").update(sealedNow).eq("id", act.observation_id).eq("workspace_id", actor.workspaceId).eq("metric_id", act.metric_id);
    } else {
      // The new value's id is taken first: its number is sealed for that row.
      const [id] = await reserveIds("observations", 1);
      writtenTo = id!;
      const sealedNew = await sealRow("observations", actor.workspaceId, { id, value: proposed });
      written = await db().from("observations").insert({ ...sealedNew, metric_id: act.metric_id, period_start: act.period_start, submitter_id: msg.author_id, source: "web_form", workspace_id: actor.workspaceId });
    }
    // The value was not written (archived in the meantime, or the database refused it): the Correction stays proposed.
    if (written.error) {
      // The database's own words stay in the server log; the person gets Ziffr's.
      if (written.error.code === CONDENSED_CODE) {
        await db().from("thread_messages").update({ correction_status: "proposed" }).eq("id", messageId).eq("workspace_id", actor.workspaceId).eq("correction_status", "accepted");
        throw new Error(await condensedWords(actor.workspaceId, act.metric_id, act.period_start));
      }
      if (written.error.code !== ARCHIVED_CODE) console.error("Accepting a Correction failed:", (written.error as { message?: string }).message ?? written.error.code);
      await db().from("thread_messages").update({ correction_status: "proposed" }).eq("id", messageId).eq("workspace_id", actor.workspaceId).eq("correction_status", "accepted");
      throw new Error(written.error.code === ARCHIVED_CODE ? ARCHIVED_REFUSAL : "The Correction could not be saved. Try again in a moment.");
    }
    // The replaced value's notes become history; the note sent with the proposal is now the period's (spec 0064).
    await notesAfterValue(actor.workspaceId, { metricId: act.metric_id, period: act.period_start, observationId: Number(writtenTo), before, after: proposed, replaces: true });
    await decideProposedNote(actor.workspaceId, messageId, { metricId: act.metric_id, period: act.period_start, observationId: Number(writtenTo), sameNumber: before === proposed });
  }
  // A declined proposal takes its note with it: it never was a Value Note.
  if (!accept) await decideProposedNote(actor.workspaceId, messageId, null);
  if (accept) {
    await db().from("period_states").update({ state: "submitted" }).eq("metric_id", act.metric_id).eq("period_start", act.period_start);
    await effects.afterValue(act.metric_id, act.period_start, msg.author_id);
  }
  // Who decided, about which period, once it took effect: never the proposed or the old value.
  const m = await openOne("metrics", actor.workspaceId, (await db().from("metrics").select("id, name").eq("id", act.metric_id).eq("workspace_id", actor.workspaceId).maybeSingle()).data);
  await audit(actor, { kind: accept ? "correction.accepted" : "correction.declined", object: { type: "metric", id: act.metric_id, name: m?.name ?? null }, details: { period: act.period_start, proposed_by: msg.author_id, action_id: msg.action_id } });
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

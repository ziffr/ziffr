// The combined form (spec 0064; GLOSSARY: Combined Prompt, Prompt, Token, Stand-in, Value Note): the one page a
// Combined Prompt's link opens, without sign-in. The link is no Token. It stands for the figures of its one message,
// for 30 days; Ziffr keeps only its code's hash. There is no Actor here, so every rule is checked on every read and
// again on every submission, figure by figure: the recipient is still in the Workspace and not blocked, the figure's
// Token is theirs and still counts (a Stand-in still stands in), the Metric is in use and takes form values, and the
// period is the running one or one still asked for. Security (AGENTS.md rules 3 and 4): the page gets for each figure
// what that figure's own form link shows and nothing more: no note, no other Metric, no Token code, no id and no link.
// A figure is named by its number in the message, the only thing a browser sends back besides what was typed.
import { askedPeriods } from "./asked-periods";
import { publicLook } from "./brand-logo";
import { COMBINED_MAX } from "./combined-words";
import { db } from "./db";
import { noteFieldsOn, submitFormLink } from "./form-submit";
import { yearStartOf } from "./fiscal-year";
import { formatValue, RULE_LABEL, SOURCE_LABEL } from "./format";
import { combinedCodeHash } from "./internal/combined-delivery";
import { normalizeMetric } from "./metric-row";
import { periodLabel, periodStart, type YearStart } from "./periods";
import { openNames, openRows } from "./sealed-columns";
import { standingInWords } from "./stand-in-words";
import { submissionEffects, type SubmissionEffects } from "./submissions";
import { DEMO_WORKSPACE_ID } from "./team";
import { tokenValid } from "./tokens";
import { personBlocked } from "./user-block";
import type { Metric, SourceId, Token } from "./types";
import { workspaceLook } from "./workspace-look";
import { numberStyleOf } from "./workspace-settings";
import type { NumberStyle } from "./number-style";

/** How often a link's form may be sent in an hour, as sign-in links are limited. */
export const COMBINED_FORM_TRIES_PER_HOUR = 30;
/** What is said for a link that opens nothing: whatever the reason, the same words. */
export const COMBINED_LINK_OVER = "This link does not work any more. A link in a request works for 30 days.";
/** What is said once a link was sent too often. */
export const COMBINED_TOO_OFTEN = "This form was sent too often. Wait an hour and send it again.";

// 32 random bytes in base64url.
const CODE = /^[A-Za-z0-9_-]{43}$/;
/** The longest a typed number and a pasted Breakdown are read, and a note before the core checks it. */
const MAX_VALUE = 200;
const MAX_BREAKDOWN = 5000;
const MAX_NOTE = 20_000;

/** A figure the page can take a number for: what its own form link shows, by the figure's number in the message. */
export type CombinedOpenRow = {
  position: number;
  open: true;
  name: string;
  description: string;
  periodLabel: string;
  /** The value the period already holds, said only for the running period, as a form link does. */
  has: string | null;
  /** The Metric's Submission Rule in words. */
  rule: string;
  placeholder: string;
  /** Whose value a Stand-in records here, in words, or null. */
  standingInFor: string | null;
  /** The way the request for this figure was answered already, when not by a form. */
  answeredOn: string | null;
};

/** A figure that takes nothing here any more. One no longer asked of the person is not named. */
export type CombinedClosedRow = { position: number; open: false; name: string | null; periodLabel: string | null; words: string };

/** One figure of the combined form. */
export type CombinedFormRow = CombinedOpenRow | CombinedClosedRow;

/** What the combined form's page gets: the recipient's first name, the figures, how numbers are read, whether a note can
 * be written and the Workspace's look. */
export type CombinedForm = { firstName: string; rows: CombinedFormRow[]; numberStyle: NumberStyle; notes: boolean; look: ReturnType<typeof publicLook> };

type Message = { ws: string; deliveryId: number; recipientId: string };

// The message a code opens, or null: a code of the right shape whose hash is kept and has not ended, of a Combined
// Prompt whose recipient is still a member or Contact of its Workspace and not blocked. The code is untrusted.
async function messageOf(code: unknown): Promise<Message | null> {
  if (typeof code !== "string" || !CODE.test(code)) return null;
  const { data: link, error } = await db().from("combined_form_links").select("workspace_id, delivery_id").eq("code_hash", combinedCodeHash(code)).gt("expires_at", new Date().toISOString()).maybeSingle();
  if (error) throw new Error("The form could not be read. Try again in a moment.");
  if (!link || link.workspace_id === DEMO_WORKSPACE_ID) return null;
  const ws = link.workspace_id as string;
  const { data: d } = await db().from("deliveries").select("recipient_id, kind, combined").eq("id", link.delivery_id as number).eq("workspace_id", ws).maybeSingle();
  if (!d?.combined || d.kind !== "prompt") return null;
  const person = d.recipient_id as string;
  const [{ data: member }, { data: contact }, blocked] = await Promise.all([
    db().from("memberships").select("user_id").eq("workspace_id", ws).eq("user_id", person).maybeSingle(),
    db().from("contacts").select("person_id").eq("workspace_id", ws).eq("person_id", person).maybeSingle(),
    personBlocked(person),
  ]);
  return (member || contact) && !blocked ? { ws, deliveryId: link.delivery_id as number, recipientId: person } : null;
}

/** One listed figure as it stands now: no longer asked, or the person's, with whether its period still takes a value. */
type Figure =
  | { position: number; asked: false }
  | { position: number; asked: true; metric: Metric; token: Token; period: string; current: string; yearStart: YearStart; open: boolean; answeredOn: string | null; answered: boolean };

// The figures the message listed, checked live. One whose Metric takes no form values is left out: it is answered by
// replying to the message, never here.
async function figuresOf(m: Message): Promise<Figure[]> {
  const { data: rows, error } = await db().from("delivery_prompts").select("prompt_id, metric_id, token_id, position").eq("workspace_id", m.ws).eq("delivery_id", m.deliveryId).not("position", "is", null).order("position");
  if (error) throw new Error("The form could not be read. Try again in a moment.");
  const ids = [...new Set((rows ?? []).map((r) => r.metric_id as number))];
  if (!ids.length) return [];
  const [{ data: prompts }, { data: metricRows }, { data: tokens }, yearStart] = await Promise.all([
    db().from("prompts").select("id, submitter_id, period_start, stands_in_for, answered_at, answered_source").eq("workspace_id", m.ws).in("id", (rows ?? []).map((r) => r.prompt_id as number)),
    db().from("metrics").select("*").eq("workspace_id", m.ws).in("id", ids),
    db().from("tokens").select("*").eq("workspace_id", m.ws).in("metric_id", ids),
    yearStartOf(m.ws),
  ]);
  const metrics = (await openRows("metrics", m.ws, metricRows)).map(normalizeMetric) as Metric[];
  const all = (tokens ?? []) as Token[];
  const figures: Figure[] = [];
  for (const r of rows ?? []) {
    const position = r.position as number;
    const prompt = prompts?.find((p) => p.id === r.prompt_id);
    const metric = metrics.find((x) => x.id === r.metric_id);
    const token = all.find((t) => t.id === r.token_id);
    const theirs = prompt && metric && token && prompt.submitter_id === m.recipientId && token.submitter_id === m.recipientId && token.metric_id === metric.id
      && (token.stands_in_for ?? null) === (prompt.stands_in_for ?? null) && tokenValid(token, all);
    if (!theirs || metric.formula || metric.archived_at) {
      figures.push({ position, asked: false });
      continue;
    }
    if (!(metric.sources as SourceId[]).includes("web_form")) continue;
    const current = periodStart(new Date(), metric.period, yearStart);
    const period = prompt.period_start as string;
    const open = period === current || (await askedPeriods(m.ws, metric, token, current, yearStart)).includes(period);
    figures.push({ position, asked: true, metric, token, period, current, yearStart, open, answeredOn: (prompt.answered_source as string | null) ?? null, answered: Boolean(prompt.answered_at) });
  }
  return figures;
}

const sourceWords = (source: string | null) => (source && source in SOURCE_LABEL ? ` on ${SOURCE_LABEL[source as SourceId]}` : "");

async function rowOf(m: Message, f: Figure, style: NumberStyle): Promise<CombinedFormRow> {
  if (!f.asked) return { position: f.position, open: false, name: null, periodLabel: null, words: "No longer asked of you." };
  const { metric, period } = f;
  const label = periodLabel(period, metric.period, f.yearStart);
  if (!f.open) return { position: f.position, open: false, name: metric.name, periodLabel: label, words: f.answered ? `Answered${sourceWords(f.answeredOn)}.` : "This one takes no value here any more." };
  let has: string | null = null;
  if (period === f.current) {
    const { data, error } = await db().from("observations").select("id, value, value_sealed").eq("workspace_id", m.ws).eq("metric_id", metric.id).eq("period_start", period).order("created_at", { ascending: false }).limit(1);
    if (error) throw new Error("The form could not be read. Try again in a moment.");
    const [value] = await openRows("observations", m.ws, (data ?? []) as Record<string, unknown>[]);
    if (typeof value?.value === "number") has = formatValue(metric, value.value, style);
  }
  return {
    position: f.position, open: true, name: metric.name, description: metric.description ?? "", periodLabel: label, has,
    rule: RULE_LABEL[metric.submission_rule].toLowerCase(),
    placeholder: metric.unit || (metric.format === "currency" ? "€" : metric.format === "percent" ? "%" : "Value"),
    standingInFor: await standingInWords(m.ws, f.token),
    answeredOn: f.answeredOn && f.answeredOn !== "web_form" && f.answeredOn in SOURCE_LABEL ? SOURCE_LABEL[f.answeredOn as SourceId] : null,
  };
}

/** What the combined form shows for a link's code, or null when it opens nothing (unknown, ended, or its recipient may
 * no longer use it). Only reads, so a mail scanner that opens the link changes nothing and uses up no try. */
export async function combinedForm(code: unknown): Promise<CombinedForm | null> {
  const m = await messageOf(code);
  if (!m) return null;
  const [figures, numberStyle, look, { data: profile }] = await Promise.all([
    figuresOf(m),
    numberStyleOf(m.ws),
    workspaceLook(m.ws),
    db().from("profiles").select("id, name").eq("id", m.recipientId),
  ]);
  const [person] = await openNames(m.ws, (profile ?? []) as { id: string; name: string }[]);
  const rows: CombinedFormRow[] = [];
  for (const f of figures) rows.push(await rowOf(m, f, numberStyle));
  return { firstName: String(person?.name ?? "").trim().split(/\s+/)[0] ?? "", rows, numberStyle, notes: noteFieldsOn(m.ws), look: publicLook(m.ws, look) };
}

/** What became of one row that was sent. `noteKept` when its note was not saved, so the field keeps the words; `ask`
 * the code under which a note asked for after it is saved (note-question.ts). */
export type CombinedRowResult = { ok: boolean; detail: string; noteKept?: boolean; ask?: string };
/** What became of a submission: each filled row's answer by its number, or why nothing was looked at. */
export type CombinedResult = { rows: Record<number, CombinedRowResult>; refused?: string };

type Entry = { position: number; value: string; breakdown: string; note: string };

// The filled rows of what a browser sent: bounded, each number of a message once, empty rows skipped.
function filledEntries(entries: unknown): Entry[] {
  if (!Array.isArray(entries)) return [];
  const text = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max).trim() : "");
  const out = new Map<number, Entry>();
  for (const e of entries.slice(0, COMBINED_MAX) as unknown[]) {
    if (!e || typeof e !== "object") continue;
    const { position, value, breakdown, note } = e as Record<string, unknown>;
    if (typeof position !== "number" || !Number.isInteger(position) || position < 1 || position > COMBINED_MAX || out.has(position)) continue;
    const entry = { position, value: text(value, MAX_VALUE), breakdown: text(breakdown, MAX_BREAKDOWN), note: text(note, MAX_NOTE) };
    if (entry.value || entry.breakdown || entry.note) out.set(position, entry);
  }
  return [...out.values()].sort((a, b) => a.position - b.position);
}

const refusedRow = (detail: string, entry: Entry): CombinedRowResult => ({ ok: false, detail, ...(entry.note ? { noteKept: true } : {}) });

async function submitRow(f: Figure | undefined, entry: Entry, effects: SubmissionEffects): Promise<CombinedRowResult> {
  if (!f) return refusedRow("Not recorded: this number is not on this page any more.", entry);
  if (!f.asked) return refusedRow("Not recorded: this one is no longer asked of you.", entry);
  if (!f.open) return refusedRow("Not recorded: this one takes no value here any more.", entry);
  if (!entry.value && !entry.breakdown) return refusedRow("Not saved: type the number too. A note goes with its number.", entry);
  try {
    // The intake checks the Token, the Metric and the period once more, as for the figure's own form link.
    const r = await submitFormLink(f.token.code, { value: entry.value, breakdown: entry.breakdown, period: f.period, note: entry.note }, effects);
    // The intake's words for another period speak of a list of periods, which this form does not have, and its words
    // for how a value came speak of a personal link, which this one is not.
    const detail = r.outcome === "rejected_other_period" ? "Not recorded: type the number alone." : r.detail.replace(" (via personal form link)", "");
    return { ok: !r.outcome.startsWith("rejected"), detail, ...(r.valueNote?.saved === false || (r.outcome.startsWith("rejected") && entry.note) ? { noteKept: true } : {}), ...(r.ask ? { ask: r.ask } : {}) };
  } catch (e) {
    // The error's own words only, never what was typed; the other rows go on.
    console.error("A value from the combined form could not be recorded:", e instanceof Error ? e.message : "unknown");
    return refusedRow("Not recorded. Try again in a moment.", entry);
  }
}

/** Sends the filled rows of a link's form, each through its own Token and the same intake as that Token's form link, in
 * the order of the message. `code` and `entries` come from a browser. A link may be sent 30 times an hour. */
export async function submitCombinedForm(code: unknown, entries: unknown, effects: SubmissionEffects = submissionEffects): Promise<CombinedResult> {
  const m = await messageOf(code);
  if (!m) return { rows: {}, refused: COMBINED_LINK_OVER };
  const filled = filledEntries(entries);
  if (!filled.length) return { rows: {}, refused: "Type at least one number." };
  const { data: may, error } = await db().rpc("claim_combined_form_try", { p_delivery: m.deliveryId, p_limit: COMBINED_FORM_TRIES_PER_HOUR });
  // A database that does not answer takes nothing either: failing open would turn the limit off when it is needed.
  if (error) throw new Error("The form could not be sent. Try again in a moment.");
  if (may !== true) return { rows: {}, refused: COMBINED_TOO_OFTEN };
  const figures = await figuresOf(m);
  const rows: Record<number, CombinedRowResult> = {};
  // One after the other: two rows of one Metric and period would otherwise race each other's Submission Rule.
  for (const entry of filled) rows[entry.position] = await submitRow(figures.find((f) => f.position === entry.position), entry, effects);
  return { rows };
}

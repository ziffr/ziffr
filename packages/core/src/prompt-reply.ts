// What a text reply to a Prompt does (spec 0064, "Reading a reply" and "The offer"; GLOSSARY: Prompt, Combined Prompt,
// Value Note, Submission Rule, Held Reply), whichever Connector it came through. It collects the figures the message
// asked for as they stand now, lets the one reader read the reply (reply-reader.ts), records each value through the
// intake, saves notes, makes and takes the offer, and words the answer. The same reading, writing nothing, says what a
// Held Reply would do before it is confirmed. Security: the Connector has proved that the reply is from the person the
// message went to; this decides, figure by figure, whether they are still asked (their own Token, the Metric in use and
// taking this way), and writes a note only on a value of their own. A figure no longer asked is not named. The words
// of a note never go into the intake log.
import { ARCHIVED_REFUSAL } from "./archived-metrics";
import { condensedOn, condensedRefusal } from "./condensed-values";
import { db } from "./db";
import { linkTo } from "./deliveries";
import { yearStartFor, yearStartOf } from "./fiscal-year";
import { withNoteWords } from "./form-submit";
import { formatValue, SOURCE_LABEL } from "./format";
import { numberedFigures, type NumberedFigure } from "./internal/combined-delivery";
import { unlinked } from "./mail-links";
import { normalizeMetric } from "./metric-row";
import { periodLabel } from "./periods";
import { claimOffer, keepOffer, offeredValue, peekOffer, valueStamp, type StoredOffer } from "./reply-offers";
import { readReply, type ReplyContext, type ReplyFigure, type ReplyOffer, type ReplyReading, type ReplyValue } from "./reply-reader";
import type { ReplyNote } from "./reply-cleaning";
import { openNames, openRows } from "./sealed-columns";
import { isLocked, previewValue, submitValue, type SubmissionEffects, type SubmissionInput, type SubmissionResult } from "./submissions";
import { tokenValid, type TokenRow } from "./tokens";
import { addReplyNote, retireNote, type ReplyNoteSaved } from "./value-note-store";
import { isAfterApprovalOrLock } from "./value-notes";
import { answerReadingOf, numberStyleOf } from "./workspace-settings";
import { answerSourceOf } from "./prompt-ways";
import type { Metric } from "./types";

/** The Delivery a reply to a request came back for: of one Prompt, or a Combined Prompt. */
type PromptDelivery = { id: number; workspace_id: string; recipient_id: string; prompt_id: number | null; combined?: boolean | null };

/** Where the reply came from: its Source, the sender as that Source knows them, and the person the Connector proved. */
type ReplyFrom = { source: "mail" | "slack" | "telegram"; sender: string; provenPersonId?: string };

/** What is done with an offer the reply's note makes: kept for a "yes" in the same place, taken at once because the
 * person pressed it on a Held Reply's page (`take` is what that page showed), or neither. */
export type OfferChoice = "keep" | "none" | { take: string };

/** Whether the reply is only looked at (a Held Reply before it is confirmed) or acted on. */
type ReplyMode = { dry: true } | { dry?: false; submission: SubmissionEffects; offers: OfferChoice };

/** What became of a reply to a request. `noted`: a note was saved and no value. `closed`: thanks or a refusal once a
 * value is in. */
export type PromptReplyOutcome = "recorded" | "refused" | "form_link" | "noted" | "closed" | "empty" | "unknown_token";

/** What the reply did, or would do, and the words that answer it. */
type PromptReplyReport = {
  outcome: PromptReplyOutcome;
  /** The answer's subject and words; no words, no answer. */
  subject: string;
  text: string;
  link?: string;
  /** A chat shows the words alone, without the subject before them. */
  bare?: boolean;
  /** The words ask for a further reply, so an email carrying them needs a reply address. */
  invites?: boolean;
  /** A saved note with nothing else to say: no email goes back. */
  noEmail?: boolean;
  /** Whether acting on the reply changes anything. */
  changes: boolean;
  /** The change a note offers, for a Held Reply's button: what to send back, and its words. */
  offer?: { take: string; label: string };
  /** An offer was kept, so the chat message answering it is remembered. */
  offered?: boolean;
};

/** A value of this person's that is in for a Prompt's period. */
type InValue = {
  /** NaN when the stored number cannot be opened. */
  value: number;
  observationId: number;
  /** It was replaced since: only the history holds it. */
  replaced: boolean;
  /** An "add" Metric whose one value also holds others' contributions. */
  shared: boolean;
};

type PromptRow = { id: number; metric_id: number; period_start: string; submitter_id: string; stands_in_for: string | null; answered_at: string | null };

/** One figure of the message, by its number. */
type Figure = {
  position: number;
  /** Null for a number that names nothing any more. */
  prompt: PromptRow | null;
  metric: Metric | null;
  held: InValue | null;
  locked: boolean;
  /** Why this reply records nothing for it, in words; null when it may. */
  closedWhy: string | null;
};

type Message = { d: PromptDelivery; from: ReplyFrom; figures: Figure[]; combined: boolean };

/** Takes the links to a form out of a reply's words: an email may quote the message it answers, and a form's link opens
 * the form, so it is in nothing that is kept or shown. */
export const withoutFormLinks = (text: string): string => text.replace(/\/submit\/(?:all\/)?[A-Za-z0-9_-]{16,}/g, "/submit/…");

const NOT_ASKED = "this one is no longer asked of you";

// This person's value for the Prompt's period, by whichever way it came in: their own, or for a Prompt sent in someone's
// place, the one they entered for that person (a Guest records it as their own).
async function valueIn(ws: string, person: string, prompt: PromptRow, rule: Metric["submission_rule"]): Promise<InValue | null> {
  const stands = prompt.stands_in_for;
  const guest = stands ? (await db().from("memberships").select("role").eq("workspace_id", ws).eq("user_id", person).maybeSingle()).data?.role === "guest" : false;
  const theirs = (o: { submitter_id?: unknown; entered_by?: unknown }) => (!stands || guest ? o.submitter_id === person : o.submitter_id === stands && o.entered_by === person);
  const { data, error } = await db().from("observations").select("id, value, value_sealed, submitter_id, entered_by").eq("workspace_id", ws).eq("metric_id", prompt.metric_id).eq("period_start", prompt.period_start).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(500);
  if (error) throw new Error("The values could not be read.");
  const rows = data ?? [];
  const open = async (table: "observations" | "observation_history", row: Record<string, unknown>) => {
    const [o] = await openRows(table, ws, [row]);
    return typeof o?.value === "number" ? o.value : Number.NaN;
  };
  const mine = rows.find(theirs);
  if (mine) return { value: await open("observations", mine), observationId: Number(mine.id), replaced: false, shared: rule === "add" };
  // Under "add" the period has one value, which keeps its first sender: whoever's request was answered added to it.
  if (rule === "add" && !stands && prompt.answered_at && rows[0]) return { value: await open("observations", rows[0]), observationId: Number(rows[0].id), replaced: false, shared: true };
  const { data: before, error: unread } = await db().from("observation_history").select("id, observation_id, value, value_sealed, submitter_id, entered_by").eq("workspace_id", ws).eq("metric_id", prompt.metric_id).eq("period_start", prompt.period_start).order("superseded_at", { ascending: false }).order("id", { ascending: false }).limit(500);
  if (unread) throw new Error("The values could not be read.");
  const earlier = (before ?? []).find(theirs);
  return earlier ? { value: await open("observation_history", earlier), observationId: Number(earlier.observation_id), replaced: true, shared: false } : null;
}

// The figures of the message as they stand now, by number; null when the Delivery is not this person's request.
async function figuresFor(d: PromptDelivery, source: ReplyFrom["source"]): Promise<Figure[] | null> {
  const ws = d.workspace_id;
  const listed: NumberedFigure[] = d.combined
    ? await numberedFigures(ws, d.id, d.recipient_id, source)
    : [{ position: 1, promptId: d.prompt_id!, name: "", allowed: true, byReply: true }];
  const { data: prompts, error } = await db().from("prompts").select("id, metric_id, period_start, submitter_id, stands_in_for, answered_at").eq("workspace_id", ws).in("id", listed.map((l) => l.promptId));
  if (error) throw new Error("The request could not be read.");
  const ids = [...new Set((prompts ?? []).map((p) => p.metric_id as number))];
  const [{ data: metricRows }, { data: tokens }] = await Promise.all([
    db().from("metrics").select("*").eq("workspace_id", ws).in("id", ids),
    db().from("tokens").select("metric_id, submitter_id, stand_in_id, stands_in_for, expires_at").in("metric_id", ids),
  ]);
  const metrics = (await openRows("metrics", ws, metricRows)).map(normalizeMetric) as Metric[];
  const all = (tokens ?? []) as TokenRow[];
  const out: Figure[] = [];
  // A message's numbers may have gaps (a Metric deleted since): each number stays where it was sent.
  const highest = Math.max(0, ...listed.map((l) => l.position));
  for (let position = 1; position <= highest; position++) {
    const l = listed.find((x) => x.position === position);
    const prompt = (prompts?.find((p) => p.id === l?.promptId) as PromptRow | undefined) ?? null;
    const metric = metrics.find((m) => m.id === prompt?.metric_id) ?? null;
    if (!l || !prompt || !metric || prompt.submitter_id !== d.recipient_id || !l.allowed) {
      out.push({ position, prompt: null, metric: null, held: null, locked: false, closedWhy: NOT_ASKED });
      continue;
    }
    const holds = all.some((t) => t.metric_id === metric.id && t.submitter_id === d.recipient_id && (!prompt.stands_in_for || t.stands_in_for === prompt.stands_in_for) && tokenValid(t, all));
    out.push({
      position, prompt, metric, held: await valueIn(ws, d.recipient_id, prompt, metric.submission_rule), locked: await isLocked(metric.id, prompt.period_start),
      closedWhy: !l.byReply ? `${metric.name} takes values only on the form` : holds ? null : NOT_ASKED,
    });
  }
  return out;
}

async function contextOf(d: PromptDelivery): Promise<Omit<ReplyContext, "figures" | "email">> {
  const ws = d.workspace_id;
  const [style, yearStart, reading, { data: profile }] = await Promise.all([numberStyleOf(ws), yearStartOf(ws), answerReadingOf(ws), db().from("profiles").select("id, name").eq("id", d.recipient_id)]);
  const [person] = await openNames(ws, (profile ?? []) as { id: string; name: string }[]);
  return { style, yearStart, today: new Date(), ...reading, senderName: (person?.name as string | undefined) ?? null };
}

// A figure as the reader takes it. One that takes nothing here is closed in a Combined Prompt; the one figure of a
// single request is read as ever, and the intake or the note's check says why it records nothing.
function readerFigure(f: Figure, combined: boolean): ReplyFigure {
  const closed = combined && f.closedWhy !== null;
  return {
    name: f.metric?.name ?? "", unit: f.metric?.unit ?? "", period: f.metric?.period ?? "month", promptPeriod: f.prompt?.period_start ?? null,
    value: closed ? null : (f.held?.value ?? null), rule: f.metric?.submission_rule ?? "reject", locked: f.locked, closed,
  };
}

/** What a run of one reply works with. */
type Run = Message & { text: string; mode: ReplyMode; context: Omit<ReplyContext, "figures" | "email"> };

const yearFor = (r: Run, f: Figure) => yearStartFor(r.d.workspace_id, f.metric!.period);
const labelOf = async (r: Run, f: Figure) => `${f.metric!.name}, ${periodLabel(f.prompt!.period_start, f.metric!.period, await yearFor(r, f)).replace(/^Week of/, "week of")}`;
const written = (r: Run, f: Figure, value: number) => formatValue(f.metric!, value, r.context.style);

/** Words of a person's quoted in an answer: on one line, cut short, and never a link. */
const quoted = (words: string) => {
  const line = [...words.replace(/\s+/g, " ")];
  return `“${unlinked(line.length > 100 ? `${line.slice(0, 100).join("")}…` : line.join(""))}”`;
};

// One value through the intake, or what the intake would answer.
function intake(r: Run, f: Figure, input: Pick<SubmissionInput, "text" | "valueNote" | "offered" | "value" | "period" | "unread">): Promise<SubmissionResult> {
  const full: SubmissionInput = { source: r.from.source, sender: r.from.sender, promptId: f.prompt!.id, workspaceId: r.d.workspace_id, ...input };
  // What a look at a Held Reply asks: the address on file is the sender, and nothing is written.
  return r.mode.dry ? previewValue(full) : submitValue(full, r.mode.submission, r.from.provenPersonId);
}

// A value the reply gives for a figure, with its note.
async function recordValue(r: Run, f: Figure, v: ReplyValue): Promise<{ ok: boolean; proposed: boolean; detail: string }> {
  const result = await intake(r, f, { text: v.answer, ...(v.note ? { valueNote: v.note.text } : {}) });
  const saved = result.valueNote;
  const told = withNoteWords(saved?.saved && v.note?.cut ? { ...result, valueNote: { saved: true, cut: true } } : result);
  const note = !v.note || !(result.ok || result.outcome === "proposed_locked") ? "" : r.mode.dry ? ` With it, your note: ${quoted(v.note.text)}` : r.combined && saved?.saved ? ` Note: ${quoted(v.note.text)}` : "";
  return { ok: result.ok, proposed: result.outcome === "proposed_locked", detail: `${told.detail}${note}` };
}

// Why this person may not write a note on this figure's value now, or null.
async function noNoteWhy(r: Run, f: Figure): Promise<string | null> {
  if (f.metric!.archived_at) return ARCHIVED_REFUSAL;
  if (f.closedWhy) return f.closedWhy === NOT_ASKED ? "This request is no longer yours." : `${f.closedWhy}.`;
  if (!f.metric!.sources.includes(r.from.source)) return `${f.metric!.name} takes nothing by ${SOURCE_LABEL[r.from.source]}.`;
  const condensed = await condensedOn(r.d.workspace_id, f.metric!.id, f.prompt!.period_start);
  return condensed ? condensedRefusal(condensed) : null;
}

async function saveNote(r: Run, f: Figure, note: ReplyNote): Promise<ReplyNoteSaved> {
  const why = await noNoteWhy(r, f);
  if (why) return { saved: false, reason: why };
  if (r.mode.dry) return { saved: true, noteId: 0, inPlace: false };
  const ws = r.d.workspace_id;
  const held = f.held!;
  // A number that does not open cannot be said to have been commented on.
  if (Number.isNaN(held.value)) return { saved: false, reason: "The note could not be saved." };
  return addReplyNote(ws, {
    metricId: f.metric!.id, period: f.prompt!.period_start, authorId: r.d.recipient_id, source: r.from.source, observationId: held.observationId, saidOf: held.value,
    replaced: held.replaced, addedLater: await isAfterApprovalOrLock(ws, f.metric!.id, f.prompt!.period_start),
  }, note.text);
}

function noteWords(r: Run, f: Figure, note: ReplyNote, saved: ReplyNoteSaved): string {
  if (!saved.saved) return `Your note was not saved. ${saved.reason}`;
  if (r.mode.dry) return `Saves your note: ${quoted(note.text)}${f.held!.replaced ? " Your value was replaced meanwhile, so it is filed under your earlier value." : ""}`;
  const where = saved.inPlace ? "Saved as your note, in place of your earlier one." : "Saved as your note.";
  const quote = r.combined ? ` ${quoted(note.text)}` : "";
  const cut = note.cut ? " It was cut to 1,000 characters." : "";
  const filed = f.held!.replaced ? " Your value was replaced meanwhile, so the note is filed under your earlier value." : "";
  return `${where}${quote}${cut}${filed}`;
}

const SEND_ALONE = "To change the value, send the number alone.";

/** What "yes" would do with an offered number, in words. */
function offerWords(r: Run, f: Figure, offer: ReplyOffer): { sentence: string; label: string } {
  const value = written(r, f, offer.value);
  const [ask, label] = offer.how === "add" ? [`To add ${value}`, `add ${value}`]
    : offer.how === "keep_both" ? [`To record ${value} as well`, `record ${value} as well`]
    : offer.how === "correction" ? [`The period is locked. To propose ${value} as a correction`, `propose ${value} as a correction`]
    : [`To change it to ${value}`, `change the value to ${value}`];
  // Their own value only, and never a sum that holds what others added.
  const still = !f.held!.shared && Number.isFinite(f.held!.value) ? `Your value is still ${written(r, f, f.held!.value)}. ` : "";
  return { sentence: `${still}${ask}, reply yes.`, label: `Save the note and ${label}` };
}

// Keeps an offer for a "yes". One that cannot be kept is not made: the note is saved either way.
async function keepFor(r: Run, f: Figure, value: number, noteId: number): Promise<boolean> {
  try {
    const stamp = await valueStamp(r.d.workspace_id, f.metric!.id, f.prompt!.period_start, f.metric!.submission_rule);
    await keepOffer(r.d.workspace_id, r.d.id, { promptId: f.prompt!.id, metricId: f.metric!.id, noteId, value, style: r.context.style, stamp });
    return true;
  } catch (e) {
    console.error("An offer after a reply could not be kept:", e instanceof Error ? e.message : "unknown");
    return false;
  }
}

// "Yes" to an offer: the offered number goes through the intake like any value, with the note's words as its note.
async function takeOffered(r: Run, f: Figure, offer: { value: number; words: string; noteId: number }): Promise<{ ok: boolean; detail: string }> {
  const result = await intake(r, f, { text: "yes", offered: true, value: { value: offer.value }, period: f.prompt!.period_start, valueNote: offer.words });
  // Under "add" and "keep both" the earlier value stays, and the words move to the new one rather than showing twice.
  if (!r.mode.dry && result.ok && result.outcome !== "overwritten" && result.valueNote?.saved && offer.noteId) await retireNote(r.d.workspace_id, offer.noteId);
  return { ok: result.ok, detail: withNoteWords(result).detail };
}

/** A note on its own: saved, with the offer its one other number gives. */
async function noteReport(r: Run, i: number, reading: Extract<ReplyReading, { kind: "note" }>): Promise<PromptReplyReport> {
  const f = r.figures[i];
  const { note } = reading;
  const saved = await saveNote(r, f, note);
  const lines = [noteWords(r, f, note, saved)];
  const report: Omit<PromptReplyReport, "text"> = { outcome: saved.saved ? "noted" : "refused", subject: saved.saved ? "Your note" : "Not recorded", bare: saved.saved, changes: saved.saved };
  const quiet = saved.saved && !reading.holdsNumber && !note.cut && !f.held!.replaced;
  // No offer from words that were cut (the number may be cut too) or filed under a value that is no longer there.
  const offer = saved.saved && !note.cut && !f.held!.replaced ? reading.offer : null;
  const choice = r.mode.dry ? null : r.mode.offers;
  if (offer && saved.saved) {
    const words = offerWords(r, f, offer);
    const take = `${f.position}:${offer.value}`;
    if (r.mode.dry) report.offer = { take, label: words.label };
    else if (choice === "keep") {
      const kept = await keepFor(r, f, offer.value, saved.noteId);
      lines.push(kept ? words.sentence : SEND_ALONE);
      report.invites = kept;
      report.offered = kept;
    } else if (choice && typeof choice === "object" && choice.take === take) {
      const done = await takeOffered(r, f, { value: offer.value, words: note.text, noteId: saved.noteId });
      lines.push(done.detail);
      if (done.ok) report.outcome = "recorded";
    }
  } else if (reading.sendAlone && saved.saved) lines.push(SEND_ALONE);
  const prefix = r.combined ? `${f.position}. ${await labelOf(r, f)}: ` : "";
  return { ...report, text: `${prefix}${lines.join(" ")}`, noEmail: quiet };
}

/** Values, and in a Combined Prompt also notes, lines that could not be read and what is still open. */
async function valuesReport(r: Run, reading: Extract<ReplyReading, { kind: "values" }>): Promise<PromptReplyReport> {
  const lines: { position: number; text: string }[] = [];
  let recorded = false;
  let proposed = false;
  let noted = false;
  let quiet = reading.values.length === 0 && reading.unread.length === 0 && reading.closed.length === 0 && reading.notes.length > 0;
  const say = (f: Figure, text: string) => lines.push({ position: f.position, text: r.combined ? `${f.position}. ${text}` : text });
  // One after the other: two figures of one Metric and period would otherwise race each other's Submission Rule.
  for (const v of reading.values) {
    const f = r.figures[v.figure];
    const done = await recordValue(r, f, v);
    recorded ||= done.ok;
    proposed ||= done.proposed;
    say(f, done.detail);
  }
  for (const u of reading.unread) {
    const f = r.figures[u.figure];
    // The line alone is logged, never the words under it.
    say(f, (await intake(r, f, { text: u.answer, unread: u.reading })).detail);
  }
  for (const n of reading.notes) {
    const f = r.figures[n.figure];
    const saved = await saveNote(r, f, n.note);
    noted ||= saved.saved;
    quiet &&= saved.saved && !n.holdsNumber && !n.note.cut && !f.held!.replaced;
    say(f, `${await labelOf(r, f)}: ${noteWords(r, f, n.note, saved)}${n.holdsNumber && saved.saved && !r.mode.dry ? ` ${SEND_ALONE}` : ""}`);
  }
  for (const i of reading.closed) {
    const f = r.figures[i];
    say(f, `Not recorded: ${f.closedWhy}.`);
  }
  const text = lines.sort((a, b) => a.position - b.position).map((l) => l.text);
  let invites = false;
  const open = reading.open.map((i) => r.figures[i]);
  if (r.combined && !r.mode.dry) {
    const nothing = !text.length;
    if (nothing) text.push(open.length ? `Nothing was recorded. Reply with one line for each, such as "${open[0].position}: 45".` : "Nothing was recorded.");
    if (open.length) {
      text.push(`Still open: ${(await Promise.all(open.map(async (f) => `${f.position}. ${await labelOf(r, f)}`))).join("; ")}.`);
      invites = true;
    }
  }
  const outcome = recorded ? "recorded" : noted ? "noted" : "refused";
  return {
    outcome, subject: recorded ? "Recorded" : noted && !reading.unread.length ? "Your note" : "Not recorded", bare: outcome === "noted",
    text: text.join(r.combined ? "\n" : " "), invites, noEmail: quiet, changes: recorded || proposed || noted,
  };
}

const nothing = (outcome: PromptReplyOutcome, subject = "", text = ""): PromptReplyReport => ({ outcome, subject, text, bare: true, changes: false });

// The offer still open for this message, which the reply closes (a look at a Held Reply leaves it), with its figure.
async function openOffer(r: Run): Promise<{ figure: number; value: number; words: string; noteId: number } | null> {
  const stored: StoredOffer | null = r.mode.dry ? await peekOffer(r.d.workspace_id, r.d.id) : await claimOffer(r.d.workspace_id, r.d.id);
  if (!stored) return null;
  const figure = r.figures.findIndex((f) => f.prompt?.id === stored.prompt_id);
  const f = r.figures[figure];
  if (!f || f.closedWhy) return null;
  const held = await offeredValue(r.d.workspace_id, stored, f.prompt!.period_start, f.metric!.submission_rule, r.context);
  return held ? { figure, ...held } : null;
}

async function report(r: Run): Promise<PromptReplyReport> {
  const offer = await openOffer(r);
  const reading = readReply(r.text, {
    ...r.context, figures: r.figures.map((f) => readerFigure(f, r.combined)), email: r.from.source === "mail", numbered: r.combined,
    openOffer: offer && { figure: offer.figure, value: offer.value },
  });
  switch (reading.kind) {
    case "values": return valuesReport(r, reading);
    case "not_read": {
      const result = await intake(r, r.figures[reading.figure], { text: r.text, unread: reading.reading });
      return { outcome: "refused", subject: "Not recorded", text: result.detail, changes: false };
    }
    case "note": return noteReport(r, reading.figure, reading);
    case "which_figure": {
      const names = await Promise.all(reading.figures.map(async (i) => `${r.figures[i].position}. ${await labelOf(r, r.figures[i])}`));
      const how = r.from.source === "telegram" ? "Reply to the request with" : "Reply with";
      return { outcome: "refused", subject: "Which number?", text: `Nothing was saved: which number are your words about? ${how} "${r.figures[reading.figures[0]].position}: your words". ${names.join("; ")}.`, invites: true, changes: false };
    }
    case "accept_offer": {
      const done = await takeOffered(r, r.figures[reading.figure], offer!);
      return { outcome: done.ok ? "recorded" : "refused", subject: done.ok ? "Recorded" : "Not recorded", text: done.detail, changes: done.ok };
    }
    case "closed": return nothing("closed");
    case "nothing": return reading.yes ? nothing("empty", "Nothing was changed", "Nothing was changed: there is no open offer to say yes to.") : nothing("empty");
  }
}

/** Reads a reply to a request from the person it went to and acts on it, or, with `dry`, says what it would do and
 * writes nothing. The words returned answer the sender alone. */
export async function takePromptReply(d: PromptDelivery, text: string, from: ReplyFrom, mode: ReplyMode): Promise<PromptReplyReport> {
  if (!d.combined) {
    const { data: prompt } = await db().from("prompts").select("id, source, metric_id, submitter_id").eq("id", d.prompt_id!).eq("workspace_id", d.workspace_id).maybeSingle();
    if (!prompt || prompt.submitter_id !== d.recipient_id) return nothing("unknown_token");
    if (!text) return nothing("empty");
    // What this Delivery offered: the Source its own message asked to be answered on. With several ways a Prompt has one
    // Delivery per way, and each takes the reply of its own way only (prompt-ways.ts).
    if ((await answerSourceOf(d, prompt.source)) !== from.source) {
      // The Metric does not take values from here: the answer is not recorded, and the person gets their form link.
      const { data: token } = await db().from("tokens").select("code").eq("workspace_id", d.workspace_id).eq("metric_id", prompt.metric_id).eq("submitter_id", d.recipient_id).is("stands_in_for", null).limit(1).maybeSingle();
      const form = token ? linkTo(`/submit/${token.code}`) : undefined;
      const why = form ? `This Metric takes values only through your form:\n${form}` : `This Metric does not take values ${from.source === "mail" ? "by email" : from.source === "telegram" ? "by Telegram" : "on Slack"}.`;
      return { outcome: "form_link", subject: "Your value was not recorded", text: why, link: form, changes: false };
    }
  }
  if (!text) return nothing("empty");
  const figures = await figuresFor(d, from.source);
  if (!figures) return nothing("unknown_token");
  if (d.combined && !figures.some((f) => f.closedWhy === null)) return { outcome: "form_link", subject: "Your values were not recorded", text: "Nothing in this message takes a reply any more. Open the link in the message, or open Ziffr.", changes: false };
  return report({ d, from, figures, combined: Boolean(d.combined), text, mode, context: await contextOf(d) });
}

/** The most replies a message takes: the usual number, and for one with several figures 2 more for each, at most 60. */
export async function repliesAllowed(deliveryId: number, usual: number): Promise<number> {
  const { count, error } = await db().from("delivery_prompts").select("id", { count: "exact", head: true }).eq("delivery_id", deliveryId);
  if (error) throw new Error("The message could not be read.");
  return count ? Math.min(usual + 2 * count, 60) : usual;
}

// How Value Notes are kept (GLOSSARY: Value Note; spec 0064): the checks on the words, the history of one period, and
// what happens to notes when a value changes. Nothing here asks who is reading or writing: value-notes.ts does that
// for a person, and the intake does it before a value is recorded. Words are sealed with the Workspace Key and are
// never written to a log.
import { db } from "./db";
import { insertSealed, openRows } from "./sealed-columns";
import { allRows, mustRead } from "./workspace-data";
import type { SourceId } from "./types";

/** The longest a note may be, in characters. */
export const NOTE_MAX = 1000;
/** The most entries a period's history keeps; a removal is always taken (the database holds the same limit). */
export const NOTES_PER_PERIOD = 50;

/** Why a note with more than NOTE_MAX characters is not taken from a program or the app. */
export const NOTE_TOO_LONG = `A note has at most ${NOTE_MAX.toLocaleString("en-US")} characters.`;
/** What is said when a period holds as many entries as it keeps. */
export const NOTES_FULL = `This period already has ${NOTES_PER_PERIOD} notes, the most it keeps.`;

// Controls other than the line break, and the characters that turn the direction of text around what follows them.
const UNWANTED = /(?!\n)[\p{Cc}\u061c\u200e\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069]/gu;

/** A note's words as they may be kept, from anything that arrived: a string, trimmed, without control and direction
 * characters, line breaks kept. A longer one is cut (`cut`, for a reply or a form) or refused (a program, the app). */
export function cleanNote(input: unknown, tooLong: "cut" | "refuse"): { words: string; cut: boolean } | { problem: string } {
  if (typeof input !== "string") return { problem: "A note is text." };
  // Bounded before anything is done to it, whatever arrived.
  const text = input.slice(0, NOTE_MAX * 20).replace(/\r\n?/g, "\n").replace(/\t/g, " ").replace(UNWANTED, "").trim();
  if (!text) return { problem: "The note is empty." };
  const characters = [...text];
  if (characters.length <= NOTE_MAX) return { words: text, cut: false };
  if (tooLong === "refuse") return { problem: NOTE_TOO_LONG };
  return { words: characters.slice(0, NOTE_MAX).join("").trimEnd(), cut: true };
}

/** One stored entry of a period's note history, its words and number opened. */
export type NoteEntry = {
  id: number; metric_id: number; period_start: string; note_id: number | null; kind: "written" | "corrected" | "removed";
  observation_id: number | null; words: string | null; said_of: number | null; author_id: string; source: string;
  added_later: boolean; replaced_at: string | null; erased_at: string | null; created_at: string;
};

const COLUMNS = "id, metric_id, period_start, note_id, kind, observation_id, words, said_of, said_of_sealed, author_id, source, added_later, replaced_at, erased_at, created_at";
const UNREAD = "The notes could not be read.";

/** The entries of one Metric, of one period or of all, oldest first. A note still travelling with a proposed
 * Correction is not a Value Note and is never among them. A read that fails throws: notes are never silently missing. */
export async function noteEntries(ws: string, metricId: number, period?: string): Promise<NoteEntry[]> {
  const rows = await allRows<Record<string, unknown>>((from, to) => {
    let query = db().from("value_notes").select(COLUMNS).eq("workspace_id", ws).eq("metric_id", metricId).is("proposal", null);
    if (period) query = query.eq("period_start", period);
    return mustRead<Record<string, unknown>>(query.order("id").range(from, to), UNREAD);
  });
  const opened = (await openRows("value_notes", ws, rows)) as Record<string, unknown>[];
  return opened.map((r) => ({ ...r, id: Number(r.id), note_id: r.note_id === null ? null : Number(r.note_id), observation_id: r.observation_id === null ? null : Number(r.observation_id), said_of: typeof r.said_of === "number" ? r.said_of : null }) as NoteEntry);
}

/** One note: its first entry and everything that happened to it. */
export type NoteThread = {
  first: NoteEntry;
  /** The first entry and every further one, oldest first. */
  entries: NoteEntry[];
  /** The entry whose words stand now. */
  latest: NoteEntry;
  /** The entry that removed it, if one did: whatever came after, the note stays removed. */
  removed: NoteEntry | null;
  /** Its value was replaced, so it is history only. */
  replaced: boolean;
  /** Its words were deleted for good. */
  erased: boolean;
};

/** The notes the entries make up, newest first. */
export function noteThreads(entries: readonly NoteEntry[]): NoteThread[] {
  return entries.filter((e) => e.note_id === null).map((first) => {
    const all = entries.filter((e) => e.id === first.id || e.note_id === first.id);
    return {
      first,
      entries: all,
      latest: all.filter((e) => e.kind !== "removed").at(-1)!,
      removed: all.find((e) => e.kind === "removed") ?? null,
      replaced: all.some((e) => e.replaced_at !== null),
      erased: all.some((e) => e.erased_at !== null),
    };
  }).reverse();
}

/** Whether a note stands in the history only: removed, deleted for good, or said of a value since replaced. */
export const isPast = (t: NoteThread) => Boolean(t.removed) || t.replaced || t.erased;

/** What the history may show of an entry's words: nothing once its note was removed or deleted for good. */
export const wordsShown = (e: NoteEntry, t: NoteThread): string | null => (t.removed || t.erased ? null : e.words);

/** What an entry to be added carries. `replaced_at` is set on one filed under a value that is no longer there. */
export type NewEntry = Pick<NoteEntry, "metric_id" | "period_start" | "note_id" | "kind" | "observation_id" | "words" | "said_of" | "author_id" | "source" | "added_later"> & { proposal?: number; replaced_at?: string };

/** Adds one entry, its words and number sealed for it; throws when it cannot be saved. Answers its id. */
export async function addEntry(ws: string, entry: NewEntry): Promise<number> {
  const [row] = await insertSealed("value_notes", ws, [entry]);
  return Number(row!.id);
}

/** A note a text reply brought for a value that is in (spec 0064, "A later reply"). */
export type ReplyNoteEntry = {
  metricId: number; period: string; authorId: string; source: SourceId;
  /** The contribution the note is about, and the number it holds. */
  observationId: number; saidOf: number;
  /** The author's value was replaced meanwhile, so the note is filed under their earlier value, in the history. */
  replaced: boolean;
  addedLater: boolean;
};

/** What became of a reply's note: `noteId` names the note, `inPlace` that it took the place of an earlier one. */
export type ReplyNoteSaved = { saved: true; noteId: number; inPlace: boolean } | { saved: false; reason: string };

/** Saves a reply's note: a second one on the same value by the same author takes the first one's place, and the same
 * words again add nothing. It checks no rights: the caller has decided that this person may write on this value. */
export async function addReplyNote(ws: string, at: ReplyNoteEntry, words: unknown): Promise<ReplyNoteSaved> {
  const cleaned = cleanNote(words, "cut");
  if ("problem" in cleaned) return { saved: false, reason: cleaned.problem };
  try {
    const entries = await noteEntries(ws, at.metricId, at.period);
    const earlier = at.replaced ? undefined : noteThreads(entries).find((t) => !isPast(t) && t.first.author_id === at.authorId && t.first.observation_id === at.observationId);
    if (earlier && earlier.latest.words === cleaned.words) return { saved: true, noteId: earlier.first.id, inPlace: false };
    if (entries.filter((e) => e.kind !== "removed").length >= NOTES_PER_PERIOD) return { saved: false, reason: NOTES_FULL };
    const id = await addEntry(ws, {
      metric_id: at.metricId, period_start: at.period, note_id: earlier?.first.id ?? null, kind: earlier ? "corrected" : "written", observation_id: at.observationId,
      words: cleaned.words, said_of: earlier ? earlier.first.said_of : at.saidOf, author_id: at.authorId, source: at.source, added_later: at.addedLater,
      ...(at.replaced ? { replaced_at: new Date().toISOString() } : {}),
    });
    return { saved: true, noteId: earlier?.first.id ?? id, inPlace: Boolean(earlier) };
  } catch (error) {
    // The error's own words only: they never hold the note's.
    console.error("A reply's Value Note could not be saved:", error instanceof Error ? error.message : "unknown");
    return { saved: false, reason: "The note could not be saved." };
  }
}

/** One note leaves the current view and stays in the history, as when its words moved to a newer value. */
export async function retireNote(ws: string, noteId: number): Promise<void> {
  for (const column of ["id", "note_id"]) {
    const { error } = await db().from("value_notes").update({ replaced_at: new Date().toISOString() }).eq("workspace_id", ws).eq(column, noteId).is("replaced_at", null);
    if (error) console.error("A Value Note could not be moved to the history:", error.message);
  }
}

/** What became of a note that came with a value. The value stands either way. */
export type NoteSaved = { saved: true; cut: boolean } | { saved: false; reason: string };

/** The words of a value as it was written, for what happens to its notes. */
export type ValueWritten = {
  metricId: number; period: string; observationId: number;
  /** The period's number before and after this value; `before` is null for a first value. */
  before: number | null; after: number;
  /** Whether this value replaced the one that was there (overwrite, Correction, Self-check): not "add" or "keep both". */
  replaces: boolean;
  /** The value replaced was a Filled-in Value, which a new one replaces even when the number is the same. */
  replacedFilledIn?: boolean;
};

/** The note that came with a value, as it arrived: untrusted, checked here. */
export type NoteArriving = { words: unknown; authorId: string; source: SourceId; tooLong: "cut" | "refuse" };

const FAILED = "The note could not be saved. The value stands.";

/** Applies a value that was written to the period's notes (spec 0064, the history table): the notes of a replaced
 * value leave the current view, and the note that came with it is added unless it is already there. The same value
 * with the same words again, as a nightly Feed sends it, changes nothing. It never fails the value. */
export async function notesAfterValue(ws: string, value: ValueWritten, note?: NoteArriving): Promise<NoteSaved | undefined> {
  const cleaned = note ? cleanNote(note.words, note.tooLong) : null;
  const words = cleaned && "words" in cleaned ? cleaned.words : null;
  try {
    const entries = await noteEntries(ws, value.metricId, value.period);
    const standing = noteThreads(entries).filter((t) => !isPast(t));
    const there = words !== null && standing.some((t) => t.first.observation_id === value.observationId && t.latest.words === words && t.latest.said_of === value.after);
    const full = entries.filter((e) => e.kind !== "removed").length >= NOTES_PER_PERIOD;
    // With the same number, notes give way only to other words that can be kept in their place.
    const replaced = value.replaces && (value.before !== value.after || Boolean(value.replacedFilledIn) || (words !== null && !there && !full));
    if (replaced) await retireNotes(ws, value.observationId);
    if (!note) return undefined;
    if (!cleaned || "problem" in cleaned) return { saved: false, reason: cleaned?.problem ?? FAILED };
    if (there && !replaced) return { saved: true, cut: cleaned.cut };
    if (full) return { saved: false, reason: NOTES_FULL };
    await addEntry(ws, { metric_id: value.metricId, period_start: value.period, note_id: null, kind: "written", observation_id: value.observationId, words: cleaned.words, said_of: value.after, author_id: note.authorId, source: note.source, added_later: false });
    return { saved: true, cut: cleaned.cut };
  } catch (error) {
    // The error's own words only: they never hold the note's.
    console.error("Value Notes could not be updated:", error instanceof Error ? error.message : "unknown");
    return note ? { saved: false, reason: FAILED } : undefined;
  }
}

// Whether the proposed words are the value's note already; if they are other words, the earlier notes give way.
async function settleSameNumber(ws: string, messageId: number, accepted: Accepted): Promise<boolean> {
  try {
    const { data, error } = await db().from("value_notes").select("id, words").eq("workspace_id", ws).eq("proposal", messageId);
    if (error) throw new Error("The proposed note could not be read.");
    const [proposed] = (await openRows("value_notes", ws, (data ?? []) as Record<string, unknown>[])) as { words?: unknown }[];
    if (!proposed) return false;
    const entries = await noteEntries(ws, accepted.metricId, accepted.period);
    const standing = noteThreads(entries).filter((t) => !isPast(t) && t.first.observation_id === accepted.observationId);
    if (standing.some((t) => t.latest.words === proposed.words)) return true;
    // Notes give way only to other words that can be kept in their place: a full period keeps what it has.
    if (entries.filter((e) => e.kind !== "removed").length < NOTES_PER_PERIOD) await retireNotes(ws, accepted.observationId);
  } catch (error) {
    console.error("Value Notes could not be updated:", error instanceof Error ? error.message : "unknown");
  }
  return false;
}

/** The notes of a contribution whose value was replaced leave the current view and stay in the history. */
async function retireNotes(ws: string, observationId: number): Promise<void> {
  const { error } = await db().from("value_notes").update({ replaced_at: new Date().toISOString() }).eq("workspace_id", ws).eq("observation_id", observationId).is("replaced_at", null);
  if (error) throw new Error("Notes of a replaced value could not be marked.");
}

/** Keeps the note that came with a value proposed for a locked period, tied to the proposal: it becomes the period's
 * Value Note only if the Correction is accepted. It never fails the proposal. */
export async function noteWithProposal(ws: string, proposal: { messageId: number; metricId: number; period: string; value: number }, note: NoteArriving): Promise<NoteSaved> {
  const cleaned = cleanNote(note.words, note.tooLong);
  if ("problem" in cleaned) return { saved: false, reason: cleaned.problem };
  try {
    await addEntry(ws, { metric_id: proposal.metricId, period_start: proposal.period, note_id: null, kind: "written", observation_id: null, words: cleaned.words, said_of: proposal.value, author_id: note.authorId, source: note.source, added_later: true, proposal: proposal.messageId });
    return { saved: true, cut: cleaned.cut };
  } catch (error) {
    console.error("a proposed Value Note could not be saved:", error instanceof Error ? error.message : "unknown");
    return { saved: false, reason: "The note could not be saved. The proposal stands." };
  }
}

/** A person's value that came in an interactive way with no note, or the proposal it went as: what Ziffr may ask a
 * note about (note-question.ts). For the core alone: no browser and no program is sent it. */
export type NumberOnly = { metricId: number; period: string; authorId: string; value: number } & ({ observationId: number; proposal?: undefined } | { proposal: number; observationId?: undefined });

/** The note of a proposed Correction, written again: it takes the place of the author's earlier words for that
 * proposal, so that a second answer replaces the first. It never fails the proposal. */
export async function replaceProposedNote(ws: string, proposal: { messageId: number; metricId: number; period: string; value: number }, note: NoteArriving): Promise<NoteSaved & { inPlace?: boolean }> {
  const cleaned = cleanNote(note.words, note.tooLong);
  if ("problem" in cleaned) return { saved: false, reason: cleaned.problem };
  const { data: gone, error } = await db().from("value_notes").delete().eq("workspace_id", ws).eq("proposal", proposal.messageId).eq("author_id", note.authorId).select("id");
  if (error) {
    console.error("a proposed Value Note could not be replaced:", error.message);
    return { saved: false, reason: "The note could not be saved. The proposal stands." };
  }
  const saved = await noteWithProposal(ws, proposal, note);
  return saved.saved ? { ...saved, inPlace: Boolean(gone?.length) } : saved;
}

/** The value an accepted Correction wrote; `sameNumber` when it is the number that stood there before. */
export type Accepted = { metricId: number; period: string; observationId: number; sameNumber: boolean };

/** The database's code for a period that already holds as many notes as it keeps (trigger value_notes_cap). */
const FULL_CODE = "ZF480";

/** A Correction was decided: accepted, its note becomes the Value Note of the value now written; declined, it goes.
 * With the same number, its words take the place of the value's notes, and words already there add nothing. In a period
 * that holds NOTES_PER_PERIOD notes already, the value is taken and the proposed note goes. */
export async function decideProposedNote(ws: string, messageId: number, accepted: Accepted | null): Promise<void> {
  // A new number has retired the earlier notes already (notesAfterValue).
  const known = accepted?.sameNumber ? await settleSameNumber(ws, messageId, accepted) : false;
  const drop = () => db().from("value_notes").delete().eq("workspace_id", ws).eq("proposal", messageId);
  let { error } = await (accepted && !known ? db().from("value_notes").update({ proposal: null, observation_id: accepted.observationId }).eq("workspace_id", ws).eq("proposal", messageId) : drop());
  // The database counts under the period's lock, so two notes arriving at once never pass the cap.
  if (error?.code === FULL_CODE) ({ error } = await drop());
  // The decision is made either way; a note left behind stays a proposal, which nobody is shown.
  if (error) console.error("a proposed Value Note could not be settled:", error.message);
}

// What a person may do with Value Notes (GLOSSARY: Value Note; spec 0064): read a period's notes, write, correct,
// remove and delete them for good. Whoever sees a period's value reads its notes and nobody else, decided here on
// every call. Whoever sent a value writes on their own; the Metric Owner and Editors write on any period. Reads one
// Workspace only and sends only words, numbers, names and times of the one period asked for.
import { db } from "./db";
import { Forbidden, Refused, type Actor } from "./actor";
import { peopleFor, seriesFor, visibleMetricIds } from "./access";
import { ARCHIVED_REFUSAL } from "./archived-metrics";
import { audit } from "./audit-log";
import { condensedOn, condensedRefusal } from "./condensed-values";
import { refuseInDemo } from "./demo";
import { yearStartOf } from "./fiscal-year";
import { nameHider } from "./hide-names";
import { canEditMetric } from "./metrics";
import { periodStart } from "./periods";
import { openRows } from "./sealed-columns";
import { isLocked, peopleToHide } from "./submissions";
import { addEntry, cleanNote, isPast, noteEntries, noteThreads, NOTES_FULL, NOTES_PER_PERIOD, wordsShown, type NoteEntry, type NoteThread } from "./value-note-store";
import { getMetrics } from "./workspace-data";
import type { Metric } from "./types";

/** A note as it stands now, for one reader. */
export type ValueNote = {
  id: number;
  words: string;
  /** Who wrote it, by name; "Someone" for a Guest about anyone else. After a correction, who wrote it first. */
  author: string;
  /** Who corrected it last, when somebody did. */
  correctedBy: string | null;
  at: string;
  source: string;
  addedLater: boolean;
  /** For a calculated value that has changed since: the number it showed when the note was written. */
  writtenWhenItShowed: number | null;
  mayCorrect: boolean;
  mayRemove: boolean;
  mayDeleteForGood: boolean;
};

/** One entry of a period's history, in the order it happened. */
export type ValueNoteEntry = {
  noteId: number;
  kind: NoteEntry["kind"];
  /** Null for a removal, and for every entry of a note removed or deleted for good. */
  words: string | null;
  saidOf: number | null;
  /** Who wrote this entry; on a removal, who removed the note. */
  author: string;
  at: string;
  source: string;
  addedLater: boolean;
  replaced: boolean;
  deletedForGood: boolean;
};

/** The notes of one period: the current ones, newest first, and the whole history. */
export type PeriodNotes = { current: ValueNote[]; history: ValueNoteEntry[] };

type Contribution = { id: number; submitter_id: string | null; entered_by: string | null; value: number };
type Sight = {
  metric: Metric;
  /** Whether the actor is the Metric Owner or an Editor. */
  editor: boolean;
  /** The values sent for the period; none for a calculated Metric. */
  contributions: Contribution[];
  /** What a calculated Metric shows this person for the period; null for a Metric that takes values. */
  calculated: number | null;
};

// What a person may see of one period, or null when they may not see its value. This is the whole rule of who reads
// notes: a Metric they see; for a calculated one (Derived Metric, Total) a number they are shown for that period, which
// a Total or what reads it withholds from someone who may not see what is added up.
async function sightOf(actor: Actor, metricId: unknown, period: unknown): Promise<Sight | null> {
  if (actor.key || typeof metricId !== "number" || !Number.isSafeInteger(metricId) || typeof period !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(period) || Number.isNaN(Date.parse(`${period}T00:00:00Z`))) return null;
  const ws = actor.workspaceId;
  const metrics = await getMetrics(ws);
  const metric = metrics.find((m) => m.id === metricId);
  if (!metric) return null;
  const [visible, yearStart] = await Promise.all([visibleMetricIds(ws, actor.personId, metrics), yearStartOf(ws)]);
  if (!visible.has(metric.id) || periodStart(period, metric.period, yearStart) !== period) return null;
  const editor = await canEditMetric(actor, metric.id);
  if (metric.formula) {
    if (metric.inputs_withheld) return null;
    const point = (await seriesFor(ws, metrics, visible, [metric.id])).series[metric.slug]?.find((p) => p.period === period);
    return point ? { metric, editor, contributions: [], calculated: point.value } : null;
  }
  const { data, error } = await db().from("observations").select("id, submitter_id, entered_by, value, value_sealed").eq("workspace_id", ws).eq("metric_id", metric.id).eq("period_start", period).order("created_at").order("id");
  if (error) throw new Error("The values could not be read.");
  const rows = (await openRows("observations", ws, (data ?? []) as Record<string, unknown>[])) as Record<string, unknown>[];
  const contributions = rows.filter((o) => typeof o.value === "number").map((o) => ({ id: Number(o.id), submitter_id: o.submitter_id as string | null, entered_by: o.entered_by as string | null, value: o.value as number }));
  return contributions.length ? { metric, editor, contributions, calculated: null } : null;
}

// A note stands while its value does: on a calculated Metric always, else while the contribution it is about is there.
const stands = (s: Sight, t: NoteThread) => !isPast(t) && (s.metric.formula ? true : s.contributions.some((c) => c.id === t.first.observation_id));

/** The notes of one Metric's period for a person who sees its value; null for anyone else, so that a period that is
 * not theirs reads like one that is not there. A Guest reads no names, neither as authors nor in the words. */
export async function periodValueNotes(actor: Actor, metricId: number, period: string): Promise<PeriodNotes | null> {
  const s = await sightOf(actor, metricId, period);
  if (!s) return null;
  const ws = actor.workspaceId;
  const threads = noteThreads(await noteEntries(ws, s.metric.id, period));
  if (!threads.length) return { current: [], history: [] };
  const guest = actor.role === "guest";
  // A Guest is told only their own name (peopleFor), and no Feed's.
  const [inWorkspace, { data: feeds }, hidden] = await Promise.all([
    peopleFor(actor),
    guest ? Promise.resolve({ data: [] }) : db().from("feeds").select("person_id, name").eq("workspace_id", ws),
    guest ? peopleToHide(ws) : Promise.resolve([]),
  ]);
  const names = new Map<string, string>([...(feeds ?? []).map((f) => [f.person_id as string, f.name as string] as const), ...inWorkspace.map((p) => [p.id, p.name] as const)]);
  const who = (id: string) => names.get(id) ?? (guest ? "Someone" : "A former member");
  const hide = guest ? nameHider(hidden.filter((p) => p.id !== actor.personId)) : (text: string) => text;
  const writable = !s.metric.archived_at && !(await condensedOn(ws, s.metric.id, period));
  const current = threads.filter((t) => stands(s, t)).map((t): ValueNote => {
    const may = writable && (s.editor || t.first.author_id === actor.personId);
    return {
      id: t.first.id, words: hide(t.latest.words ?? ""), author: who(t.first.author_id), correctedBy: t.latest.id === t.first.id ? null : who(t.latest.author_id),
      at: t.latest.created_at, source: t.latest.source, addedLater: t.latest.added_later,
      writtenWhenItShowed: s.calculated !== null && t.first.said_of !== s.calculated ? t.first.said_of : null,
      mayCorrect: may, mayRemove: may, mayDeleteForGood: s.metric.owner_id === actor.personId,
    };
  });
  const history = threads.flatMap((t) => t.entries.map((e): ValueNoteEntry => {
    const words = wordsShown(e, t);
    return { noteId: t.first.id, kind: e.kind, words: words === null ? null : hide(words), saidOf: e.said_of, author: who(e.author_id), at: e.created_at, source: e.source, addedLater: e.added_later, replaced: t.replaced, deletedForGood: t.erased };
  }));
  return { current, history: history.sort((a, b) => a.at.localeCompare(b.at)) };
}

// Nobody writes on an Archived Metric or a Condensed Value.
async function assertTakesNotes(ws: string, metric: Metric, period: string): Promise<void> {
  if (metric.archived_at) throw new Refused(ARCHIVED_REFUSAL);
  const condensed = await condensedOn(ws, metric.id, period);
  if (condensed) throw new Refused(condensedRefusal(condensed));
}

// A note written once the period is locked, or after its value was approved, says "added later".
async function isAfterApprovalOrLock(ws: string, metricId: number, period: string): Promise<boolean> {
  if (await isLocked(metricId, period)) return true;
  const { data, error } = await db().from("audit_events").select("id, details").eq("workspace_id", ws).eq("object_type", "metric").eq("object_id", String(metricId)).eq("kind", "approval.given").order("id", { ascending: false }).limit(500);
  if (error) throw new Error("The approvals could not be read.");
  const events = (await openRows("audit_events", ws, (data ?? []) as Record<string, unknown>[])) as { details?: { period?: string } | null }[];
  return events.some((e) => e.details?.period === period);
}

function wordsOf(input: unknown): string {
  const cleaned = cleanNote(input, "refuse");
  if ("problem" in cleaned) throw new Refused(cleaned.problem);
  return cleaned.words;
}

const NOT_YOURS = "There is no value here that you can write a note on.";

/** Writes a note on a period's value: the Metric Owner or an Editor on any period, anyone else on a value they sent or
 * entered (`observationId`, else their newest). On a calculated Metric only the owner and Editors. Answers the note's
 * id; the same words on the same value again add nothing. */
export async function writeValueNote(actor: Actor, input: { metricId: number; period: string; words: unknown; observationId?: number }): Promise<{ id: number }> {
  refuseInDemo(actor);
  const s = await sightOf(actor, input.metricId, input.period);
  if (!s) throw new Forbidden();
  const ws = actor.workspaceId;
  await assertTakesNotes(ws, s.metric, input.period);
  const own = s.contributions.filter((c) => s.editor || c.submitter_id === actor.personId || c.entered_by === actor.personId);
  const target = input.observationId === undefined ? own.at(-1) : own.find((c) => c.id === input.observationId);
  if (s.metric.formula ? !s.editor || input.observationId !== undefined : !target) throw new Forbidden(NOT_YOURS);
  const words = wordsOf(input.words);
  const saidOf = target ? target.value : s.calculated!;
  const entries = await noteEntries(ws, s.metric.id, input.period);
  const there = noteThreads(entries).find((t) => stands(s, t) && t.latest.words === words && t.latest.said_of === saidOf && t.first.observation_id === (target?.id ?? null));
  if (there) return { id: there.first.id };
  if (entries.filter((e) => e.kind !== "removed").length >= NOTES_PER_PERIOD) throw new Refused(NOTES_FULL);
  return { id: await addEntry(ws, { metric_id: s.metric.id, period_start: input.period, note_id: null, kind: "written", observation_id: target?.id ?? null, words, said_of: saidOf, author_id: actor.personId, source: "web_form", added_later: await isAfterApprovalOrLock(ws, s.metric.id, input.period) }) };
}

// The Metric and period of a note of the actor's Workspace; the id comes from a browser.
async function placeOf(actor: Actor, noteId: unknown): Promise<{ metricId: number; period: string }> {
  if (typeof noteId !== "number" || !Number.isSafeInteger(noteId)) throw new Forbidden();
  const { data } = await db().from("value_notes").select("metric_id, period_start").eq("workspace_id", actor.workspaceId).eq("id", noteId).is("note_id", null).is("proposal", null).maybeSingle();
  if (!data) throw new Forbidden();
  return { metricId: Number(data.metric_id), period: String(data.period_start) };
}

// A note the actor may change: they see its value, they wrote it or are the owner or an Editor, and notes are taken.
async function changeable(actor: Actor, noteId: number): Promise<{ s: Sight; thread: NoteThread; period: string; entries: NoteEntry[] }> {
  refuseInDemo(actor);
  const { metricId, period } = await placeOf(actor, noteId);
  const s = await sightOf(actor, metricId, period);
  if (!s) throw new Forbidden();
  const entries = await noteEntries(actor.workspaceId, metricId, period);
  const thread = noteThreads(entries).find((t) => t.first.id === noteId);
  if (!thread || !(s.editor || thread.first.author_id === actor.personId)) throw new Forbidden("Only its author, the Metric's owner and Editors change a note.");
  await assertTakesNotes(actor.workspaceId, s.metric, period);
  return { s, thread, period, entries };
}

/** Corrects a note: its author, the Metric Owner or an Editor. The new words show; the earlier ones stay in the history. */
export async function correctValueNote(actor: Actor, noteId: number, input: unknown): Promise<void> {
  const { s, thread, period, entries } = await changeable(actor, noteId);
  if (!stands(s, thread)) throw new Refused("This note is part of the history now and can no longer be corrected.");
  const words = wordsOf(input);
  if (words === thread.latest.words) return;
  if (entries.filter((e) => e.kind !== "removed").length >= NOTES_PER_PERIOD) throw new Refused(NOTES_FULL);
  const ws = actor.workspaceId;
  await addEntry(ws, { metric_id: s.metric.id, period_start: period, note_id: noteId, kind: "corrected", observation_id: thread.first.observation_id, words, said_of: thread.first.said_of, author_id: actor.personId, source: "web_form", added_later: await isAfterApprovalOrLock(ws, s.metric.id, period) });
}

/** Removes a note: its author, the Metric Owner or an Editor. Its words are hidden and the history says who removed it. */
export async function removeValueNote(actor: Actor, noteId: number): Promise<void> {
  const { s, thread, period } = await changeable(actor, noteId);
  if (thread.removed) return;
  const ws = actor.workspaceId;
  await addEntry(ws, { metric_id: s.metric.id, period_start: period, note_id: noteId, kind: "removed", observation_id: thread.first.observation_id, words: null, said_of: thread.first.said_of, author_id: actor.personId, source: "web_form", added_later: false });
  // Without the words: they are in no log.
  await audit(actor, { kind: "value_note.removed", object: { type: "metric", id: s.metric.id, name: s.metric.name }, details: { period } });
}

/** Deletes a note's words for good, for something that should never have been written: the Metric Owner only, also on
 * an Archived Metric and whatever happened to the note. Every entry of it is emptied; that it was there stays. Notes
 * are kept nowhere else yet: what later copies words (Snapshots, View Links, the intake log) must empty them here. */
export async function deleteValueNoteForGood(actor: Actor, noteId: number): Promise<void> {
  refuseInDemo(actor);
  const ws = actor.workspaceId;
  const { metricId, period } = await placeOf(actor, noteId);
  const metrics = await getMetrics(ws);
  const metric = metrics.find((m) => m.id === metricId);
  if (actor.key || !metric || metric.owner_id !== actor.personId || actor.role === "guest" || !(await visibleMetricIds(ws, actor.personId, metrics)).has(metricId)) {
    throw new Forbidden("Only the Metric's owner deletes a note's words for good.");
  }
  const gone = { words: null, erased_at: new Date().toISOString() };
  // The first entry and then every further one of the same note.
  for (const column of ["id", "note_id"]) {
    const { error } = await db().from("value_notes").update(gone).eq("workspace_id", ws).eq(column, noteId);
    if (error) throw new Error("The note's words could not be deleted.");
  }
  await audit(actor, { kind: "value_note.deleted", object: { type: "metric", id: metricId, name: metric.name }, details: { period } });
}

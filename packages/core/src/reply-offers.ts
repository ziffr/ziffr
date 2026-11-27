// The offer after a reply's note (spec 0064, "The offer"; GLOSSARY: Value Note, Submission Rule): the words that held
// one other number were saved as the note, and "yes", as the person's next reply in the same place, records that number.
// Kept here: which note it came from, a keyed mark of the number and the state of the period's values, never the words
// or the number. It checks no rights: prompt-reply.ts calls it for a reply from the person the message went to, and the
// value itself goes through the intake, which checks everything again.
import { createHash } from "node:crypto";
import { db } from "./db";
import { loneNumber, type ReplyContext } from "./reply-reader";
import { isLocked } from "./submissions";
import { noteEntries, noteThreads } from "./value-note-store";
import { workspaceCipher } from "./workspace-keys";
import type { NumberStyle } from "./number-style";
import type { SubmissionRule } from "./types";

const PURPOSE = "reply_offers.value";

/** An open offer as it is kept. */
export type StoredOffer = { delivery_id: number; prompt_id: number; metric_id: number; note_id: number; value_mark: string; number_style: string; value_stamp: string };

const COLUMNS = "delivery_id, prompt_id, metric_id, note_id, value_mark, number_style, value_stamp";

// A mark of the number, never the number: keyed with the Workspace Key, and where the Workspace has none, a hash bound
// to the message.
const plainMark = (deliveryId: number, value: number) => createHash("sha256").update(`${PURPOSE}:${deliveryId}:${value}`).digest("hex");

/** The state of a period's values that an offer holds for: any value added, replaced or corrected, a changed
 * Submission Rule and a Lock set or lifted give another stamp, and so close the offer: "yes" does what was asked or
 * nothing. */
export async function valueStamp(ws: string, metricId: number, period: string, rule: SubmissionRule): Promise<string> {
  const locked = await isLocked(metricId, period);
  const { data, count, error } = await db().from("observations").select("id, value, value_sealed", { count: "exact" }).eq("workspace_id", ws).eq("metric_id", metricId).eq("period_start", period).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(1);
  if (error) throw new Error("The values could not be read.");
  const latest = data?.[0];
  return createHash("sha256").update(JSON.stringify([rule, locked, count ?? 0, latest?.id ?? null, latest?.value_sealed ?? String(latest?.value ?? "")])).digest("hex");
}

/** Keeps the offer made in answer to a reply to this message; it takes the place of any earlier one. Throws when it
 * cannot be kept, so that nothing is offered that "yes" could not take. */
export async function keepOffer(ws: string, deliveryId: number, o: { promptId: number; metricId: number; noteId: number; value: number; style: NumberStyle; stamp: string }): Promise<void> {
  const cipher = await workspaceCipher(ws);
  const { error } = await db().from("reply_offers").upsert({
    delivery_id: deliveryId, workspace_id: ws, prompt_id: o.promptId, metric_id: o.metricId, note_id: o.noteId,
    value_mark: cipher.blindIndex(PURPOSE, String(o.value)) ?? plainMark(deliveryId, o.value), number_style: o.style, value_stamp: o.stamp, answer_message_id: null,
  }, { onConflict: "delivery_id" });
  if (error) throw new Error("The offer could not be kept.");
}

/** Takes the open offer of a message, which every reply that is read closes: removed in one write, so two replies at
 * once never both take it. */
export async function claimOffer(ws: string, deliveryId: number): Promise<StoredOffer | null> {
  const { data, error } = await db().from("reply_offers").delete().eq("delivery_id", deliveryId).eq("workspace_id", ws).select(COLUMNS);
  if (error) throw new Error("The offer could not be read.");
  return (data?.[0] as StoredOffer | undefined) ?? null;
}

/** The open offer of a message, left where it is: for showing what a reply nobody vouched for would do. */
export async function peekOffer(ws: string, deliveryId: number): Promise<StoredOffer | null> {
  const { data, error } = await db().from("reply_offers").select(COLUMNS).eq("delivery_id", deliveryId).eq("workspace_id", ws).maybeSingle();
  if (error) throw new Error("The offer could not be read.");
  return (data as StoredOffer | null) ?? null;
}

/** Remembers the chat message that made the offer, so that a reply to it finds the message it belongs to. */
export async function offerAnsweredAs(ws: string, deliveryId: number, messageId: number): Promise<void> {
  const { error } = await db().from("reply_offers").update({ answer_message_id: messageId }).eq("delivery_id", deliveryId).eq("workspace_id", ws);
  // The offer can still be taken by a reply to the request itself.
  if (error) console.error("An offer's message could not be recorded:", error.message);
}

/** The Deliveries of the open offers made by a chat message with this id; the caller checks the chat. */
export async function offersAnsweredAs(messageId: number): Promise<number[]> {
  const { data, error } = await db().from("reply_offers").select("delivery_id").eq("answer_message_id", messageId);
  if (error) throw new Error("The offer could not be read.");
  return (data ?? []).map((r) => Number(r.delivery_id));
}

/** The number an offer still stands for and the words it came from, or null when it holds no longer: the period's values
 * changed, the note was removed or its words deleted, or the words no longer give that number. */
export async function offeredValue(ws: string, o: StoredOffer, period: string, rule: SubmissionRule, reading: Omit<ReplyContext, "figures" | "email" | "style">): Promise<{ value: number; words: string; noteId: number } | null> {
  if ((await valueStamp(ws, o.metric_id, period, rule)) !== o.value_stamp) return null;
  const note = noteThreads(await noteEntries(ws, o.metric_id, period)).find((t) => t.first.id === Number(o.note_id));
  if (!note || note.removed || note.erased || !note.latest.words) return null;
  const value = loneNumber(note.latest.words, { ...reading, style: o.number_style as NumberStyle });
  if (value === null) return null;
  const cipher = await workspaceCipher(ws);
  const marks = [...cipher.blindIndexes(PURPOSE, String(value)), plainMark(Number(o.delivery_id), value)];
  return marks.includes(o.value_mark) ? { value, words: note.latest.words, noteId: note.first.id } : null;
}

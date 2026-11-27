// The question "anything behind it?" (spec 0064, "The question"; GLOSSARY: Value Note, Metric Description, Delivery,
// Token): whether Ziffr asks after a value that came with no note, which questions are open, and the note that answers
// one from a form. Asking sends nothing: whoever words a confirmation puts the question in it. Security (AGENTS.md rules
// 2 to 4): the question gives no reason, and whoever may not see the Metric, or typed into a form that is no sign-in, is
// asked whatever the value is, so that asking tells them nothing. A form's answer needs the random code only that form's
// result holds (kept as a hash), works once and for a day, and is checked again when it arrives: the form link's Token
// still counts, or the same person is signed in and still sees the Metric. It writes only on the value, or the proposed
// Correction, the question was made for. Nothing here reads a note back to anyone.
import { createHash, randomBytes } from "node:crypto";
import { visibleMetricIds } from "./access";
import type { Actor } from "./actor";
import { ARCHIVED_REFUSAL } from "./archived-metrics";
import { ASK_NOTE_DEFAULT } from "./ask-note";
import { targetFor } from "./compare";
import { condensedOn, condensedRefusal } from "./condensed-values";
import { db } from "./db";
import { noteFieldsOn } from "./form-submit";
import { openRows } from "./sealed-columns";
import { tokenValid, type TokenRow } from "./tokens";
import { personBlocked } from "./user-block";
import { addReplyNote, cleanNote, noteEntries, noteThreads, isPast, replaceProposedNote, type NoteSaved, type NumberOnly } from "./value-note-store";
import { isAfterApprovalOrLock } from "./value-notes";
import { unusualWarning } from "./workflow-engine";
import { getMetrics } from "./workspace-data";
import type { Metric } from "./types";

/** How long the field a form opens takes its note, in hours. */
export const NOTE_QUESTION_HOURS = 24;
// Rows are of no use once a reply address has stopped working; they go when a Workspace asks again.
const KEPT_DAYS = 31;

/** What is said for a form's question that takes no answer: whatever the reason, the same words. */
export const NOTE_QUESTION_OVER = "This note can no longer be saved here. Your value stands.";

const CODE = /^[A-Za-z0-9_-]{43}$/;
const hashOf = (code: string) => createHash("sha256").update(`ziffr-note-question:${code}`).digest("hex");

// Whether the person is a member who sees the Metric. A Contact sees none.
async function sees(ws: string, personId: string, metrics: Metric[], metricId: number): Promise<boolean> {
  const { data: member } = await db().from("memberships").select("user_id").eq("workspace_id", ws).eq("user_id", personId).maybeSingle();
  return Boolean(member) && (await visibleMetricIds(ws, personId, metrics)).has(metricId);
}

// Off target as the Metric table judges it (the period's own target first, else the Target Range), or unusual as the
// Metric's Workflow checks it, or without one a change of more than 100 % on the period before.
async function standsOut(ws: string, metric: Metric, at: NumberOnly): Promise<boolean> {
  const { data, error } = await db().from("series_values").select("metric_id, kind, period_start, value, value_sealed").eq("workspace_id", ws).eq("metric_id", metric.id).eq("kind", "target").eq("period_start", at.period);
  if (error) throw new Error("The targets could not be read.");
  const targets = (await openRows("series_values", ws, (data ?? []) as Record<string, unknown>[])) as { period_start: string; value: number | null }[];
  const t = targetFor(metric, at.period, targets.flatMap((x) => (typeof x.value === "number" ? [{ period: x.period_start, value: x.value }] : [])));
  if ((t.min !== null && at.value < Number(t.min)) || (t.max !== null && at.value > Number(t.max))) return true;
  return Boolean(await unusualWarning(metric.id, at.period, at.value));
}

// Whether to ask the person about this value. `seer` is who would learn something from a question that depends on the
// value: null for a form that is no sign-in, whose reader is asked every time.
async function asks(ws: string, at: NumberOnly, seer: string | null): Promise<boolean> {
  if (!noteFieldsOn(ws)) return false;
  const metrics = await getMetrics(ws);
  const metric = metrics.find((m) => m.id === at.metricId);
  if (!metric || metric.formula || metric.total || metric.archived_at) return false;
  const when = metric.ask_note ?? ASK_NOTE_DEFAULT;
  if (when === "never") return false;
  // A note of theirs that stands on this very value, as when the same number came again, has answered already.
  if (at.observationId !== undefined) {
    const standing = noteThreads(await noteEntries(ws, metric.id, at.period)).some((t) => !isPast(t) && t.first.observation_id === at.observationId && t.first.author_id === at.authorId);
    if (standing) return false;
  }
  if (when === "always" || !seer || !(await sees(ws, seer, metrics, metric.id))) return true;
  return standsOut(ws, metric, at);
}

// A hash of the value's row as it is now (its number is sealed, or plain where the Workspace seals nothing), or null
// when the row is gone. It differs once the value is written again.
async function markOf(ws: string, metricId: number, observationId: number): Promise<{ mark: string; row: Record<string, unknown> } | null> {
  const { data, error } = await db().from("observations").select("id, value, value_sealed").eq("workspace_id", ws).eq("metric_id", metricId).eq("id", observationId).maybeSingle();
  if (error) throw new Error("The value could not be read.");
  if (!data) return null;
  return { mark: createHash("sha256").update(JSON.stringify([data.value_sealed ?? null, data.value_sealed ? null : String(data.value)])).digest("hex"), row: data as Record<string, unknown> };
}

/** The columns that say what a question is about. */
async function target(ws: string, at: NumberOnly) {
  return {
    metric_id: at.metricId, period_start: at.period, person_id: at.authorId,
    observation_id: at.observationId ?? null, proposal: at.proposal ?? null,
    value_mark: at.observationId === undefined ? null : (await markOf(ws, at.metricId, at.observationId))?.mark ?? null,
  };
}

// Old questions go as new ones come: nothing can answer them any more.
async function forgetOld(ws: string): Promise<void> {
  await db().from("note_questions").delete().eq("workspace_id", ws).lt("created_at", new Date(Date.now() - KEPT_DAYS * 86_400_000).toISOString());
}

/** Who typed into the form: whoever holds a form link's code, or a signed-in person. */
export type FormAsker = { linkCode: string } | { personId: string };

/** After a form recorded a value without a note: the code its result carries so that the note can still be sent
 * (saveAskedNote), or nothing where Ziffr does not ask. It never fails the value. */
export async function askOnForm(ws: string | null, at: NumberOnly, by: FormAsker): Promise<string | undefined> {
  try {
    let workspaceId = ws;
    let tokenId: number | null = null;
    if ("linkCode" in by) {
      const { data } = await db().from("tokens").select("id, workspace_id, submitter_id").eq("code", by.linkCode).maybeSingle();
      // The link writes as its own holder only.
      if (!data || data.submitter_id !== at.authorId) return undefined;
      workspaceId = data.workspace_id as string;
      tokenId = data.id as number;
    } else if (by.personId !== at.authorId) return undefined;
    if (!workspaceId || !(await asks(workspaceId, at, "linkCode" in by ? null : by.personId))) return undefined;
    const code = randomBytes(32).toString("base64url");
    await forgetOld(workspaceId);
    const { error } = await db().from("note_questions").insert({ workspace_id: workspaceId, token_id: tokenId, code_hash: hashOf(code), ...(await target(workspaceId, at)) });
    if (error) {
      console.error("A question for a form could not be saved:", error.message);
      throw new Error("The question could not be saved.");
    }
    return code;
  } catch (e) {
    console.error("A note could not be asked for:", e instanceof Error ? e.message : "unknown");
    return undefined;
  }
}

/** After a reply recorded values without a note: which of these figures the confirmation asks about, each at most once
 * for a message. A figure asked about before only has the value its answer goes to brought up to date. The caller words
 * the question into the confirmation. It never fails the reply. */
export async function askOnReply(ws: string, deliveryId: number, personId: string, items: readonly { promptId: number; at: NumberOnly }[]): Promise<number[]> {
  const asked: number[] = [];
  for (const { promptId, at } of items) {
    try {
      const what = await target(ws, at);
      const { data: there, error } = await db().from("note_questions").update(what).eq("workspace_id", ws).eq("delivery_id", deliveryId).eq("prompt_id", promptId).select("id");
      if (error) {
        console.error("A question could not be brought up to date:", error.message);
        throw new Error("The question could not be saved.");
      }
      // A value entered in someone's place is noted by who entered it, who is the person asked.
      if (there?.length || at.authorId !== personId || !(await asks(ws, at, personId))) continue;
      await forgetOld(ws);
      const { error: failed } = await db().from("note_questions").insert({ workspace_id: ws, delivery_id: deliveryId, prompt_id: promptId, ...what });
      // Another reply asked at the same moment: one question is enough.
      if (failed && failed.code !== "23505") {
        console.error("A question for a reply could not be saved:", failed.message);
        throw new Error("The question could not be saved.");
      }
      if (!failed) asked.push(promptId);
    } catch (e) {
      console.error("A note could not be asked for:", e instanceof Error ? e.message : "unknown");
    }
  }
  return asked;
}

/** Remembers the chat message that asked, so that a reply to it, or a press on its buttons, finds the question. */
export async function questionsSentAs(ws: string, deliveryId: number, promptIds: readonly number[], message: string): Promise<void> {
  const { error } = await db().from("note_questions").update({ chat_message: message }).eq("workspace_id", ws).eq("delivery_id", deliveryId).in("prompt_id", [...promptIds]);
  // A reply to the request still answers.
  if (error) console.error("A question's message could not be recorded:", error.message);
}

/** The figures (by Prompt) a chat message of this Delivery asked about; `open` those not closed yet. */
export async function questionsIn(ws: string, deliveryId: number, message: string): Promise<{ promptId: number; open: boolean }[]> {
  const { data, error } = await db().from("note_questions").select("prompt_id, closed_at").eq("workspace_id", ws).eq("delivery_id", deliveryId).eq("chat_message", message).order("id");
  if (error) throw new Error("The question could not be read.");
  return (data ?? []).map((r) => ({ promptId: r.prompt_id as number, open: !r.closed_at }));
}

/** The Deliveries of the questions asked by a chat message with this id; the caller checks the chat. */
export async function deliveriesAskedIn(message: string): Promise<number[]> {
  const { data, error } = await db().from("note_questions").select("delivery_id").eq("chat_message", message).not("delivery_id", "is", null);
  if (error) throw new Error("The question could not be read.");
  return [...new Set((data ?? []).map((r) => Number(r.delivery_id)))];
}

/** Closes the questions of a message, all or those of some figures: answered, or answered with "no". */
export async function closeQuestions(ws: string, deliveryId: number, promptIds?: readonly number[]): Promise<void> {
  let query = db().from("note_questions").update({ closed_at: new Date().toISOString() }).eq("workspace_id", ws).eq("delivery_id", deliveryId).is("closed_at", null);
  if (promptIds) query = query.in("prompt_id", [...promptIds]);
  const { error } = await query;
  if (error) console.error("A question could not be closed:", error.message);
}

/** The proposed Corrections a message asked about that still wait for the owner, by Prompt, each with the number
 * proposed: words that answer such a question travel with the proposal. */
export async function openProposals(ws: string, deliveryId: number): Promise<Map<number, { messageId: number; value: number }>> {
  const { data, error } = await db().from("note_questions").select("prompt_id, proposal").eq("workspace_id", ws).eq("delivery_id", deliveryId).not("proposal", "is", null);
  if (error) throw new Error("The question could not be read.");
  const out = new Map<number, { messageId: number; value: number }>();
  if (!data?.length) return out;
  const { data: messages, error: unread } = await db().from("thread_messages").select("id, correction_value, correction_value_sealed").eq("workspace_id", ws).eq("correction_status", "proposed").in("id", data.map((r) => Number(r.proposal)));
  if (unread) throw new Error("The question could not be read.");
  const open = (await openRows("thread_messages", ws, (messages ?? []) as Record<string, unknown>[])) as { id: number; correction_value: number | null }[];
  for (const r of data) {
    const m = open.find((x) => Number(x.id) === Number(r.proposal));
    if (m && typeof m.correction_value === "number") out.set(r.prompt_id as number, { messageId: Number(m.id), value: m.correction_value });
  }
  return out;
}

type Question = {
  id: number; workspace_id: string; metric_id: number; period_start: string; person_id: string; token_id: number | null;
  observation_id: number | null; proposal: number | null; value_mark: string | null; created_at: string;
};

// Whether whoever sends the code may still write this note: by the form link, its Token still counts and is the
// person's, who is still in the Workspace; signed in, they are that person and still see the Metric.
async function mayAnswerForm(q: Question, actor: Actor | null, metrics: Metric[]): Promise<boolean> {
  const ws = q.workspace_id;
  if (await personBlocked(q.person_id)) return false;
  if (q.token_id === null) return Boolean(actor) && !actor!.key && actor!.workspaceId === ws && actor!.personId === q.person_id && (await sees(ws, q.person_id, metrics, q.metric_id));
  const [{ data: tokens }, { data: member }, { data: contact }] = await Promise.all([
    db().from("tokens").select("id, metric_id, submitter_id, stand_in_id, stands_in_for, expires_at").eq("workspace_id", ws).eq("metric_id", q.metric_id),
    db().from("memberships").select("user_id").eq("workspace_id", ws).eq("user_id", q.person_id).maybeSingle(),
    db().from("contacts").select("person_id").eq("workspace_id", ws).eq("person_id", q.person_id).maybeSingle(),
  ]);
  const all = (tokens ?? []) as (TokenRow & { id: number })[];
  const token = all.find((t) => t.id === q.token_id);
  return Boolean(member || contact) && Boolean(token && token.submitter_id === q.person_id && tokenValid(token, all));
}

// Saves a form's answer on what was asked about: the proposal while it waits, else the value, in the history when that
// value was replaced meanwhile.
async function saveAnswer(q: Question, metric: Metric, words: string): Promise<NoteSaved & { replaced?: boolean }> {
  const ws = q.workspace_id;
  if (q.proposal !== null) {
    const { data } = await db().from("thread_messages").select("correction_status").eq("workspace_id", ws).eq("id", q.proposal).maybeSingle();
    if (data?.correction_status !== "proposed") return { saved: false, reason: "The proposed correction was decided meanwhile, so the note was not saved." };
    // The number is the proposal's own; the note keeps it as the one it was said of.
    const [m] = (await openRows("thread_messages", ws, ((await db().from("thread_messages").select("id, correction_value, correction_value_sealed").eq("workspace_id", ws).eq("id", q.proposal)).data ?? []) as Record<string, unknown>[])) as { correction_value?: unknown }[];
    if (typeof m?.correction_value !== "number") return { saved: false, reason: "The note could not be saved." };
    return replaceProposedNote(ws, { messageId: Number(q.proposal), metricId: q.metric_id, period: q.period_start, value: m.correction_value }, { words, authorId: q.person_id, source: "web_form", tooLong: "cut" });
  }
  const now = await markOf(ws, q.metric_id, Number(q.observation_id));
  // Under "add" the one value grows with each contribution, whose note stays current.
  const replaced = !now || (metric.submission_rule !== "add" && now.mark !== q.value_mark);
  let row = now?.row;
  let table: "observations" | "observation_history" = "observations";
  if (replaced) {
    // The number the question was about: the first one that gave way since it was asked.
    const { data } = await db().from("observation_history").select("id, observation_id, value, value_sealed").eq("workspace_id", ws).eq("metric_id", q.metric_id).eq("observation_id", Number(q.observation_id)).gte("superseded_at", q.created_at).order("superseded_at").order("id").limit(1);
    if (data?.[0]) { row = data[0] as Record<string, unknown>; table = "observation_history"; }
  }
  const [opened] = row ? await openRows(table, ws, [row]) : [];
  if (typeof opened?.value !== "number") return { saved: false, reason: "The note could not be saved." };
  const saved = await addReplyNote(ws, {
    metricId: q.metric_id, period: q.period_start, authorId: q.person_id, source: "web_form", observationId: Number(q.observation_id), saidOf: opened.value, replaced,
    addedLater: await isAfterApprovalOrLock(ws, q.metric_id, q.period_start),
  }, words);
  return saved.saved ? { saved: true, cut: false, replaced } : saved;
}

/** **Save note** under a form's result (spec 0064): the words for the one value, or proposed Correction, the question
 * was asked about. `code` and `words` come from a browser; `actor` is who is signed in, if anyone. The question takes
 * one note: once saved it is over. The answer says what became of the words and never shows a note that is there. */
export async function saveAskedNote(code: unknown, words: unknown, actor: Actor | null = null): Promise<{ saved: boolean; detail: string }> {
  const over = { saved: false, detail: NOTE_QUESTION_OVER };
  if (typeof code !== "string" || !CODE.test(code)) return over;
  const since = new Date(Date.now() - NOTE_QUESTION_HOURS * 3_600_000).toISOString();
  const { data, error } = await db().from("note_questions").select("id, workspace_id, metric_id, period_start, person_id, token_id, observation_id, proposal, value_mark, created_at").eq("code_hash", hashOf(code)).is("closed_at", null).gt("created_at", since).maybeSingle();
  if (error) throw new Error("The note could not be saved. Try again in a moment.");
  const q = data as Question | null;
  if (!q || !noteFieldsOn(q.workspace_id)) return over;
  const metrics = await getMetrics(q.workspace_id);
  const metric = metrics.find((m) => m.id === q.metric_id);
  if (!metric || !(await mayAnswerForm(q, actor, metrics))) return over;
  // Nobody writes on an Archived Metric or a Condensed Value.
  if (metric.archived_at) return { saved: false, detail: ARCHIVED_REFUSAL };
  const condensed = await condensedOn(q.workspace_id, q.metric_id, q.period_start);
  if (condensed) return { saved: false, detail: condensedRefusal(condensed) };
  const cleaned = cleanNote(words, "cut");
  if ("problem" in cleaned) return { saved: false, detail: cleaned.problem };
  // Taken first, in one write, so that two presses save one note.
  const { data: claimed } = await db().from("note_questions").update({ closed_at: new Date().toISOString() }).eq("id", q.id).is("closed_at", null).select("id");
  if (!claimed?.length) return over;
  const saved = await saveAnswer(q, metric, cleaned.words);
  if (!saved.saved) {
    await db().from("note_questions").update({ closed_at: null }).eq("id", q.id);
    return { saved: false, detail: `Your note was not saved. ${saved.reason}` };
  }
  const where = q.proposal !== null ? "Your note goes with your proposed correction." : "Your note was saved.";
  const cut = cleaned.cut ? " It was cut to 1,000 characters." : "";
  return { saved: true, detail: `${where}${cut}${saved.replaced ? " Your value was replaced meanwhile, so the note is filed under your earlier value." : ""}` };
}

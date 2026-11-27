// What a Combined Prompt may say to its reader at this moment (spec 0064; GLOSSARY: Combined Prompt, Token, Stand-in).
// Internal to the core: these check no Actor, so only what makes or sends such a Delivery calls them. A figure is named
// only while its recipient is still asked for it by a Token that counts and the Metric is in use (AGENTS.md rule 3): the
// words are written when the message is made, again when it is sent, and when a chat message is edited.
import { db } from "../db";
import { openNames, openRows, sealedPatch } from "../sealed-columns";
import { combinedOrder, combinedWords, type CombinedLine } from "../combined-words";
import { tokenValid, type TokenRow } from "../tokens";
import { periodLabel } from "../periods";
import { yearStartFor } from "../fiscal-year";
import { appendedLink, unlinked } from "../mail-links";
import { slackEscape } from "../connectors/slack";
import type { ConnectorId } from "../connectors/index";
import type { Period } from "../types";

/** Why a Combined Prompt with nothing left to ask is not sent. */
const NOTHING_OPEN = "Not sent: nothing in it is still open.";

/** One listed figure: what may be said of it, whether its Prompt is answered (and where), and whether it is allowed. */
type CombinedFigure = { promptId: number; position: number | null; line: CombinedLine; answeredOn: string | null; answered: boolean; allowed: boolean };

/** The Combined Prompts that list any of these Prompts. A Prompt's messages are found by their `prompt_id` or here, so
 * whatever looks for them asks both. The caller has decided that these Prompts may be looked at. */
export async function combinedListing(ws: string, promptIds: number[]): Promise<{ promptId: number; deliveryId: number }[]> {
  if (!promptIds.length) return [];
  const { data } = await db().from("delivery_prompts").select("prompt_id, delivery_id").eq("workspace_id", ws).in("prompt_id", promptIds);
  return (data ?? []).map((r) => ({ promptId: r.prompt_id as number, deliveryId: r.delivery_id as number }));
}

/** Call before a Metric is deleted. The function it returns, called afterwards, writes the Combined Prompts that listed
 * it again without it and removes one with nothing left to ask: their list rows go with the Metric, but their words
 * would go on naming it. */
export async function forgetInCombined(ws: string, metricId: number): Promise<() => Promise<void>> {
  const { data, error } = await db().from("delivery_prompts").select("delivery_id").eq("workspace_id", ws).eq("metric_id", metricId);
  if (error) throw new Error("The Metric could not be deleted.");
  const ids = [...new Set((data ?? []).map((r) => r.delivery_id as number))];
  return async () => {
    for (const id of ids) {
      if (await storeCombinedWords(ws, id)) continue;
      const { error: kept } = await db().from("deliveries").delete().eq("id", id).eq("workspace_id", ws);
      if (kept) throw new Error("A message that named the Metric could not be removed.");
    }
  };
}

/** The recipient and way of a Combined Prompt, or null when this Delivery is none. */
async function combinedOf(ws: string, deliveryId: number): Promise<{ via: ConnectorId; recipientId: string } | null> {
  const { data } = await db().from("deliveries").select("connector, recipient_id, combined").eq("id", deliveryId).eq("workspace_id", ws).maybeSingle();
  return data?.combined ? { via: data.connector as ConnectorId, recipientId: data.recipient_id as string } : null;
}

/** The first word of a name, on one line. */
const firstName = (name: unknown) => String(name ?? "").trim().split(/\s+/)[0] ?? "";

/** The figures a Combined Prompt lists, as they stand now, in the order they were collected in. */
async function figuresOf(ws: string, deliveryId: number, recipientId: string): Promise<{ hello: string; figures: CombinedFigure[] }> {
  const { data: rows } = await db().from("delivery_prompts").select("prompt_id, metric_id, token_id, position, answer_source, reply_here, still_missing, due_date").eq("workspace_id", ws).eq("delivery_id", deliveryId).order("ord");
  const ids = [...new Set((rows ?? []).map((r) => r.metric_id as number))];
  const [{ data: prompts }, { data: sealed }, { data: tokens }, { data: member }] = await Promise.all([
    db().from("prompts").select("id, submitter_id, period_start, stands_in_for, answered_at, answered_source").eq("workspace_id", ws).in("id", (rows ?? []).map((r) => r.prompt_id as number)),
    db().from("metrics").select("id, name, period, sources, formula, archived_at").eq("workspace_id", ws).in("id", ids),
    db().from("tokens").select("id, metric_id, submitter_id, stand_in_id, stands_in_for, expires_at").in("metric_id", ids),
    db().from("memberships").select("role").eq("workspace_id", ws).eq("user_id", recipientId).maybeSingle(),
  ]);
  const metrics = await openRows("metrics", ws, sealed);
  const people = [recipientId, ...(prompts ?? []).map((p) => p.stands_in_for as string | null).filter((x): x is string => Boolean(x))];
  const names = await openNames(ws, (await db().from("profiles").select("id, name").in("id", [...new Set(people)])).data);
  const nameOf = (id: string) => firstName(names.find((p) => p.id === id)?.name);
  // A Guest, and a Contact who is no member, read no other person's name.
  const readsNames = Boolean(member) && member?.role !== "guest";
  const figures: CombinedFigure[] = [];
  for (const r of rows ?? []) {
    const p = prompts?.find((x) => x.id === r.prompt_id);
    const m = metrics.find((x) => x.id === r.metric_id);
    if (!p || !m) continue;
    const token = tokens?.find((t) => t.id === r.token_id);
    const sources = (m.sources ?? []) as string[];
    const form = sources.includes("web_form");
    const replyHere = Boolean(r.reply_here) && sources.includes(r.answer_source as string);
    const asked = p.submitter_id === recipientId && token?.submitter_id === recipientId && tokenValid(token as TokenRow, (tokens ?? []) as TokenRow[]);
    figures.push({
      promptId: p.id as number, position: r.position as number | null, answered: Boolean(p.answered_at), answeredOn: p.answered_source as string | null,
      allowed: asked && !m.formula && !m.archived_at && (replyHere || form),
      line: {
        metric: String(m.name).replace(/\s+/g, " "), period: periodLabel(p.period_start as string, m.period as Period, await yearStartFor(ws, m.period as Period)),
        due: r.due_date as string | null, stillMissing: Boolean(r.still_missing), replyHere, form,
        forName: p.stands_in_for ? (readsNames && nameOf(p.stands_in_for as string)) || "a colleague" : null,
      },
    });
  }
  return { hello: nameOf(recipientId), figures };
}

/** The words of these numbered lines, by this way, before any escaping. */
function wordsOf(via: ConnectorId, hello: string, lines: (CombinedLine & { position: number })[]): { subject: string; body: string } {
  const words = combinedWords({ via, firstName: hello, lines, link: null, today: new Date().toISOString().slice(0, 10) });
  // A Metric's name must not pass for the link an email's button is read from (mail-links.ts).
  const site = (process.env.ZIFFR_SITE_URL ?? "").replace(/\/+$/, "");
  return { subject: words.subject, body: appendedLink(words.body, [site]) ? unlinked(words.body) : words.body };
}

/** The figures that can be asked for, numbered: as fixed when the message was first sent, else in the order they are listed. */
function numbered(via: ConnectorId, figures: CombinedFigure[]): (CombinedFigure & { position: number })[] {
  const open = figures.filter((f) => f.allowed && !f.answered);
  if (figures.some((f) => f.position !== null)) return open.filter((f): f is CombinedFigure & { position: number } => f.position !== null).sort((a, b) => a.position - b.position);
  return combinedOrder(via, open.map((f) => ({ ...f.line, f }))).map((x, i) => ({ ...x.f, position: i + 1 }));
}

/** Writes a Combined Prompt's words from its figures as they stand, sealed. With `fix`, the numbers are recorded too.
 * Returns the words as stored (escaped for Slack), or null when nothing in it is open and allowed. */
export async function storeCombinedWords(ws: string, deliveryId: number, fix = false): Promise<{ subject: string; body: string } | null> {
  const of = await combinedOf(ws, deliveryId);
  if (!of) return null;
  const { hello, figures } = await figuresOf(ws, deliveryId, of.recipientId);
  const list = numbered(of.via, figures);
  if (!list.length) return null;
  if (fix) for (const f of list) {
    if (figures.find((x) => x.promptId === f.promptId)?.position !== null) continue;
    const { error } = await db().from("delivery_prompts").update({ position: f.position }).eq("workspace_id", ws).eq("delivery_id", deliveryId).eq("prompt_id", f.promptId);
    if (error) throw new Error("A message's numbers could not be recorded.");
  }
  const plain = wordsOf(of.via, hello, list.map((f) => ({ ...f.line, position: f.position })));
  const words = { subject: plain.subject, body: of.via === "slack" ? slackEscape(plain.body) : plain.body };
  const { error } = await db().from("deliveries").update(await sealedPatch("deliveries", ws, deliveryId, words)).eq("id", deliveryId).eq("workspace_id", ws);
  if (error) throw new Error("A message's words could not be kept.");
  return words;
}

/** The check before a Combined Prompt is sent: its words are written from what is still open and allowed and put on the
 * row the sender holds, and the numbers fixed. Returns why it must not go, or null. */
export async function composeAtSend(d: { id: number; workspace_id: string; subject?: unknown; body?: unknown }): Promise<string | null> {
  const words = await storeCombinedWords(d.workspace_id, d.id, true);
  if (!words) return NOTHING_OPEN;
  if ("subject" in d) d.subject = words.subject;
  d.body = words.body;
  return null;
}

/** A sent Combined Prompt as it reads now: each number in its place, one answered or no longer asked marked so (the
 * latter without its name), and no value. `answeredOn` says where the listed figures were answered, `allAnswered`
 * whether every Prompt in it is. Null when the Delivery is no Combined Prompt. `source` words a Source for the reader. */
export async function combinedAsItStands(ws: string, deliveryId: number, source: (s: string | null) => string): Promise<{ text: string; allAnswered: boolean; answeredOn: (string | null)[] } | null> {
  const of = await combinedOf(ws, deliveryId);
  if (!of) return null;
  const { hello, figures } = await figuresOf(ws, deliveryId, of.recipientId);
  const sent = figures.filter((f): f is CombinedFigure & { position: number } => f.position !== null).sort((a, b) => a.position - b.position);
  const text = wordsOf(of.via, hello, sent.map((f) => ({
    ...f.line, position: f.position,
    closed: !f.allowed ? { words: "No longer asked", named: false } : f.answered ? { words: `Answered on ${source(f.answeredOn)}`, named: true } : undefined,
  }))).body;
  return { text, allAnswered: figures.every((f) => f.answered), answeredOn: sent.filter((f) => f.answered).map((f) => f.answeredOn) };
}

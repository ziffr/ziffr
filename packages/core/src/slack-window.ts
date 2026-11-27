// What Ziffr says back on Slack, and the windows its buttons open (spec 0064, "The combined form" and "The question";
// GLOSSARY: Delivery, Combined Prompt, Value Note): the answer in a message's thread, with **Add a note** and **No
// note** under a question, and the windows of **Add a note** (a field for each number asked about) and **Enter all** (a
// number and a note for each number of a Combined Prompt). Nothing here checks a signature or a person: slack-inbound.ts
// has proved that Slack sent the press and that it is the message's own recipient, and calls this for that Delivery
// only. Security: a window names only the figures that person is still asked for, as they stand when it opens, shows no
// value and no note, and what comes back from it is untrusted and checked again figure by figure (prompt-reply.ts).
import { slackEscape } from "./connectors/slack";
import { questionsIn, questionsSentAs } from "./note-question";
import { SLACK_ANSWER_BUTTONS, slackButton } from "./slack-buttons";
import { mayAnswer } from "./practice";
import { takeEntries, windowFigures, type ReplyEntry, type WindowFigure } from "./prompt-reply";
import { chunks } from "./reply-chunks";
import { callSlack } from "./slack-api";
import type { SlackBot } from "./slack-connection";
import { slackIdentityOf } from "./slack-identity";
import { submissionEffects, type SubmissionEffects } from "./submissions";
import { db } from "./db";

/** The ids of Ziffr's own windows; a submission of any other is ignored. */
export const SLACK_WINDOWS = { notes: "ziffr_notes", entries: "ziffr_enter_all" } as const;

/** The most numbers one **Enter all** window holds: Slack takes 100 blocks, and each number has two fields. */
export const ENTER_ALL_MAX = 40;

const FIELD = "x";
const MAX_VALUE = 200;
const MAX_NOTE = 20_000;

const plain = (text: string) => ({ type: "plain_text", text });

/** Says something in the thread of a message to the Slack user who wrote or pressed, and answers the sent message's
 * timestamp; a lost confirmation is not worth failing the answer for. Where `asksFor` names the message's Delivery, the
 * last part carries the buttons of its question for a note. In a Practice Workspace (spec 0063) nobody but its person's
 * recorded account is answered. */
export async function slackSay(bot: SlackBot, channel: string, threadTs: string | null, user: string, text: string, asksFor?: number): Promise<string | void> {
  try {
    if (!(await mayAnswer(bot.workspaceId, "slack", `${bot.teamId}:${user}`))) return;
    // In the Workspace's name and logo like the message it answers, where the connection may.
    const who = await slackIdentityOf(bot.workspaceId, bot.scopes);
    // A long answer (a line for each of many figures) goes in several messages, cut between lines.
    const parts = chunks(text, 2500);
    let ts: string | undefined;
    for (const [i, part] of parts.entries()) {
      const words = slackEscape(part).slice(0, 3000);
      const blocks = asksFor !== undefined && i === parts.length - 1
        ? [{ type: "section", text: { type: "mrkdwn", text: words } }, { type: "actions", block_id: "ziffr", elements: [slackButton(SLACK_ANSWER_BUTTONS.addNote, "Add a note", asksFor), slackButton(SLACK_ANSWER_BUTTONS.noNote, "No note", asksFor)] }]
        : undefined;
      const sent = await callSlack("chat.postMessage", { channel, ...(threadTs ? { thread_ts: threadTs } : {}), ...who, text: words, blocks, unfurl_links: false, unfurl_media: false }, bot.token);
      ts = typeof sent.ts === "string" && /^[0-9]{1,12}\.[0-9]{1,8}$/.test(sent.ts) ? sent.ts : undefined;
    }
    return ts;
  } catch {
    // The answer itself was taken.
  }
}

/** The Delivery of a request, as slack-inbound.ts found it. */
export type WindowDelivery = { id: number; workspace_id: string; recipient_id: string; prompt_id: number | null; combined?: boolean | null };

const field = (block_id: string, label: string, element: Record<string, unknown>, hint?: string) => ({
  type: "input", block_id, optional: true, label: plain(label.slice(0, 150)), element: { type: "plain_text_input", action_id: FIELD, ...element }, ...(hint ? { hint: plain(hint) } : {}),
});
const noteField = (f: WindowFigure, label: string) => field(`n${f.position}`, label, { multiline: true, max_length: 1000, placeholder: plain("What is behind it?") });
const READERS = "Everyone who sees a Metric can read the words on it.";

async function open(bot: SlackBot, trigger: string, callback: string, meta: Record<string, unknown>, words: { title: string; submit: string }, blocks: unknown[]): Promise<boolean> {
  try {
    await callSlack("views.open", { trigger_id: trigger, view: { type: "modal", callback_id: callback, private_metadata: JSON.stringify(meta), title: plain(words.title), submit: plain(words.submit), close: plain("Cancel"), blocks } }, bot.token);
    return true;
  } catch {
    return false;
  }
}

/** Opens the window of **Add a note** for the question the pressed message asked: a note field for each of its numbers
 * the person may still write on. False when there is none or Slack opened no window. */
export async function openNotesWindow(bot: SlackBot, d: WindowDelivery, message: string, trigger: string): Promise<boolean> {
  const asked = new Set((await questionsIn(d.workspace_id, d.id, message)).map((q) => q.promptId));
  const figures = (await windowFigures(d, "slack")).filter((f) => asked.has(f.promptId));
  if (!figures.length) return false;
  return open(bot, trigger, SLACK_WINDOWS.notes, { d: d.id, m: message }, { title: "Add a note", submit: "Save" },
    [{ type: "section", text: plain(READERS) }, ...figures.map((f) => noteField(f, f.label))]);
}

/** Opens the window of **Enter all** for a Combined Prompt: a number and a note for each figure still asked that Slack
 * takes, at most 40, with how many more stand on the form. False when there is none or Slack opened no window. */
export async function openEntryWindow(bot: SlackBot, d: WindowDelivery, trigger: string): Promise<boolean> {
  const figures = await windowFigures(d, "slack");
  if (!figures.length) return false;
  const more = figures.length - ENTER_ALL_MAX;
  return open(bot, trigger, SLACK_WINDOWS.entries, { d: d.id }, { title: "Enter all", submit: "Submit" }, [
    { type: "section", text: plain(`Leave empty what you cannot say yet. ${READERS}`) },
    ...figures.slice(0, ENTER_ALL_MAX).flatMap((f) => [
      field(`v${f.position}`, f.label, {}, f.rule ? `Your number is in already. A new one here: ${f.rule.toLowerCase()}.` : undefined),
      noteField(f, `Note for ${f.position} (optional)`),
    ]),
    ...(more > 0 ? [{ type: "context", elements: [plain(`${more} more: enter them on the form, by the link in the message.`)] }] : []),
  ]);
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});

// The filled fields of a submitted window, by figure number: bounded, whatever came back.
function entriesOf(values: unknown): ReplyEntry[] {
  const out = new Map<number, ReplyEntry>();
  for (const [block, held] of Object.entries(obj(values)).slice(0, 2 * ENTER_ALL_MAX + 50)) {
    const m = /^([vn])([1-9]\d?)$/.exec(block);
    const typed = obj(obj(held)[FIELD]).value;
    if (!m || typeof typed !== "string") continue;
    const position = Number(m[2]);
    const entry = out.get(position) ?? { position, value: "", note: "" };
    if (m[1] === "v") entry.value = typed.slice(0, MAX_VALUE).replace(/\s+/g, " ");
    else entry.note = typed.slice(0, MAX_NOTE);
    out.set(position, entry);
  }
  return [...out.values()];
}

/** Takes a submitted window of this Delivery and posts what became of it in the message's thread. From **Add a note**
 * only notes are taken, and only on the numbers its message (`asked`) asked about. */
export async function takeWindow(bot: SlackBot, d: WindowDelivery & { slack_channel: string; slack_ts: string }, user: string, window: { values: unknown; asked: string | null }, submission: SubmissionEffects = submissionEffects): Promise<"recorded" | "noted" | "refused" | "empty"> {
  let entries = entriesOf(window.values);
  if (window.asked !== null) {
    const asked = new Set((await questionsIn(d.workspace_id, d.id, window.asked)).map((q) => q.promptId));
    const allowed = new Set((await windowFigures(d, "slack")).filter((f) => asked.has(f.promptId)).map((f) => f.position));
    entries = entries.filter((e) => allowed.has(e.position)).map((e) => ({ ...e, value: "" }));
  }
  const done = await takeEntries(d, entries, { source: "slack", sender: `slack:${user}`, provenPersonId: d.recipient_id }, submission);
  if (!done) return "empty";
  // A message with several figures counts as answered once each is in, which closing its Prompts sees to.
  if (done.outcome === "recorded" && !d.combined) await db().from("deliveries").update({ status: "answered" }).eq("id", d.id).eq("workspace_id", d.workspace_id);
  const ts = await slackSay(bot, d.slack_channel, d.slack_ts, user, done.text, done.asked ? d.id : undefined);
  if (done.asked && ts) await questionsSentAs(d.workspace_id, d.id, done.asked, ts);
  return done.outcome === "recorded" || done.outcome === "noted" ? done.outcome : "refused";
}

// The words of a Combined Prompt (spec 0064; GLOSSARY: Combined Prompt, Prompt): the subject, the numbered figures and
// how to answer them, and how many figures one message may hold. Pure: whoever calls decides which figures the reader
// may be told about.
import { format, parseISO } from "date-fns";
import { slackEscape } from "./connectors/slack";
import type { ConnectorId } from "./connectors/index";

/** The most figures one Combined Prompt holds. */
export const COMBINED_MAX = 50;
/** The most figures a chat message (Slack, Telegram) lists; the others are on the form. */
export const COMBINED_CHAT_LISTED = 20;

/** The most characters of a chat message's words. Slack shows 2,900 of a message and the link comes last, so the list
 * gets shorter before the end could be cut off. */
const CHAT_ROOM = 2600;

const isChat = (via: ConnectorId) => via === "slack" || via === "telegram";

/** Splits the figures of one person and way into messages of at most 50. A chat message lists 20, so it is split earlier
 * only when more than 20 of its figures cannot be answered on the form and so could not be answered if left out. */
export function combinedChunks<T extends { form: boolean }>(via: ConnectorId, figures: T[]): T[][] {
  const out: T[][] = [];
  let chunk: T[] = [];
  let off = 0;
  for (const f of figures) {
    if (chunk.length >= COMBINED_MAX || (isChat(via) && !f.form && off >= COMBINED_CHAT_LISTED)) {
      out.push(chunk);
      chunk = [];
      off = 0;
    }
    chunk.push(f);
    if (!f.form) off++;
  }
  if (chunk.length) out.push(chunk);
  return out;
}

/** One figure as a Combined Prompt names it. */
export type CombinedLine = {
  metric: string;
  /** The period in words: "October 2026", "week of 26 Oct 2026". */
  period: string;
  due: string | null;
  stillMissing: boolean;
  /** Whom the reader answers it for, as a Stand-in: a first name, or words that name nobody. */
  forName: string | null;
  replyHere: boolean;
  /** Whether the Metric takes it on the form. */
  form: boolean;
  /** Set on a figure of a message already sent that needs nothing more: what to say in its place. */
  closed?: { words: string; named: boolean };
};

/** The order the figures are listed and numbered in: those a reply records (new before still missing), then those only
 * the form takes. In a chat message with more than 20, the ones the form does not take come first, so none is left out. */
export function combinedOrder<T extends Pick<CombinedLine, "replyHere" | "stillMissing" | "form">>(via: ConnectorId, lines: T[]): T[] {
  const sorted = (list: T[]) => [...list].sort((a, b) => Number(!a.replyHere) - Number(!b.replyHere) || Number(a.stillMissing) - Number(b.stillMissing));
  if (!isChat(via) || lines.length <= COMBINED_CHAT_LISTED) return sorted(lines);
  const first = [...lines].sort((a, b) => Number(a.form) - Number(b.form)).slice(0, COMBINED_CHAT_LISTED);
  return [...sorted(first), ...sorted(lines.filter((l) => !first.includes(l)))];
}

const dayWords = (day: string) => format(parseISO(day), "d MMM");

function lineWords(l: CombinedLine & { position: number }, parts: boolean, today: string): string {
  if (l.closed) return `${l.position}. ${l.closed.named ? `${l.metric}, ${l.period}: ` : ""}${l.closed.words}`;
  const due = l.due ? `${l.due < today ? "was due" : "due"} ${dayWords(l.due)}` : null;
  return [`${l.position}. ${l.metric}`, l.period, l.stillMissing && !parts ? "still missing" : null, due, l.forName ? `for ${l.forName}` : null, l.replyHere && !l.form ? "Reply here" : null]
    .filter(Boolean).join(", ");
}

/** What a Combined Prompt's words are written from. */
type WordsFor = { via: ConnectorId; firstName: string; lines: (CombinedLine & { position: number })[]; link: string | null; today: string };

/** The subject and text of a Combined Prompt. The lines come numbered and in order; `link` is the combined form's
 * address, left out while there is none. */
export function combinedWords(i: WordsFor): { subject: string; body: string } {
  if (!isChat(i.via)) return wordsListing(i, i.lines.length);
  for (let most = Math.min(COMBINED_CHAT_LISTED, i.lines.length); ; most--) {
    const out = wordsListing(i, most);
    if (most <= 1 || (i.via === "slack" ? slackEscape(out.body) : out.body).length <= CHAT_ROOM) return out;
  }
}

/** The words with at most `most` figures listed. */
function wordsListing(i: WordsFor, most: number): { subject: string; body: string } {
  const { lines } = i;
  const open = lines.filter((l) => !l.closed);
  const parts = open.some((l) => l.stillMissing) && open.some((l) => !l.stillMissing);
  const listed = lines.slice(0, most);
  const out = [`Hi ${i.firstName},`];
  let heading: string | null = null;
  for (const l of listed) {
    const under = !l.replyHere ? "Only on the form" : parts ? (l.stillMissing ? "Still missing" : "New") : "";
    if (under !== heading) {
      if (under) out.push("", under);
      else if (heading === null) out.push("");
      heading = under;
    }
    out.push(lineWords(l, parts, i.today));
  }
  if (lines.length > listed.length) out.push(`and ${lines.length - listed.length} more on the form`);
  const byReply = open.find((l) => l.replyHere);
  const how = [
    byReply ? `Reply with one line for each, such as "${(byReply as CombinedLine & { position: number }).position}: 45". Words under a number are its note.` : null,
    i.link && open.some((l) => l.form) ? `${byReply ? "Or enter them" : "Enter them"} on one page: ${i.link}` : null,
  ].filter((x): x is string => Boolean(x));
  if (how.length) out.push("", ...how);
  const first = (open[0] ?? lines[0])?.metric ?? "";
  const count = open.length;
  const subject = !count ? "All answered" : count === 1 ? `1 number due: ${first}` : `${count} numbers due: ${first} and ${count - 1} more`;
  return { subject, body: out.join("\n") };
}

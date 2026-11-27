// How a message quotes a Value Note (GLOSSARY: Value Note, Delivery; spec 0064, "Untrusted input"). The words and the
// author's name are somebody's own: every line of theirs is a quoted line ("> "), which an email never reads as its
// link or its button (mail-links.ts), no address in them is a link, and Slack shows them literally. Pure.
import { unlinked } from "./mail-links";
import { slackEscape } from "./connectors/slack";
import type { ConnectorId } from "./connectors/index";

// The most of a note a message quotes, in characters: the rest is on the page the message links to.
const QUOTED = 300;

/** A message's words with a note quoted above its last line, which is the link Ziffr appended and stays last. `more`
 * counts the period's other notes: they are only said to be there. */
export function withQuotedNote(body: string, via: ConnectorId, note: { author: string; words: string; more: number }): string {
  const safe = (text: string) => (via === "slack" ? slackEscape(unlinked(text)) : unlinked(text));
  const characters = [...note.words];
  const words = characters.length > QUOTED ? `${characters.slice(0, QUOTED).join("").trimEnd()}…` : note.words;
  const quoted = words.split(/[\n\r\u2028\u2029]+/).filter((line) => line.trim()).map((line) => `> ${safe(line)}`).join("\n");
  const parts = [
    `Note from ${safe(note.author.replace(/\s+/g, " ").trim())}:`,
    quoted,
    ...(note.more ? [`${note.more === 1 ? "One more note is" : `${note.more} more notes are`} on the task's page.`] : []),
  ];
  // An email's parts stand apart, so the quote is a block of its own; a chat message keeps them close.
  const gap = via === "email" ? "\n\n" : "\n";
  const end = body.trimEnd();
  const at = end.lastIndexOf("\n");
  return [end.slice(0, Math.max(at, 0)).trimEnd(), ...parts, end.slice(at + 1)].filter(Boolean).join(gap);
}

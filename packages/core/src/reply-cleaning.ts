// Cleaning a text reply before and after it is read (spec 0064; GLOSSARY: Prompt, Answer Language): what of an email
// was written now, which lines are a greeting or a signature, and a note's words as they may be kept. Pure. The words
// are in the Answer Languages' word files, so a language is data.
import { wordsFor } from "./numbers/period-words";
import type { AnswerWords } from "./numbers/languages";

/** What the person wrote now: the text above the quoted message ("On … wrote:", "> …", "-----Original Message-----",
 * the German "Am … schrieb") and above a signature ("-- "), at most 5,000 characters. */
export function newText(text: string): string {
  const out: string[] = [];
  for (const line of String(text).replace(/\r\n?/g, "\n").split("\n")) {
    if (/^>/.test(line) || /^-- ?$/.test(line) || /^-{2,}\s*(Original Message|Ursprüngliche Nachricht)/i.test(line) || namesTheQuoted(line) || /^From: .+/i.test(line) && out.length > 0) break;
    out.push(line);
  }
  return out.join("\n").trim().slice(0, 5000);
}

/** Whether a line says whose message is quoted below: "On … wrote … :" or the German "Am … schrieb … :". */
function namesTheQuoted(line: string): boolean {
  if (!/^(On|Am) /i.test(line)) return false;
  const said = line.trimEnd();
  const before = said.slice(0, -1);
  // At least one character stands between the opening word and the verb.
  return said.endsWith(":") && !/[\u2028\u2029]/.test(before) && / (wrote|schrieb)\b/i.test(before.slice(4));
}

/** HTML as plain text, for replies that have no text part. */
export function stripHtml(html: string): string {
  const lines = withoutBlocks(html).replace(/<br\s*\/?>|<\/p>|<\/div>/gi, "\n");
  // A tag ends in ">", so none starts after the last one.
  const end = lines.lastIndexOf(">") + 1;
  const text = lines.slice(0, end).replace(/<[^>]+>/g, "") + lines.slice(end);
  return text.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

/** The HTML without its scripts and styles, each from where it opens to the first closing tag of its name. One that is
 * never closed stays. */
function withoutBlocks(html: string): string {
  const opening = /<(script|style)/gi;
  const unclosed = new Set<string>();
  let out = "";
  let kept = 0;
  for (let open = opening.exec(html); open; open = opening.exec(html)) {
    const name = open[1].toLowerCase();
    if (unclosed.has(name)) continue;
    const closing = new RegExp(`</${name}>`, "gi");
    closing.lastIndex = opening.lastIndex;
    if (!closing.test(html)) {
      unclosed.add(name);
      continue;
    }
    out += html.slice(kept, open.index);
    kept = opening.lastIndex = closing.lastIndex;
  }
  return out + html.slice(kept);
}

const ENDINGS = " ,.!…";

/** A line as it is compared with a word list: lower case, single spaces, without the punctuation it ends in. */
export function plainLine(line: string): string {
  const s = line.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();
  let end = s.length;
  while (end > 0 && ENDINGS.includes(s[end - 1])) end--;
  return s.slice(0, end);
}

/** One list of the reply words of these languages. */
export function replyWords(languages: readonly string[], list: keyof AnswerWords["byHand"]["reply"]): string[] {
  return wordsFor(languages).flatMap((l) => l.byHand.reply[list]);
}

/** The longest line taken for a greeting or for a mail app's line: anything longer is something the person wrote. */
const SHORT = 80;

/** Whether a line only greets: a greeting, at most four more words (a name) and no digit. */
export function isGreeting(line: string, languages: readonly string[]): boolean {
  if (line.length > SHORT || /\p{N}/u.test(line)) return false;
  const plain = plainLine(line);
  return replyWords(languages, "greetings").some((g) => {
    if (plain !== g && !plain.startsWith(`${g} `) && !plain.startsWith(`${g},`)) return false;
    return plain.slice(g.length).split(/[ ,]+/).filter(Boolean).length <= 4;
  });
}

/** Whether a line starts an email's signature: a closing, a mail app's "Sent from my …", or the sender's name alone. */
export function isSignature(line: string, languages: readonly string[], senderName?: string | null): boolean {
  if (line.length > SHORT) return false;
  const plain = plainLine(line);
  const full = plainLine(senderName ?? "");
  const names = full ? [full, full.split(" ")[0]] : [];
  if (names.includes(plain)) return true;
  // A closing alone, or followed by the sender's name ("Best regards, Anna").
  if (replyWords(languages, "closings").some((c) => plain === c || names.some((n) => plain === `${c} ${n}` || plain === `${c}, ${n}`))) return true;
  return replyWords(languages, "sentFrom").some((pattern) => {
    const [before, after] = pattern.split("…").map((p) => p.trim());
    return plain.startsWith(`${before} `) && plain.endsWith(after);
  });
}

/** The longest note, in characters (spec 0064, "Untrusted input"). */
export const NOTE_CHARS = 1000;

/** A note from a reply: its words, and whether it was longer than a note may be and so was cut. */
export type ReplyNote = { text: string; cut: boolean };

// Control characters other than the line break, and characters that show nothing or change the direction text is shown
// in, which can make words read differently from what they say: soft hyphen, Arabic letter mark, Hangul fillers,
// Mongolian vowel separator, zero-width space, direction marks and controls, line and paragraph separators, the word
// joiner and invisible operators, the blank Braille pattern, the byte order mark and tag characters. The same as
// demo-text.ts; the zero-width non-joiner and joiner (U+200C, U+200D) stay, since words and emoji need them.
const HIDDEN = /(?!\n)[\p{Cc}\u00ad\u061c\u115f\u1160\u180e\u200b\u200e\u200f\u2028\u2029\u202a-\u202e\u2060-\u2069\u2800\u3164\ufeff\uffa0\u{e0000}-\u{e007f}]/gu;

/** A reply's lines as a note: hidden characters removed (a tab becomes a space), trimmed, cut at NOTE_CHARS
 * characters; null when nothing is left. */
export function noteFrom(lines: readonly string[]): ReplyNote | null {
  const all = [...lines.join("\n").replace(/\t/g, " ").replace(HIDDEN, "").trim()];
  if (!all.length) return null;
  const cut = all.length > NOTE_CHARS;
  return { text: all.slice(0, NOTE_CHARS).join("").trimEnd(), cut };
}

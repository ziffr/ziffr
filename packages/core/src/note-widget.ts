// The words of a Note Widget (GLOSSARY: Note Widget): their limits, what is taken out of them and how they are read as
// paragraphs and simple lists. Pure, so the core checks them and the screens draw them the same way.
// Security: a note is untrusted text that others read, also through a View Link. It is kept as plain text and drawn as
// text only: nothing here makes markup, a link or anything that runs. Characters that show nothing or turn the reading
// order around are taken out.

import { APP_REFUSED } from "./file-text";

/** The longest heading, on one line. */
export const NOTE_HEADING_MAX = 120;
/** The longest text. */
export const NOTE_TEXT_MAX = 2000;
/** The most lines a text has. */
export const NOTE_LINES_MAX = 100;

/** What a Note Widget keeps in its settings; its heading is the widget's title. */
export type NoteSettings = { note?: string; noteHighlight?: boolean };

/** Cleaned words, or the sentence that says why they cannot be kept. */
export type NoteWords = { ok: true; text: string } | { ok: false; problem: string };

// What other typed text refuses (APP_REFUSED: control and invisible characters, lone surrogates, the controls that turn
// the reading order around), but for the new line.
const UNSEEN = new RegExp(`(?!\\n)[${APP_REFUSED}]`, "gu");
// Every way a line may end becomes a new line, and a tab a space.
const plainLines = (raw: string) => raw.replace(/\r\n?|[\u2028\u2029]/g, "\n").replace(/\t/g, " ").replace(UNSEEN, "");

const TOO_LONG = `A note widget takes at most ${NOTE_TEXT_MAX} characters.`;
const TOO_MANY_LINES = `A note widget takes at most ${NOTE_LINES_MAX} lines.`;
const HEADING_TOO_LONG = `The heading takes at most ${NOTE_HEADING_MAX} characters.`;
const NOT_WORDS = "A note widget holds plain text.";

/** A note's text as it is kept: its lines, without unseen characters and without blank lines around it. */
export function cleanNoteText(raw: unknown): NoteWords {
  if (raw === undefined || raw === null) return { ok: true, text: "" };
  if (typeof raw !== "string") return { ok: false, problem: NOT_WORDS };
  // A huge text is refused before anything is done with it.
  if (raw.length > NOTE_TEXT_MAX * 4) return { ok: false, problem: TOO_LONG };
  const text = plainLines(raw).replace(/^(?:[ ]*\n)+/, "").trimEnd();
  if (text.length > NOTE_TEXT_MAX) return { ok: false, problem: TOO_LONG };
  if (text.split("\n").length > NOTE_LINES_MAX) return { ok: false, problem: TOO_MANY_LINES };
  return { ok: true, text };
}

/** A note's heading as it is kept: one line. */
export function cleanNoteHeading(raw: unknown): NoteWords {
  if (raw === undefined || raw === null) return { ok: true, text: "" };
  if (typeof raw !== "string") return { ok: false, problem: NOT_WORDS };
  if (raw.length > NOTE_HEADING_MAX * 4) return { ok: false, problem: HEADING_TOO_LONG };
  const text = plainLines(raw).replace(/\s+/g, " ").trim();
  return text.length > NOTE_HEADING_MAX ? { ok: false, problem: HEADING_TOO_LONG } : { ok: true, text };
}

/** One part of a note as it is drawn: lines of text, or a list. */
export type NoteBlock =
  | { kind: "text"; lines: string[] }
  | { kind: "list"; ordered: boolean; start: number; items: string[] };

// "- item", "* item" or "• item"; "3. item" or "3) item".
const BULLET = /^ {0,3}(?:[-*•]) +(\S.*)$/;
const NUMBERED = /^ {0,3}(\d{1,4})[.)] +(\S.*)$/;

/** A note's text as paragraphs and simple lists, in order. A blank line ends either. */
export function noteBlocks(text: string): NoteBlock[] {
  const blocks: NoteBlock[] = [];
  let open: NoteBlock | null = null;
  const into = (block: NoteBlock) => { blocks.push(block); open = block; return block; };
  for (const line of text.split("\n")) {
    if (!line.trim()) { open = null; continue; }
    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    if (bullet || numbered) {
      const ordered = Boolean(numbered);
      const current = open as NoteBlock | null;
      const list = current?.kind === "list" && current.ordered === ordered ? current : into({ kind: "list", ordered, start: numbered ? Number(numbered[1]) : 1, items: [] });
      (list as Extract<NoteBlock, { kind: "list" }>).items.push((bullet ? bullet[1] : numbered![2]).trimEnd());
    } else {
      const current = open as NoteBlock | null;
      const para = current?.kind === "text" ? current : into({ kind: "text", lines: [] });
      (para as Extract<NoteBlock, { kind: "text" }>).lines.push(line.trimEnd());
    }
  }
  return blocks;
}

// About how many characters a line of a phone's card holds, and the heights of a line and a grid row in pixels.
const PHONE_LINE = 34;
const LINE_PX = 22;
const ROW_PX = 36 + 16;

/** How many grid rows a note takes where the dashboard is one column (a phone), so its words show without scrolling:
 * an estimate from its length, with room to write while it can be written (`writing`). */
export function noteRows(heading: string | null, text: string, writing: boolean): number {
  const lines = (t: string) => t.split("\n").reduce((n, line) => n + Math.max(1, Math.ceil(line.length / PHONE_LINE)), 0);
  const px = 56 + (heading ? (lines(heading) - 1) * LINE_PX : 0) + (text ? lines(text) * LINE_PX : 44) + 24;
  // Written, it also holds the heading's field and the buttons, and its lines are larger.
  return Math.min(60, Math.max(writing ? 8 : 3, Math.ceil((px + (writing ? 132 : 0) + 16) / ROW_PX)));
}

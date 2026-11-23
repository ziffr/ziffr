// GLOSSARY: Slide-over. Turns the user guide's Markdown (docs/user-guide) into the small search index the Help
// panel ships to the browser. Pure (no files), so the test and the generator share it. The index holds plain text
// per section, not the whole guide: code blocks and tables are dropped and each section is cut short, the full
// text is one link away.
import { CHAPTER_FILE, chapterPart, chapterTitle, headingId } from "./user-guide-render";

/** One section of a chapter: its heading, the id the full guide gives it, and its text cut to a snippet. */
export type HelpSection = { id: string; heading: string; text: string };
/** One chapter: the address slug (`metrics` for `10-metrics.md`), its title and its sections in order. */
type HelpChapter = { slug: string; title: string; part: string | null; sections: HelpSection[] };
/** The whole index, as it is written to `help-index.generated.json`. */
export type HelpIndex = { chapters: HelpChapter[] };

/** Longest text kept per section; enough to search and to read the point, short enough to keep the file small. */
const SECTION_TEXT_LIMIT = 600;

/** Plain text from a Markdown block: no code, tables, comments, images or markup characters. */
export function plainText(markdown: string): string {
  return markdown
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/^(```|~~~)[\s\S]*?^\1[^\n]*$/gm, "")
    .split("\n")
    .filter((line) => !/^\s*\|/.test(line))
    .join("\n")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/(\*\*|__|\*|_(?=\S))/g, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/<[^>]+>/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

/** `text` cut at a word boundary within `limit` characters, with an ellipsis when something was left out. */
function clip(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  return cut.slice(0, Math.max(cut.lastIndexOf(" "), limit / 2)).trimEnd() + "…";
}

/** The sections of one chapter: the lead before the first heading, then each `##` and `###` heading. */
export function chapterSections(markdown: string, title: string): HelpSection[] {
  const sections: HelpSection[] = [];
  let current: { heading: string; lines: string[]; lead: boolean } = { heading: title, lines: [], lead: true };
  let fence: string | null = null;
  const flush = () => {
    const text = clip(plainText(current.lines.join("\n")), SECTION_TEXT_LIMIT);
    // The lead has no id (it is the chapter's top) and is skipped when empty.
    if (current.lead ? text : true) sections.push({ id: current.lead ? "" : headingId(current.heading), heading: current.heading, text });
  };
  for (const line of markdown.split("\n")) {
    const f = /^(```|~~~)/.exec(line);
    if (f) fence = fence === f[1] ? null : fence ?? f[1];
    const h = fence ? null : /^#{2,3}\s+(.+?)\s*#*\s*$/.exec(line);
    if (h) { flush(); current = { heading: plainText(h[1]), lines: [], lead: false }; continue; }
    if (!fence && /^#\s/.test(line)) continue; // the chapter's own title
    current.lines.push(line);
  }
  flush();
  return sections;
}

/** The index for chapter files given as file name and Markdown; files that are no numbered chapter are left out. */
export function buildHelpIndex(files: { name: string; markdown: string }[]): HelpIndex {
  const chapters = files
    .map((f) => ({ m: CHAPTER_FILE.exec(f.name), markdown: f.markdown }))
    .filter((x): x is { m: RegExpExecArray; markdown: string } => x.m !== null)
    .sort((a, b) => Number(a.m[1]) - Number(b.m[1]) || a.m[0].localeCompare(b.m[0]))
    .map(({ m, markdown }) => {
      const title = chapterTitle(markdown, m[2]);
      return { slug: m[2], title, part: chapterPart(markdown), sections: chapterSections(markdown, title) };
    });
  return { chapters };
}

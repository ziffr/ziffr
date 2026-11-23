// GLOSSARY: Slide-over. The Help panel's search over the user guide's index: a scored match of the words typed
// against section headings, chapter titles and text. Runs in the browser; what is typed goes nowhere else.
import type { HelpIndex } from "./help-index-build";

/** One hit: where it is, and a snippet of the text around the match. */
export type HelpHit = { chapter: string; chapterTitle: string; id: string; heading: string; snippet: string; score: number };

const SNIPPET = 140;

/** Lower-case words of at least two letters or digits, accents folded. */
function tokens(text: string): string[] {
  return text.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9]+/).filter((t) => t.length >= 2);
}

/** A slice of `text` around the first of `words` it contains, or its start. */
function snippetOf(text: string, words: string[]): string {
  const flat = text.replace(/\s+/g, " ");
  const lower = flat.toLowerCase();
  const at = words.map((w) => lower.indexOf(w)).filter((i) => i >= 0).sort((a, b) => a - b)[0] ?? 0;
  const start = Math.max(0, at - 40);
  return (start > 0 ? "…" : "") + flat.slice(start, start + SNIPPET) + (start + SNIPPET < flat.length ? "…" : "");
}

/** The best sections for `query`, best first; every word typed must appear in the section, its heading or its chapter's title. */
export function searchHelp(index: HelpIndex, query: string, limit = 20): HelpHit[] {
  const words = tokens(query);
  if (words.length === 0) return [];
  const hits: HelpHit[] = [];
  for (const chapter of index.chapters) {
    const title = tokens(chapter.title);
    for (const s of chapter.sections) {
      const heading = tokens(s.heading);
      const text = tokens(s.text);
      let score = 0;
      let all = true;
      for (const w of words) {
        const inHeading = heading.includes(w) ? 6 : heading.some((t) => t.startsWith(w)) ? 4 : 0;
        const inTitle = title.some((t) => t.startsWith(w)) ? 2 : 0;
        const inText = Math.min(text.filter((t) => t.startsWith(w)).length, 3);
        const part = inHeading + inTitle + inText;
        if (part === 0) all = false;
        score += part;
      }
      if (all) hits.push({ chapter: chapter.slug, chapterTitle: chapter.title, id: s.id, heading: s.heading, snippet: snippetOf(s.text, words), score });
    }
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

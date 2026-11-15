// The user guide's Markdown, turned into a page (docs/user-guide/README.md). Pure: no files, so it is tested on its own.
// The chapters are written by whoever looks after the guide, not by programmers, so the output is kept to plain
// Markdown: raw HTML is shown as text and only ordinary links survive.
import { Marked, type Tokens } from "marked";

/** A chapter file's name: a number for its order, then the address it gets, e.g. `02-concepts.md` → /guide/concepts. */
export const CHAPTER_FILE = /^(\d+)-([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/;

/** The address of a chapter inside the app. */
export const chapterHref = (slug: string) => `/guide/${slug}`;

/** Text made safe to place inside HTML. */
function escape(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** An id for a heading, so a link can point at a section (`#the-metric-catalog`). */
export function headingId(text: string): string {
  return text.toLowerCase().replace(/<[^>]*>/g, "").replace(/&[a-z0-9#]+;/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** Where a link in a chapter leads. A link to another chapter's file (`04-connecting.md#feeds`), as it works when the
 * files are read on their own, leads to that chapter in the app. Other links keep only safe schemes: no `javascript:`. */
export function linkTarget(href: string): { href: string; external: boolean } | null {
  const [file, hash] = href.split("#", 2);
  const chapter = CHAPTER_FILE.exec(file.replace(/^\.\//, ""));
  if (chapter) return { href: chapterHref(chapter[2]) + (hash ? `#${headingId(hash)}` : ""), external: false };
  if (/^https?:\/\//i.test(href) || /^mailto:/i.test(href)) return { href, external: true };
  // A browser reads `/\` like `//`, another site, so only a single slash followed by neither counts as inside the app.
  if (href.startsWith("#") || /^\/(?![/\\])/.test(href)) return { href, external: false };
  return null;
}

/** Where a chapter takes in the glossary: the chapter file holds this line, the app puts GLOSSARY.md in its place.
 * On GitHub the line is an invisible comment. */
export const GLOSSARY_MARKER = /^<!--\s*glossary\s*-->\s*$/m;

/** Links from bold glossary terms in the other chapters to their entries: each term's lower-case name → its entry. */
export type GlossaryLinks = { href: string; terms: Map<string, string> };

/** The glossary's terms by lower-case name, each with the id its heading gets in the glossary chapter. */
export function glossaryTerms(glossary: string): Map<string, string> {
  const terms = new Map<string, string>();
  for (const [, term] of glossary.matchAll(/^\*\*(.+?)\*\*:\s*$/gm)) terms.set(term.toLowerCase(), headingId(term));
  return terms;
}

/** GLOSSARY.md as part of the guide: its own title and intro left out, each group a section, each term a heading
 * to link to, and the words it avoids shown as what readers may know from elsewhere. Words that are themselves
 * Ziffr terms are left out of those, since the glossary explains them on their own. */
export function glossaryForGuide(glossary: string): string {
  const body = glossary.slice(Math.max(0, glossary.search(/^### /m)));
  const terms = glossaryTerms(glossary);
  return body.split("\n").map((line) => {
    const group = /^###\s+(.+)$/.exec(line);
    if (group) return `## ${group[1]}`;
    const term = /^\*\*(.+?)\*\*:\s*$/.exec(line);
    if (term) return `### ${term[1]}`;
    const avoid = /^_Avoid_:\s*(.+)$/.exec(line);
    if (avoid) {
      const words = avoid[1].replace(/\([^)]*\)/g, "").split(",").map((w) => w.trim()).filter((w) => w && !terms.has(w.toLowerCase()));
      return words.length ? `\n*Elsewhere you may see:* ${words.join(", ")}` : "";
    }
    return line;
  }).join("\n");
}

/** One chapter's Markdown as HTML for the guide page. With `glossary`, the first bold mention of each glossary term
 * links to its entry. */
export function renderGuide(markdown: string, glossary?: GlossaryLinks): string {
  const linked = new Set<string>();
  const marked = new Marked({
    gfm: true,
    renderer: {
      // Raw HTML in a chapter is shown as text, never run in the reader's browser. Comments are notes for editors
      // and checks (`<!-- screens: … -->`), shown neither here nor on GitHub.
      html({ text }: Tokens.HTML | Tokens.Tag) {
        if (/^\s*<!--[\s\S]*-->\s*$/.test(text)) return "";
        return escape(text);
      },
      heading({ tokens, depth }: Tokens.Heading) {
        const inner = this.parser.parseInline(tokens);
        return `<h${depth} id="${headingId(inner)}">${inner}</h${depth}>\n`;
      },
      link({ href, tokens }: Tokens.Link) {
        const inner = this.parser.parseInline(tokens);
        const to = linkTarget(href);
        if (!to) return inner;
        return to.external
          ? `<a href="${escape(to.href)}" target="_blank" rel="noopener noreferrer">${inner}</a>`
          : `<a href="${escape(to.href)}">${inner}</a>`;
      },
      strong({ tokens, text }: Tokens.Strong) {
        const inner = `<strong>${this.parser.parseInline(tokens)}</strong>`;
        // "Stand-ins" finds "Stand-in" too; only plain words, so a bold link or code stays as it is.
        const word = text.toLowerCase();
        const id = glossary?.terms.get(word) ?? glossary?.terms.get(word.replace(/s$/, ""));
        if (!glossary || !id || linked.has(id) || tokens.some((t) => t.type !== "text")) return inner;
        linked.add(id);
        return `<a href="${escape(glossary.href)}#${id}" class="guide-term">${inner}</a>`;
      },
      // Pictures are not part of the guide yet: their description is shown instead.
      image({ text }: Tokens.Image) {
        return escape(text);
      },
    },
  });
  return marked.parse(markdown, { async: false });
}

/** Which part of the guide a chapter belongs to, from its `<!-- part: … -->` line, or null. */
export function chapterPart(markdown: string): string | null {
  return /^<!--\s*part:\s*(.+?)\s*-->/m.exec(markdown)?.[1] ?? null;
}

/** A chapter's title: its first top-level heading, or the address it has when it has none. */
export function chapterTitle(markdown: string, slug: string): string {
  const heading = /^#\s+(.+?)\s*#*\s*$/m.exec(markdown);
  return heading ? heading[1] : slug.replace(/-/g, " ");
}

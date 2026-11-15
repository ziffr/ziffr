// The user guide (docs/user-guide/README.md): its chapters are Markdown files read when a page is asked for, so
// editing the guide changes no code. Where it is shown is a setting: Ziffr's own /guide, or ZIFFR_USER_GUIDE_URL.
import "server-only";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { CHAPTER_FILE, GLOSSARY_MARKER, type GlossaryLinks, chapterHref, chapterPart, chapterTitle, glossaryForGuide, glossaryTerms } from "./user-guide-render";

/** One chapter of the guide; `glossary` when it takes in GLOSSARY.md. */
export type GuideChapter = { slug: string; title: string; file: string; part: string | null; glossary: boolean };

/** The folder that holds the chapters: ZIFFR_USER_GUIDE_DIR, or docs/user-guide in this checkout. */
function guideDir(): string {
  return process.env.ZIFFR_USER_GUIDE_DIR || path.resolve(process.cwd(), "../../docs/user-guide");
}

/** GLOSSARY.md at the root of the checkout the guide's folder sits in, or null when there is none. */
async function readGlossary(): Promise<string | null> {
  return readFile(path.resolve(guideDir(), "../../GLOSSARY.md"), "utf8").catch(() => null);
}

/** Where the app's "User guide" link leads: ZIFFR_USER_GUIDE_URL when a team keeps its guide elsewhere, else /guide. */
export function guideHref(): string {
  const url = process.env.ZIFFR_USER_GUIDE_URL;
  // Only a web address: the setting ends up in a link on every page.
  return url && /^https?:\/\//i.test(url) ? url : "/guide";
}

/** Every chapter, in the order of the numbers in their file names; empty when the folder is missing. */
export async function guideChapters(): Promise<GuideChapter[]> {
  const dir = guideDir();
  const files = await readdir(dir).catch(() => [] as string[]);
  const found = files.map((f) => ({ f, m: CHAPTER_FILE.exec(f) })).filter((x) => x.m)
    .sort((a, b) => Number(a.m![1]) - Number(b.m![1]) || a.f.localeCompare(b.f));
  return Promise.all(found.map(async ({ f, m }) => {
    const markdown = await readFile(path.join(dir, f), "utf8");
    return { slug: m![2], file: f, title: chapterTitle(markdown, m![2]), part: chapterPart(markdown), glossary: GLOSSARY_MARKER.test(markdown) };
  }));
}

/** One chapter's Markdown, with GLOSSARY.md in place of the glossary marker, and for every other chapter the links
 * from its bold terms to the glossary; null when there is no such chapter. The file is found by its address among the
 * listed chapters, never by joining what the browser sent onto a path, so no other file can be read. */
export async function guideChapter(slug: string): Promise<{ chapter: GuideChapter; markdown: string; glossary?: GlossaryLinks } | null> {
  const chapters = await guideChapters();
  const chapter = chapters.find((c) => c.slug === slug);
  if (!chapter) return null;
  const markdown = await readFile(path.join(guideDir(), chapter.file), "utf8");
  const words = chapters.find((c) => c.glossary);
  const glossary = words ? await readGlossary() : null;
  if (chapter.glossary) return { chapter, markdown: markdown.replace(GLOSSARY_MARKER, () => (glossary ? glossaryForGuide(glossary) : "")) };
  return { chapter, markdown, glossary: words && glossary ? { href: chapterHref(words.slug), terms: glossaryTerms(glossary) } : undefined };
}

export { chapterHref };

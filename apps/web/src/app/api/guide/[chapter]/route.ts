// GLOSSARY: Slide-over. One chapter of the user guide, already rendered, for the Help panel to show in place
// (spec 0050). Reads only the guide's own files: the chapter is found by its address among the listed chapters
// (lib/user-guide.ts), never by joining what the browser sent onto a path, and no database is touched. The text is
// the same for everyone, so it is cached by the browser for a few minutes.
import { chapterHref, guideChapter } from "@/lib/user-guide";
import { renderGuide } from "@/lib/user-guide-render";

// A chapter's address is lower-case words joined by hyphens; anything else is refused before the guide is read.
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_SLUG = 80;

/** The chapter as `{ slug, title, html, href }`, or 404 when the guide has no such chapter. */
export async function GET(_req: Request, { params }: { params: Promise<{ chapter: string }> }) {
  const { chapter: slug } = await params;
  const found = slug.length <= MAX_SLUG && SLUG.test(slug) ? await guideChapter(slug) : null;
  if (!found) return Response.json({ error: "No such chapter" }, { status: 404, headers: { "cache-control": "no-store" } });
  return Response.json(
    { slug: found.chapter.slug, title: found.chapter.title, html: renderGuide(found.markdown, found.glossary), href: chapterHref(found.chapter.slug) },
    { headers: { "cache-control": "private, max-age=300" } },
  );
}

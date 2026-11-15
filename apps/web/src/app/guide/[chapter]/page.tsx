// One chapter of the user guide (docs/user-guide), with every chapter listed beside it. Open to everyone, signed in
// or not: it shows only the guide's own text, nothing of any Workspace.
import Link from "next/link";
import { notFound } from "next/navigation";
import { chapterHref, guideChapter, guideChapters } from "@/lib/user-guide";
import { renderGuide } from "@/lib/user-guide-render";
import { cn } from "@/lib/utils";

export async function generateMetadata({ params }: { params: Promise<{ chapter: string }> }) {
  const found = await guideChapter((await params).chapter);
  return { title: found ? `${found.chapter.title} · User guide · Ziffr` : "User guide · Ziffr" };
}

export default async function GuideChapterPage({ params }: { params: Promise<{ chapter: string }> }) {
  const { chapter: slug } = await params;
  const [found, chapters] = await Promise.all([guideChapter(slug), guideChapters()]);
  if (!found) notFound();
  const at = chapters.findIndex((c) => c.slug === slug);
  const next = chapters[at + 1];
  return (
    <div className="grid gap-8 lg:grid-cols-[14rem_minmax(0,1fr)]">
      <nav aria-label="User guide" className="min-w-0 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:self-start lg:overflow-y-auto">
        <p className="px-2 pb-2 text-xs font-medium text-muted-foreground">User guide</p>
        <ol className="flex gap-1 overflow-x-auto pb-1 text-sm lg:flex-col lg:overflow-visible">
          {chapters.map((c, i) => (
            <li key={c.slug} className="shrink-0">
              {/* A chapter that starts a new part of the guide (its "<!-- part: … -->" line) shows the part's name above it. */}
              {c.part && c.part !== chapters[i - 1]?.part && <p className="hidden px-2 pb-1 pt-4 text-xs font-medium text-muted-foreground lg:block">{c.part}</p>}
              <Link href={chapterHref(c.slug)} aria-current={c.slug === slug ? "page" : undefined}
                className={cn("flex gap-2 rounded-[var(--radius-input)] px-2 py-1.5 hover:bg-muted", c.slug === slug ? "bg-muted font-medium text-foreground" : "text-muted-foreground")}>
                <span className="fig">{i + 1}</span><span>{c.title}</span>
              </Link>
            </li>
          ))}
        </ol>
      </nav>
      <div className="min-w-0">
        {/* The chapters are this installation's own files, rendered with raw HTML escaped and only safe links (user-guide-render.ts). */}
        <article className="guide-prose" dangerouslySetInnerHTML={{ __html: renderGuide(found.markdown, found.glossary) }} />
        {next && (
          <p className="mt-12 max-w-[68ch] border-t border-border pt-4 text-sm">
            <Link href={chapterHref(next.slug)} className="font-medium underline-offset-4 hover:underline">Next: {next.title} →</Link>
          </p>
        )}
      </div>
    </div>
  );
}

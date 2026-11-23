"use client";
// GLOSSARY: Slide-over. Help in the side panel (spec 0050): the "?" button in the app shell opens the user guide's
// chapter for the screen you are on, with a search over every chapter. The text is the guide's own, bundled at build
// time (help-index.generated.json); searching runs in the browser, so nothing typed leaves it. No model is involved.
import { useEffect, useId, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CircleHelp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSlideOver } from "@/components/slide-over-host";
import type { HelpIndex } from "@/lib/help-index-build";
import { chapterForPath } from "@/lib/help-routes";
import { searchHelp } from "@/lib/help-search";

// The index is a few hundred kilobytes: it loads when the panel first opens, not with every page.
const loadIndex = () => import("@/lib/help-index.generated.json").then((m) => m.default as HelpIndex);

/** Where a section lives in the full guide: Ziffr's own /guide, or the team's own guide page (ZIFFR_USER_GUIDE_URL), which has no sections to point at. */
function sectionHref(guide: string, chapter: string, id: string): string {
  return guide.startsWith("/") ? `/guide/${chapter}${id ? `#${id}` : ""}` : guide;
}

/** A link to the guide: inside the app a Next link, a team's own guide in a new tab. */
function GuideAnchor({ href, children }: { href: string; children: React.ReactNode }) {
  const cls = "font-medium underline-offset-4 hover:underline";
  return href.startsWith("/") ? <Link href={href} className={cls}>{children}</Link> : <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>{children}</a>;
}

/** The panel's content: a search box, and below it either the results or the chapter for `path`. */
function HelpContent({ path, guide, load = loadIndex }: { path: string; guide: string; load?: () => Promise<HelpIndex> }) {
  const [index, setIndex] = useState<HelpIndex | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const inputId = useId();
  useEffect(() => { let live = true; load().then((i) => live && setIndex(i), () => live && setFailed(true)); return () => { live = false; }; }, [load]);

  const slug = chapterForPath(path);
  const chapter = index?.chapters.find((c) => c.slug === slug) ?? null;
  const hits = useMemo(() => (index ? searchHelp(index, query) : []), [index, query]);
  const searching = query.trim() !== "";

  return (
    <div className="flex flex-col gap-4 text-sm">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={inputId}>Search the user guide</Label>
        <Input id={inputId} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="For example: share a dashboard" autoComplete="off" autoFocus />
        {/* Said once for screen readers when the results change; the list itself is below. */}
        <p className="sr-only" role="status">{searching && index ? `${hits.length} ${hits.length === 1 ? "result" : "results"}` : ""}</p>
      </div>
      {failed && <p className="text-muted-foreground">The help could not be loaded. <GuideAnchor href={guide}>Open the full guide</GuideAnchor> instead.</p>}
      {!index && !failed && <p className="text-muted-foreground">Loading the help…</p>}
      {index && searching && (hits.length === 0
        ? <p className="text-muted-foreground">Nothing in the guide matches “{query.trim()}”. Try fewer or other words.</p>
        : (
          <ul aria-label="Search results" className="flex flex-col gap-3">
            {hits.map((h) => (
              <li key={`${h.chapter}#${h.id}`}>
                <GuideAnchor href={sectionHref(guide, h.chapter, h.id)}>{h.heading}</GuideAnchor>
                <p className="text-xs text-muted-foreground">{h.chapterTitle}</p>
                <p className="mt-0.5">{h.snippet}</p>
              </li>
            ))}
          </ul>
        ))}
      {index && !searching && (chapter ? (
        <section aria-label={`About this screen: ${chapter.title}`} className="flex flex-col gap-3">
          <h3 className="text-base font-semibold">About this screen: {chapter.title}</h3>
          {chapter.sections.map((s) => (
            <div key={s.id || "top"}>
              {s.id && <h4 className="font-medium">{s.heading}</h4>}
              {s.text.split("\n").map((p, i) => <p key={i} className="mt-1">{p}</p>)}
              <p className="mt-1 text-xs"><GuideAnchor href={sectionHref(guide, chapter.slug, s.id)}>Read this in the guide<span className="sr-only">: {s.heading}</span></GuideAnchor></p>
            </div>
          ))}
        </section>
      ) : (
        <div>
          <p className="text-muted-foreground">There is no chapter for this screen. Search above, or pick a chapter.</p>
          <ul className="mt-2 flex flex-col gap-1">
            {index.chapters.map((c) => <li key={c.slug}><GuideAnchor href={sectionHref(guide, c.slug, "")}>{c.title}</GuideAnchor></li>)}
          </ul>
        </div>
      ))}
      <p className="border-t border-border pt-3"><GuideAnchor href={guide}>Open the full guide</GuideAnchor></p>
    </div>
  );
}

/** The "?" button in the app shell: opens Help for the screen you are on in the side panel; focus returns to it on close. */
export function HelpButton({ guide, className }: { guide: string; className?: string }) {
  const panel = useSlideOver();
  const path = usePathname();
  return (
    <Button variant="ghost" size="icon-sm" className={className} aria-label="Help for this screen" title="Help for this screen" aria-haspopup="dialog"
      onClick={() => panel.open({ title: "Help", description: "The user guide for this screen, and a search over all of it.", content: <HelpContent path={path} guide={guide} /> })}>
      <CircleHelp aria-hidden />
    </Button>
  );
}

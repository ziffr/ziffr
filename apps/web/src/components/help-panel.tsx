"use client";
// GLOSSARY: Slide-over. Help in the side panel (spec 0050): the "?" button in the app shell and the sidebar's Help entry open
// the user guide beside the page: the chapter for the screen you are on or the list of chapters, a search over every chapter,
// and any guide page read right there (Back goes one page back, "Wider" widens the panel). Nothing in it leaves the screen
// except "Open full page", which opens a new tab. The search text is the guide's own, bundled at build time
// (help-index.generated.json) and searched in the browser, so nothing typed leaves it; a page is fetched, already rendered,
// from /api/guide/<chapter> when it is opened. No model is involved. The guides of the installed Packs are offered here too
// (pack-guide-help.tsx): the Pack creators' words, listed and read through the core, apart from the user guide.
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ArrowLeft, CircleHelp, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSlideOver } from "@/components/slide-over-host";
import { SetupGuideButton, useSetupState } from "@/components/setup-panel";
import { PackGuideList, PackGuidePage, usePackGuides } from "@/components/pack-guide-help";
import type { HelpIndex } from "@/lib/help-index-build";
import { chapterForPath } from "@/lib/help-routes";
import { searchHelp } from "@/lib/help-search";

// The index is a few hundred kilobytes: it loads when the panel first opens, not with every page.
const loadIndex = () => import("@/lib/help-index.generated.json").then((m) => m.default as HelpIndex);

type Page = { slug: string; hash: string };
type Loaded = { title: string; html: string };
type Cache = Map<string, Loaded>;
/** Where the panel starts: the chapter for this screen, or the list of chapters (the sidebar's Help entry). */
type Start = "screen" | "contents";

// Pages kept for "Back"; a person never needs more.
const MAX_PAGES = 12;
const anchorCls = "font-medium underline-offset-4 hover:underline";
const linkCls = `text-left ${anchorCls}`;

/** One chapter, already rendered, from the guide route; rejects when there is none. */
async function fetchChapter(slug: string): Promise<Loaded> {
  const res = await fetch(`/api/guide/${encodeURIComponent(slug)}`);
  if (!res.ok) throw new Error("no such page");
  const body = (await res.json()) as Partial<Loaded>;
  if (typeof body.title !== "string" || typeof body.html !== "string") throw new Error("unexpected answer");
  return { title: body.title, html: body.html };
}

/** The full guide's address for a page: Ziffr's own /guide/<chapter>, or a team's own guide (ZIFFR_USER_GUIDE_URL), which has no chapters to point at. */
function fullHref(guide: string, chapter: string, id: string): string {
  return guide.startsWith("/") ? `/guide/${chapter}${id ? `#${id}` : ""}` : guide;
}

/** A link to the guide that opens in a new tab, so it never takes the person off the screen. */
function GuideAnchor({ href, children }: { href: string; children: React.ReactNode }) {
  return <a href={href} target="_blank" rel="noopener noreferrer" className={anchorCls}>{children}</a>;
}

/** A guide page as it is offered: a button that shows it in the panel, or, where the team keeps its guide elsewhere, a link to it. */
function Entry({ inPanel, guide, slug, id, onOpen, children }: { inPanel: boolean; guide: string; slug: string; id: string; onOpen: (slug: string, hash: string) => void; children: React.ReactNode }) {
  return inPanel
    ? <button type="button" className={linkCls} onClick={() => onOpen(slug, id)}>{children}</button>
    : <GuideAnchor href={fullHref(guide, slug, id)}>{children}</GuideAnchor>;
}

/** Scrolls to the element with `id` inside `root`, or to the top of `top` when there is none. Ids are compared, never put into a selector. */
function scrollToId(root: HTMLElement, id: string, top: HTMLElement) {
  const target = id ? [...root.querySelectorAll<HTMLElement>("[id]")].find((e) => e.id === id) : undefined;
  (target ?? top).scrollIntoView?.({ block: "start" });
}

/** A guide page inside the panel: Back and "Open full page" on top, then the chapter's own rendered text; links to other chapters stay in the panel. */
function PageView({ page, guide, valid, cache, onOpen, onBack }: { page: Page; guide: string; valid: Set<string>; cache: Cache; onOpen: (slug: string, hash: string) => void; onBack: () => void }) {
  const [loaded, setLoaded] = useState<Loaded | null>(cache.get(page.slug) ?? null);
  const [failed, setFailed] = useState(false);
  const top = useRef<HTMLDivElement>(null);
  const article = useRef<HTMLElement>(null);
  useEffect(() => {
    const hit = cache.get(page.slug);
    if (hit) { setLoaded(hit); return; }
    setLoaded(null); setFailed(false);
    let live = true;
    fetchChapter(page.slug).then((l) => { cache.set(page.slug, l); if (live) setLoaded(l); }, () => live && setFailed(true));
    return () => { live = false; };
  }, [page.slug, cache]);
  // Once the text is in (or the page changes), show the section that was clicked, else the top.
  useLayoutEffect(() => { if (loaded && article.current && top.current) scrollToId(article.current, page.hash, top.current); }, [loaded, page]);

  function onClick(e: React.MouseEvent<HTMLElement>) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || !(e.target instanceof Element)) return;
    const a = e.target.closest("a");
    if (!a) return;
    // Links to other sites carry target=_blank from the guide's renderer: they open in a new tab as they are.
    if (a.target === "_blank") return;
    e.preventDefault();
    const href = a.getAttribute("href") ?? "";
    const chapter = /^\/guide\/([a-z0-9]+(?:-[a-z0-9]+)*)(?:#(.*))?$/.exec(href);
    if (href.startsWith("#") && article.current && top.current) scrollToId(article.current, href.slice(1), top.current);
    else if (chapter && valid.has(chapter[1])) onOpen(chapter[1], chapter[2] ?? "");
    else window.open(href, "_blank", "noopener,noreferrer");
  }

  return (
    <div ref={top} className="flex flex-col gap-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" className="-ml-2" onClick={onBack} autoFocus><ArrowLeft aria-hidden /> Back</Button>
        <a href={fullHref(guide, page.slug, page.hash)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs underline-offset-4 hover:underline">
          Open full page<ExternalLink aria-hidden className="size-3" /><span className="sr-only"> (new tab)</span>
        </a>
      </div>
      {failed && <p className="text-muted-foreground">This page could not be loaded. <GuideAnchor href={fullHref(guide, page.slug, page.hash)}>Open the full page</GuideAnchor> instead.</p>}
      {!loaded && !failed && <p className="text-muted-foreground">Loading the page…</p>}
      {/* The chapter is the guide's own text, rendered by the guide's renderer (raw HTML escaped, only safe links, user-guide-render.ts). */}
      {loaded && <article ref={article} className="guide-prose guide-prose-panel" onClick={onClick} dangerouslySetInnerHTML={{ __html: loaded.html }} />}
    </div>
  );
}

/** The panel's content: a search box, and below it the results, the chapter for `path` or the chapters; a page opened from any of them replaces it until Back. */
function HelpContent({ path, guide, start, load = loadIndex }: { path: string; guide: string; start: Start; load?: () => Promise<HelpIndex> }) {
  const [index, setIndex] = useState<HelpIndex | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [contents, setContents] = useState(start === "contents");
  const [pages, setPages] = useState<Page[]>([]);
  const cache = useRef<Cache>(new Map());
  const inputId = useId();
  const setup = useSetupState();
  // The installed Packs' guides (spec 0058), and the one being read, which takes the panel until Back.
  const guides = usePackGuides();
  const [pack, setPack] = useState<number | null>(null);
  useEffect(() => { let live = true; load().then((i) => live && setIndex(i), () => live && setFailed(true)); return () => { live = false; }; }, [load]);

  const inPanel = guide.startsWith("/");
  const slug = chapterForPath(path);
  const chapter = index?.chapters.find((c) => c.slug === slug) ?? null;
  const hits = useMemo(() => (index ? searchHelp(index, query) : []), [index, query]);
  const valid = useMemo(() => new Set(index?.chapters.map((c) => c.slug)), [index]);
  const searching = query.trim() !== "";
  const open = useCallback((s: string, hash: string) => setPages((p) => [...p, { slug: s, hash }].slice(-MAX_PAGES)), []);
  const back = useCallback(() => setPages((p) => p.slice(0, -1)), []);
  const entry = (s: string, id: string, children: React.ReactNode) => <Entry inPanel={inPanel} guide={guide} slug={s} id={id} onOpen={open}>{children}</Entry>;

  if (pack !== null) return <PackGuidePage installId={pack} onBack={() => setPack(null)} />;
  const page = pages[pages.length - 1];
  if (page) return <PageView key={page.slug + "#" + pages.length} page={page} guide={guide} valid={valid} cache={cache.current} onOpen={open} onBack={back} />;

  const showChapter = index && !searching && !contents && chapter;
  // On the Packs screen and in the list of chapters the Packs' guides come first; elsewhere after the screen's own help.
  const packsFirst = !showChapter || slug === "packs";
  const packList = searching ? null : <PackGuideList entries={guides} onOpen={setPack} />;
  // The chapter for this screen first, then the rest in the guide's order.
  const listed = index ? [...index.chapters.filter((c) => c.slug === slug), ...index.chapters.filter((c) => c.slug !== slug)] : [];
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
      {packsFirst && packList}
      {index && searching && (hits.length === 0
        ? <p className="text-muted-foreground">Nothing in the guide matches “{query.trim()}”. Try fewer or other words.</p>
        : (
          <ul aria-label="Search results" className="flex flex-col gap-3">
            {hits.map((h) => (
              <li key={`${h.chapter}#${h.id}`}>
                {entry(h.chapter, h.id, h.heading)}
                <p className="text-xs text-muted-foreground">{h.chapterTitle}</p>
                <p className="mt-0.5">{h.snippet}</p>
              </li>
            ))}
          </ul>
        ))}
      {showChapter && (
        <section aria-label={`About this screen: ${chapter.title}`} className="flex flex-col gap-3">
          <h3 className="text-base font-semibold">About this screen: {chapter.title}</h3>
          <p className="text-xs">{entry(chapter.slug, "", <>Read the whole chapter</>)} · <button type="button" className={linkCls} onClick={() => setContents(true)}>All chapters</button></p>
          {chapter.sections.map((s) => (
            <div key={s.id || "top"}>
              {s.id && <h4 className="font-medium">{s.heading}</h4>}
              {s.text.split("\n").map((p, i) => <p key={i} className="mt-1">{p}</p>)}
              <p className="mt-1 text-xs">{entry(chapter.slug, s.id, <>Read this section<span className="sr-only">: {s.heading}</span></>)}</p>
            </div>
          ))}
        </section>
      )}
      {index && !searching && !showChapter && (
        <div>
          <p className="text-muted-foreground">
            {chapter ? "Every chapter of the user guide." : "There is no chapter for this screen. Search above, or pick a chapter."}
            {chapter && <> <button type="button" className={linkCls} onClick={() => setContents(false)}>About this screen</button></>}
          </p>
          <ul aria-label="Chapters" className="mt-2 flex flex-col gap-1">
            {/* The Setup Guide first while its line is up, last once it is finished or hidden (spec 0052); clicking it reopens it. */}
            {setup.shown && <li><SetupGuideButton className={linkCls} /></li>}
            {listed.map((c) => <li key={c.slug}>{entry(c.slug, "", c.title)}{c.slug === slug && <span className="text-xs text-muted-foreground"> (this screen)</span>}</li>)}
            {setup.applies && !setup.shown && <li><SetupGuideButton className={linkCls} /></li>}
          </ul>
        </div>
      )}
      {!packsFirst && packList}
      <p className="border-t border-border pt-3"><GuideAnchor href={guide}>Open the full guide</GuideAnchor></p>
    </div>
  );
}

/** Opens Help in the side panel at `start`; the panel can be widened and its pages read in place. Used by the "?" button and the sidebar's Help entry. */
export function useOpenHelp(guide: string): (start: Start) => void {
  const panel = useSlideOver();
  const path = usePathname();
  return useCallback((start: Start) => panel.open({
    title: "Help",
    description: "The user guide for this screen, and a search over all of it.",
    widthToggle: true,
    content: <HelpContent path={path} guide={guide} start={start} />,
  }), [panel, path, guide]);
}

/** The "?" button in the app shell: opens Help for the screen you are on in the side panel; focus returns to it on close. */
export function HelpButton({ guide, className }: { guide: string; className?: string }) {
  const openHelp = useOpenHelp(guide);
  return (
    <Button variant="ghost" size="icon-sm" className={className} aria-label="Help for this screen" title="Help for this screen" aria-haspopup="dialog" onClick={() => openHelp("screen")}>
      <CircleHelp aria-hidden />
    </Button>
  );
}

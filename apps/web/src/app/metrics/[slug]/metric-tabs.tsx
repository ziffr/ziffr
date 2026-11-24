"use client";
// GLOSSARY: Metric. The section links of a Metric's page (Overview, Analysis, Targets, History, Description). On a phone
// they do not all fit: the strip scrolls sideways, fades on the side that is clipped, and brings the open section into view.
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/** Which sides of a scrolled strip still hide something (a pixel of slack for fractional widths). */
export function clippedSides(scrollLeft: number, clientWidth: number, scrollWidth: number) {
  return { left: scrollLeft > 1, right: scrollLeft + clientWidth < scrollWidth - 1 };
}

/** The scroll position that centres a tab in the strip, kept inside what can be scrolled. */
export function centredScroll(tabLeft: number, tabWidth: number, clientWidth: number, scrollWidth: number) {
  return Math.max(0, Math.min(scrollWidth - clientWidth, tabLeft + tabWidth / 2 - clientWidth / 2));
}

/** The tab links as a sideways-scrolling strip; `active` is the open tab's id. */
export function MetricTabs({ tabs, active }: { tabs: readonly { id: string; label: string; href: string }[]; active: string }) {
  const strip = useRef<HTMLElement>(null);
  const [sides, setSides] = useState({ left: false, right: false });
  const measure = useCallback(() => {
    const el = strip.current;
    if (el) setSides(clippedSides(el.scrollLeft, el.clientWidth, el.scrollWidth));
  }, []);
  useEffect(() => {
    const el = strip.current;
    const tab = el?.querySelector<HTMLElement>("[aria-current='page']");
    // Scroll the strip itself, not the page (scrollIntoView would move the page up and down too).
    if (el && tab) el.scrollTo({ left: centredScroll(tab.offsetLeft, tab.offsetWidth, el.clientWidth, el.scrollWidth) });
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [active, measure]);
  // The fade is a mask on the clipped side only, so a strip that fits (desktop) has none.
  const mask = sides.left || sides.right
    ? `linear-gradient(to right, ${sides.left ? "transparent, #000 2rem" : "#000, #000"}, ${sides.right ? "#000 calc(100% - 2rem), transparent" : "#000, #000"})`
    : undefined;
  return (
    <nav ref={strip} aria-label="Metric sections" onScroll={measure} style={{ maskImage: mask, WebkitMaskImage: mask }}
      className="mb-6 flex snap-x gap-1 overflow-x-auto overscroll-x-contain border-b border-border [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {tabs.map((t) => (
        <Link key={t.id} href={t.href} scroll={false} aria-current={active === t.id ? "page" : undefined}
          className={cn("-mb-px inline-flex min-h-11 shrink-0 snap-center items-center border-b-2 px-3 text-sm no-underline", active === t.id ? "border-[var(--color-ink)] font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

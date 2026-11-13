"use client";
// Present mode (decks): one slide at a time, scaled to fit any screen, with live numbers.
// Arrow keys, space or swipes move on; the deck itself is read-only here.
import "tldraw/tldraw.css";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Tldraw, type Editor, type TLEditorSnapshot } from "tldraw";
import { ChevronLeft, ChevronRight, Maximize, Minimize, X } from "lucide-react";
import { ThemeScope } from "@/components/theme-scope";
import { DeckData, WidgetShapeUtil } from "./widget-shape";
import { DeckMaster, SlideFrameUtil } from "./master";
import { orderedSlides } from "./layouts";
import { isDark, slideDesign, themeFor } from "@/lib/themes";
import { useFullscreen, useStepper } from "@/lib/use-stepper";
import type { CanvasData } from "@/lib/types";

const shapeUtils = [WidgetShapeUtil, SlideFrameUtil];

export function Slideshow({ deck, data, start, publicNote }: { deck: { id: number; name: string; document: unknown; theme_id: number | null; footer: string | null }; data: CanvasData; start: number; publicNote?: string }) {
  const pub = publicNote !== undefined;
  const router = useRouter();
  const back = `/decks/${deck.id}`;
  const [editor, setEditor] = useState<Editor | null>(null);
  const [count, setCount] = useState(0);
  const [snapshot] = useState(() => (deck.document ? ({ document: deck.document } as unknown as TLEditorSnapshot) : undefined));
  const theme = themeFor(data.themes, deck.theme_id);
  const master = useMemo(() => slideDesign(theme, deck.footer), [theme, deck.footer]);
  const step = useStepper(count, start, pub ? undefined : () => router.push(back));
  const { go } = step;
  // The slides are known only once tldraw has loaded the deck: jump to the requested one then.
  useEffect(() => { if (count) go(start); }, [count, start, go]);
  const full = useFullscreen();

  // Fit the current slide to the screen, now and whenever the screen changes size.
  useEffect(() => {
    if (!editor) return;
    const fit = () => {
      const slide = orderedSlides(editor)[step.i];
      const b = slide && editor.getShapePageBounds(slide);
      if (b) editor.zoomToBounds(b, { inset: 0 });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(editor.getContainer());
    return () => ro.disconnect();
  }, [editor, step.i]);

  const btn = "flex size-10 items-center justify-center rounded-[var(--radius-input)] text-[var(--color-muted)] hover:bg-[var(--muted)] hover:text-[var(--color-ink)] disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-[var(--color-accent-2)]";
  return (
    <DeckData.Provider value={data}>
      <DeckMaster.Provider value={master}>
        <ThemeScope theme={theme} className="slideshow fixed inset-0 z-[var(--z-modal)] flex flex-col bg-[var(--color-desk)]">
          <div className="relative min-h-0 flex-1" {...step.swipe} style={{ touchAction: "pan-y", pointerEvents: "auto" }}>
            <div className="absolute inset-0" style={{ pointerEvents: "none" }}>
              <Tldraw
                shapeUtils={shapeUtils}
                snapshot={snapshot}
                hideUi
                onMount={(ed) => {
                  ed.updateInstanceState({ isReadonly: true });
                  ed.user.updateUserPreferences({ colorScheme: theme && isDark(theme.tokens) ? "dark" : "light", locale: "en" });
                  ed.selectNone();
                  setCount(orderedSlides(ed).length);
                  setEditor(ed);
                }}
              />
            </div>
            {editor && count === 0 && <p className="absolute inset-0 m-auto h-fit text-center text-sm text-[var(--color-muted)]">This deck has no slides yet. <Link href={back} className="underline">Add slides in the deck</Link>.</p>}
            {/* Click the right half to go on, the left half to go back. */}
            <button type="button" aria-label="Previous slide" tabIndex={-1} onClick={step.prev} className="absolute inset-y-0 left-0 w-1/3 cursor-w-resize opacity-0" />
            <button type="button" aria-label="Next slide" tabIndex={-1} onClick={step.next} className="absolute inset-y-0 right-0 w-2/3 cursor-e-resize opacity-0" />
          </div>
          <nav aria-label="Slides" className="flex items-center gap-2 px-3 py-1.5 text-sm text-[var(--color-muted)]">
            <span className="min-w-0 flex-1 truncate">{deck.name}</span>
            <button type="button" onClick={step.prev} disabled={step.i === 0} className={btn} aria-label="Previous slide"><ChevronLeft aria-hidden className="size-5" /></button>
            <span className="fig min-w-14 text-center" aria-live="polite">{count ? `${step.i + 1} / ${count}` : ""}</span>
            <button type="button" onClick={step.next} disabled={step.i >= count - 1} className={btn} aria-label="Next slide"><ChevronRight aria-hidden className="size-5" /></button>
            <span className="flex flex-1 justify-end gap-1">
              <button type="button" onClick={full.toggle} className={btn} aria-label={full.on ? "Leave full screen" : "Full screen"}>{full.on ? <Minimize aria-hidden className="size-4" /> : <Maximize aria-hidden className="size-4" />}</button>
              {pub ? <span className="self-center text-xs">{publicNote}</span> : <Link href={back} className={btn} aria-label="Stop presenting"><X aria-hidden className="size-4" /></Link>}
            </span>
          </nav>
        </ThemeScope>
      </DeckMaster.Provider>
    </DeckData.Provider>
  );
}

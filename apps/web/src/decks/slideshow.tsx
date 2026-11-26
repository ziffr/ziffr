"use client";
// Present mode (GLOSSARY: Deck): one slide at a time, scaled to fit any screen, with live numbers.
// Arrow keys, space or swipes move on; the deck itself is read-only here. On an upright phone the slide is as wide as
// the screen, with the deck's name above it and how to see it larger below.
import "tldraw/tldraw.css";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Tldraw, type Editor, type TLEditorSnapshot } from "tldraw";
import { ChevronLeft, ChevronRight, Maximize, Minimize, RotateCw, X } from "lucide-react";
import { ThemeScope } from "@/components/theme-scope";
import { DeckData, WidgetShapeUtil } from "./widget-shape";
import { DeckMaster, SlideFrameUtil } from "./master";
import { orderedSlides } from "./layouts";
import { isDark, slideDesign, themeFor } from "@ziffr/core/themes";
import { tokensForViewer } from "@ziffr/core/theme-dark";
import { useViewerDark } from "@/lib/use-viewer-dark";
import { useFullscreen, usePinchZoomed, useStepper } from "@/lib/use-stepper";
import type { CanvasData } from "@ziffr/core/types";

const shapeUtils = [WidgetShapeUtil, SlideFrameUtil];

export function Slideshow({ deck, data, start, publicNote, back = `/decks/${deck.id}` }: { deck: { id: number; name: string; document: unknown; theme_id: number | null; footer: string | null }; data: CanvasData; start: number; publicNote?: string; /** Where leaving the presentation goes. */ back?: string }) {
  const pub = publicNote !== undefined;
  const router = useRouter();
  const [editor, setEditor] = useState<Editor | null>(null);
  const [count, setCount] = useState(0);
  const [snapshot] = useState(() => (deck.document ? ({ document: deck.document } as unknown as TLEditorSnapshot) : undefined));
  const theme = themeFor(data.themes, deck.theme_id);
  // The slides follow the viewer's dark Appearance unless the Theme says "always as designed"; through a View Link they
  // keep the look they were shared with (#583).
  const viewerDark = useViewerDark() && !pub;
  const shown = useMemo(() => (theme ? { ...theme, tokens: tokensForViewer(theme.tokens, viewerDark) } : theme), [theme, viewerDark]);
  const master = useMemo(() => slideDesign(shown, deck.footer), [shown, deck.footer]);
  const step = useStepper(count, start, pub ? undefined : () => router.push(back));
  const { go } = step;
  // The slides are known only once tldraw has loaded the deck: jump to the requested one then.
  useEffect(() => { if (count) go(start); }, [count, start, go]);
  const full = useFullscreen();
  // While the person has pinched in, a finger moves around the slide instead of changing it.
  const zoomed = usePinchZoomed();

  // Fit the current slide to the screen, now and whenever the screen changes size.
  useEffect(() => {
    if (!editor) return;
    const fit = () => {
      // tldraw measures a new size a moment later (throttled): without this the slide is fitted to the old one, and a
      // phone turned sideways keeps its small slide.
      editor.updateViewportScreenBounds(editor.getContainer());
      const slide = orderedSlides(editor)[step.i];
      const b = slide && editor.getShapePageBounds(slide);
      if (b) editor.zoomToBounds(b, { inset: 0 });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(editor.getContainer());
    return () => ro.disconnect();
  }, [editor, step.i]);

  const btn = "flex size-10 pointer-coarse:size-11 items-center justify-center rounded-[var(--radius-input)] text-[var(--color-muted)] hover:bg-[var(--muted)] hover:text-[var(--color-ink)] disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-[var(--color-accent-2)]";
  return (
    <DeckData.Provider value={data}>
      <DeckMaster.Provider value={master}>
        <ThemeScope theme={theme} scheme={pub ? "designed" : "follow"} className="slideshow fixed inset-0 z-[var(--z-modal)] flex flex-col bg-[var(--color-desk)]">
          <div className="relative min-h-0 flex-1" {...(zoomed ? {} : step.swipe)} style={{ touchAction: zoomed ? "auto" : "pan-y pinch-zoom", pointerEvents: "auto" }}>
            {/* On an upright phone only the slide's own 16:9 band is drawn, so the slides above and below do not show.
                Text is laid out at its own size: Chrome otherwise keeps chart labels where the last zoom put them. */}
            <div className="absolute inset-0 [text-rendering:geometricPrecision] max-sm:portrait:top-1/2 max-sm:portrait:bottom-auto max-sm:portrait:aspect-video max-sm:portrait:-translate-y-1/2" style={{ pointerEvents: "none" }}>
              <Tldraw
                shapeUtils={shapeUtils}
                snapshot={snapshot}
                hideUi
                onMount={(ed) => {
                  ed.updateInstanceState({ isReadonly: true });
                  ed.user.updateUserPreferences({ colorScheme: shown && isDark(shown.tokens) ? "dark" : "light", locale: "en" });
                  ed.selectNone();
                  setCount(orderedSlides(ed).length);
                  setEditor(ed);
                }}
              />
            </div>
            {/* 28.125vw is half the height of a 16:9 slide as wide as the screen. */}
            <p className="absolute inset-x-4 bottom-[calc(50%+28.125vw+1rem)] hidden text-center font-medium [overflow-wrap:anywhere] text-[var(--color-ink)] max-sm:portrait:block">{deck.name}</p>
            <div className="absolute inset-x-4 top-[calc(50%+28.125vw+1rem)] hidden space-y-3 text-center text-sm text-[var(--color-muted)] max-sm:portrait:block">
              {count > 0 && <p><RotateCw aria-hidden className="mr-1.5 inline size-4 align-[-0.15em]" />Turn your phone sideways for a larger slide, or pinch to zoom.</p>}
              {pub && <p className="text-xs">{publicNote}</p>}
            </div>
            {editor && count === 0 && <p className="absolute inset-0 m-auto h-fit text-center text-sm text-[var(--color-muted)]">This deck has no slides yet. <Link href={back} className="underline">Add slides in the deck</Link>.</p>}
            {/* Click the right half to go on, the left half to go back. */}
            <button type="button" aria-label="Previous slide" tabIndex={-1} onClick={step.prev} className="absolute inset-y-0 left-0 w-1/3 cursor-w-resize opacity-0" />
            <button type="button" aria-label="Next slide" tabIndex={-1} onClick={step.next} className="absolute inset-y-0 right-0 w-2/3 cursor-e-resize opacity-0" />
          </div>
          <nav aria-label="Slides" className="flex items-center gap-2 px-3 py-1.5 text-sm text-[var(--color-muted)]">
            {/* Hidden but still taking its room on an upright phone, where the name stands above the slide. */}
            <span className="min-w-0 flex-1 truncate max-sm:portrait:invisible">{deck.name}</span>
            <button type="button" onClick={step.prev} disabled={step.i === 0} className={btn} aria-label="Previous slide"><ChevronLeft aria-hidden className="size-5" /></button>
            <span className="fig min-w-14 text-center" aria-live="polite">{count ? `${step.i + 1} / ${count}` : ""}</span>
            <button type="button" onClick={step.next} disabled={step.i >= count - 1} className={btn} aria-label="Next slide"><ChevronRight aria-hidden className="size-5" /></button>
            <span className="flex flex-1 justify-end gap-1">
              {full.supported && <button type="button" onClick={full.toggle} className={btn} aria-label={full.on ? "Leave full screen" : "Full screen"}>{full.on ? <Minimize aria-hidden className="size-4" /> : <Maximize aria-hidden className="size-4" />}</button>}
              {pub ? <span className="self-center text-xs max-sm:portrait:hidden">{publicNote}</span> : <Link href={back} className={btn} aria-label="Stop presenting"><X aria-hidden className="size-4" /></Link>}
            </span>
          </nav>
        </ThemeScope>
      </DeckMaster.Provider>
    </DeckData.Provider>
  );
}

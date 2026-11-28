"use client";
// Present for a deck Ziffr makes (GLOSSARY: Deck, Slide; spec 0069): one slide at a time, as large as the screen allows,
// held at 16:9 upright or sideways. Next and Previous by buttons, arrow keys, space, or a swipe; Escape goes back. It only
// reads: it writes nothing, and holds only the drawing the server sent for this person.
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { slideFontsHref } from "@/decks/slides/fonts";
import { SlideView } from "@/decks/slides/slide-view";
import type { DeckDrawing } from "@ziffr/core/deck-drawing/draw-deck";

/** The presentation of one deck. */
export function Presenter({ name, drawing, start, back }: { name: string; drawing: DeckDrawing; start: number; back: string }) {
  const last = drawing.slides.length - 1;
  const [at, setAt] = useState(Math.min(Math.max(0, Math.trunc(start)), Math.max(0, last)));
  const touch = useRef<{ x: number; y: number } | null>(null);
  const go = useCallback((to: (now: number) => number) => setAt((now) => Math.min(Math.max(0, to(now)), Math.max(0, last))), [last]);
  const step = useCallback((by: number) => go((now) => now + by), [go]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (["ArrowRight", "ArrowDown", "PageDown", " ", "Enter"].includes(e.key)) step(1);
      else if (["ArrowLeft", "ArrowUp", "PageUp", "Backspace"].includes(e.key)) step(-1);
      else if (e.key === "Home") go(() => 0);
      else if (e.key === "End") go(() => last);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, go, last]);

  const slide = drawing.slides[at];
  if (!slide) return <p className="p-8 text-center">This deck has no slides you can see.</p>;
  const button = "inline-flex size-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-30";
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black text-white"
      onTouchStart={(e) => { const t = e.touches[0]; touch.current = t ? { x: t.clientX, y: t.clientY } : null; }}
      onTouchEnd={(e) => {
        const from = touch.current, t = e.changedTouches[0];
        touch.current = null;
        if (!from || !t) return;
        const dx = t.clientX - from.x;
        // A mostly sideways swipe of some length turns the page; a tap or a scroll does not.
        if (Math.abs(dx) > 40 && Math.abs(dx) > 1.5 * Math.abs(t.clientY - from.y)) step(dx < 0 ? 1 : -1);
      }}
    >
      <link rel="stylesheet" href={slideFontsHref(drawing.look.fonts)} />
      <div className="flex min-h-14 items-center justify-between gap-2 px-3">
        <span className="min-w-0 truncate text-sm text-white/80">{name}</span>
        <Link href={back} aria-label="Leave the presentation" className={button}><X aria-hidden className="size-5" /></Link>
      </div>
      <div className="grid min-h-0 flex-1 place-items-center">
        <div style={{ width: "min(100vw, calc((100dvh - 7rem) * 16 / 9))" }}>
          <SlideView key={`${slide.id}.${slide.part ?? 0}`} slide={slide} look={drawing.look} />
        </div>
      </div>
      <p className="sr-only" aria-live="polite">Slide {at + 1} of {drawing.slides.length}: {slide.headline}</p>
      <div className="flex min-h-14 items-center justify-center gap-4 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <button type="button" aria-label="Previous slide" disabled={at === 0} onClick={() => step(-1)} className={button}><ChevronLeft aria-hidden className="size-5" /></button>
        <span className="min-w-16 text-center text-sm tabular-nums text-white/80">{at + 1} / {drawing.slides.length}</span>
        <button type="button" aria-label="Next slide" disabled={at === last} onClick={() => step(1)} className={button}><ChevronRight aria-hidden className="size-5" /></button>
      </div>
    </div>
  );
}

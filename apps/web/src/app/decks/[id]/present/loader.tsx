"use client";
import dynamic from "next/dynamic";
import type { CanvasData, SlideBody } from "@ziffr/core/types";
import type { Kept } from "@/decks/kept/kept-drawing";
import { saveDeck } from "@/app/deck-actions";

// tldraw is browser-only.
const Slideshow = dynamic(() => import("@/decks/slideshow").then((m) => m.Slideshow), { ssr: false });

export function SlideshowLoader({ keep, ...props }: { deck: { id: number; name: string; document: unknown; theme_id: number | null; footer: string | null }; data: CanvasData; kept: Kept; start: number; back: string; templateSeed?: { slides: SlideBody[]; fills: number[][] } | null; /** The presenting person may change the deck: slides laid out now are kept. */ keep?: boolean }) {
  // A refusal or a lost connection only means they are laid out again next time.
  return <Slideshow {...props} onLaidOut={keep ? (document) => void saveDeck(props.deck.id, document).catch(() => undefined) : undefined} />;
}

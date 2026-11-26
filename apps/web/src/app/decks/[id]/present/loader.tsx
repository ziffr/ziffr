"use client";
import dynamic from "next/dynamic";
import type { CanvasData } from "@ziffr/core/types";
import type { Kept } from "@/decks/kept/kept-drawing";

// tldraw is browser-only.
const Slideshow = dynamic(() => import("@/decks/slideshow").then((m) => m.Slideshow), { ssr: false });

export function SlideshowLoader(props: { deck: { id: number; name: string; document: unknown; theme_id: number | null; footer: string | null }; data: CanvasData; kept: Kept; start: number; back: string }) {
  return <Slideshow {...props} />;
}

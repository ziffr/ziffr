"use client";
import dynamic from "next/dynamic";
import type { CanvasData, Master } from "@/lib/types";

// tldraw is browser-only.
const Slideshow = dynamic(() => import("@/decks/slideshow").then((m) => m.Slideshow), { ssr: false });

export function SlideshowLoader(props: { deck: { id: number; name: string; document: unknown; theme_id: number | null }; master: Master | null; data: CanvasData; start: number }) {
  return <Slideshow {...props} />;
}

"use client";
import dynamic from "next/dynamic";
import type { CanvasData } from "@ziffr/core/types";

// tldraw is browser-only.
const Slideshow = dynamic(() => import("@/decks/slideshow").then((m) => m.Slideshow), { ssr: false });

export function PublicSlideshow(props: { deck: { id: number; name: string; document: unknown; theme_id: number | null; footer: string | null }; data: CanvasData; note: string }) {
  return <Slideshow deck={props.deck} data={props.data} start={0} publicNote={props.note} />;
}

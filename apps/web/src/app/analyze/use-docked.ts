"use client";
// Whether the page is wide enough to hold the methods panel beside the canvas (GLOSSARY: Slide-over). The shared side panel is modal:
// while it is open the page behind it cannot be used. The methods panel has to leave the canvas and the Pool usable (drag from the
// Pool, then pick a question), so on a wide screen it is a column of the page; on a narrow one there is no room for it, and it is
// the Slide-over. On the server and before the browser has said, the answer is wide.
import { useMedia } from "@/lib/use-media";

const WIDE = "(min-width: 1280px)";

/** True when the methods panel sits beside the canvas, false when it is the Slide-over. */
export function useDocked(): boolean {
  return useMedia(WIDE, true);
}

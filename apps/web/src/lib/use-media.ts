"use client";
// Whether a media query matches: for the few layouts that cannot be said in CSS alone (GLOSSARY: Preview, Slide-over).
import { useCallback, useSyncExternalStore } from "react";

/** A phone in the hand (spec 0055): narrow, and pointed at with a finger. */
export const PHONE_TOUCH = "(max-width: 640px) and (pointer: coarse)";

/** True while the query matches; `before` on the server and until the browser has said. Follows changes. */
export function useMedia(query: string, before = false): boolean {
  const subscribe = useCallback((onChange: () => void) => {
    const q = window.matchMedia?.(query);
    q?.addEventListener?.("change", onChange);
    return () => q?.removeEventListener?.("change", onChange);
  }, [query]);
  return useSyncExternalStore(subscribe, () => window.matchMedia?.(query)?.matches ?? before, () => before);
}

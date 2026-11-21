"use client";
// Whether the viewer's Appearance is dark right now (GLOSSARY: Appearance; #583): Dark, or System on a dark device.
// High contrast follows the device the same way. For the places that need a plain answer (the deck canvas and slide
// colours); anything drawn with CSS follows the Appearance by itself (themeVars uses light-dark()).
import { useSyncExternalStore } from "react";

const QUERY = "(prefers-color-scheme: dark)";

function subscribe(notify: () => void) {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", notify);
  const mo = new MutationObserver(notify);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-appearance"] });
  return () => { mq.removeEventListener("change", notify); mo.disconnect(); };
}

function snapshot(): boolean {
  const a = document.documentElement.dataset.appearance;
  return a === "dark" || ((a === "system" || a === "contrast") && window.matchMedia(QUERY).matches);
}

/** True while the page is drawn dark; false on the server and before hydration (the first paint is light, then it follows). */
export function useViewerDark(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}

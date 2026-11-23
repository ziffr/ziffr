"use client";
// The one-line hint on a dashboard about a widget's ⋯ menu (GLOSSARY: Widget). It shows until the person has opened a
// widget menu once; where that is remembered is this browser's localStorage, as the guided tour does it, a convenience
// per person (the viewer id is in the key) that never needs the server. Without storage the hint shows every time.
import { useSyncExternalStore } from "react";

const EVENT = "ziffr:widget-menu-seen";
const key = (viewer: string) => `ziffr-widget-menu-seen-${viewer}`;
// Kept in memory too, so a browser that refuses storage still stops showing it for the rest of the visit.
const seenNow = new Set<string>();

function read(viewer: string): boolean {
  if (seenNow.has(viewer)) return true;
  try { return localStorage.getItem(key(viewer)) === "1"; } catch { return false; }
}

/** Notes that this person opened a widget menu, so the hint can go. */
export function markWidgetMenuSeen(viewer: string) {
  if (read(viewer)) return;
  seenNow.add(viewer);
  try { localStorage.setItem(key(viewer), "1"); } catch {}
  window.dispatchEvent(new Event(EVENT));
}

/** Whether this person has opened a widget menu before. Counts as seen on the server, so the hint never flashes. */
export function useWidgetMenuSeen(viewer: string): boolean {
  return useSyncExternalStore(
    (cb) => { window.addEventListener(EVENT, cb); window.addEventListener("storage", cb); return () => { window.removeEventListener(EVENT, cb); window.removeEventListener("storage", cb); }; },
    () => read(viewer),
    () => true,
  );
}

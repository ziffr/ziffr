"use client";
// Which slide-over is open lives in the address (`?panel=share`), so a panel has a direct URL: opening that link opens
// the page with the panel already open (docs/specs/0036-app-layout.md; GLOSSARY: Slide-over). Next keeps
// `useSearchParams` in step with history.replaceState, so nothing is re-fetched when a panel opens or closes.
import { useCallback } from "react";
import { useSearchParams } from "next/navigation";

/** The name of a Metric's quick look in the address, `metric-<slug>`. */
export const lookPanel = (slug: string) => `metric-${slug}`;

/** The name of the panel with the open Actions about Metrics, `actions-<slug>[,<slug>]` (no slugs: the prefix alone). */
export const actionsPanel = (slugs: readonly string[]) => `actions-${slugs.join(",")}`;

/** Writes which panel is open into the address (none for null); only one panel is open at a time. */
export function writePanel(name: string | null) {
  const url = new URL(window.location.href);
  if (name) url.searchParams.set("panel", name);
  else url.searchParams.delete("panel");
  // null state: Next ignores a call that passes its own state back, and the address would change without the page knowing.
  window.history.replaceState(null, "", url);
}

/** The name of the open panel, or null. */
export function useOpenPanel(): string | null {
  return useSearchParams().get("panel");
}

/** Whether the panel called `name` is open, and a setter that writes it into the address. */
export function usePanel(name: string): [boolean, (open: boolean) => void] {
  const open = useOpenPanel() === name;
  const setOpen = useCallback((next: boolean) => {
    if (next) writePanel(name);
    else if (new URL(window.location.href).searchParams.get("panel") === name) writePanel(null);
  }, [name]);
  return [open, setOpen];
}

"use client";
// The slide editor's license key as a browser asks for it (GLOSSARY: Installation Settings, Deck, Free Layout). Kept
// apart from the canvas that uses it, so a screen can ask whether Free Layouts are offered without loading the editor.
// Showing or hiding is only help for the person: the core refuses what may not be done.
import { useEffect, useState } from "react";

/** The answer of `/api/slide-license`; `failed` when it did not come. */
export type SlideLicense = { key: string | null; admin: boolean; settings?: string; failed?: boolean };

let asking: Promise<SlideLicense> | null = null;

/** Asks once for all who ask together, and again next time, so a key just saved is used at once. */
function askForSlideLicense(): Promise<SlideLicense> {
  asking ??= fetch("/api/slide-license", { cache: "no-store" })
    .then((r) => (r.ok ? (r.json() as Promise<SlideLicense>) : Promise.reject(new Error())))
    .catch(() => ({ key: null, admin: false, failed: true }))
    .finally(() => { asking = null; });
  return asking;
}

/** The answer, or null while it is asked for; nothing is asked while `wanted` is false. */
export function useSlideLicense(wanted = true): SlideLicense | null {
  const [license, setLicense] = useState<SlideLicense | null>(null);
  useEffect(() => {
    if (!wanted) return;
    let on = true;
    void askForSlideLicense().then((l) => { if (on) setLicense(l); });
    return () => { on = false; };
  }, [wanted]);
  return license;
}

/** Whether Free Layouts are offered here: only where this Ziffr has a slide editor key. False until that is known. */
export const useFreeLayouts = (wanted = true): boolean => Boolean(useSlideLicense(wanted)?.key);

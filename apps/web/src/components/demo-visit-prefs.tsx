"use client";
// A demo visit's own pins and home (GLOSSARY: Demo Mode, Pinned Dashboard; spec 0051, ticket 7), kept in this browser, per made-up
// person viewed as, and never sent anywhere (lib/demo-visit-prefs.ts has the rules). Present only where visitors may change the
// demo; without the provider every consumer gets null and keeps showing what the server sent. localStorage can be missing or
// refuse (a private window, blocked site data): every read and write is guarded, and then the choice lasts the page only.
import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { movePin, parsePrefs, prefsKey, resolveRef, resolveRefs, serializePrefs, togglePin, type DashboardRef, type VisitPrefs } from "@/lib/demo-visit-prefs";

type Prefs = {
  /** The pins to show, in order: the visitor's, or the demo's own until the visitor changes them. */
  pinned: DashboardRef[];
  /** The visitor's home dashboard, or null to keep the demo's. */
  homeId: number | null;
  isPinned: (id: number) => boolean;
  /** Pins or unpins; a sentence if it is refused (the list is full). */
  togglePin: (ref: DashboardRef) => string | null;
  /** Moves a pin to a place in the list. */
  movePin: (id: number, to: number) => void;
  /** Makes a dashboard the visitor's home. */
  setHome: (ref: DashboardRef) => void;
};

const Context = createContext<Prefs | null>(null);

const EVENT = "ziffr-demo-prefs";
const memory = new Map<string, string>();

/** The stored string, from localStorage or, when that is not there, from this page's memory. */
function read(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return memory.get(key) ?? null; }
}

function write(key: string, value: string): void {
  memory.set(key, value);
  try { localStorage.setItem(key, value); } catch { /* the choice then lasts the page */ }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => { window.removeEventListener(EVENT, onChange); window.removeEventListener("storage", onChange); };
}

/** Gives the demo bar, the sidebar and the dashboard screens the visit's pins and home. `known` is the dashboards the person
 * viewed as may open (so a saved one is found again after a reset by its name), `demoPinned` the demo's own pins. */
export function DemoVisitPrefs({ person, known, demoPinned, children }: { person: string; known: DashboardRef[]; demoPinned: DashboardRef[]; children: ReactNode }) {
  const key = prefsKey(person);
  // Server render and first draw: nothing kept, so the page matches the server's; the browser's choice follows.
  const raw = useSyncExternalStore(subscribe, () => read(key), () => null);
  const prefs: VisitPrefs = useMemo(() => parsePrefs(raw), [raw]);
  const value = useMemo<Prefs>(() => {
    const pinned = prefs.pins ? resolveRefs(prefs.pins, known) : demoPinned;
    const home = prefs.home ? resolveRef(prefs.home, known) : null;
    const save = (next: VisitPrefs) => write(key, serializePrefs(next));
    return {
      pinned,
      homeId: home?.id ?? null,
      isPinned: (id) => pinned.some((p) => p.id === id),
      togglePin: (ref) => { const r = togglePin(pinned, ref); if (!r.refused) save({ ...prefs, pins: r.pins }); return r.refused ?? null; },
      movePin: (id, to) => save({ ...prefs, pins: movePin(pinned, id, to) }),
      setHome: (ref) => save({ ...prefs, pins: prefs.pins ?? pinned, home: ref }),
    };
  }, [prefs, known, demoPinned, key]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

/** The visit's pins and home, or null where visitors may not change the demo (the provider is absent). */
export function useDemoPrefs(): Prefs | null {
  return useContext(Context);
}

/** On Home (a page with no dashboard of its own in its address): goes to the visitor's home when it is not the one shown. */
export function DemoHomeRedirect({ shownId }: { shownId: number | null }) {
  const prefs = useDemoPrefs();
  const router = useRouter();
  const [done, setDone] = useState(false);
  const home = prefs?.homeId ?? null;
  useEffect(() => {
    if (!done && home !== null && home !== shownId) { setDone(true); router.replace(`/dashboards/${home}`); }
  }, [done, home, shownId, router]);
  return null;
}

/** The pins of the sidebar and the tab bar: the visit's where visitors may change the demo, else what the server sent. */
export function useShownPins<T extends DashboardRef>(fromServer: T[]): DashboardRef[] {
  return useDemoPrefs()?.pinned ?? fromServer;
}

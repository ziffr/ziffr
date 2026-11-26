"use client";
// GLOSSARY: Slide-over. The one host for the side panel (spec 0050, docs/guides/side-panel.md): a screen that
// wants to show something beside the page calls `useSlideOver().open({ title, content })` instead of building
// its own Sheet. The host owns the width (the full width on a phone, a fixed one on a desktop), where focus goes
// on open and where it returns on close, Escape, the accessible title and the way back. It holds no data of its
// own: `content` is a component the caller already built from what the page may show.
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ArrowLeft, Maximize2, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

/** What the panel shows: a title that names it for screen readers, an optional line under it, and the content. */
export type SlideOverContent = {
  title: string;
  description?: string;
  content: React.ReactNode;
  /** Shows a "Wider" / "Narrower" button in the header (reading panels such as Help); the choice is kept for the session. Other panels keep their one width. */
  widthToggle?: boolean;
};

type SlideOverApi = {
  /** Shows `panel` in place of what is open; what was open stays one step back. Focus moves into the panel. */
  open: (panel: SlideOverContent) => void;
  /** Shows `panel` in place of what is open without keeping it as a step back (a panel that replaces itself, such as a list that refreshes). */
  replace: (panel: SlideOverContent) => void;
  /** Goes back one step; closes when there is none. */
  back: () => void;
  /** Closes the panel and forgets the steps. Focus returns to what opened it. */
  close: () => void;
  /** Whether a panel is open. */
  isOpen: boolean;
};

const SlideOverContext = createContext<SlideOverApi | null>(null);

// Steps kept for "back"; a person never needs more, and the content of a forgotten step is not held in memory.
const MAX_STEPS = 8;

const WIDE_KEY = "ziffr.slide-over.wide";
/** Whether the person chose the wide panel earlier in this session; storage can be blocked, then it is the normal width. */
function readWide(): boolean {
  try { return typeof window !== "undefined" && window.sessionStorage.getItem(WIDE_KEY) === "1"; } catch { return false; }
}

/** The panel's controls for the screen that is on. Throws outside the app shell, which is where a missing provider would otherwise show as a panel that never opens. */
export function useSlideOver(): SlideOverApi {
  const api = useContext(SlideOverContext);
  if (!api) throw new Error("useSlideOver needs the SlideOverProvider (the app shell has it)");
  return api;
}

/** Holds the panel's steps and draws it once, over the page it wraps. */
export function SlideOverProvider({ children }: { children: React.ReactNode }) {
  const [steps, setSteps] = useState<SlideOverContent[]>([]);
  // What had focus when the panel opened; it gets focus back on close, also when the opener has since been replaced by a menu.
  const opener = useRef<HTMLElement | null>(null);
  const [wide, setWide] = useState(readWide);
  const pathname = usePathname();
  const [seenPath, setSeenPath] = useState(pathname);

  const open = useCallback((panel: SlideOverContent) => {
    // Remember the opener unless focus is already inside the panel (a step opened from within it keeps the first opener).
    const active = document.activeElement;
    if (active instanceof HTMLElement && !active.closest("[data-slide-over]")) opener.current = active;
    setSteps((s) => [...s, panel].slice(-MAX_STEPS));
  }, []);
  const replace = useCallback((panel: SlideOverContent) => setSteps((s) => [...s.slice(0, -1), panel]), []);
  const back = useCallback(() => setSteps((s) => s.slice(0, -1)), []);
  const close = useCallback(() => setSteps([]), []);

  // A panel belongs to the page it was opened on: going to another page closes it (state adjusted while rendering, as React advises).
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    if (steps.length > 0) setSteps([]);
  }

  const toggleWide = () => setWide((w) => {
    try { window.sessionStorage.setItem(WIDE_KEY, w ? "0" : "1"); } catch { /* the choice just lasts until the page is left */ }
    return !w;
  });

  const current = steps[steps.length - 1];
  const isWide = Boolean(current?.widthToggle) && wide;
  const api = useMemo<SlideOverApi>(() => ({ open, replace, back, close, isOpen: steps.length > 0 }), [open, replace, back, close, steps.length]);

  return (
    <SlideOverContext.Provider value={api}>
      {children}
      <Sheet open={Boolean(current)} onOpenChange={(o) => { if (!o) close(); }}>
        {current && (
          <SheetContent className={isWide ? "max-w-[min(48rem,100vw)] sm:w-[48rem]" : "sm:w-[26rem]"} data-slide-over finalFocus={opener}>
            <SheetHeader>
              {steps.length > 1 && (
                <Button variant="ghost" size="sm" className="-ml-2 w-fit" onClick={back}><ArrowLeft aria-hidden /> Back</Button>
              )}
              <div className="flex items-center gap-2 pr-9">
                <SheetTitle className="flex-1">{current.title}</SheetTitle>
                {/* Phones already show the full width, so the button is for wider screens only. */}
                {current.widthToggle && (
                  <Button variant="ghost" size="sm" className="hidden sm:inline-flex" aria-pressed={isWide} onClick={toggleWide}>
                    {isWide ? <Minimize2 aria-hidden /> : <Maximize2 aria-hidden />}{isWide ? "Narrower" : "Wider"}
                  </Button>
                )}
              </div>
              {current.description && <SheetDescription>{current.description}</SheetDescription>}
            </SheetHeader>
            <div className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{current.content}</div>
          </SheetContent>
        )}
      </Sheet>
    </SlideOverContext.Provider>
  );
}

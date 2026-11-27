"use client";
// The one place a tldraw canvas is drawn (GLOSSARY: Deck, Installation Settings). It asks for the license key in effect
// and hands it to tldraw. Where tldraw would hide the canvas (no key it accepts on a public https address), plain words
// say what is missing instead of an empty space. tldraw's own check decides; this only reads its outcome.
import { useCallback, useEffect, useState } from "react";
import { Tldraw, type TldrawProps } from "tldraw";
import { useSlideLicense } from "./slide-license";
import { needsLicenseKey } from "./slide-license-rules";
import { SlideNotice } from "./slide-notice";

// Distributed over tldraw's union of props (a snapshot or a store), which a plain Omit would flatten.
type SlideCanvasProps = (TldrawProps extends infer P ? (P extends unknown ? Omit<P, "licenseKey"> : never) : never) & { onRefused?: () => void };

/** Over the words that stand in the canvas's place. */
const HEADING = "Slides and free layouts cannot be shown here";

/** `<Tldraw>` with the Installation's license key; fills the space it is given. `onRefused` says that tldraw took its
 * canvas away again, so that what lies over it can make way. */
export function SlideCanvas({ onRefused, ...props }: SlideCanvasProps) {
  const license = useSlideLicense();
  const [refused, setRefused] = useState(false);
  // tldraw leaves a marked, hidden element where its canvas was when it does not accept the key.
  const watch = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    const seen = new MutationObserver(() => { if (el.querySelector('[data-testid="tl-license-expired"]')) setRefused(true); });
    seen.observe(el, { childList: true, subtree: true });
    return () => seen.disconnect();
  }, []);

  useEffect(() => { if (refused) onRefused?.(); }, [refused, onRefused]);

  if (!license) return <p role="status" className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">Loading…</p>;
  const missing = !license.key && needsLicenseKey(window.location, process.env.NODE_ENV === "production");
  if (missing && license.failed) return <SlideNotice heading={HEADING} words="The page could not load all it needs to draw this. Reload it to try again." />;
  if (missing || refused) {
    return (
      <SlideNotice
        heading={HEADING}
        words={license.key
          ? "tldraw did not accept this Ziffr's license key for the slide editor. It may have ended, or not list this address."
          : "This Ziffr has no license key for tldraw, the slide editor that draws it."}
        admin={license.admin}
        settings={license.settings}
        missing={!license.key}
      />
    );
  }
  return (
    <div ref={watch} className="contents">
      <Tldraw {...props} licenseKey={license.key ?? undefined} />
    </div>
  );
}

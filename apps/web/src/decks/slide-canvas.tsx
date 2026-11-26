"use client";
// The one place a tldraw canvas is drawn (GLOSSARY: Deck, Installation Settings). It asks for the license key in effect
// and hands it to tldraw. Where tldraw would hide the canvas (no key it accepts on a public https address), plain words
// say what is missing instead of an empty space. tldraw's own check decides; this only reads its outcome.
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Tldraw, type TldrawProps } from "tldraw";
import { needsLicenseKey } from "./slide-license-rules";

type License = { key: string | null; admin: boolean; failed?: boolean };

// Distributed over tldraw's union of props (a snapshot or a store), which a plain Omit would flatten.
type SlideCanvasProps = (TldrawProps extends infer P ? (P extends unknown ? Omit<P, "licenseKey"> : never) : never) & { onRefused?: () => void };

let asking: Promise<License> | null = null;

/** Asks once for all canvases that start together, and again next time, so a key just saved is used at once. */
function askForLicense(): Promise<License> {
  asking ??= fetch("/api/slide-license", { cache: "no-store" })
    .then((r) => (r.ok ? (r.json() as Promise<License>) : Promise.reject(new Error())))
    .catch(() => ({ key: null, admin: false, failed: true }))
    .finally(() => { asking = null; });
  return asking;
}

/** `<Tldraw>` with the Installation's license key; fills the space it is given. `onRefused` says that tldraw took its
 * canvas away again, so that what lies over it can make way. */
export function SlideCanvas({ onRefused, ...props }: SlideCanvasProps) {
  const [license, setLicense] = useState<License | null>(null);
  const [refused, setRefused] = useState(false);
  useEffect(() => {
    let on = true;
    void askForLicense().then((l) => { if (on) setLicense(l); });
    return () => { on = false; };
  }, []);
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
  if (missing && license.failed) return <Notice words="The page could not load all it needs to draw this. Reload it to try again." />;
  if (missing || refused) {
    return (
      <Notice
        words={license.key
          ? "tldraw did not accept this Ziffr's license key for the slide editor. It may have ended, or not list this address."
          : "This Ziffr has no license key for tldraw, the slide editor that draws it."}
        admin={license.admin}
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

/** What stands in the canvas's place. `admin` set (either way) adds who can change it. It stays clickable where the
 * canvas around it takes no pointer, and above a presentation's click areas. */
function Notice({ words, admin, missing }: { words: string; admin?: boolean; missing?: boolean }) {
  return (
    <div role="status" className="pointer-events-auto relative z-10 flex h-full w-full overflow-auto bg-card p-3 text-center text-sm text-card-foreground">
      <div className="m-auto max-w-[48ch] space-y-1">
        <p className="font-medium">Slides and free layouts cannot be shown here</p>
        <p>{words}</p>
        {admin === true && <p><Link href="/installation#slides" className="inline-flex min-h-11 items-center underline underline-offset-2">{missing ? "Add the license key" : "Check the license key"}</Link></p>}
        {admin === false && <p className="text-muted-foreground">The person who runs this Ziffr can {missing ? "add one" : "change it"}.</p>}
      </div>
    </div>
  );
}

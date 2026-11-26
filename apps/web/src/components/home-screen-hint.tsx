"use client";
// GLOSSARY: Installed app. A once-only hint on a phone, after signing in, that Ziffr can be added to the home screen
// (spec 0055). It is about this device, so this browser remembers it (localStorage), as it does the Setup Guide's phone
// note: no server write. It never joins another nudge of a first visit: when Ziffr was opened on the Setup Guide, with
// the Setup line, or on a screen for one quick task, the hint waits for a later opening. It names both iPhone and
// Android, because a screen never decides by the browser's name.
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PHONE_TOUCH } from "@/lib/use-media";

const SEEN_KEY = "ziffr.home-screen-hint-seen";
/** Where people arrive to look around; a screen opened to do one thing (an answer, a form) stays free of the hint. */
const ARRIVAL = /^\/(dashboards(\/\d+)?|metrics|schedule)?$/;

/** Whether to show the hint now; saying yes notes it as seen. Any browser or storage failure counts as no: never nag. */
function takeTurn(path: string): boolean {
  if (!ARRIVAL.test(path)) return false;
  try {
    if (!window.matchMedia(PHONE_TOUCH).matches) return false;
    // Already running as the installed app; iOS says so in its own property.
    if (window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone) return false;
    if (window.localStorage.getItem(SEEN_KEY) !== null) return false;
    window.localStorage.setItem(SEEN_KEY, "1");
    return true;
  } catch {
    return false;
  }
}

/** The hint above the page, until it is closed or the person goes elsewhere. `wait` while the Setup line is shown. */
export function HomeScreenHint({ wait }: { wait: boolean }) {
  const path = usePathname();
  // Decided once, from how Ziffr was opened: moving on, or hiding the Setup line, never brings it up.
  const decided = useRef(false);
  const [shownOn, setShownOn] = useState<string | null>(null);
  useEffect(() => {
    if (!decided.current) {
      decided.current = true;
      if (!wait && takeTurn(path)) setShownOn(path);
    } else if (shownOn !== null && shownOn !== path) {
      // Another page puts it away for good: it never follows the person around (#1120).
      setShownOn(null);
    }
  }, [path, wait, shownOn]);

  if (shownOn !== path) return null;
  return (
    <section aria-labelledby="home-screen-hint" className="stock mx-4 mt-3 rounded-[var(--radius-card)] p-4 text-sm">
      <h2 id="home-screen-hint" className="flex items-center gap-2 text-sm font-medium"><Smartphone aria-hidden className="size-4 shrink-0" /> Add Ziffr to your home screen</h2>
      <p className="mt-1.5 text-muted-foreground">It then opens from there like an app, in a window of its own.</p>
      <ul className="mt-2 space-y-1">
        <li><span className="font-medium">iPhone:</span> tap Share, then Add to Home Screen.</li>
        <li><span className="font-medium">Android:</span> open the browser menu (⋮), then Add to Home screen or Install app.</li>
      </ul>
      <Button variant="outline" className="mt-3 h-11 w-full" onClick={() => setShownOn(null)}>Got it</Button>
    </section>
  );
}

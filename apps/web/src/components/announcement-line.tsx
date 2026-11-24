"use client";
// GLOSSARY: Announcement. The Announcement line: one line above every page for each Announcement of this visit, with a
// Dismiss button. A dismissal is kept in this tab's sessionStorage under the visit's scope (announcement-state.ts), so it
// ends with the tab and with the next sign-in or demo visit; where storage is blocked the line simply stays. It is a
// labelled region (so it can be reached by landmark), the words carry the meaning (never colour alone), and the button
// is an ordinary, named button; one that cannot be dismissed has none. A warning says so in words, with an icon. At most three
// show at once, the rest behind a "more" button, so a phone's screen is not eaten. The text is always a text node, never
// markup. `extra` is a live part some Announcement ends with (the demo's countdown), by id.
import { useEffect, useState } from "react";
import { Info, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DISMISSED_KEY, capShown, dismissedIn, stillShown, withDismissed, type Announcement } from "@/lib/announcement-state";

/** One Announcement as the line shows it, without its Dismiss button: the level (an icon, and "Warning:" in words), the text,
 * what it ends with, and its link (an https one opens in a new tab). The Installation settings preview draws the same
 * piece, so what an admin sees there is what the line says. */
export function AnnouncementWords({ a, extra }: { a: Announcement; extra?: React.ReactNode }) {
  return (
    <>
      {a.level === "warning"
        ? <TriangleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
        : <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />}
      <p className="min-w-0 flex-1 text-muted-foreground">
        {a.level === "warning" && <strong className="font-semibold text-foreground">Warning: </strong>}
        {a.text}
        {extra}
        {a.link && <>{" "}<a href={a.link.href} {...(a.link.href.startsWith("https://") ? { target: "_blank", rel: "noopener noreferrer" } : {})} className="underline underline-offset-2 hover:text-foreground">{a.link.label}</a>.</>}
      </p>
    </>
  );
}

/** The line for each Announcement not dismissed in this visit. */
export function AnnouncementLine({ items, scope, extra = {} }: { items: Announcement[]; scope: string; extra?: Record<string, React.ReactNode> }) {
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [expanded, setExpanded] = useState(false);

  // After the first draw, which is the server's: whatever this tab already dismissed in this visit.
  useEffect(() => {
    try { setDismissed(dismissedIn(sessionStorage.getItem(DISMISSED_KEY), scope)); } catch { /* storage blocked: nothing is remembered */ }
  }, [scope]);

  const dismiss = (id: string) => {
    setDismissed((ids) => [...ids, id]);
    try { sessionStorage.setItem(DISMISSED_KEY, withDismissed(sessionStorage.getItem(DISMISSED_KEY), scope, id)); } catch { /* the line stays gone until the page is drawn again */ }
  };

  const { visible, hidden } = capShown(stillShown(items, dismissed), expanded);

  return (
    <>
      {visible.map((a) => (
        <section key={a.id} aria-label="Announcement" className="mx-auto flex w-full max-w-7xl items-start gap-2 px-4 pt-3 text-xs sm:px-6">
          <AnnouncementWords a={a} extra={extra[a.id]} />
          {a.dismissible !== false && (
            <Button variant="ghost" size="icon-xs" className="shrink-0" onClick={() => dismiss(a.id)}>
              <X aria-hidden="true" />
              <span className="sr-only">Dismiss this announcement</span>
            </Button>
          )}
        </section>
      ))}
      {hidden > 0 && (
        <div className="mx-auto w-full max-w-7xl px-4 pt-1 text-xs sm:px-6">
          <button type="button" onClick={() => setExpanded(true)} className="text-muted-foreground underline underline-offset-2 hover:text-foreground">+{hidden} more {hidden === 1 ? "announcement" : "announcements"}</button>
        </div>
      )}
    </>
  );
}

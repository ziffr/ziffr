"use client";
// GLOSSARY: Announcement. The Announcement line: one line above every page for each Announcement of this visit, with a
// Dismiss button. A dismissal is kept in this tab's sessionStorage under the visit's scope (announcement-state.ts), so it
// ends with the tab and with the next sign-in or demo visit; where storage is blocked the line simply stays. It is a
// labelled region (so it can be reached by landmark), the words carry the meaning (never colour alone), and the button
// is an ordinary, named button; one that cannot be dismissed has none. A warning says so in words, with an icon. At most three
// show at once, the rest behind a "more" button, so a phone's screen is not eaten. The text is always a text node, never
// markup. `extra` is a live part some Announcement ends with (the demo's countdown), by id.
import { useEffect, useState } from "react";
import { ChevronDown, Info, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DISMISSED_KEY, capShown, dismissedIn, stillShown, withDismissed, type Announcement } from "@/lib/announcement-state";

/** One Announcement as the line shows it, without its Dismiss button: the level (an icon, and "Warning:" in words), the text,
 * what it ends with, and its link (an https one opens in a new tab). The Installation settings preview draws the same
 * piece, so what an admin sees there is what the line says. */
export function AnnouncementWords({ a, extra, clamped = false }: { a: Announcement; extra?: React.ReactNode; /** On a phone, cut to one line (the line sets it until the person opens the whole text). */ clamped?: boolean }) {
  return (
    <>
      {a.level === "warning"
        ? <TriangleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
        : <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />}
      <p className={`min-w-0 flex-1 text-muted-foreground${clamped ? " max-md:line-clamp-1" : ""}`}>
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
  // On a phone each Announcement is one line until its chevron is tapped (the text is never cut for a screen reader).
  const [opened, setOpened] = useState<string[]>([]);

  // After the first draw, which is the server's: whatever this tab already dismissed in this visit.
  useEffect(() => {
    try { setDismissed(dismissedIn(sessionStorage.getItem(DISMISSED_KEY), scope)); } catch { /* storage blocked: nothing is remembered */ }
  }, [scope]);

  const dismiss = (id: string) => {
    setDismissed((ids) => [...ids, id]);
    try { sessionStorage.setItem(DISMISSED_KEY, withDismissed(sessionStorage.getItem(DISMISSED_KEY), scope, id)); } catch { /* the line stays gone until the page is drawn again */ }
  };

  const live = stillShown(items, dismissed);
  const { visible, hidden } = capShown(live, expanded);
  // A phone shows one Announcement (the first, by the ranking) until "+N more"; the rest are only hidden by CSS, so the page draws the same on the server.
  const phoneHidden = expanded ? 0 : Math.max(0, live.length - 1);

  return (
    <>
      {visible.map((a, i) => {
        const open = opened.includes(a.id);
        return (
          <section key={a.id} aria-label="Announcement" className={`mx-auto w-full max-w-7xl items-start gap-2 px-4 pt-3 text-xs sm:px-6 max-md:min-h-11 max-md:items-center max-md:pt-0 ${i > 0 && !expanded ? "max-md:hidden" : ""} flex`}>
            <AnnouncementWords a={a} extra={extra[a.id]} clamped={!open} />
            <Button variant="ghost" size="icon-xs" className="shrink-0 md:hidden max-md:size-11" aria-expanded={open} onClick={() => setOpened((ids) => (open ? ids.filter((x) => x !== a.id) : [...ids, a.id]))}>
              <ChevronDown aria-hidden="true" className={open ? "rotate-180" : ""} />
              <span className="sr-only">{open ? "Show less of this announcement" : "Show all of this announcement"}</span>
            </Button>
            {a.dismissible !== false && (
              <Button variant="ghost" size="icon-xs" className="shrink-0 max-md:size-11" onClick={() => dismiss(a.id)}>
                <X aria-hidden="true" />
                <span className="sr-only">Dismiss this announcement</span>
              </Button>
            )}
          </section>
        );
      })}
      {hidden > 0 && (
        <div className="mx-auto w-full max-w-7xl px-4 pt-1 text-xs sm:px-6 max-md:hidden">
          <button type="button" onClick={() => setExpanded(true)} className="text-muted-foreground underline underline-offset-2 hover:text-foreground">+{hidden} more {hidden === 1 ? "announcement" : "announcements"}</button>
        </div>
      )}
      {phoneHidden > 0 && (
        <div className="mx-auto w-full max-w-7xl px-4 text-xs sm:px-6 md:hidden">
          <button type="button" onClick={() => setExpanded(true)} className="flex min-h-11 items-center text-muted-foreground underline underline-offset-2">+{phoneHidden} more {phoneHidden === 1 ? "announcement" : "announcements"}</button>
        </div>
      )}
    </>
  );
}

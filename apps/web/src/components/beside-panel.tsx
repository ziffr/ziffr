"use client";
// GLOSSARY: Slide-over, Pool. The panel that stands beside a canvas on a wide screen (a dashboard's Add widget panel, the
// Analysis Canvas's panel): it covers nothing, so things are dragged out of it onto the page. Narrower screens use the
// Slide-over instead (SlideOverWindow), which the caller chooses. It holds no data of its own.
import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = { id: string; title: string; /** One line under the title. */ hint: string; onClose: () => void; children: React.ReactNode };

/** Takes the focus when it opens and when its title changes; Escape closes it. */
export function BesidePanel({ id, title, hint, onClose, children }: Props) {
  const aside = useRef<HTMLElement>(null);
  useEffect(() => { aside.current?.focus({ preventScroll: true }); }, [title]);
  return (
    <aside
      ref={aside}
      id={id}
      tabIndex={-1}
      aria-label={title}
      // A menu opened from inside is drawn elsewhere on the page: its Escape closes the menu, not the panel.
      onKeyDown={(e) => { if (e.key === "Escape" && !e.defaultPrevented && e.currentTarget.contains(e.target as Node)) onClose(); }}
      className="sticky top-4 flex max-h-[calc(100dvh-2rem)] min-w-0 flex-col self-start rounded-[var(--radius-card)] border border-border bg-[var(--color-paper-2)] outline-none"
    >
      <div className="border-b p-3">
        <div className="flex items-center gap-2">
          <h2 className="flex-1 text-sm font-semibold tracking-normal">{title}</h2>
          <Button variant="ghost" size="icon-sm" aria-label={`Close ${title}`} onClick={onClose}><X aria-hidden /></Button>
        </div>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">{children}</div>
    </aside>
  );
}

"use client";
// GLOSSARY: Widget, Present. Wraps a Widget's card so a tap or click on its body, or Enter on it, opens it large (ticket #826).
// Menus, links, controls and data points keep their own click (see lib/open-large.ts). Not used in Edit mode.
import type { ReactNode } from "react";
import { opensLarge } from "@/lib/open-large";
import { cn } from "@/lib/utils";

/** The card's body opens `onOpen`; `title` names it for assistive technology. */
export function OpenLarge({ title, onOpen, children, className, style }: { title: string; onOpen: () => void; children: ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div
      role="group"
      tabIndex={0}
      aria-label={`Open ${title || "widget"} large`}
      className={cn("cursor-pointer rounded-[var(--radius-card)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent-2)]", className)}
      style={style}
      // A click is only sent when the finger or pointer stayed put, so scrolling on touch opens nothing; a text selection is not a tap either.
      onClick={(e) => {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        if (!opensLarge(e.target as Element, e.currentTarget)) return;
        if (window.getSelection()?.toString()) return;
        onOpen();
      }}
      onKeyDown={(e) => { if (e.key === "Enter" && e.target === e.currentTarget) { e.preventDefault(); onOpen(); } }}
    >
      {children}
    </div>
  );
}

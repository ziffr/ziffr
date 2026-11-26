"use client";
// What the deck editor says over a deck made from a Snapshot before decks kept numbers (spec 0061; GLOSSARY: Deck,
// Snapshot): its numbers are live, and how to get a deck whose numbers stay.
import { useValue, type Editor } from "tldraw";
import { orderedSlides } from "../layouts";
import { liveUpTo } from "./slide-lines";

/** Shown while a slide draws live numbers up to a Snapshot period's last day; nothing otherwise. */
export function LiveNumbersNote({ editor }: { editor: Editor }) {
  const old = useValue("live snapshot slides", () => orderedSlides(editor).some((s) => liveUpTo(editor, s.id) !== null), [editor]);
  if (!old) return null;
  return (
    <p role="note" className="mb-4 rounded-[var(--radius-card)] border border-[var(--color-rule-2)] bg-[var(--muted)] px-4 py-3 text-sm">
      <span className="font-medium">The numbers in this deck are live.</span> It was made from a Snapshot before decks kept numbers, so a value corrected or recorded since shows on its slides. For numbers that stay, open the Snapshot and choose <span className="font-medium">Add to a deck…</span> or <span className="font-medium">Make a deck…</span>
    </p>
  );
}

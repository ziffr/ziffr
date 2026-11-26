"use client";
// What stands in a shape's place on a slide while it has no numbers (spec 0061; GLOSSARY: Snapshot Part, Slide): the
// words saying why, or a quiet placeholder while they are on their way.

/** The words in place of a kept shape's numbers; without words, a placeholder while they load. */
export function ShapeNotice({ words }: { words: string | null }) {
  if (words === null) return <div aria-busy="true" aria-label="Loading values" className="h-full w-full animate-pulse rounded-[var(--radius-input)] bg-muted/40" />;
  return <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-[var(--radius-card)] border border-dashed border-[var(--color-rule-2)] p-4 text-center text-sm text-muted-foreground">{words}</div>;
}

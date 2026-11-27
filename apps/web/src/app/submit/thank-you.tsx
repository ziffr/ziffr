"use client";
// The finished screen of a form link's form (GLOSSARY: Token, Combined Prompt, Value Note): once what was sent is
// recorded, the form gives way to a thank-you with what the core answered, so it never looks as if nothing happened.
// It shows only what the page already has: the core's own words and the note as it was typed here.
import { useEffect, useId, useRef } from "react";
import { Button } from "@/components/ui/button";

/** The words of the note that was sent, only where the core's answer says it saved them; else null. The core cuts a
 * longer note, so only what it keeps is shown. */
export function savedNote(detail: string, words: string | undefined): string | null {
  const kept = [...(words ?? "").trim()].slice(0, 1000).join("");
  return kept && /Your note (was saved|goes with it)/.test(detail) ? kept : null;
}

/** The note under what was recorded. */
export function NoteSaid({ words }: { words: string }) {
  return <p className="mt-1.5 whitespace-pre-line break-words text-muted-foreground">Note: {words}</p>;
}

/** "Thank you", what was recorded (`children`), what comes next, the button back to the form and that the tab may be
 * closed. Focus moves to the heading, which is described by what was recorded, so both are read out. */
export function ThankYou({ children, next, changeLabel = "Change it", onChange }: { children: React.ReactNode; next?: React.ReactNode; changeLabel?: string; onChange: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null);
  const said = useId();
  useEffect(() => { heading.current?.focus(); }, []);
  return (
    <div>
      <h1 ref={heading} tabIndex={-1} aria-describedby={said} className="text-xl font-semibold outline-none">Thank you</h1>
      <div id={said} className="mt-3 flex flex-col gap-3 text-sm">{children}</div>
      {next}
      <Button type="button" variant="outline" size="lg" className="mt-4 w-full max-sm:h-12 max-sm:text-base" onClick={onChange}>{changeLabel}</Button>
      <p className="mt-3 text-center text-sm text-muted-foreground">You can close this tab.</p>
    </div>
  );
}

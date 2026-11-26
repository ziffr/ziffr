"use client";
// A short welcome note for someone opening the Setup Guide for the first time on a phone (spec 0052; GLOSSARY: Setup Guide):
// Ziffr was made desktop first, and the Dashboards are the screens tuned for phones. Shown once per device: the choice is
// kept in this browser (localStorage), so no server write and no migration. The decision is made on the client, so the
// server renders the same page for every device: until it is made, a phone-sized touch screen keeps the page's space but
// does not show it (no flash of the setup, no layout jump); desktop and tablet widths never wait.
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { PHONE_TOUCH } from "@/lib/use-media";
import { PHONE_ACTIONS, PHONE_BUTTON } from "./phone";

const SEEN_KEY = "ziffr.phone-note-seen";

/** Whether the note is shown, in this browser. Any storage failure counts as already seen: never nag. */
function shouldShow(): boolean {
  try {
    return window.matchMedia(PHONE_TOUCH).matches && window.localStorage.getItem(SEEN_KEY) === null;
  } catch {
    return false;
  }
}

/** Shows the note instead of its children on a first visit from a phone; `first` is false for anyone past step 1. */
export function PhoneNoteGate({ first, children }: { first: boolean; children: React.ReactNode }) {
  const [phase, setPhase] = useState<"pending" | "note" | "done">(first ? "pending" : "done");
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (phase === "pending") setPhase(shouldShow() ? "note" : "done");
  }, [phase]);
  useEffect(() => {
    if (phase === "note") heading.current?.focus();
  }, [phase]);

  function leave() {
    try {
      window.localStorage.setItem(SEEN_KEY, "1");
    } catch {
      // Private mode: the note may come back on a reload; that is better than an error.
    }
    setPhase("done");
    window.scrollTo(0, 0);
  }

  if (phase === "note") {
    return (
      <section aria-labelledby="phone-note-heading" className="mx-auto max-w-md space-y-4 py-4">
        <h1 id="phone-note-heading" ref={heading} tabIndex={-1} className="text-xl font-semibold outline-none">Welcome to Ziffr</h1>
        <p className="text-base">We are very happy to have you here.</p>
        <p className="text-base">We have tried to make Ziffr as friendly as we could in a phone browser. To be honest, Ziffr was written with the desktop in mind, where most work happens, so some screens are roomier there. The Dashboards are the screens we tuned for phones.</p>
        <div className={PHONE_ACTIONS}>
          <Button className={PHONE_BUTTON} onClick={leave}>Continue to set up</Button>
          <Button variant="ghost" className={PHONE_BUTTON} onClick={leave}>Skip</Button>
        </div>
      </section>
    );
  }
  return (
    <div className={phase === "pending" ? "[@media(max-width:640px)_and_(pointer:coarse)]:invisible" : undefined}>
      {children}
      {phase === "pending" && <noscript><style>{`.invisible{visibility:visible!important}`}</style></noscript>}
    </div>
  );
}

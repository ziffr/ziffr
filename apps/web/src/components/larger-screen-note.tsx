"use client";
// The desktop-only message (spec 0055; GLOSSARY: Screen Link): the short plain note a phone shows above a screen that is
// made for building, such as the deck editor. It says that it is easier on a larger screen and why, and offers a way on:
// the person's own Screen Link by email and, where there is one, a view that only reads. It never blocks the screen
// below it, and from 640 px wide it is not shown.
import { useState, useTransition } from "react";
import Link from "next/link";
import { Eye, MonitorSmartphone, Send } from "lucide-react";
import { desktopScreen } from "@ziffr/core/desktop-screens";
import { sendScreenLink } from "@/app/connector-actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { shown, unwrap } from "@/lib/action-error";

/** Where "Look at it" leads: another address, or something the screen does in place. */
export type Look = { href: string } | { onLook: () => void };

const BUTTON = "h-11 flex-1";

/** The note for the screen at `path`. `send` offers "Send me the link" (not in the demo or to a Guest: the core refuses
 * those anyway). The browser names only the path; who it goes to is decided on the server. */
export function LargerScreenNote({ path, send, look }: { path: string; send: boolean; look?: Look }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ words: string; gone: boolean } | null>(null);
  const screen = desktopScreen(path);
  if (!screen) return null;
  const press = () => start(async () => {
    try {
      const r = unwrap(await sendScreenLink(path));
      setResult({ words: r.words, gone: r.state === "sent" || r.state === "queued" });
    } catch (err) {
      setResult({ words: shown(err), gone: false });
    }
  });
  const lookClass = buttonVariants({ variant: send ? "outline" : "default", className: BUTTON });
  return (
    <div role="note" className="stock mb-5 rounded-[var(--radius-card)] p-4 text-sm sm:hidden">
      <p className="flex items-center gap-2 font-medium"><MonitorSmartphone aria-hidden className="size-4 shrink-0" /> This is easier on a larger screen.</p>
      <p className="mt-1.5 text-muted-foreground">{screen.why}</p>
      {(send || look) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {send && <Button className={BUTTON} disabled={pending || result?.gone} onClick={press}><Send aria-hidden /> Send me the link</Button>}
          {look && ("href" in look
            ? <Link href={look.href} className={lookClass}><Eye aria-hidden /> Look at it</Link>
            : <button type="button" className={lookClass} onClick={look.onLook}><Eye aria-hidden /> Look at it</button>)}
        </div>
      )}
      <p role="status" className="mt-2 empty:mt-0">{result?.words}</p>
    </div>
  );
}

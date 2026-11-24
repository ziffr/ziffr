"use client";
// The Heads-ups hint under the title of Analyze (GLOSSARY: Heads-up, Slide-over; the owner's words of 2026-11-24): one slim line that
// says how many Heads-ups there are for the person, and a button that opens the list in the side panel (`?panel=headsups` opens it from
// a link). The list itself is built on the server from what the person may see and handed in as `children`; this component draws a line
// and a panel around it and holds no data of its own.
import { useEffect, useRef, type ReactNode } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { useSlideOver } from "@/components/slide-over-host";
import { useOpenPanel, writePanel } from "@/lib/panel-param";

/** What the line says: how many Heads-ups there are, or why there is no count. */
export type HintState = { kind: "count"; count: number } | { kind: "off" } | { kind: "unread" };

/** The words of the line before the button, and the button's words (none when there is nothing to look at). */
export function hintWords(s: HintState): { text: string; look: boolean } {
  if (s.kind === "unread") return { text: "Heads-ups could not be read just now.", look: false };
  if (s.kind === "off") return { text: "You turned Heads-ups off for yourself.", look: false };
  if (s.count === 0) return { text: "No Heads-ups right now.", look: false };
  return { text: `${s.count} Heads-up${s.count === 1 ? "" : "s"} for you.`, look: true };
}

/** The hint line. `children` is the list of Heads-ups, shown in the side panel. */
export function HeadsUpsHint({ state, children }: { state: HintState; children?: ReactNode }) {
  const panel = useSlideOver();
  const asked = useOpenPanel() === "headsups";
  const handled = useRef(false);
  const words = hintWords(state);
  const show = () => panel.open({ title: "Heads-ups", description: "What Ziffr noticed in the Metrics you can see.", content: children });
  // `?panel=headsups` opens the list once and leaves the address clean (a person with nothing to look at sees the line only).
  useEffect(() => {
    if (!asked) { handled.current = false; return; }
    if (handled.current) return;
    handled.current = true;
    if (words.look) panel.open({ title: "Heads-ups", description: "What Ziffr noticed in the Metrics you can see.", content: children });
    writePanel(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- opens once per request
  }, [asked]);
  return (
    <p className="-mt-4 mb-5 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground" role="status">
      <Bell aria-hidden className="size-3.5" />
      <span>{words.text}</span>
      {words.look && <button type="button" onClick={show} aria-haspopup="dialog" className="font-medium text-foreground underline underline-offset-4 hover:no-underline">Look</button>}
      {state.kind === "off" && <span>Turn them on under <Link href="/settings/deliveries" className="underline underline-offset-4">Your Deliveries</Link>.</span>}
    </p>
  );
}

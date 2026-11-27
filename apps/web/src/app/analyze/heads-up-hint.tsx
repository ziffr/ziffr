"use client";
// The Heads-ups block under the title of Analyze (GLOSSARY: Heads-up, Slide-over; the owner's words of 2026-11-27): a bordered block
// with the heading "Heads-ups", how many there are for the person and a button that opens the list in the side panel (`?panel=headsups`
// opens it from a link). With none there is no block. The list itself is built on the server from what the person may see and handed in
// as `children`; this component draws a block and a panel around it and holds no data of its own.
import { useEffect, useRef, type ReactNode } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { useSlideOver } from "@/components/slide-over-host";
import { useOpenPanel, writePanel } from "@/lib/panel-param";

/** What the block says: how many Heads-ups there are, or why there is no count. */
export type HintState = { kind: "count"; count: number } | { kind: "off" } | { kind: "unread" };

/** The block. `children` is the list of Heads-ups, shown in the side panel. */
export function HeadsUpsHint({ state, children }: { state: HintState; children?: ReactNode }) {
  const panel = useSlideOver();
  const asked = useOpenPanel() === "headsups";
  const handled = useRef(false);
  const look = state.kind === "count" && state.count > 0;
  const show = () => panel.open({ title: "Heads-ups", description: "What Ziffr noticed in the Metrics you can see.", content: children });
  // `?panel=headsups` opens the list once and leaves the address clean (with nothing to look at, nothing opens).
  useEffect(() => {
    if (!asked) { handled.current = false; return; }
    if (handled.current) return;
    handled.current = true;
    if (look) show();
    writePanel(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- opens once per request
  }, [asked]);
  if (state.kind === "count" && !look) return null;
  return (
    <section aria-labelledby="heads-ups-heading" className="mb-5 flex min-h-14 flex-wrap items-center gap-x-4 gap-y-1 rounded-[var(--radius-card)] border border-[var(--color-rule-2)] px-4 py-1.5 text-sm">
      <h2 id="heads-ups-heading" className="flex items-center gap-2 text-sm font-semibold">
        <Bell aria-hidden className="size-3.5" /> Heads-ups{" "}
        {state.kind === "count" && <span className="fig font-normal text-muted-foreground">{state.count}</span>}
      </h2>
      {state.kind === "unread" && <p role="status" className="text-muted-foreground">Heads-ups could not be read just now.</p>}
      {state.kind === "off" && <p className="py-2 text-muted-foreground">You turned Heads-ups off for yourself. Turn them on under <Link href="/settings/deliveries" className="underline underline-offset-4">Your Deliveries</Link>.</p>}
      {look && <button type="button" onClick={show} aria-haspopup="dialog" className="ml-auto min-h-11 min-w-11 font-medium underline underline-offset-4 hover:no-underline sm:min-h-10">Look</button>}
    </section>
  );
}

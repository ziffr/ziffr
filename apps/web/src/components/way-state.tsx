// What works here (spec 0021): one way in or out of Ziffr as real, simulated or off, with why and its limit. The
// words come from the core's whatWorksHere, never from the page, so every page says the same as the queue does.
import type { WayState } from "@ziffr/core/what-works-here";
import { cn } from "@/lib/utils";

const STATE_LABEL: Record<WayState["state"], string> = { real: "Real", simulated: "Simulated", off: "Off" };

/** The state as a small badge: real in the success colour, simulated and off plain. */
export function WayBadge({ state }: { state: WayState["state"] }) {
  return (
    <span className={cn("inline-flex items-center rounded-[var(--radius-input)] border px-1.5 text-xs font-medium", state === "real" ? "border-[var(--color-success)] text-[var(--color-success)]" : "border-border text-muted-foreground")}>
      {STATE_LABEL[state]}
    </span>
  );
}

/** The badge with its reason and, when there is one, its limit. */
export function WayLine({ way, className }: { way: WayState; className?: string }) {
  return (
    <p className={cn("text-xs text-muted-foreground", className)}>
      <WayBadge state={way.state} /> {way.reason}{way.limit ? ` ${way.limit}` : ""}
    </p>
  );
}

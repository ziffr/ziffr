// The login page of a Ziffr that offers trials (spec 0021): the shared demo and a Trial Workspace side by side, each
// with what it can and cannot do, so a visitor chooses knowing what they get. The words about each way come from the
// core's whatThisZiffrOffers, which holds no workspace data.
import type { WayState } from "@ziffr/core/what-works-here";
import { WayBadge } from "@/components/way-state";

/** What a trial gives and asks for, next to the sign-in form. */
export function TrialColumn({ days, ways, open, children }: { days: number; ways: WayState[]; open: boolean; children: React.ReactNode }) {
  return (
    <section aria-labelledby="trial-h" className="stock rounded-[var(--radius-card)] p-5">
      <h2 id="trial-h" className="text-[length:var(--text-lg)] font-medium">Try it for real</h2>
      <p className="mt-1 text-sm text-muted-foreground">A workspace of your own, with made-up numbers to start. Requests for values reach you for real.</p>
      <ul className="mt-3 space-y-1.5 text-sm">
        {ways.map((w) => (
          <li key={w.way} className="flex flex-wrap items-baseline gap-x-2">
            <WayBadge state={w.state} /> <span className="font-medium">{w.label}</span> <span className="text-xs text-muted-foreground">{w.reason}{w.limit ? ` ${w.limit}` : ""}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted-foreground">
        You need your email address. Nothing is sent to anyone else, and nobody can be invited. After {days} days the trial ends and is deleted with everything in it.
      </p>
      {/* The form stays when trials are full: whoever has one already still signs in to it. */}
      {!open && <p role="status" className="mt-4 rounded-[var(--radius-input)] border border-border p-3 text-sm">All new trials are taken right now. Look around the demo, or come back in a few days. If you have a trial already, sign in to it here.</p>}
      {children}
    </section>
  );
}

/** What the shared demo is, and what it is not. */
export function DemoColumn() {
  return (
    <section aria-labelledby="demo-h" className="rounded-[var(--radius-card)] border border-border p-5">
      <h2 id="demo-h" className="text-[length:var(--text-lg)] font-medium">Look around</h2>
      <p className="mt-1 text-sm text-muted-foreground">A made-up online shop: its Metrics, dashboards, Workflows and decks. No account needed.</p>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        <li>Everything is simulated: messages appear in the Outbox, and you answer them yourself.</li>
        <li>No Slack, Telegram, API, assistants or Feeds.</li>
        <li>Shared with every visitor, and started fresh often.</li>
      </ul>
      {/* A plain link, so a full page load: /demo sets the cookie in the middleware, and the root layout's header must be drawn again for it (#14). */}
      <a href="/demo" className="mt-4 inline-flex h-9 items-center rounded-[var(--radius-input)] border border-input px-3 text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring">Try the demo</a>
    </section>
  );
}

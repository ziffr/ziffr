// The login page of a Ziffr that offers trials (spec 0021): a trial of one's own and the shared demo, each with what it
// can and cannot do, so a visitor chooses knowing what they get. The words about each way come from the core's
// whatThisZiffrOffers, which holds no workspace data.
import type { WayState } from "@ziffr/core/what-works-here";
import { WayBadge } from "@/components/way-state";

/** What a trial gives and asks for, above the sign-in form. */
export function TrialIntro({ days, ways, open }: { days: number; ways: WayState[]; open: boolean }) {
  return (
    <section aria-labelledby="trial-h" className="mb-6">
      <h2 id="trial-h" className="text-[length:var(--text-lg)] font-medium">Try it for real</h2>
      <p className="mt-1 text-sm text-muted-foreground">A workspace of your own, starting with one Metric to try asking with. Requests for values reach you for real.</p>
      <details className="group mt-3 text-sm">
        <summary className="cursor-pointer text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring">What works in a trial</summary>
        <ul className="mt-2 space-y-1.5">
          {ways.map((w) => (
            <li key={w.way} className="flex flex-wrap items-baseline gap-x-2">
              <WayBadge state={w.state} /> <span className="font-medium">{w.label}</span> <span className="text-xs text-muted-foreground">{w.reason}{w.limit ? ` ${w.limit}` : ""}</span>
            </li>
          ))}
        </ul>
      </details>
      <p className="mt-3 text-xs text-muted-foreground">
        You need your email address. Nothing is sent to anyone else, and nobody can be invited. After {days} days the trial ends and is deleted with everything in it.
      </p>
      {/* The form stays when trials are full: whoever has one already still signs in to it. */}
      {!open && <p role="status" className="mt-4 rounded-[var(--radius-input)] border border-border p-3 text-sm">All new trials are taken right now. Look around the demo, or come back in a few days. If you have a trial already, sign in to it here.</p>}
    </section>
  );
}

/** The way into the shared demo, below the form: what the demo is, and what it is not. */
export function DemoChoice({ detailed }: { detailed: boolean }) {
  return (
    <section aria-labelledby="demo-h" className="mt-8 border-t border-border pt-6">
      <h2 id="demo-h" className="text-sm font-medium">No account? Look around first</h2>
      <p className="mt-1 text-sm text-muted-foreground">A made-up online shop: its Metrics, dashboards, Workflows and decks. {detailed ? "No account needed." : "Nothing you do there reaches real data."}</p>
      {detailed && (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Everything is simulated: messages appear in the Outbox, and you answer them yourself.</li>
          <li>No Slack, Telegram, API, assistants or Feeds.</li>
          <li>Shared with every visitor, and started fresh often.</li>
        </ul>
      )}
      {/* A plain link, so a full page load: /demo sets the cookie in the middleware, and the root layout's header must be drawn again for it (#14). */}
      <a href="/demo" className="mt-4 inline-flex h-9 items-center rounded-[var(--radius-input)] border border-input px-3 text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring">Try the demo</a>
    </section>
  );
}

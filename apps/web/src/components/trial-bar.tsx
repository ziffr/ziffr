// The bar of a Trial Workspace (spec 0021, ticket 9): on every page, how long the trial has left, with Try it, the
// download of its values and the way to end it now; and the screen that replaces the app once it has ended.
import Link from "next/link";
import { EndTrialButton } from "./end-trial-button";

/** The line under the top bar while the trial runs. */
export function TrialBar({ daysLeft, endsAt }: { daysLeft: number; endsAt: string }) {
  return (
    <p className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-1 px-4 pt-3 text-xs text-muted-foreground sm:px-6">
      <span>Your trial ends {daysLeft <= 1 ? "within a day" : `in ${daysLeft} days`}, on {endsAt.slice(0, 10)}.</span>
      <Link href="/try" className="underline underline-offset-2 hover:text-foreground">Try it</Link>
      <a href="/try/download" className="underline underline-offset-2 hover:text-foreground">Download your values</a>
    </p>
  );
}

/** What a person sees instead of the app once their trial has ended. */
export function TrialEnded({ deletedAt }: { deletedAt: string }) {
  return (
    <div className="mx-auto mt-16 max-w-md text-sm">
      <h1 className="text-[length:var(--text-2xl)] leading-tight">This trial has ended</h1>
      <p className="mt-2 text-muted-foreground">
        Nothing is sent or taken any more, and its keys have stopped. On {deletedAt.slice(0, 10)} it is deleted with everything in it, and your account with it.
      </p>
      <p className="mt-4">To keep your numbers, download them now. To use Ziffr for real, run it yourself: <a href="https://github.com/ziffr/ziffr" className="underline">github.com/ziffr/ziffr</a>.</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <a href="/try/download" className="inline-flex h-9 items-center rounded-[var(--radius-input)] border border-input px-3 font-medium hover:bg-muted">Download your values</a>
        <EndTrialButton label="Delete it now" />
      </div>
    </div>
  );
}

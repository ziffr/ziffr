// The line Owners and Admins see on every page while their Workspace is over its Workspace Limit (spec 0029, ticket
// #266): how it stands and until when new Metrics may be made, with a way to Size and usage.
import Link from "next/link";

/** The banner, with the core's words. */
export function OverLimitBar({ words }: { words: string }) {
  return (
    <p role="status" className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-1 px-4 pt-3 text-xs text-[var(--color-ink-2)] sm:px-6">
      <span>{words}</span>
      <Link href="/settings/workspace#size" className="underline underline-offset-2 hover:text-foreground">Size and usage</Link>
    </p>
  );
}

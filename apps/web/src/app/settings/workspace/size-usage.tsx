// Size and usage in Workspace settings (spec 0029, ticket #266; GLOSSARY: Size, Workspace Limit): for Owners and
// Admins, the Size's name, how many Metrics the Workspace holds of how many, the 14 days over the limit if they run,
// and a coming change. Without a limit, only the count. No price and no payment detail: Ziffr holds none. Owners get
// Change Size and Billing and invoices where Ziffr Cloud is set up.
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { dayWords, type Usage } from "@ziffr/core/workspace-usage";

const n = (x: number) => x.toLocaleString("en-US");

/** The section, by its anchor #size, which the banner and the emails link to. */
export function SizeAndUsage({ usage: u, cloud = false }: { usage: Usage; cloud?: boolean }) {
  return (
    <section id="size" aria-labelledby="size-heading" className="scroll-mt-20 space-y-2">
      <h2 id="size-heading" className="text-lg font-medium">Size and usage</h2>
      {u.limit === null ? (
        <p className="text-sm"><span className="fig">{n(u.metrics)}</span> Metric{u.metrics === 1 ? "" : "s"}, without a limit. Archived Metrics are not counted.</p>
      ) : (
        <>
          {u.label && <p className="text-sm">Size: <span className="font-medium">{u.label}</span></p>}
          <p className="text-sm"><span className="fig font-medium">{n(u.metrics)} of {n(u.limit)}</span> Metrics. Archived Metrics are not counted.</p>
          {u.overSince && u.metrics > u.limit && (
            <p className="text-sm text-[var(--color-ink-2)]">
              {u.waiting
                ? `Over the limit since ${dayWords(u.overSince)}: new Metrics wait until it holds fewer than ${n(u.limit)}.`
                : `Over the limit since ${dayWords(u.overSince)}: new Metrics can be made until ${dayWords(u.graceEnds!)}, up to ${n(u.room!)}.`}
              {" "}Everything else keeps working, and values keep arriving. <Link href="/metrics" className="underline underline-offset-2">Archive Metrics</Link> you no longer track to make room.
            </p>
          )}
          {/* Ticket #457: one 14-day grace per 90 days; say when the next is possible. */}
          {u.nextGraceOn && !(u.overSince && !u.waiting) && (
            <p className="text-sm text-[var(--color-ink-2)]">
              The 14 days over the limit were used recently{u.waiting ? ", so new Metrics wait now" : ""}. The next ones are possible from {dayWords(u.nextGraceOn)}.
            </p>
          )}
          {u.next && <p className="text-sm">Changes to {u.next.label} on {dayWords(u.next.on)}.</p>}
        </>
      )}
      {/* The values of the Metrics this Owner or Admin sees, as CSV (spec 0029): what an unused Workspace's warning offers. */}
      <p className="text-sm"><a href="/settings/workspace/download" className="underline underline-offset-2">Download the values</a> of every Metric you see, as a CSV file.</p>
      {/* Owners only, where Ziffr Cloud is set up: a form post hands them over with a token (spec 0029). */}
      {cloud && (
        <div className="flex flex-wrap gap-2 pt-1">
          <form method="post" action="/settings/size/handover"><input type="hidden" name="to" value="size" /><button type="submit" className={buttonVariants({ size: "sm" })}>Change Size</button></form>
          <form method="post" action="/settings/size/handover"><input type="hidden" name="to" value="billing" /><button type="submit" className={buttonVariants({ variant: "outline", size: "sm" })}>Billing and invoices</button></form>
        </div>
      )}
    </section>
  );
}

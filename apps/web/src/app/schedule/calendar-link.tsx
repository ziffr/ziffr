"use client";
// The Calendar Link section of My schedule (spec 0027, ticket #243; GLOSSARY: Calendar Link): making one, the address
// shown once with how to subscribe, "no names", making a new one and turning it off.
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { shown, unwrap } from "@/lib/action-error";
import { Button } from "@/components/ui/button";
import { makeCalendarLink, revokeCalendarLink, setCalendarNoNames } from "@/app/calendar-link-actions";
import type { CalendarLinkInfo } from "@ziffr/core/calendar-links";
import { formatDate } from "@ziffr/core/format";

/** How to subscribe in the three calendar apps most people use. */
const STEPS = [
  ["Apple Calendar", "File → New Calendar Subscription, paste the address, and choose how often it refreshes (every hour)."],
  ["Google Calendar", "Other calendars → + → From URL, paste the address, Add calendar. Google decides how often it fetches: it can take up to a day."],
  ["Outlook", "Add calendar → Subscribe from web, paste the address, Import."],
] as const;

function NoNames({ checked, disabled, onChange }: { checked: boolean; disabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-4 accent-[var(--color-ink)]" />
      <span><span className="font-medium">No names</span>: entries say only what and how many, such as “Ziffr: 2 values due”. Choose this if others can see your calendar.</span>
    </label>
  );
}

/** The person's Calendar Link, or the button to get one. In the demo there is none. */
export function CalendarLink({ link, demo }: { link: CalendarLinkInfo | null; demo: boolean }) {
  const [pending, start] = useTransition();
  const [address, setAddress] = useState<string | null>(null);
  const [noNames, setNoNames] = useState(link?.noNames ?? false);
  const run = (f: () => Promise<unknown>, ok?: string) => start(async () => { try { unwrap(await f()); if (ok) toast.success(ok); } catch (err) { toast.error("Not done", { description: shown(err) }); } });
  const make = () => run(async () => setAddress(unwrap(await makeCalendarLink({ noNames }))), link ? "New link made; the old one no longer works" : "Calendar link made");
  const choose = (v: boolean) => { setNoNames(v); if (link || address) run(() => setCalendarNoNames(v), v ? "Names are left out" : "Names are shown"); };
  const copy = () => address && navigator.clipboard?.writeText(address).then(() => toast.success("Address copied"), () => toast.error("Copying did not work: select the address instead."));
  return (
    <section aria-labelledby="calendar-heading" className="space-y-3 border-t border-border pt-6">
      <div>
        <h2 id="calendar-heading" className="font-medium">In your calendar</h2>
        <p className="max-w-[62ch] text-sm text-muted-foreground">A Calendar Link puts these dates in your calendar app as all-day entries, each linking here, from 30 days back to 90 days ahead. Entries without a date are left out. Anyone with the address sees what it shows, so keep it to yourself.</p>
      </div>
      {demo ? <p className="text-sm text-muted-foreground">The demo has no Calendar Links. Make one in your own Workspace.</p> : (
        <>
          {address && (
            <div className="space-y-3 rounded-[var(--radius-card)] border border-border p-4">
              <p className="text-sm font-medium">Copy the address now; it is not shown again.</p>
              <div className="flex flex-wrap gap-2">
                <input readOnly value={address} onFocus={(e) => e.target.select()} aria-label="Calendar address" className="h-9 min-w-0 flex-1 rounded-[var(--radius-input)] border border-input bg-card px-2 font-mono text-sm" />
                <Button type="button" variant="outline" onClick={copy}>Copy</Button>
              </div>
              <ul className="space-y-1 text-sm">
                {STEPS.map(([app, how]) => <li key={app}><span className="font-medium">{app}:</span> {how}</li>)}
              </ul>
              <p className="text-xs text-muted-foreground">Ziffr builds it anew for each fetch; your calendar app decides how often it fetches.</p>
            </div>
          )}
          {link && !address && (
            <p className="text-sm">You have a calendar link, made {formatDate(link.createdAt)}. {link.lastFetchedAt ? `A calendar last fetched it ${formatDate(link.lastFetchedAt)}.` : "No calendar has fetched it yet."}</p>
          )}
          <NoNames checked={noNames} disabled={pending} onChange={choose} />
          <div className="flex flex-wrap gap-2">
            {link || address ? (
              <>
                <Button type="button" variant="outline" disabled={pending} onClick={make}>Make a new link</Button>
                <Button type="button" variant="outline" disabled={pending} onClick={() => run(async () => { unwrap(await revokeCalendarLink()); setAddress(null); }, "Calendar link turned off")}>Turn off</Button>
              </>
            ) : <Button type="button" disabled={pending} onClick={make}>Get a calendar link</Button>}
          </div>
          {(link || address) && <p className="text-xs text-muted-foreground">Make a new link if the address reached someone it should not: the old one stops working at once.</p>}
        </>
      )}
    </section>
  );
}

"use client";
// Who has a Calendar Link in the Workspace (spec 0027, ticket #243; GLOSSARY: Calendar Link), for Owners and Admins:
// name, made and last fetched, never the address, and Revoke, which ends it at once.
import { useTransition } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { shown, unwrap } from "@/lib/action-error";
import { revokeCalendarLink } from "@/app/calendar-link-actions";
import type { CalendarLinkListed } from "@ziffr/core/calendar-links";
import { formatDate } from "@ziffr/core/format";

export function CalendarLinks({ links }: { links: CalendarLinkListed[] }) {
  const [pending, start] = useTransition();
  const revoke = (l: CalendarLinkListed) => start(async () => {
    try { unwrap(await revokeCalendarLink(l.personId)); toast.success(`${l.name}'s calendar link revoked`); } catch (err) { toast.error("Not done", { description: shown(err) }); }
  });
  return (
    <section aria-labelledby="calendar-links-heading" className="mt-8 space-y-3 border-t border-border pt-6">
      <div>
        <h2 id="calendar-links-heading" className="font-medium">Calendar Links</h2>
        <p className="text-sm text-muted-foreground">Who shows their schedule in a calendar app. Anyone with a link&apos;s address sees that person&apos;s schedule, so revoke one that may have reached someone else. Its person can make a new one on My schedule.</p>
      </div>
      {links.length === 0 ? <p className="text-sm text-muted-foreground">Nobody has one.</p> : (
        <ul className="divide-y divide-border rounded-[var(--radius-card)] border border-border text-sm">
          {links.map((l) => (
            <li key={l.personId} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2">
              <span className="font-medium">{l.name}</span>
              <span className="text-muted-foreground">made {formatDate(l.createdAt)}</span>
              <span className="text-muted-foreground">{l.lastFetchedAt ? `last fetched ${formatDate(l.lastFetchedAt)}` : "never fetched"}</span>
              <button type="button" aria-label={`Revoke ${l.name}'s calendar link`} disabled={pending} onClick={() => revoke(l)} className="ml-auto flex size-8 items-center justify-center rounded-[var(--radius-input)] text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"><Trash2 aria-hidden className="size-3.5" /></button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

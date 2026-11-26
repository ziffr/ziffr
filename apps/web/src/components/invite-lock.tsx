"use client";
// GLOSSARY: Invitation, Trial Workspace, Trial Limit, Submitter, Ask me now, Record a value. Said right above an invite
// form that is closed: why, what opens it, and the buttons that do it. The core decides (`inviteGate`) and the database
// refuses whatever is shown here. While the form waits for something that can happen elsewhere (a reply by email, a freed
// place), the gate is read again by itself, so the fields open without reloading the page.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Lock } from "lucide-react";
import { inviteGateNow } from "@/app/team-actions";
import { askNow } from "@/app/metrics/[slug]/ask-now";
import { RecordValue } from "@/app/metrics/[slug]/record-value";
import { Button, buttonVariants } from "@/components/ui/button";
import { isActionError } from "@/lib/action-error";
import type { InviteGate, InviteMetric } from "@ziffr/core/invite-gate";

/** How often a closed gate that can open by itself is read again, while the page is in view. */
const LOOK_EVERY_MS = 8000;

/** The gate as last read, and what it was closed for if it has opened since the form was first seen. */
export type SeenGate = { gate: InviteGate | null; was: Exclude<InviteGate["state"], "open"> | null };

/** What is known after one more read: an opening is remembered, so the form can say it opened. */
export function seeGate(seen: SeenGate, gate: InviteGate): SeenGate {
  if (gate.state !== "open") return { gate, was: null };
  return { gate, was: seen.gate && seen.gate.state !== "open" ? seen.gate.state : seen.was };
}

/** The invite gate for a form. `given` is what the server rendered, when it did; without it the gate is read once the
 * form is up, only if `wanted`. `closed` is true only once the gate is known to refuse: an unread one leaves the form
 * usable, and the core refuses with its own words. */
export function useInviteGate(given?: InviteGate, wanted = true): SeenGate & { closed: boolean; look: () => void } {
  const [seen, setSeen] = useState<SeenGate>({ gate: given ?? null, was: null });
  const look = useCallback(() => {
    inviteGateNow().then((r) => { if (r && !isActionError(r)) setSeen((s) => seeGate(s, r)); }).catch(() => {});
  }, []);
  useEffect(() => { if (given) setSeen((s) => seeGate(s, given)); }, [given]);
  const unread = wanted && !given;
  useEffect(() => { if (unread) look(); }, [unread, look]);
  const mayOpen = seen.gate?.state === "waiting" || seen.gate?.state === "full";
  useEffect(() => {
    if (!mayOpen) return;
    const inView = () => { if (document.visibilityState === "visible") look(); };
    const timer = setInterval(inView, LOOK_EVERY_MS);
    window.addEventListener("focus", inView);
    return () => { clearInterval(timer); window.removeEventListener("focus", inView); };
  }, [mayOpen, look]);
  return { ...seen, closed: seen.gate !== null && seen.gate.state !== "open", look };
}

const box = "space-y-2 rounded-[var(--radius-card)] border border-[var(--color-rule-2)] bg-[var(--color-paper-2)] p-3 text-sm text-foreground";
const tall = "max-sm:min-h-11";
/** Why a trial holds invitations back until a value came in (ADR 0015). */
const WHY = "An invitation is an email to an address nobody has confirmed yet. So that automated sign-ups cannot use a trial to send mail, a trial invites only after its Owner has sent in a value.";

/** The words above a closed invite form (give the fields `aria-describedby={id}`), or that it has just opened, or
 * nothing. `onMembers` leaves out the link to Members and Groups on that page itself. */
export function InviteLock({ gate, was, id, onMembers }: SeenGate & { id: string; onMembers?: boolean }) {
  if (!gate) return null;
  if (gate.state === "open") {
    if (!was) return null;
    return <p role="status" id={id} className={box}>{was === "full" ? "There is a free place again, so you can invite." : "Invitations are open now: a first value has arrived."}</p>;
  }
  return (
    <div role="note" id={id} className={box}>
      <p className="flex items-center gap-2 font-medium"><Lock aria-hidden className="size-4 shrink-0" />{TITLE[gate.state]}</p>
      {gate.state === "ended" && <p>This trial has ended, so nobody can be invited any more.</p>}
      {gate.state === "full" && (
        <>
          <p>A trial holds at most {gate.limit} {gate.limit === 1 ? "person" : "people"}, and open invitations count. To invite someone else, revoke an open invitation or remove a person. An invitation nobody accepts also frees its place when it runs out.</p>
          {!onMembers && <Link href="/team" className={buttonVariants({ variant: "outline", size: "sm", className: tall })}>See Members and open invitations</Link>}
        </>
      )}
      {gate.state === "waiting" && (
        <>
          <p>{WHY}</p>
          {!gate.you ? (
            <p>An Owner of this Workspace opens invitations by sending in a first value of their own, as a reply to a request or with Record a value. The fields open here by themselves after that.</p>
          ) : gate.metric ? (
            <SendOne metric={gate.metric} />
          ) : (
            <>
              <p><strong className="font-medium">To open them,</strong> send in one value yourself. You do not send values for any Metric yet: make one with yourself as its Submitter, then reply to its request or use Record a value.</p>
              <div className="flex flex-wrap gap-2">
                <Link href="/metrics/new" className={buttonVariants({ size: "sm", className: tall })}>Make a Metric</Link>
                <Link href="/setup?step=first_metric" className={buttonVariants({ variant: "outline", size: "sm", className: tall })}>Go to the First Metric step</Link>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

const TITLE = { ended: "Invitations are closed", full: "This trial has no free place", waiting: "Invitations are not open yet" } as const;

/** What the Owner does to open invitations, for the Metric they can send a value for. */
function SendOne({ metric }: { metric: InviteMetric }) {
  const [asking, setAsking] = useState(false);
  const ways = [metric.canAsk && "press Ask me now and reply to the request", metric.offer && (metric.canAsk ? "record the value here" : "record it here")].filter(Boolean).join(", or ");
  return (
    <>
      <p><strong className="font-medium">To open them,</strong> send in one value for <Link href={`/metrics/${metric.slug}`} className="underline underline-offset-2">{metric.name}</Link> yourself: {ways}. Values from a Feed or an Import do not count.</p>
      <div className="flex flex-wrap gap-2">
        {metric.canAsk && <Button type="button" className={tall} disabled={asking} onClick={() => { setAsking(true); void askNow(metric.id).finally(() => setAsking(false)); }}>Ask me now</Button>}
        {metric.offer && <div className="[&>button]:max-sm:min-h-11"><RecordValue offer={metric.offer} /></div>}
      </div>
      <p className="text-muted-foreground">The fields open here by themselves once your value is in.</p>
    </>
  );
}

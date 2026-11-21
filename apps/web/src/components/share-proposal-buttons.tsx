"use client";
// Confirm and Decline for a Share Proposal (GLOSSARY: Share Proposal). Confirming is the person's own click here, in Ziffr;
// the core checks again that they own the dashboard and may share it.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { shown, unwrap } from "@/lib/action-error";
import { confirmProposal, declineProposal } from "@/app/share-proposal-actions";

/** The two choices, then what happened. `showConfirm` is false in lists, where the person first looks at the preview; `closed` says why there is nothing to choose any more. */
export function ShareProposalButtons({ id, showConfirm = true, closed = null }: { id: number; showConfirm?: boolean; closed?: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ message: string; linkPath?: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = (f: () => Promise<unknown>) => start(async () => {
    setError(null);
    try { setResult(unwrap(await f()) as { message: string; linkPath?: string | null }); router.refresh(); } catch (e) { setError(shown(e)); }
  });
  // What happened stays on screen after the page refreshes to the decided state: the link of a View Link whose email failed is shown only here.
  if (result) {
    return (
      <div role="status" className="text-sm">
        <p>{result.message}</p>
        {result.linkPath && <p className="mt-1 break-all font-mono text-xs">{`${window.location.origin}${result.linkPath}`}</p>}
      </div>
    );
  }
  if (closed) return <p className="text-sm text-muted-foreground">{closed}</p>;
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {showConfirm && <Button disabled={pending} onClick={() => run(() => confirmProposal(id))}><Check aria-hidden /> Confirm</Button>}
        <Button variant="outline" disabled={pending} onClick={() => run(() => declineProposal(id))}><X aria-hidden /> Decline</Button>
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-[var(--color-danger,#b00020)]">{error}</p>}
    </div>
  );
}

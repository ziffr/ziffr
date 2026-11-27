"use client";
// The Practice Workspace on the Installation Settings page (spec 0063; GLOSSARY: Practice Workspace, Installation Admin):
// make it, open it, or start it over after a confirmation. The core checks who may and deletes only the person's own.
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/confirm-dialog";
import { switchWorkspace } from "@/app/auth-actions";
import { makePracticeWorkspace, startOverPracticeWorkspace } from "@/app/installation-actions";
import type { PracticeWorkspaceState } from "@ziffr/core/practice-workspace";

/** The section: what it is, and the buttons for how it stands. `app` is Ziffr's address where this page is at the
 * Admin Address, which shows no Workspace: the Practice Workspace is then opened there. */
export function PracticeWorkspaceSection({ state, app }: { state: PracticeWorkspaceState; app: string | null }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { confirm, dialog } = useConfirm();
  const { workspace, refused, demoEndsOn } = state;
  const run = (action: () => Promise<{ error?: string } | void>) => start(async () => {
    setError(null);
    const r = await action();
    if (r?.error) setError(r.error);
  });
  const startOver = async (id: string) => {
    if (!(await confirm({ title: "Start the Practice Workspace over?", description: "It is deleted with everything you made or changed in it, and its key is destroyed. A fresh copy of the demo takes its place. No other Workspace is touched. This cannot be undone.", confirmLabel: "Delete and start over" }))) return;
    run(() => startOverPracticeWorkspace(id));
  };
  return (
    <section id="practice" aria-labelledby="practice-heading" className="scroll-mt-20 space-y-3">
      {dialog}
      <h2 id="practice-heading" className="text-lg font-medium">Practice Workspace</h2>
      <p className="max-w-prose text-sm text-muted-foreground">A private Workspace of your own to try everything in: a copy of the demo&apos;s company, with made-up numbers and people. Nothing reaches anyone but you or an address you enter yourself, and nobody else becomes a member.</p>
      {refused ? <p className="text-sm">{refused}</p> : (
        <>
          {demoEndsOn && <p className="text-sm">The demo is not being refreshed here: its numbers end on {demoEndsOn}, and so do those of a fresh copy.</p>}
          <div className="flex flex-wrap items-center gap-3">
            {!workspace && <Button disabled={pending} onClick={() => run(makePracticeWorkspace)} className="min-h-11 sm:min-h-0">Make a Practice Workspace</Button>}
            {workspace?.ready && !app && <Button disabled={pending} onClick={() => run(() => switchWorkspace(workspace.id))} className="min-h-11 sm:min-h-0">Open it</Button>}
            {workspace && <Button variant="outline" disabled={pending} onClick={() => startOver(workspace.id)} className="min-h-11 sm:min-h-0">Start over</Button>}
          </div>
          {app && <p className="text-sm">Open it in <a href={app} className="underline underline-offset-2">Ziffr</a>: choose it in the Workspace switcher.</p>}
          {workspace && !workspace.ready && !pending && <p className="text-sm">It is being made. Reload the page in a minute. If it stays like this, Start over works after 15 minutes.</p>}
        </>
      )}
      <p role="status" className="text-sm">{pending ? "Working. Making a copy of the demo can take a minute; keep this page open." : ""}</p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </section>
  );
}

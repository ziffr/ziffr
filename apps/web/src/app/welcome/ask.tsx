"use client";
// Asking to join a workspace of one's company domain (GLOSSARY: Domain Joining).
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { askToJoin } from "@/app/auth-actions";
import { isActionError } from "@/lib/action-error";

/** The workspaces the person may ask to join, each with its button. */
export function AskToJoin({ workspaces }: { workspaces: { id: string; name: string; asked: boolean }[] }) {
  const [pending, start] = useTransition();
  const [asked, setAsked] = useState(new Set(workspaces.filter((w) => w.asked).map((w) => w.id)));
  const [error, setError] = useState<string | null>(null);
  return (
    <section aria-labelledby="join-heading" className="mb-10 space-y-3">
      <h2 id="join-heading" className="text-sm font-medium">Your colleagues already use Ziffr</h2>
      {workspaces.map((w) => (
        <div key={w.id} className="flex items-center gap-3 text-sm">
          <span>{w.name}</span>
          {asked.has(w.id) ? (
            <span className="ml-auto text-muted-foreground">Asked; an owner or admin decides.</span>
          ) : (
            <Button size="sm" variant="outline" className="ml-auto" disabled={pending} onClick={() => start(async () => { const r = await askToJoin(w.id); if (isActionError(r)) { setError(r.error); return; } setError(null); setAsked(new Set([...asked, w.id])); })}>Ask to join</Button>
          )}
        </div>
      ))}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </section>
  );
}

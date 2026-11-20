"use client";
// "Stop telling me" (GLOSSARY: Tell): one switch per Workflow whose Tell step tells the person, in Your Alerts.
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { shown, unwrap } from "@/lib/action-error";
import { setTellStopped } from "@/app/tell-actions";
import { Button } from "@/components/ui/button";
import type { TellSubscription } from "@ziffr/core/tell";

/** The Workflows that tell the person, each with a button to stop or start again. */
export function TellSwitches({ items }: { items: TellSubscription[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (w: TellSubscription) => start(async () => {
    try { unwrap(await setTellStopped(w.workflowId, !w.stopped)); toast.success(w.stopped ? "You will be told again" : "You will not be told by it"); router.refresh(); }
    catch (e) { toast.error("Not done", { description: shown(e) }); }
  });
  return (
    <ul className="divide-y divide-[var(--color-rule-2)] rounded-[var(--radius-card)] border border-[var(--color-rule-2)]">
      {items.map((w) => (
        <li key={w.workflowId} className="flex items-center justify-between gap-3 p-3 text-sm">
          <span><span className="font-medium">{w.name}</span><span className="block text-xs text-muted-foreground">{w.stopped ? "You asked not to be told by this Workflow." : "Tells you when a Metric of it reaches a level."}</span></span>
          <Button variant="outline" size="sm" disabled={pending} onClick={() => run(w)}>{w.stopped ? "Tell me again" : "Stop telling me"}</Button>
        </li>
      ))}
    </ul>
  );
}

"use client";
// The note for a person who stopped requests and reminders by email (spec 0004; GLOSSARY: Prompt), with the way
// back: on Connectors → Channels, and on a Metric they send values for.
import { isActionError } from "@/lib/action-error";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { emailRemindersAgain } from "@/app/connector-actions";

/** Says the viewer stopped email requests and offers "Get them by email again"; `says` words it for the page it is on. */
export function OptedOutNote({ says = "You stopped requests for numbers and reminders by email in this workspace." }: { says?: string }) {
  const [pending, start] = useTransition();
  return (
    <p role="status" className="stock flex flex-wrap items-center gap-3 rounded-[var(--radius-card)] p-4 text-sm">
      <span className="min-w-0">{says}</span>
      <Button size="sm" variant="outline" className="max-md:min-h-11 pointer-coarse:min-h-11" disabled={pending} onClick={() => start(async () => { const r = await emailRemindersAgain(); if (isActionError(r)) { toast.error("Not done", { description: r.error }); return; } toast.success("You get them by email again"); })}>Get them by email again</Button>
    </p>
  );
}

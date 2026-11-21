"use client";
// The note on Connectors → Channels for a person who stopped requests and reminders by email (spec 0004), with the
// way back.
import { isActionError } from "@/lib/action-error";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { emailRemindersAgain } from "@/app/connector-actions";

/** Says the viewer stopped email requests and offers "Get them by email again". */
export function OptedOutNote() {
  const [pending, start] = useTransition();
  return (
    <p role="status" className="stock flex flex-wrap items-center gap-3 rounded-[var(--radius-card)] p-4 text-sm">
      You stopped requests for numbers and reminders by email in this workspace.
      <Button size="sm" variant="outline" disabled={pending} onClick={() => start(async () => { const r = await emailRemindersAgain(); if (isActionError(r)) { toast.error("Not done", { description: r.error }); return; } toast.success("You get them by email again"); })}>Get them by email again</Button>
    </p>
  );
}

"use client";
// Ending a trial now (spec 0021): deletes it with everything in it after a confirmation, then signs out.
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/confirm-dialog";
import { endMyTrial } from "@/app/auth-actions";

/** The button with its confirmation. */
export function EndTrialButton({ label = "End my trial" }: { label?: string }) {
  const [pending, start] = useTransition();
  const { confirm, dialog } = useConfirm();
  return (
    <>
      {dialog}
      <Button variant="outline" disabled={pending} onClick={async () => {
        if (!(await confirm({ title: "End your trial now?", description: "It is deleted at once with every Metric, value and dashboard in it, and your account with it. This cannot be undone.", confirmLabel: "Delete everything" }))) return;
        start(async () => { const r = await endMyTrial(); if (r?.error) toast.error(r.error); });
      }}>{label}</Button>
    </>
  );
}

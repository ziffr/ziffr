"use client";
// Deleting a Metric (GLOSSARY: Metric, Audit Log): for its owner, who types its name to confirm. The core refuses while
// anything uses it and records the deletion in the Audit Log.
import { isActionError, UNEXPECTED } from "@/lib/action-error";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { deleteMetric } from "@/app/series-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

/** The confirmation of "Delete…" (an entry of the Metric page's ⋯ menu), which asks for the Metric's name. Owner only. */
export function DeleteMetric({ metricId, name, open, onOpenChange }: { metricId: number; name: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [typed, setTyped] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle>Delete {name}?</DialogTitle>
        <p className="text-sm text-muted-foreground">Its values, targets, questions, tasks and form links go with it, and this cannot be undone. The Audit Log keeps that you deleted it. Take it out of widgets, decks, formulas and View Links first.</p>
        <form
          className="mt-2 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              try {
                const r = await deleteMetric(metricId, typed);
                if (isActionError(r)) { toast.error("Not deleted", { description: r.error }); return; }
                toast.success(`${name} deleted`, { description: `${r.values} values went with it.` });
                router.push("/metrics");
              } catch {
                toast.error("Not deleted", { description: UNEXPECTED });
              }
            });
          }}
        >
          <label className="block text-sm">
            <span className="mb-1 block">Type <span className="font-medium">{name}</span> to confirm</span>
            <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </label>
          <Button type="submit" variant="destructive" disabled={pending || typed.trim() !== name}>{pending ? "Deleting…" : "Delete the Metric"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

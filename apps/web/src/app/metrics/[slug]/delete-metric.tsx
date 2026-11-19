"use client";
// Deleting a Metric (GLOSSARY: Metric, Audit Log): for its owner, who types its name to confirm. The core refuses while
// anything uses it and records the deletion in the Audit Log.
import { isActionError, UNEXPECTED } from "@/lib/action-error";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { deleteMetric } from "@/app/series-actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

/** "Delete…" with a confirmation that asks for the Metric's name. Owner only. */
export function DeleteMetric({ metricId, name }: { metricId: number; name: string }) {
  const [typed, setTyped] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Dialog>
      <DialogTrigger className={buttonVariants({ variant: "ghost" })}><Trash2 aria-hidden /> Delete…</DialogTrigger>
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

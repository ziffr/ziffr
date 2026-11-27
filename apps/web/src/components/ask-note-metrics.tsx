"use client";
// **Ask for a note…** for several Metrics at once (GLOSSARY: Metric Description, Value Note; spec 0064): one choice
// for all ticked in the Metrics list. The core decides which of them the person may change; the others stay as they
// are and are only counted.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setAskNoteForMetrics } from "@/app/series-actions";
import { AskNoteField } from "@/app/metrics/ask-note-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { isActionError, UNEXPECTED } from "@/lib/action-error";
import { isAskNote } from "@ziffr/core/ask-note";

const metrics = (n: number) => `${n} Metric${n === 1 ? "" : "s"}`;

/** What the change came to, in words: how many were set, and how many were left out. */
function askNoteSaid({ changed, leftOut }: { changed: number; leftOut: number }): string {
  const done = changed ? `Set for ${metrics(changed)}.` : "Nothing was changed.";
  return leftOut ? `${done} ${metrics(leftOut)} left out: only the owner and Editors change this, and calculated Metrics have no values sent to them.` : done;
}

function Form({ ids, onDone }: { ids: number[]; onDone: () => void }) {
  const [problem, setProblem] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const choice = String(new FormData(e.currentTarget).get("ask_note"));
        if (!isAskNote(choice)) return;
        start(async () => {
          try {
            const r = await setAskNoteForMetrics(ids, choice);
            if (isActionError(r)) { setProblem(r.error); return; }
            toast.success(askNoteSaid(r));
            router.refresh();
            onDone();
          } catch {
            setProblem(UNEXPECTED);
          }
        });
      }}
    >
      <AskNoteField id="many-ask-note" />
      {problem && <p role="alert" className="text-sm text-destructive">{problem}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" className="min-h-11 sm:min-h-9" onClick={onDone}>Cancel</Button>
        <Button type="submit" className="min-h-11 sm:min-h-9" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
      </div>
    </form>
  );
}

/** The dialog for the ticked Metrics; `ids` are those taken when it opened. */
export function AskNoteMetrics({ ids, onClose }: { ids: number[] | null; onClose: () => void }) {
  return (
    <Dialog open={ids !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle>Ask for a note</DialogTitle>
        <DialogDescription>For {metrics(ids?.length ?? 0)}. Those you may not change are left as they are.</DialogDescription>
        {ids && <Form ids={ids} onDone={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

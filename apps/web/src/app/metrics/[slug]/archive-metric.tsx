"use client";
// Archiving a Metric and bringing it back (GLOSSARY: Archived Metric): for Owners, Admins and the Metric's owner. The
// core checks who again.
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { isActionError, UNEXPECTED } from "@/lib/action-error";
import { archiveMetric, restoreMetric } from "@/app/series-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

/** The confirmation of "Archive…" (an entry of the Metric page's ⋯ menu): says what archiving does. */
export function ArchiveMetric({ metricId, name, open, onOpenChange }: { metricId: number; name: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle>Archive {name}?</DialogTitle>
        <p className="text-sm text-muted-foreground">Its values, history and Versions stay, and widgets keep showing them. Nobody is asked for it any more and it takes no values. It no longer counts towards the workspace&rsquo;s Metrics, and you can bring it back at any time.</p>
        <Button
          className="mt-2"
          disabled={pending}
          onClick={() => start(async () => {
            try {
              const r = await archiveMetric(metricId);
              if (isActionError(r)) { toast.error("Not archived", { description: r.error }); return; }
              toast.success(`${name} archived`, { description: "Find it under Archived on the Metrics page." });
              onOpenChange(false);
              router.refresh();
            } catch {
              toast.error("Not archived", { description: UNEXPECTED });
            }
          })}
        >
          {pending ? "Archiving…" : "Archive the Metric"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

/** "Bring back", an entry of the ⋯ menu: the Metric is asked for and takes values again. */
export function useBringBack(metricId: number, name: string): () => void {
  const router = useRouter();
  const [, start] = useTransition();
  return () => start(async () => {
    try {
      const r = await restoreMetric(metricId);
      if (isActionError(r)) { toast.error("Not brought back", { description: r.error }); return; }
      toast.success(`${name} is back`, { description: "It is asked for and takes values again." });
      router.refresh();
    } catch {
      toast.error("Not brought back", { description: UNEXPECTED });
    }
  });
}

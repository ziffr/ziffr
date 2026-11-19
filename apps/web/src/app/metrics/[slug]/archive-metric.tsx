"use client";
// Archiving a Metric and bringing it back (GLOSSARY: Archived Metric): for Owners, Admins and the Metric's owner. The
// core checks who again, and refuses bringing it back when there is no room for it.
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Archive, ArchiveRestore } from "lucide-react";
import { isActionError, UNEXPECTED } from "@/lib/action-error";
import { archiveMetric, restoreMetric } from "@/app/series-actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

/** Archive… on a Metric in use, Bring back on an Archived Metric; nothing for someone who may do neither. */
export function ArchiveControl({ metricId, name, archived, allowed }: { metricId: number; name: string; archived: boolean; allowed: boolean }) {
  if (!allowed) return null;
  return archived ? <RestoreMetric metricId={metricId} name={name} /> : <ArchiveMetric metricId={metricId} name={name} />;
}

/** "Archive…" with a confirmation that says what archiving does. */
function ArchiveMetric({ metricId, name }: { metricId: number; name: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Dialog>
      <DialogTrigger className={buttonVariants({ variant: "ghost" })}><Archive aria-hidden /> Archive…</DialogTrigger>
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

/** "Bring back": the Metric is asked for and takes values again. */
function RestoreMetric({ metricId, name }: { metricId: number; name: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() => start(async () => {
        try {
          const r = await restoreMetric(metricId);
          if (isActionError(r)) { toast.error("Not brought back", { description: r.error }); return; }
          toast.success(`${name} is back`, { description: "It is asked for and takes values again." });
          router.refresh();
        } catch {
          toast.error("Not brought back", { description: UNEXPECTED });
        }
      })}
    >
      <ArchiveRestore aria-hidden /> {pending ? "Bringing back…" : "Bring back"}
    </Button>
  );
}

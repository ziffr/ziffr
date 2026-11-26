"use client";
// "Delete…" for one Metric or several (spec 0065; GLOSSARY: Metric, Metric Owner, Metric Record, Dashboard, Deck,
// View Link, Snapshot, Archived Metric): one preview of what can go and what stands in the way, ticks for the changes
// Ziffr may make, the record to download, and the words to type. The server decides all of it again.
import { Check, Download } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { archiveInstead, deleteMetrics, previewMetricDelete } from "@/app/metric-delete-actions";
import { SCROLLING_DIALOG, SCROLLING_DIALOG_BODY, SCROLLING_DIALOG_TITLE } from "@/app/metrics/[slug]/scrolling-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { isActionError, UNEXPECTED } from "@/lib/action-error";
import { cn } from "@/lib/utils";
import type { DeleteChoices, DeletePlan } from "@ziffr/core/metric-delete";

const NO_TICKS: DeleteChoices = { dashboards: false, decks: false, viewLinks: false };
const TALL = "min-h-11 sm:min-h-9";

const metrics = (n: number) => `${n} Metric${n === 1 ? "" : "s"}`;

/** Saves a file the server answered with, under the name it gave. */
async function save(res: Response) {
  const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "ziffr-record.zip";
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  // Some browsers read the file after the click has returned.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** One thing the person may tick, with what it would change listed under it. */
function Tick({ label, note, lines, on, onChange, disabled }: { label: string; note?: string; lines: string[]; on: boolean; onChange: (on: boolean) => void; disabled: boolean }) {
  if (!lines.length) return null;
  return (
    <div className="rounded-[var(--radius-input)] border border-border px-3 pb-2">
      <label className="flex min-h-11 cursor-pointer items-center gap-2.5 font-medium">
        <input type="checkbox" checked={on} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="size-5 shrink-0 accent-primary" />
        <span>{label}</span>
      </label>
      <ul className="ml-[1.875rem] list-disc space-y-0.5 pl-4 text-muted-foreground [overflow-wrap:anywhere]">{lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
      {note && <p className="ml-[1.875rem] mt-1 text-muted-foreground">{note}</p>}
    </div>
  );
}

/** Which Metrics can go and which stay, with why. */
function Preview({ plan }: { plan: DeletePlan }) {
  const going = plan.metrics.filter((m) => m.deletable);
  const staying = plan.metrics.filter((m) => !m.deletable);
  return (
    <>
      {going.length > 0 && (
        <section aria-label="Can be deleted">
          <h3 className="font-medium">Can be deleted: {going.length}</h3>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 [overflow-wrap:anywhere]">{going.map((m) => <li key={m.id}>{m.name}</li>)}</ul>
        </section>
      )}
      {staying.length > 0 && (
        <section aria-label="Cannot be deleted">
          <h3 className="font-medium">{going.length ? "Stays" : "Cannot be deleted yet"}: {staying.length}</h3>
          <ul className="mt-1 space-y-2 [overflow-wrap:anywhere]">
            {staying.map((m) => (
              <li key={m.id}>
                <span className="font-medium">{m.name}</span>
                {m.reasons.map((r) => <span key={r} className="block text-muted-foreground">{r}</span>)}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

type Props = {
  /** The Metrics picked. */
  ids: number[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the ids of the Metrics that went. */
  onDeleted: (ids: number[]) => void;
  /** Opens a screen's own way of archiving, in place of archiving here (the Metric page asks about Totals). */
  onArchive?: () => void;
};

/** The body, made anew each time the dialog opens, so nothing of an earlier turn is left in it. */
function Flow({ ids, onOpenChange, onDeleted, onArchive }: Omit<Props, "open">) {
  const [choices, setChoices] = useState(NO_TICKS);
  const [plan, setPlan] = useState<DeletePlan | null>(null);
  const [problem, setProblem] = useState("");
  /** The set whose record was downloaded here, as its ids. */
  const [downloaded, setDownloaded] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [typed, setTyped] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const asked = useRef(0);
  const picked = ids.join(",");

  const look = useCallback(async (next: DeleteChoices) => {
    const turn = ++asked.current;
    try {
      const r = await previewMetricDelete(picked.split(",").map(Number), next);
      if (turn !== asked.current) return;
      if (isActionError(r)) setProblem(r.error);
      else setPlan(r);
    } catch {
      if (turn === asked.current) setProblem(UNEXPECTED);
    }
  }, [picked]);
  useEffect(() => { void look(NO_TICKS); }, [look]);

  const set = plan ? [...plan.ids].sort((a, b) => a - b).join(",") : "";
  const ready = Boolean(set) && downloaded === set;
  const confirmed = Boolean(plan?.confirm) && (plan!.ids.length === 1 ? typed.trim() === plan!.confirm.trim() : typed.trim().toLowerCase() === plan!.confirm.toLowerCase());
  const archivable = plan?.metrics.filter((m) => m.archivable).length ?? 0;

  const tick = (key: keyof DeleteChoices) => (on: boolean) => {
    const next = { ...choices, [key]: on };
    setChoices(next);
    setProblem("");
    setTyped("");
    void look(next);
  };

  async function download() {
    if (!plan) return;
    setDownloading(true);
    setProblem("");
    try {
      const res = await fetch(`/metric-record?${plan.ids.map((id) => `metric=${id}`).join("&")}`);
      if (!res.ok) { setProblem(res.status < 500 ? await res.text() : UNEXPECTED); return; }
      await save(res);
      setDownloaded(set);
    } catch {
      setProblem("The record could not be downloaded. Try again.");
    } finally {
      setDownloading(false);
    }
  }

  const remove = () => start(async () => {
    if (!plan) return;
    setProblem("");
    try {
      const r = await deleteMetrics(plan.ids, choices, typed, plan.seen);
      if (isActionError(r)) {
        setProblem(r.error);
        // Something may have changed: look again, and ask for the download again.
        setDownloaded("");
        await look(choices);
        return;
      }
      const gone = r.deleted.map((m) => m.id);
      if (r.stopped) {
        setProblem(`${r.deleted.length ? `Deleted: ${r.deleted.map((m) => m.name).join(", ")}. ` : ""}${r.stopped.name} stays. ${r.stopped.why}`);
        setDownloaded("");
        setTyped("");
        router.refresh();
        return;
      }
      toast.success(r.deleted.length === 1 ? `${r.deleted[0].name} deleted` : `${metrics(r.deleted.length)} deleted`, { description: "Past Snapshots keep their numbers." });
      onOpenChange(false);
      onDeleted(gone);
    } catch {
      setProblem(UNEXPECTED);
    }
  });

  const archive = () => {
    if (onArchive) { onOpenChange(false); onArchive(); return; }
    start(async () => {
      try {
        const r = await archiveInstead(ids);
        if (isActionError(r)) { setProblem(r.error); return; }
        toast.success(`${metrics(r.archived)} archived`, { description: "Find them under Archived on the Metrics page." });
        onOpenChange(false);
        router.refresh();
      } catch {
        setProblem(UNEXPECTED);
      }
    });
  };

  const title = plan?.metrics.length === 1 ? `Delete ${plan.metrics[0].name}?` : `Delete ${metrics(plan?.metrics.length ?? ids.length)}?`;
  return (
    <>
      <DialogTitle className={SCROLLING_DIALOG_TITLE}>{title}</DialogTitle>
      <div className={SCROLLING_DIALOG_BODY}>
        <p className="text-muted-foreground">Values, their history, targets, Projections, questions, tasks and form links go for good. Past Snapshots keep their numbers, marked as deleted, for the people who can see them today.</p>
        {!plan && !problem && <p role="status" className="text-muted-foreground">Looking at what uses {ids.length === 1 ? "it" : "them"}…</p>}
        {plan && (
          <>
            <Preview plan={plan} />
            <Tick label="Take them off dashboards" lines={plan.dashboards} on={choices.dashboards} onChange={tick("dashboards")} disabled={pending} />
            <Tick label="Take them out of decks" lines={plan.decks} on={choices.decks} onChange={tick("decks")} disabled={pending} />
            <Tick label="Revoke these View Links" note="A revoked link stops working as a whole." lines={plan.viewLinks} on={choices.viewLinks} onChange={tick("viewLinks")} disabled={pending} />
          </>
        )}
        {plan && plan.ids.length > 0 && (
          <>
            <section aria-label="1. Download the record" className="space-y-1.5">
              <h3 className="font-medium">1. Download the record</h3>
              <p className="text-muted-foreground">A ZIP file with {plan.ids.length === 1 ? "its" : "their"} values and every change to them, Breakdowns, targets, Projections, questions, tasks and replies, and how {plan.ids.length === 1 ? "it is" : "each is"} set up.</p>
              <Button variant="outline" className={cn(TALL, "w-full sm:w-auto")} disabled={downloading || pending} onClick={() => void download()}>
                <Download aria-hidden /> {downloading ? "Making the file…" : ready ? "Download again" : "Download the record"}
              </Button>
              <p role="status" className="flex items-center gap-1.5">{ready && <><Check aria-hidden className="size-4 shrink-0" /> Downloaded.</>}</p>
            </section>
            <form
              aria-label="2. Delete"
              className="space-y-2"
              onSubmit={(e) => { e.preventDefault(); if (ready && confirmed && !pending) remove(); }}
            >
              <h3 className="font-medium">2. Delete</h3>
              <label className="block">
                <span className="mb-1 block [overflow-wrap:anywhere]">{ready ? <>Type <span className="font-medium">{plan.confirm}</span> to confirm</> : "Download the record first."}</span>
                <Input value={typed} onChange={(e) => setTyped(e.target.value)} disabled={!ready || pending} autoComplete="off" autoCapitalize="none" spellCheck={false} className="min-h-11 text-base sm:min-h-9 sm:text-sm" />
              </label>
              <Button type="submit" variant="destructive" className={cn(TALL, "h-auto w-full whitespace-normal sm:w-auto")} disabled={!ready || !confirmed || pending}>
                {pending ? "Working…" : `Delete ${metrics(plan.ids.length)} for good`}
              </Button>
            </form>
          </>
        )}
        {problem && <p role="alert" className="rounded-[var(--radius-input)] border border-destructive/40 px-3 py-2 text-destructive [overflow-wrap:anywhere]">{problem}</p>}
        {archivable > 0 && (
          <section aria-label="Archive instead" className="space-y-1.5 border-t border-border pt-3">
            <p className="text-muted-foreground">
              Only want the requests to stop? Archiving keeps everything.
              {archivable < (plan?.metrics.length ?? 0) && ` It covers ${archivable} of these ${plan!.metrics.length}.`}
              {!onArchive && plan?.countedByTotals && " A Total that counts one of them will have no value for later periods: to end it there first, archive that Metric from its own page."}
            </p>
            <Button variant="outline" className={cn(TALL, "w-full sm:w-auto")} disabled={pending} onClick={archive}>{onArchive ? "Archive instead…" : "Archive instead"}</Button>
          </section>
        )}
      </div>
    </>
  );
}

/** The dialog of "Delete…", on the Metrics list for the ticked Metrics and on a Metric's page for that one. */
export function DeleteMetrics({ open, ...props }: Props) {
  return (
    <Dialog open={open} onOpenChange={props.onOpenChange}>
      <DialogContent className={cn(SCROLLING_DIALOG, "sm:max-w-lg")}>
        {open && <Flow {...props} />}
      </DialogContent>
    </Dialog>
  );
}

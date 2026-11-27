"use client";
// Opening and closing a Total, for its owner (GLOSSARY: Total; spec 0058, "Opening a Total"): the switch "Also show this
// total to people who do not see every part", which shows who learns what before it is confirmed. The core makes the
// lists, asks for the fingerprint of the ones shown, and asks again where they changed.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { closeTotal, openTotal, previewTotalOpening } from "@/app/total-actions";
import { isActionError, UNEXPECTED, type ActionError } from "@/lib/action-error";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { periodLabel, type YearStart } from "@ziffr/core/periods";
import { countsFromFirstValue } from "@ziffr/core/total-rules";
import type { Shown, TotalOpening as Opening } from "@ziffr/core/total-opening";
import type { Period } from "@ziffr/core/types";

// "2: Sales, Board", or the count alone where none may be named.
const shownText = (s: Shown) => (s.count === 0 ? "None." : `${s.count}${s.names.length ? `: ${s.names.join(", ")}${s.count > s.names.length ? " and others" : ""}` : ""}`);

/** The button that opens a Total (after its lists are confirmed) or closes it. */
export function TotalOpening({ metricId, open, period, yearStart }: { metricId: number; open: boolean; period: Period; yearStart: YearStart }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [shown, setShown] = useState<Opening | null>(null);
  const name = (p: string) => periodLabel(p, period, yearStart, true);
  const run = <T,>(work: () => Promise<T | ActionError>, failed: string, done: (r: T) => void) => start(async () => {
    try {
      const r = await work();
      if (isActionError(r)) { toast.error(failed, { description: r.error }); return; }
      done(r);
    } catch {
      toast.error(failed, { description: UNEXPECTED });
    }
  });
  const look = () => run(() => previewTotalOpening(metricId), "Not read", (r: Opening) => setShown(r));
  return (
    <div className="mt-5 border-t border-border pt-4">
      {open ? (
        <>
          <p className="mb-2">You show this total to people who do not see every Metric it adds up. Closing it takes effect at once.</p>
          <Button variant="outline" className="min-h-11 sm:min-h-9" disabled={pending} onClick={() => run(() => closeTotal(metricId), "Not closed", () => { toast.success("Closed"); router.refresh(); })}>Stop showing it to them</Button>
        </>
      ) : (
        <>
          <Button variant="outline" className="h-auto min-h-11 py-2 text-left whitespace-normal sm:min-h-9" disabled={pending} onClick={look}>Also show this total to people who do not see every Metric…</Button>
          <p className="mt-1.5 text-xs text-muted-foreground">Off for now. You see who would learn what before anything changes.</p>
        </>
      )}
      <Dialog open={shown !== null} onOpenChange={(o) => { if (!o) setShown(null); }}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
          {shown && (
            <>
              <DialogTitle className="pr-10 leading-snug [overflow-wrap:anywhere]">Show {shown.name} to people who do not see every Metric?</DialogTitle>
              <DialogDescription>Each of them learns the sum of every period, past ones included, and through subtraction the sum of the Metrics they do not see. No name, row or value of those is shown to them.{shown.parts.some((p) => countsFromFirstValue(p.first)) ? " Where a Metric counts from its first value, history pasted or sent later for earlier periods is shown to them too." : ""}</DialogDescription>
              <dl className="space-y-3 text-sm [overflow-wrap:anywhere]">
                <div>
                  <dt className="font-medium">It adds up</dt>
                  <dd><ul>{shown.parts.map((p) => <li key={p.name + p.first}>{p.name}, from {countsFromFirstValue(p.first) ? "its first value" : name(p.first)}{p.last ? ` up to ${name(p.last)}` : ""}</li>)}</ul></dd>
                </div>
                <div>
                  <dt className="font-medium">Who will newly see its numbers</dt>
                  <dd>
                    {shown.people.length === 0 ? "Nobody it is shared with now. Whoever you share it with later learns them." : (
                      <ul>{shown.people.map((p, i) => <li key={i}>{p.name}{p.learns ? <strong className="font-medium">: sees every other Metric, so can work out {p.learns}</strong> : null}</li>)}</ul>
                    )}
                  </dd>
                </div>
                <div><dt className="font-medium">View Links that show it</dt><dd>{shownText(shown.viewLinks)}</dd></div>
                <div><dt className="font-medium">Snapshots that show it</dt><dd>{shownText(shown.snapshots)}</dd></div>
                <div><dt className="font-medium">Formulas that read it</dt><dd>{shownText(shown.formulas)}</dd></div>
              </dl>
              <p className="text-sm text-muted-foreground">Files already made, such as a PDF or a download, cannot be taken back, also after you close it.</p>
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <Button variant="ghost" className="min-h-11 sm:min-h-9" onClick={() => setShown(null)}>Cancel</Button>
                <Button
                  className="min-h-11 sm:min-h-9" disabled={pending}
                  onClick={() => start(async () => {
                    try {
                      const r = await openTotal(metricId, shown.fingerprint);
                      if (isActionError(r)) {
                        toast.error("Not opened", { description: r.error });
                        // Read again, so what is confirmed next is what stands now.
                        const again = await previewTotalOpening(metricId);
                        setShown(isActionError(again) ? null : again);
                        return;
                      }
                      toast.success("The total is open");
                      setShown(null);
                      router.refresh();
                    } catch {
                      toast.error("Not opened", { description: UNEXPECTED });
                    }
                  })}
                >
                  Show it to them
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

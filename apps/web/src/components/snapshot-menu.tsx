"use client";
// A dashboard's Snapshots (spec 0013, ticket #175; GLOSSARY: Snapshot): the list by its title, newest period first,
// drafts marked, and Take a Snapshot… for its owner and Editors. The core decides which Snapshots are listed.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Camera, ChevronDown } from "lucide-react";
import { takeSnapshot } from "@/app/snapshot-actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { completePeriods, type SnapshotPeriodKind } from "@ziffr/core/snapshot-periods";
import type { SnapshotSummary } from "@ziffr/core/snapshots";

const KINDS: { id: SnapshotPeriodKind; label: string }[] = [{ id: "month", label: "Month" }, { id: "quarter", label: "Quarter" }, { id: "week", label: "Week" }];

/** Today as yyyy-mm-dd in the browser's own calendar. */
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

/** The Snapshots button and menu of one dashboard; `canTake` for its owner and Editors who may create. */
export function SnapshotMenu({ dashboardId, snapshots, canTake }: { dashboardId: number; snapshots: SnapshotSummary[]; canTake: boolean }) {
  const router = useRouter();
  const [taking, setTaking] = useState(false);
  if (!snapshots.length && !canTake) return null;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger className={buttonVariants({ variant: "outline" })}><Camera aria-hidden /> Snapshots <ChevronDown aria-hidden className="size-3.5" /></DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuGroup>
            <DropdownMenuLabel>The dashboard as it stood for a period</DropdownMenuLabel>
            {snapshots.length === 0 && <p className="px-2 py-1.5 text-sm text-muted-foreground">None yet.</p>}
            {snapshots.map((s) => (
              <DropdownMenuItem key={s.id} onClick={() => router.push(`/dashboards/${dashboardId}/snapshots/${s.id}`)}>
                <span className="flex-1">{s.label}</span>
                {!s.shownAt && <span className="rounded-[var(--radius-input)] bg-[var(--muted)] px-1.5 text-xs text-muted-foreground">Draft</span>}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
          {canTake && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setTimeout(() => setTaking(true), 0)}><Camera aria-hidden /> Take a Snapshot…</DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {taking && <TakeDialog dashboardId={dashboardId} onClose={() => setTaking(false)} />}
    </>
  );
}

/** Picks the period to take a Snapshot of: the last complete month by default. */
function TakeDialog({ dashboardId, onClose }: { dashboardId: number; onClose: () => void }) {
  const [kind, setKind] = useState<SnapshotPeriodKind>("month");
  const periods = completePeriods(kind, today(), kind === "week" ? 12 : 8);
  const [start, setStart] = useState(periods[0].start);
  const [pending, run] = useTransition();
  const pick = (k: SnapshotPeriodKind) => { setKind(k); setStart(completePeriods(k, today(), 1)[0].start); };
  const select = "h-9 w-full rounded-[var(--radius-input)] border border-input bg-card px-2.5 text-sm";
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle>Take a Snapshot</DialogTitle>
        <DialogDescription>
          The dashboard as it is now, with the values up to the end of the period. Its numbers never change; you write its words afterwards. It is a draft for you and the dashboard&rsquo;s Editors until you show it.
        </DialogDescription>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm"><span className="text-muted-foreground">Period</span>
            <select aria-label="Period length" value={kind} onChange={(e) => pick(e.target.value as SnapshotPeriodKind)} className={select}>
              {KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm"><span className="text-muted-foreground">Which</span>
            <select aria-label="Which period" value={start} onChange={(e) => setStart(e.target.value)} className={select}>
              {periods.map((p) => <option key={p.start} value={p.start}>{p.label}</option>)}
            </select>
          </label>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={pending} onClick={() => run(async () => {
            try { await takeSnapshot(dashboardId, kind, start); } catch (err) {
              // A redirect after taking it is not a failure.
              if ((err as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw err;
              toast.error("No Snapshot taken", { description: (err as Error).message });
            }
          })}>Take Snapshot</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

"use client";
// A dashboard's Snapshots (spec 0013, ticket #175; spec 0020; GLOSSARY: Snapshot): the list by its title, newest period first,
// drafts marked, and Take a Snapshot… for its owner and Editors. The core decides which Snapshots are listed.
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { shown, unwrap } from "@/lib/action-error";
import { Camera, ChevronDown, Repeat } from "lucide-react";
import { setAutoSnapshots, snapshotChoices, takeSnapshot } from "@/app/snapshot-actions";
import { Input } from "@/components/ui/input";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { completePeriods, isFree, noValuesWords, offeredPeriods, type SnapshotChoices, type SnapshotPeriodKind } from "@ziffr/core/snapshot-periods";
import type { SnapshotSummary } from "@ziffr/core/snapshots";
import { type YearStart } from "@ziffr/core/periods";

const KINDS: { id: SnapshotPeriodKind; label: string }[] = [{ id: "month", label: "Month" }, { id: "quarter", label: "Quarter" }, { id: "half", label: "Half-year" }, { id: "year", label: "Year" }, { id: "week", label: "Week" }];

/** "half-year" for "half": how a period length reads in "every …". */
const every = (k: SnapshotPeriodKind) => (KINDS.find((x) => x.id === k)?.label ?? k).toLowerCase();

/** Today as yyyy-mm-dd in the browser's own calendar. */
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

/** The Snapshots button and menu of one dashboard; `canTake` for its owner and Editors who may create. `auto` is how it
 * takes Snapshots by itself, given only to its owner, who alone may change it (#176). */
export function SnapshotMenu({ dashboardId, snapshots, canTake, auto, yearStart }: { dashboardId: number; snapshots: SnapshotSummary[]; canTake: boolean; auto?: { every: SnapshotPeriodKind | null; waitDays: number } | null; yearStart: YearStart }) {
  const router = useRouter();
  const [taking, setTaking] = useState(false);
  const [setting, setSetting] = useState(false);
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
              {auto && <DropdownMenuItem onClick={() => setTimeout(() => setSetting(true), 0)}><Repeat aria-hidden /> {auto.every ? `Takes one every ${every(auto.every)}…` : "Take one by itself…"}</DropdownMenuItem>}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {taking && <TakeDialog dashboardId={dashboardId} yearStart={yearStart} onClose={() => setTaking(false)} />}
      {setting && auto && <AutoDialog dashboardId={dashboardId} auto={auto} onClose={() => setSetting(false)} />}
    </>
  );
}

/** Picks the period to take a Snapshot of: by default the last complete month that has values and no Snapshot yet.
 * The core says which periods have none or are taken; those cannot be chosen, and a taken one can be opened. */
function TakeDialog({ dashboardId, yearStart, onClose }: { dashboardId: number; yearStart: YearStart; onClose: () => void }) {
  const [kind, setKind] = useState<SnapshotPeriodKind>("month");
  // Undefined while asking; null when the read failed, which rules no period out: taking says why not.
  const [choices, setChoices] = useState<SnapshotChoices | null | undefined>(undefined);
  useEffect(() => {
    let open = true;
    snapshotChoices(dashboardId).then((r) => { if (open) setChoices(unwrap(r)); }).catch(() => { if (open) setChoices(null); });
    return () => { open = false; };
  }, [dashboardId]);
  const periods = choices ? choices[kind].periods : completePeriods(kind, today(), offeredPeriods(kind), yearStart).map((p) => ({ ...p, hasValues: true, takenId: null }));
  const [picked, setStart] = useState<string | null>(null);
  const free = periods.filter(isFree);
  const start = (free.find((p) => p.start === picked) ?? free[0] ?? periods[0]).start;
  const existing = periods.find((p) => p.takenId !== null);
  const none = choices ? noValuesWords(choices, kind, today()) : null;
  const [pending, run] = useTransition();
  const pick = (k: SnapshotPeriodKind) => { setKind(k); setStart(null); };
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
              {periods.map((p) => <option key={p.start} value={p.start} disabled={!isFree(p)}>{p.takenId !== null ? `${p.label} (taken)` : p.hasValues ? p.label : `${p.label} (no values)`}</option>)}
            </select>
          </label>
        </div>
        <p className="text-sm text-muted-foreground">One Snapshot per period. To take it again, delete the old one first.</p>
        {existing && <Link href={`/dashboards/${dashboardId}/snapshots/${existing.takenId}`} onClick={onClose} className="inline-flex min-h-11 items-center text-sm underline underline-offset-2">Open the Snapshot of {existing.label}</Link>}
        {none && <p role="status" className="text-sm">{none}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={pending || choices === undefined || Boolean(none)} onClick={() => run(async () => {
            try { unwrap(await takeSnapshot(dashboardId, kind, start)); } catch (err) {
              // A redirect after taking it is not a failure.
              if ((err as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw err;
              toast.error("No Snapshot taken", { description: shown(err) });
            }
          })}>Take Snapshot</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Whether, and how often, the dashboard takes a Snapshot by itself, and how long it waits for the Locks. */
function AutoDialog({ dashboardId, auto, onClose }: { dashboardId: number; auto: { every: SnapshotPeriodKind | null; waitDays: number }; onClose: () => void }) {
  const router = useRouter();
  const [kind, setKind] = useState<string>(auto.every ?? "");
  const [wait, setWait] = useState(String(auto.waitDays));
  const [pending, run] = useTransition();
  const select = "h-9 w-full rounded-[var(--radius-input)] border border-input bg-card px-2.5 text-sm";
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle>Take Snapshots by themselves</DialogTitle>
        <DialogDescription>
          Each period&rsquo;s Snapshot is taken in your name as soon as every Metric on the dashboard is Locked for it, or the set number of days after it ends, whichever comes first. You get a message to write it up; it stays a draft until you show it.
        </DialogDescription>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm"><span className="text-muted-foreground">Take one</span>
            <select aria-label="Take one" value={kind} onChange={(e) => setKind(e.target.value)} className={select}>
              <option value="">Only by hand</option>
              {KINDS.map((k) => <option key={k.id} value={k.id}>Every {k.label.toLowerCase()}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm"><span className="text-muted-foreground">Wait at most (days)</span>
            <Input aria-label="Wait at most, in days" type="number" min={0} max={60} value={wait} onChange={(e) => setWait(e.target.value)} disabled={!kind} />
          </label>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={pending} onClick={() => run(async () => {
            try { unwrap(await setAutoSnapshots(dashboardId, kind || null, Number(wait))); toast.success(kind ? `A Snapshot of every ${every(kind as SnapshotPeriodKind)} is taken by itself` : "Snapshots are taken by hand only"); onClose(); router.refresh(); }
            catch (err) { toast.error("Not saved", { description: shown(err) }); }
          })}>Save</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

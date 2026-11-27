"use client";
// The Workspaces and what an Installation Admin may do with one (spec 0066; GLOSSARY: Workspace, Trial Workspace,
// Workspace Limit): give it a limit of its own, or give a running trial more days. It holds only what the page shows.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { InstallationWorkspace, WorkspaceKind } from "@ziffr/core/installation-workspaces";
import { extendTrial } from "@/app/installation-actions";
import { RelativeTime } from "@/components/relative-time";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PanelBadge } from "../panel-list";
import { LimitForm, LimitSetBy, limitWords } from "../workspace-limits";

const KIND: Record<WorkspaceKind, string> = { workspace: "Workspace", size: "Size", trial: "Trial", trial_ended: "Trial ended", closed: "Closed" };
// The date alone, the same on the server and in the browser, never broken across two lines.
const day = (iso: string) => <span className="whitespace-nowrap">{iso.slice(0, 10)}</span>;
const count = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/** One card per Workspace, by name. */
export function WorkspaceList({ workspaces, pinned, maxDays }: { workspaces: InstallationWorkspace[]; pinned: boolean; maxDays: number }) {
  return (
    <ul className="divide-y divide-border rounded-[var(--radius-card)] border border-border text-sm" aria-label="Workspaces">
      {workspaces.map((w) => <WorkspaceRow key={w.workspaceId} workspace={w} pinned={pinned} maxDays={maxDays} />)}
    </ul>
  );
}

/** Where a trial or a closed Workspace stands, in words. */
function Dates({ workspace: w }: { workspace: InstallationWorkspace }) {
  if (w.kind === "trial" && w.trialEndsAt) return <p>{w.daysLeft === 1 ? "1 day left" : `${w.daysLeft} days left`}: the trial ends on {day(w.trialEndsAt)}.</p>;
  if ((w.kind === "trial_ended" || w.kind === "closed") && w.trialEndsAt) {
    return <p>{w.kind === "closed" ? "Closed because its Size was cancelled, on " : "The trial ended on "}{day(w.trialEndsAt)}.{w.deletedAt && <> It is deleted on {day(w.deletedAt)}.</>}</p>;
  }
  return null;
}

/** One Workspace: its facts, and the two things that can be changed about it. */
function WorkspaceRow({ workspace: w, pinned, maxDays }: { workspace: InstallationWorkspace; pinned: boolean; maxDays: number }) {
  const [open, setOpen] = useState<"limit" | "trial" | null>(null);
  return (
    <li className="space-y-2 p-3">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="min-w-0 break-words font-medium">{w.name}</span>
        <PanelBadge strong={w.kind === "closed" || w.kind === "trial_ended"}>{w.kind === "size" && w.label ? `Size ${w.label}` : KIND[w.kind]}</PanelBadge>
      </p>
      <p className="break-words text-muted-foreground">
        {w.owners.length ? <>{w.owners.length === 1 ? "Owner" : "Owners"}: {w.owners.map((o) => (o.email ? `${o.name} (${o.email})` : o.name)).join(", ")}</> : "No Owner"}
      </p>
      <p className="fig flex flex-wrap gap-x-3">
        <span>{count(w.people, "person", "people")}</span>
        <span>{count(w.metrics, "Metric")}</span>
        <span>{count(w.dashboards, "dashboard")}</span>
      </p>
      <Dates workspace={w} />
      <p className="text-muted-foreground">Limit: {limitWords(w)}{w.overSince && <>. Over its limit since <RelativeTime at={w.overSince} /></>}</p>
      <LimitSetBy row={w} />
      <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
        <span>Made <RelativeTime at={w.createdAt} /></span>
        {w.lastUsedAt && <span>Last used <RelativeTime at={w.lastUsedAt} /></span>}
      </p>
      {(!pinned || w.extendable) && (
        <div className="flex flex-wrap gap-2">
          {!pinned && <Button type="button" variant="outline" size="sm" aria-expanded={open === "limit"} aria-label={`Change the limit of ${w.name}`} onClick={() => setOpen(open === "limit" ? null : "limit")}>Change limit</Button>}
          {w.extendable && <Button type="button" variant="outline" size="sm" aria-expanded={open === "trial"} aria-label={`Give the trial ${w.name} more days`} onClick={() => setOpen(open === "trial" ? null : "trial")}>Give more days</Button>}
        </div>
      )}
      {open === "limit" && !pinned && <LimitForm row={w} onSaved={() => setOpen(null)} />}
      {open === "trial" && w.extendable && <ExtendForm workspace={w} maxDays={maxDays} onDone={() => setOpen(null)} />}
    </li>
  );
}

/** Days to add to a running trial. */
function ExtendForm({ workspace: w, maxDays, onDone }: { workspace: InstallationWorkspace; maxDays: number; onDone: () => void }) {
  const [days, setDays] = useState("7");
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await extendTrial(w.workspaceId, days);
          if ("error" in r) { toast.error("Not done", { description: r.error }); return; }
          toast.success(r.message ?? "Done.");
          onDone();
          router.refresh();
        });
      }}
    >
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs">
          <span className="mb-1 block">Days to add</span>
          <Input inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} maxLength={3} className="w-28" />
        </label>
        <Button type="submit" size="sm" disabled={pending || !days.trim()}>{pending ? "Saving…" : "Add days"}</Button>
      </div>
      <p className="max-w-[62ch] text-xs text-muted-foreground">A trial can end at most {maxDays} days from today. Its reminders are sent again before the new end.</p>
    </form>
  );
}

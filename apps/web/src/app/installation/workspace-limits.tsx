"use client";
// The Workspaces with their limits, on the Installation Settings page (spec 0029; GLOSSARY: Workspace Limit,
// Installation Admin): each Workspace's name, how many Metrics it holds and its limit, nothing else of it. An
// Installation Admin gives one a limit of its own or gives it back to the default; the core checks every value.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RelativeTime } from "@/components/relative-time";
import { setWorkspaceLimit } from "@/app/installation-actions";
import type { WorkspaceLimitRow } from "@ziffr/core/workspace-limits-admin";

const n = (x: number) => x.toLocaleString("en-US");

/** "50 (Small)", "No limit", with whether it is the Workspace's own or the default. */
function limitWords(r: WorkspaceLimitRow): string {
  const value = r.limit === null ? "No limit" : `${n(r.limit)}${r.label ? ` (${r.label})` : ""}`;
  return r.own ? value : `${value}, the default`;
}

/** The list, one row per Workspace, each with a form to change its limit. */
export function WorkspaceLimits({ rows, pinned = false }: { rows: WorkspaceLimitRow[]; pinned?: boolean }) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">Workspaces</h3>
      {rows.length ? (
        <ul className="divide-y divide-border rounded-[var(--radius-card)] border border-border text-sm">
          {rows.map((r) => <LimitRow key={r.workspaceId} row={r} pinned={pinned} />)}
        </ul>
      ) : <p className="text-sm">No Workspaces yet.</p>}
    </div>
  );
}

/** One Workspace: its numbers, who set its limit, and the form. */
function LimitRow({ row: r, pinned }: { row: WorkspaceLimitRow; pinned: boolean }) {
  const [open, setOpen] = useState(false);
  const [metrics, setMetrics] = useState(r.own && r.limit !== null ? String(r.limit) : "");
  const [label, setLabel] = useState(r.own ? r.label ?? "" : "");
  const [pending, start] = useTransition();
  const router = useRouter();
  const save = (value: { metrics: string; label: string } | null) => start(async () => {
    const res = await setWorkspaceLimit(r.workspaceId, value);
    if ("error" in res) { toast.error("Not saved", { description: res.error }); return; }
    toast.success(value === null ? `${r.name} has the default limit again` : `Limit of ${r.name} saved`);
    setOpen(false);
    router.refresh();
  });
  return (
    <li className="space-y-2 p-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-medium">{r.name}</span>
        <span className="fig">{n(r.metrics)} Metric{r.metrics === 1 ? "" : "s"}</span>
        <span className="text-muted-foreground">Limit: {limitWords(r)}</span>
        {r.overSince && <span className="text-[var(--color-ink-2)]">Over its limit since <RelativeTime at={r.overSince} /></span>}
        {pinned ? <span className="ml-auto text-xs text-muted-foreground">Set by Ziffr Cloud</span> : <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setOpen(!open)} aria-expanded={open}>Change</Button>}
      </div>
      {r.own && r.setAt && (
        <p className="text-xs text-muted-foreground">
          Set by {r.setBy === "cloud" ? "Ziffr Cloud" : r.setByName ?? "an Installation Admin"} <RelativeTime at={r.setAt} />{r.setBy === "cloud" && ". Saving here overrides it until Ziffr Cloud sets it again"}
        </p>
      )}
      {open && !pinned && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => { e.preventDefault(); save({ metrics, label }); }}
        >
          <label className="text-xs">
            <span className="mb-1 block">Most Metrics</span>
            <Input inputMode="numeric" value={metrics} onChange={(e) => setMetrics(e.target.value)} placeholder="No limit" className="w-28" />
          </label>
          <label className="text-xs">
            <span className="mb-1 block">Name</span>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={30} placeholder="Such as Team" className="w-40" />
          </label>
          <Button type="submit" size="sm" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
          {r.own && <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => save(null)}>Use the default</Button>}
        </form>
      )}
    </li>
  );
}

"use client";
// The Usage section of the Installation Settings page (spec 0031; GLOSSARY: Usage, Usage Key, Installation Admin): the
// Usage Key, the Workspace left out of the figures, and the last 30 days as the endpoint answers them. Counts only: the
// page gets no Workspace's content, and the one Workspace it names (to pick the one left out) comes from the limits list.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RelativeTime } from "@/components/relative-time";
import { makeUsageKey, revokeUsageKey, saveInstallationSettings } from "@/app/installation-actions";
import type { UsageDay, UsageKeyInfo } from "@ziffr/core/installation-usage";
import type { WorkspaceLimitRow } from "@ziffr/core/workspace-limits-admin";

const n = (x: unknown) => (typeof x === "number" ? x.toLocaleString("en-US") : "·");
const sum = (d: UsageDay, ...keys: string[]) => (keys.some((k) => typeof d[k] === "number") ? keys.reduce((s, k) => s + (typeof d[k] === "number" ? (d[k] as number) : 0), 0) : null);

/** The Usage Key, the exclusion and the table. */
export function UsageSection({ keyInfo, days, workspaces, excluded, excludedFromServer }: { keyInfo: UsageKeyInfo | null; days: UsageDay[]; workspaces: WorkspaceLimitRow[]; excluded: string | null; excludedFromServer: boolean }) {
  return (
    <div className="space-y-6">
      <UsageKey info={keyInfo} />
      <Exclusion workspaces={workspaces} excluded={excluded} fromServer={excludedFromServer} />
      <UsageTable days={days} />
    </div>
  );
}

/** Making and revoking the one Usage Key; the secret is shown once. */
function UsageKey({ info }: { info: UsageKeyInfo | null }) {
  const [secret, setSecret] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">Usage Key</h3>
      <p className="max-w-[62ch] text-sm text-muted-foreground">A secret that lets a program read these counts at <span className="font-mono text-xs">/api/v1/installation/usage</span>, and nothing else. There is one at a time; a new one replaces it at once.</p>
      {info ? (
        <p className="text-sm">A Usage Key is live (<span className="font-mono text-xs">zu_{info.prefix}_…</span>), made <RelativeTime at={info.createdAt} />{info.createdByName ? ` by ${info.createdByName}` : ""}; {info.lastUsedAt ? <>last used <RelativeTime at={info.lastUsedAt} />.</> : "not used yet."}</p>
      ) : <p className="text-sm">No Usage Key yet.</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={pending}
          onClick={() => {
            if (info && !window.confirm("Make a new Usage Key? The one in use stops working at once.")) return;
            start(async () => {
              const r = await makeUsageKey();
              if ("error" in r) { toast.error("Not done", { description: r.error }); return; }
              setSecret(r.secret);
              router.refresh();
            });
          }}>{info ? "Make a new Usage Key" : "Make a Usage Key"}</Button>
        {info && (
          <Button type="button" variant="outline" disabled={pending}
            onClick={() => {
              if (!window.confirm("Revoke the Usage Key? A program that uses it stops getting figures.")) return;
              start(async () => {
                const r = await revokeUsageKey();
                if ("error" in r) { toast.error("Not done", { description: r.error }); return; }
                setSecret(null);
                toast.success("The Usage Key is revoked.");
                router.refresh();
              });
            }}>Revoke</Button>
        )}
      </div>
      {secret && (
        <div role="status" className="space-y-1 text-sm">
          <p>Copy it now; this page does not show it again.</p>
          <div className="flex gap-2">
            <Input readOnly value={secret} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} aria-label="The new Usage Key" />
            <Button type="button" variant="outline" onClick={() => { void navigator.clipboard?.writeText(secret).then(() => toast.success("Copied.")); }}>Copy</Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Picks the Workspace left out of every figure, by name. */
function Exclusion({ workspaces, excluded, fromServer }: { workspaces: WorkspaceLimitRow[]; excluded: string | null; fromServer: boolean }) {
  const [value, setValue] = useState(excluded ?? "");
  const [pending, start] = useTransition();
  const router = useRouter();
  const save = () => start(async () => {
    const r = await saveInstallationSettings("usage", { ZIFFR_USAGE_EXCLUDE_WORKSPACE: value || null });
    if ("error" in r) { toast.error("Not saved", { description: r.error }); return; }
    toast.success(value ? "That Workspace is left out of the figures from the next day's count." : "No Workspace is left out any more.");
    router.refresh();
  });
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">Workspace left out</h3>
      <p className="max-w-[62ch] text-sm text-muted-foreground">Leave one Workspace out of every figure and of the count of Workspaces, usually the one that holds your own numbers, so they do not count themselves. It takes effect with the next day&apos;s count.</p>
      {fromServer ? <p className="text-sm">It is set on the server; change it there.</p> : (
        <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <label className="text-xs">
            <span className="mb-1 block">Workspace</span>
            <select value={value} onChange={(e) => setValue(e.target.value)} className="h-9 w-64 rounded-[var(--radius-input)] border border-border bg-background px-2 text-sm">
              <option value="">None</option>
              {workspaces.map((w) => <option key={w.workspaceId} value={w.workspaceId}>{w.name}</option>)}
            </select>
          </label>
          <Button type="submit" size="sm" disabled={pending || value === (excluded ?? "")}>{pending ? "Saving…" : "Save"}</Button>
        </form>
      )}
    </div>
  );
}

/** The last 30 days as a table, newest first. */
function UsageTable({ days }: { days: UsageDay[] }) {
  const rows = [...days].reverse();
  const withheld = [...new Set(rows.flatMap((d) => d.withheld))];
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">The last 30 days</h3>
      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead><tr className="text-left text-xs text-muted-foreground">
              <th scope="col" className="py-1 pr-3 font-normal">Day</th>
              {["Workspaces", "People", "Metrics", "Dashboards", "Values", "API calls", "Views"].map((h) => <th key={h} scope="col" className="py-1 pr-3 text-right font-normal">{h}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-border">
              {rows.map((d) => (
                <tr key={d.day}>
                  <th scope="row" className="py-1 pr-3 text-left font-normal">{d.day}</th>
                  <td className="fig py-1 pr-3 text-right">{n(d.workspaces)}</td>
                  <td className="fig py-1 pr-3 text-right">{n(d.people)}</td>
                  <td className="fig py-1 pr-3 text-right">{n(d.metrics)}</td>
                  <td className="fig py-1 pr-3 text-right">{n(d.dashboards)}</td>
                  <td className="fig py-1 pr-3 text-right">{n(sum(d, "values_web", "values_email", "values_slack", "values_telegram", "values_api"))}</td>
                  <td className="fig py-1 pr-3 text-right">{n(d.api_calls)}</td>
                  <td className="fig py-1 pr-3 text-right">{n(sum(d, "views_dashboards", "views_decks", "views_metrics"))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="text-sm">No figures yet. The first day is counted at 04:40 UTC, for the day before.</p>}
      {withheld.length > 0 && <p className="max-w-[62ch] text-xs text-muted-foreground">With fewer than 3 Workspaces, nothing is split by kind, Source or Pack; only totals are shown.</p>}
    </div>
  );
}

"use client";
// Feeds (GLOSSARY: Feed, Feed Key) in the workspace settings (spec 0012): each Feed with its keys, the Metrics it
// submits to and how it is doing, a form to make one, and a new key's secret once. Owners and Admins only; the core
// checks again.
import { shown, unwrap } from "@/lib/action-error";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createFeed, createFeedKey, deleteFeed, renameFeed, revokeFeedKey } from "@/app/feed-actions";
import type { FeedInfo } from "@ziffr/core/feeds";
import type { AccessLogEntry } from "@ziffr/core/access-log";
import { formatDate } from "@ziffr/core/format";

const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });

/** The workspace's Feeds and a form to make one. */
export function Feeds({ feeds, logs }: { feeds: FeedInfo[]; logs: Record<number, AccessLogEntry[]> }) {
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const run = (f: () => Promise<unknown>, ok?: string) => start(async () => { try { unwrap(await f()); if (ok) toast.success(ok); } catch (err) { toast.error("Not done", { description: shown(err) }); } });
  return (
    <section aria-labelledby="feeds-heading" className="space-y-4 border-t border-border pt-6">
      <div>
        <h2 id="feeds-heading" className="font-medium">Feeds</h2>
        <p className="max-w-prose text-sm text-muted-foreground">
          A Feed brings in values from another system, such as a CRM or a data warehouse. It runs outside Ziffr, with a Feed Key that can only record values for the Metrics that take it as a Submitter, never read them. It belongs to the workspace and keeps working when the person who set it up leaves. Choose a Feed under a Metric&rsquo;s Settings.
        </p>
      </div>
      {feeds.length === 0 && <p className="text-sm text-muted-foreground">No Feeds yet.</p>}
      <ul className="space-y-3">
        {feeds.map((f) => <FeedCard key={f.id} feed={f} logs={logs} pending={pending} run={run} />)}
      </ul>
      <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); run(async () => { unwrap(await createFeed(name)); setName(""); }, "Feed created"); }}>
        <label className="text-xs text-muted-foreground">New Feed<Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. HubSpot" maxLength={80} className="mt-1 w-56" /></label>
        <Button type="submit" variant="outline" disabled={pending || !name.trim()}>Create Feed</Button>
      </form>
    </section>
  );
}

function FeedCard({ feed: f, logs, pending, run }: { feed: FeedInfo; logs: Record<number, AccessLogEntry[]>; pending: boolean; run: (f: () => Promise<unknown>, ok?: string) => void }) {
  const [keyName, setKeyName] = useState("");
  const [expires, setExpires] = useState(inDays(90));
  const [secret, setSecret] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  return (
    <li className="space-y-3 rounded-[var(--radius-card)] border border-border p-4 text-sm">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {renaming === null ? (
          <button type="button" className="font-medium hover:underline focus-visible:outline-2 focus-visible:outline-ring" onClick={() => setRenaming(f.name)} aria-label={`Rename ${f.name}`}>{f.name}</button>
        ) : (
          <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); run(async () => { unwrap(await renameFeed(f.id, renaming)); setRenaming(null); }, "Renamed"); }}>
            <Input value={renaming} onChange={(e) => setRenaming(e.target.value)} maxLength={80} aria-label="Feed name" className="h-8 w-48" autoFocus />
            <Button size="sm" type="submit" disabled={pending || !renaming.trim()}>Save</Button>
            <Button size="sm" variant="ghost" type="button" onClick={() => setRenaming(null)}>Cancel</Button>
          </form>
        )}
        <span className="text-muted-foreground">{f.last_call ? `last call ${when(f.last_call)}` : "no calls yet"}</span>
        <span className="text-muted-foreground">last 24 hours: {f.recorded_today} recorded{f.refused_today ? <>, <span className="text-destructive">{f.refused_today} refused</span></> : null}</span>
        <button type="button" disabled={pending} onClick={() => { if (confirm(`Delete the Feed “${f.name}”? Its keys stop at once; its values stay.`)) run(() => deleteFeed(f.id), "Feed deleted"); }} aria-label={`Delete ${f.name}`} className="ml-auto flex size-8 items-center justify-center rounded-[var(--radius-input)] text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"><Trash2 aria-hidden className="size-3.5" /></button>
      </div>
      <p className="text-muted-foreground">{f.metrics.length ? <>Submits to {f.metrics.map((m) => m.name).join(", ")}.</> : "Submits to no Metric yet: choose it under a Metric’s Settings."}</p>
      {f.keys.length > 0 && (
        <ul className="divide-y divide-border rounded-[var(--radius-input)] border border-border">
          {f.keys.map((k) => (
            <li key={k.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2">
              <span className="font-medium">{k.name}</span>
              <span className="font-mono text-xs text-muted-foreground">zk_{k.prefix}_…</span>
              <span className="text-muted-foreground">{k.revoked ? "revoked" : `until ${formatDate(k.expires_on)}`}</span>
              {!k.revoked && (
                <button type="button" aria-label={`Revoke ${k.name}`} disabled={pending} onClick={() => run(() => revokeFeedKey(k.id), "Key revoked")} className="ml-auto flex size-8 items-center justify-center rounded-[var(--radius-input)] text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"><Trash2 aria-hidden className="size-3.5" /></button>
              )}
              <details className="w-full text-xs">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">{logs[k.id]?.length ? `Recent calls (last ${when(logs[k.id][0].at)})` : "No calls yet"}</summary>
                {!!logs[k.id]?.length && (
                  <table className="mt-2 w-full max-w-xl">
                    <thead className="text-left text-muted-foreground"><tr><th className="font-normal">When</th><th className="font-normal">Call</th><th className="font-normal">Result</th></tr></thead>
                    <tbody>
                      {logs[k.id].map((c, i) => (
                        <tr key={i}><td className="pr-3">{when(c.at)}</td><td className="pr-3 font-mono">{c.method} {c.route}</td><td className={c.status >= 400 ? "text-destructive" : undefined}>{c.status}</td></tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </details>
            </li>
          ))}
        </ul>
      )}
      <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); run(async () => { setSecret(unwrap(await createFeedKey(f.id, { name: keyName, expiresOn: expires }))); setKeyName(""); }, "Key created"); }}>
        <label className="text-xs text-muted-foreground">Key name<Input value={keyName} onChange={(e) => setKeyName(e.target.value)} placeholder="e.g. Nightly run" maxLength={80} className="mt-1 w-48" /></label>
        <label className="text-xs text-muted-foreground">Until<Input type="date" value={expires} min={inDays(1)} max={inDays(365)} onChange={(e) => setExpires(e.target.value)} className="mt-1" /></label>
        <Button type="submit" variant="outline" disabled={pending}>Create Feed Key</Button>
      </form>
      {secret && (
        <p>Copy it now; it is not shown again. Set it as <code className="font-mono">ZIFFR_FEED_KEY</code> where the Feed runs: <input readOnly value={secret} onFocus={(e) => e.target.select()} aria-label="New Feed Key" className="h-9 w-full max-w-xl rounded-[var(--radius-input)] border border-input bg-card px-2 font-mono text-sm" /></p>
      )}
    </li>
  );
}

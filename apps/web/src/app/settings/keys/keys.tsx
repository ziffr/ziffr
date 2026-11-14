"use client";
// Access Keys (GLOSSARY: Access Key) in the workspace settings (spec 0006): a person's own keys, and for Owners every key of the workspace.
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createKey, revokeKey } from "@/app/key-actions";
import type { AccessKeyInfo } from "@ziffr/core/access-keys";
import type { AccessLogEntry } from "@ziffr/core/access-log";
import type { Scope } from "@ziffr/core/actor";
import { formatDate } from "@ziffr/core/format";

const SCOPE_LABEL: Record<Scope, string> = { "metrics:read": "Read metrics", "values:submit": "Submit values", "metrics:write": "Create metrics" };
const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });

/** The keys the viewer may see with their recent calls (the Access Log), a form to make one, and the new secret once.
 * Admins see every key but may revoke only their own; Owners may revoke any (the core checks this again). */
export function AccessKeys({ keys, logs, people, viewer, isOwner, canCreate }: { keys: AccessKeyInfo[]; logs: Record<number, AccessLogEntry[]>; people: Record<string, string>; viewer: string; isOwner: boolean; canCreate: boolean }) {
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<Scope[]>(["metrics:read"]);
  const [expires, setExpires] = useState(inDays(90));
  const [secret, setSecret] = useState<string | null>(null);
  const run = (f: () => Promise<unknown>, ok?: string) => start(async () => { try { await f(); if (ok) toast.success(ok); } catch (err) { toast.error("Not done", { description: (err as Error).message }); } });
  return (
    <section aria-labelledby="keys-heading" className="space-y-3 border-t border-border pt-6">
      <div>
        <h2 id="keys-heading" className="font-medium">Access Keys</h2>
        <p className="text-sm text-muted-foreground">For programs that read metrics, submit values or create metrics for you, in this workspace only, through the end of the day you pick (UTC). A key sees no more than you do.</p>
      </div>
      {keys.length > 0 && (
        <ul className="divide-y divide-border rounded-[var(--radius-card)] border border-border text-sm">
          {keys.map((k) => (
            <li key={k.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2">
              <span className="font-medium">{k.name}</span>
              <span className="text-muted-foreground">{k.scopes.map((s) => SCOPE_LABEL[s as Scope] ?? s).join(", ")}</span>
              <span className="text-muted-foreground">{k.revoked ? "revoked" : `until ${formatDate(k.expires_on)}`}</span>
              {k.created_by !== viewer && <span className="text-muted-foreground">by {people[k.created_by] ?? "someone"}</span>}
              {!k.revoked && (isOwner || k.created_by === viewer) && (
                <button type="button" aria-label={`Revoke ${k.name}`} disabled={pending} onClick={() => run(() => revokeKey(k.id), "Key revoked")} className="ml-auto flex size-8 items-center justify-center rounded-[var(--radius-input)] text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"><Trash2 aria-hidden className="size-3.5" /></button>
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
      <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); run(async () => { setSecret(await createKey({ name, scopes, expiresOn: expires })); setName(""); }, "Key created"); }}>
        <label className="text-xs text-muted-foreground">Name<Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Shop export" className="mt-1 w-48" /></label>
        {/* A key may create Metrics only if its creator may (Guests may not); the core refuses it too. */}
        {(Object.keys(SCOPE_LABEL) as Scope[]).filter((s) => canCreate || s !== "metrics:write").map((s) => (
          <label key={s} className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" checked={scopes.includes(s)} onChange={(e) => setScopes(e.target.checked ? [...scopes, s] : scopes.filter((x) => x !== s))} className="size-4 accent-[var(--color-ink)]" />
            {SCOPE_LABEL[s]}
          </label>
        ))}
        <label className="text-xs text-muted-foreground">Until<Input type="date" value={expires} min={inDays(1)} max={inDays(365)} onChange={(e) => setExpires(e.target.value)} className="mt-1" /></label>
        <Button type="submit" variant="outline" disabled={pending || !scopes.length}>Create key</Button>
      </form>
      {secret && (
        <p className="text-sm">Copy it now; it is not shown again: <input readOnly value={secret} onFocus={(e) => e.target.select()} aria-label="New access key" className="h-9 w-full max-w-xl rounded-[var(--radius-input)] border border-input bg-card px-2 font-mono text-sm" /></p>
      )}
    </section>
  );
}

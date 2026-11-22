"use client";
// Webhooks (GLOSSARY: Webhook) in the workspace settings (spec 0034): each Webhook with its masked address, its events,
// a test button, its log with Send again, switch off, a new secret and a form to add one. A secret is shown once, here,
// and never read back. Owners and Admins only; the core checks again.
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import type { WebhookInfo } from "@ziffr/core/webhooks";
import type { WebhookLogEntry } from "@ziffr/core/webhook-log";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { shown, unwrap } from "@/lib/action-error";
import { createWebhook, deleteWebhook, replaceWebhookSecret, resendWebhookSend, sendTestWebhook, setWebhookEnabled, updateWebhook } from "@/app/webhook-actions";

/** The events a Webhook may choose, in words (the same list as the core's WEBHOOK_EVENTS). */
const EVENTS: { id: string; label: string }[] = [
  { id: "action.created", label: "A task or question is given" },
  { id: "action.updated", label: "A task or question changes" },
  { id: "action.answered", label: "A question is answered" },
  { id: "action.done", label: "A task is done or closed" },
  { id: "value.recorded", label: "A value is recorded" },
  { id: "value.unusual", label: "A value is unusual" },
  { id: "alert.fired", label: "A Tell step fires" },
];

const STATE: Record<string, string> = { queued: "waiting", sending: "sending", retrying: "will try again", delivered: "delivered", failed: "failed", dropped: "not sent" };
const FAILURE: Record<string, string> = { timeout: "no answer in time", network: "could not connect", refused: "address refused", too_big: "message too big", status: "the address refused it", gone: "the address is gone (410)", key: "secret missing" };
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
const OFF: Record<string, string> = { owner: "switched off", failing: "switched off because it kept failing", gone: "switched off because its address is gone" };

type Run = (f: () => Promise<unknown>, ok?: string) => void;

/** The workspace's Webhooks and a form to add one. */
export function Webhooks({ webhooks, logs, limits }: { webhooks: WebhookInfo[]; logs: Record<string, WebhookLogEntry[]>; limits: { most: number; days: number; perDay: number; trial: boolean } }) {
  const [pending, start] = useTransition();
  const [secret, setSecret] = useState<{ name: string; value: string } | null>(null);
  const run: Run = (f, ok) => start(async () => { try { await f(); if (ok) toast.success(ok); } catch (err) { toast.error("Not done", { description: shown(err) }); } });
  return (
    <section aria-labelledby="webhooks-heading" className="space-y-4 border-t border-border pt-6">
      <div>
        <h2 id="webhooks-heading" className="font-medium">Webhooks</h2>
        <p className="max-w-prose text-sm text-muted-foreground">
          A Webhook is an address outside Ziffr that gets a signed message when something happens here, such as a task given or done. A program there, such as n8n, passes it on to another system. It belongs to the workspace and keeps working when the person who set it up leaves. A Workspace can have {limits.most} Webhooks, up to {limits.perDay.toLocaleString()} messages a day; the log below keeps {limits.days} days.{limits.trial && " In a trial the address has to be public: one inside a private network is refused."}
        </p>
        <p role="note" className="mt-2 max-w-prose rounded-[var(--radius-input)] border border-border p-3 text-sm">
          Messages leave Ziffr in clear text over TLS, opened for sending: Workspace Keys seal data in the database, not on its way out, and the receiving system keeps what it gets as it sees fit. This is not end-to-end encryption. A message holds only what everyone in the Workspace may see; other things reach it with their words left out.
        </p>
      </div>
      {secret && (
        <div role="status" className="space-y-2 rounded-[var(--radius-card)] border border-border p-4 text-sm">
          <p>The secret of <strong>{secret.name}</strong>. Copy it now; it is not shown again. The receiver uses it to check each message&rsquo;s signature.</p>
          <input readOnly value={secret.value} onFocus={(e) => e.target.select()} aria-label="Webhook secret" className="h-9 w-full max-w-xl rounded-[var(--radius-input)] border border-input bg-card px-2 font-mono text-sm" />
          <Button size="sm" variant="ghost" type="button" onClick={() => setSecret(null)}>I have copied it</Button>
        </div>
      )}
      {webhooks.length === 0 && <p className="text-sm text-muted-foreground">No Webhooks yet.</p>}
      <ul className="space-y-3">
        {webhooks.map((w) => <WebhookCard key={w.id} hook={w} log={logs[w.id] ?? []} pending={pending} run={run} onSecret={(value) => setSecret({ name: w.name, value })} />)}
      </ul>
      {webhooks.length < limits.most && <AddForm pending={pending} run={run} onSecret={setSecret} />}
    </section>
  );
}

function Events({ chosen, onChange, disabled }: { chosen: string[]; onChange: (events: string[]) => void; disabled?: boolean }) {
  return (
    <fieldset className="space-y-1" disabled={disabled}>
      <legend className="text-xs text-muted-foreground">Events it gets</legend>
      {EVENTS.map((e) => (
        <label key={e.id} className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={chosen.includes(e.id)} onChange={(ev) => onChange(ev.target.checked ? [...chosen, e.id] : chosen.filter((x) => x !== e.id))} />
          {e.label}
        </label>
      ))}
    </fieldset>
  );
}

function AddForm({ pending, run, onSecret }: { pending: boolean; run: Run; onSecret: (s: { name: string; value: string }) => void }) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>(["action.created", "action.done"]);
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); run(async () => { const made = unwrap(await createWebhook({ name, url, events })); onSecret({ name, value: made.secret }); setName(""); setUrl(""); }, "Webhook added"); }}>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-muted-foreground">New Webhook<Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Microsoft To Do" maxLength={80} className="mt-1 w-56" /></label>
        <label className="min-w-64 flex-1 text-xs text-muted-foreground">Address (https)<Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://n8n.example.com/webhook/…" maxLength={2000} autoComplete="off" className="mt-1" /></label>
      </div>
      <Events chosen={events} onChange={setEvents} />
      <Button type="submit" variant="outline" disabled={pending || !name.trim() || !url.trim()}>Add Webhook</Button>
    </form>
  );
}

function WebhookCard({ hook: w, log, pending, run, onSecret }: { hook: WebhookInfo; log: WebhookLogEntry[]; pending: boolean; run: Run; onSecret: (value: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(w.name);
  const [events, setEvents] = useState<string[]>(w.events);
  const icon = "flex size-8 items-center justify-center rounded-[var(--radius-input)] text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring";
  return (
    <li className="space-y-3 rounded-[var(--radius-card)] border border-border p-4 text-sm">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="font-medium">{w.name}</span>
        <span className="font-mono text-xs text-muted-foreground">{w.address}</span>
        {!w.enabled && <span className="text-destructive">{OFF[w.disabledReason ?? "owner"]}</span>}
        <button type="button" disabled={pending} onClick={() => { if (confirm(`Delete the Webhook “${w.name}”? Nothing more is sent to it.`)) run(async () => unwrap(await deleteWebhook(w.id)), "Webhook deleted"); }} aria-label={`Delete ${w.name}`} className={`ml-auto ${icon}`}><Trash2 aria-hidden className="size-3.5" /></button>
      </div>
      {editing ? (
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); run(async () => { unwrap(await updateWebhook(w.id, { name, events })); setEditing(false); }, "Saved"); }}>
          <label className="text-xs text-muted-foreground">Name<Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className="mt-1 w-56" /></label>
          <Events chosen={events} onChange={setEvents} />
          <div className="flex gap-2"><Button size="sm" type="submit" disabled={pending || !name.trim()}>Save</Button><Button size="sm" variant="ghost" type="button" onClick={() => { setEditing(false); setName(w.name); setEvents(w.events); }}>Cancel</Button></div>
        </form>
      ) : (
        <p className="text-muted-foreground">{w.events.length ? <>Gets: {w.events.map((e) => EVENTS.find((x) => x.id === e)?.label ?? e).join("; ")}.</> : "Gets no events yet: choose some."} {w.replacingSecret && "The old secret still signs for 24 hours after a new one."}</p>
      )}
      <div className="flex flex-wrap gap-2">
        {!editing && <Button size="sm" variant="outline" disabled={pending} onClick={() => setEditing(true)}>Name and events</Button>}
        <Button size="sm" variant="outline" disabled={pending || !w.enabled} onClick={() => run(async () => unwrap(await sendTestWebhook(w.id)), "Test event sent")}>Send test event</Button>
        <Button size="sm" variant="outline" disabled={pending} onClick={() => { if (confirm(`Replace the secret of “${w.name}”? The old one keeps signing for 24 hours, so the receiver can switch without a gap.`)) run(async () => onSecret(unwrap(await replaceWebhookSecret(w.id))), "New secret made"); }}>Replace secret</Button>
        <Button size="sm" variant="outline" disabled={pending} onClick={() => run(async () => unwrap(await setWebhookEnabled(w.id, !w.enabled)), w.enabled ? "Switched off" : "Switched on; nothing missed is resent")}>{w.enabled ? "Switch off" : "Switch on"}</Button>
      </div>
      <Log log={log} name={w.name} pending={pending} run={run} canResend={w.enabled} />
    </li>
  );
}

function Log({ log, name, pending, run, canResend }: { log: WebhookLogEntry[]; name: string; pending: boolean; run: Run; canResend: boolean }) {
  if (!log.length) return <p className="text-muted-foreground">Nothing sent yet.</p>;
  return (
    <details>
      <summary className="cursor-pointer text-muted-foreground">Log of {name}: {log.length} {log.length === 1 ? "send" : "sends"}</summary>
      <table className="mt-2 w-full text-left text-xs">
        <thead><tr className="text-muted-foreground"><th className="py-1 pr-3 font-normal">When</th><th className="pr-3 font-normal">Event</th><th className="pr-3 font-normal">About</th><th className="pr-3 font-normal">State</th><th className="pr-3 font-normal">Answer</th><th className="pr-3 font-normal">Tries</th><th /></tr></thead>
        <tbody>
          {log.map((s) => (
            <tr key={s.id} className="border-t border-border">
              <td className="py-1 pr-3">{when(s.at)}</td><td className="pr-3 font-mono">{s.type}</td><td className="pr-3">{s.about ?? ""}</td>
              <td className={`pr-3 ${s.state === "failed" ? "text-destructive" : ""}`}>{STATE[s.state] ?? s.state}</td>
              <td className="pr-3">{[s.statusCode, s.failure ? FAILURE[s.failure] ?? s.failure : null].filter(Boolean).join(", ")}</td>
              <td className="pr-3">{s.attempts}</td>
              <td>{s.state === "failed" && canResend && <button type="button" disabled={pending} className="underline" onClick={() => run(async () => unwrap(await resendWebhookSend(s.id)), "Sent again")}>Send again</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

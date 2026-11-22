"use client";
// Your Webhooks (GLOSSARY: Personal Webhook; spec 0037): each of the person's own Webhooks with its masked address,
// the events and Metrics it hears, a test button, its log, a new secret, switch off and delete, and a form to add one.
// A secret is shown once, here, and never read back. What a Webhook hears is what this person may see when it is sent.
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import type { PersonalWebhookInfo } from "@ziffr/core/personal-webhooks";
import type { WebhookLogEntry } from "@ziffr/core/webhook-log";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { shown, unwrap } from "@/lib/action-error";
import { Events, Log, OFF, type Run } from "@/app/settings/webhooks/webhooks";
import { createPersonalWebhook, deletePersonalWebhook, replacePersonalWebhookSecret, sendTestPersonalWebhook, setPersonalWebhookEnabled, updatePersonalWebhook } from "@/app/personal-webhook-actions";

/** What a Personal Webhook may choose, in words (a subset of the core's events; `ping` is the test button). */
const EVENTS: { id: string; label: string }[] = [
  { id: "action.created", label: "A task or question is given to you or asked by you" },
  { id: "action.updated", label: "One of them changes" },
  { id: "action.answered", label: "One of your questions is answered" },
  { id: "action.done", label: "One of them is done or closed" },
  { id: "value.recorded", label: "A value is recorded (Metrics you pick)" },
  { id: "value.unusual", label: "A value is unusual (Metrics you pick)" },
  { id: "alert.fired", label: "One of your Alerts fires (choose this Webhook on the Alert)" },
];
const VALUE_EVENTS = ["value.recorded", "value.unusual"];
type Pick = { id: number; name: string };

/** The person's own Webhooks and a form to add one. */
export function YourWebhooks({ webhooks, logs, metrics, names, limits }: { webhooks: PersonalWebhookInfo[]; logs: Record<string, WebhookLogEntry[]>; metrics: Pick[]; names: Pick[]; limits: { most: number; workspaceMost: number; perDay: number; metrics: number; days: number; trial: boolean } }) {
  const [pending, start] = useTransition();
  const [secret, setSecret] = useState<{ name: string; value: string } | null>(null);
  const run: Run = (f, ok) => start(async () => { try { await f(); if (ok) toast.success(ok); } catch (err) { toast.error("Not done", { description: shown(err) }); } });
  return (
    <section aria-labelledby="your-webhooks-heading" className="space-y-4">
      <div>
        <h2 id="your-webhooks-heading" className="font-medium">Your Webhooks</h2>
        <p className="max-w-prose text-sm text-muted-foreground">
          A Webhook is an address outside Ziffr, such as an n8n flow of yours, that gets a signed message when something happens. Yours hears only what you may see in this Workspace, at the moment it is sent, and acts as you: ticking a task off in your own list marks it done here as you. You can have {limits.most} here, up to {limits.perDay.toLocaleString()} messages a day; the log keeps {limits.days} days.{limits.trial && " In a trial the address has to be public: one inside a private network is refused."}
        </p>
        <p role="note" className="mt-2 max-w-prose rounded-[var(--radius-input)] border border-border p-3 text-sm">
          Messages leave Ziffr in clear text over TLS, opened for sending: Workspace Keys seal data in the database, not on its way out, and the receiving system keeps what it gets as it sees fit. This is not end-to-end encryption. You answer for where your data goes; an Owner or Admin can see that you have a Webhook, where it points (the address masked) and when it sent, never what it sent, and can remove it.
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
        {webhooks.map((w) => <Card key={w.id} hook={w} log={logs[w.id] ?? []} metrics={metrics} names={names} max={limits.metrics} pending={pending} run={run} onSecret={(value) => setSecret({ name: w.name, value })} />)}
      </ul>
      {webhooks.length < limits.most && <AddForm metrics={metrics} max={limits.metrics} pending={pending} run={run} onSecret={setSecret} />}
    </section>
  );
}

/** The Metrics the person picks for the value events, from those they see now. */
function Metrics({ metrics, chosen, onChange, max, hidden = 0 }: { metrics: Pick[]; chosen: number[]; onChange: (ids: number[]) => void; max: number; hidden?: number }) {
  if (!metrics.length && !hidden) return <p className="text-xs text-muted-foreground">You see no Metrics to pick yet.</p>;
  return (
    <fieldset className="space-y-1">
      <legend className="text-xs text-muted-foreground">Metrics whose values it hears (up to {max})</legend>
      <div className="max-h-40 space-y-1 overflow-y-auto">
        {metrics.map((m) => (
          <label key={m.id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={chosen.includes(m.id)} disabled={!chosen.includes(m.id) && chosen.length >= max} onChange={(e) => onChange(e.target.checked ? [...chosen, m.id] : chosen.filter((x) => x !== m.id))} />
            {m.name}
          </label>
        ))}
      </div>
      {hidden > 0 && <p className="text-xs text-muted-foreground">{hidden === 1 ? "One picked Metric is one" : `${hidden} picked Metrics are ones`} you no longer see: nothing is sent for {hidden === 1 ? "it" : "them"}.</p>}
    </fieldset>
  );
}

function AddForm({ metrics, max, pending, run, onSecret }: { metrics: Pick[]; max: number; pending: boolean; run: Run; onSecret: (s: { name: string; value: string }) => void }) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>([]);
  const [picked, setPicked] = useState<number[]>([]);
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); run(async () => { const made = unwrap(await createPersonalWebhook({ name, url, events, metricIds: events.some((x) => VALUE_EVENTS.includes(x)) ? picked : [] })); onSecret({ name, value: made.secret }); setName(""); setUrl(""); setEvents([]); setPicked([]); }, "Webhook added"); }}>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-muted-foreground">New Webhook<Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. My task list" maxLength={80} className="mt-1 w-56" /></label>
        <label className="min-w-64 flex-1 text-xs text-muted-foreground">Address (https)<Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://n8n.example.com/webhook/…" maxLength={2000} autoComplete="off" className="mt-1" /></label>
      </div>
      <Events chosen={events} onChange={setEvents} list={EVENTS} />
      {events.some((x) => VALUE_EVENTS.includes(x)) && <Metrics metrics={metrics} chosen={picked} onChange={setPicked} max={max} />}
      <Button type="submit" variant="outline" disabled={pending || !name.trim() || !url.trim()}>Add Webhook</Button>
    </form>
  );
}

function Card({ hook: w, log, metrics, names, max, pending, run, onSecret }: { hook: PersonalWebhookInfo; log: WebhookLogEntry[]; metrics: Pick[]; names: Pick[]; max: number; pending: boolean; run: Run; onSecret: (value: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(w.name);
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>(w.events);
  const [picked, setPicked] = useState<number[]>(w.metricIds);
  // Picks the person lost sight of come as a count only, never named or numbered.
  const hidden = w.hiddenMetrics;
  const reset = () => { setEditing(false); setName(w.name); setUrl(""); setEvents(w.events); setPicked(w.metricIds); };
  const icon = "flex size-8 items-center justify-center rounded-[var(--radius-input)] text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring";
  const named = names.filter((m) => w.metricIds.includes(m.id)).map((m) => m.name);
  return (
    <li className="space-y-3 rounded-[var(--radius-card)] border border-border p-4 text-sm">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="font-medium">{w.name}</span>
        <span className="font-mono text-xs text-muted-foreground">{w.address}</span>
        {!w.enabled && <span className="text-destructive">{OFF[w.disabledReason ?? "owner"]}</span>}
        <button type="button" disabled={pending} onClick={() => { if (confirm(`Delete the Webhook “${w.name}”? Nothing more is sent to it.`)) run(async () => unwrap(await deletePersonalWebhook(w.id)), "Webhook deleted"); }} aria-label={`Delete ${w.name}`} className={`ml-auto ${icon}`}><Trash2 aria-hidden className="size-3.5" /></button>
      </div>
      {editing ? (
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); run(async () => { unwrap(await updatePersonalWebhook(w.id, { name, ...(url.trim() ? { url } : {}), events, metricIds: events.some((x) => VALUE_EVENTS.includes(x)) ? picked : [] })); reset(); }, "Saved"); }}>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs text-muted-foreground">Name<Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className="mt-1 w-56" /></label>
            <label className="min-w-64 flex-1 text-xs text-muted-foreground">New address (https), only to change it<Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={w.address} maxLength={2000} autoComplete="off" className="mt-1" /></label>
          </div>
          <Events chosen={events} onChange={setEvents} list={EVENTS} />
          {events.some((x) => VALUE_EVENTS.includes(x)) && <Metrics metrics={metrics} chosen={picked} onChange={setPicked} max={max} hidden={hidden} />}
          <div className="flex gap-2"><Button size="sm" type="submit" disabled={pending || !name.trim()}>Save</Button><Button size="sm" variant="ghost" type="button" onClick={reset}>Cancel</Button></div>
        </form>
      ) : (
        <>
          <p className="text-muted-foreground">{w.events.length ? <>Gets: {w.events.map((e) => EVENTS.find((x) => x.id === e)?.label ?? e).join("; ")}.</> : "Gets no events yet: choose some."} {w.replacingSecret && "The old secret still signs for 24 hours after a new one."}</p>
          {w.events.some((e) => VALUE_EVENTS.includes(e)) && (
            <p className="text-muted-foreground">{w.metricIds.length || hidden ? <>Values of: {named.length ? named.join(", ") : "none you see now"}{hidden > 0 && `${named.length ? "; " : ": "}${hidden} you no longer see (nothing is sent for ${hidden === 1 ? "it" : "them"})`}.</> : "No Metrics picked: it hears no values."}</p>
          )}
          {w.paused && <p className="text-destructive">Your Workspace has paused personal Webhooks: nothing is sent.</p>}
        </>
      )}
      <div className="flex flex-wrap gap-2">
        {!editing && <Button size="sm" variant="outline" disabled={pending} onClick={() => setEditing(true)}>Change</Button>}
        <Button size="sm" variant="outline" disabled={pending || !w.enabled} onClick={() => run(async () => unwrap(await sendTestPersonalWebhook(w.id)), "Test event sent")}>Send test event</Button>
        <Button size="sm" variant="outline" disabled={pending} onClick={() => { if (confirm(`Replace the secret of “${w.name}”? The old one keeps signing for 24 hours, so the receiver can switch without a gap.`)) run(async () => onSecret(unwrap(await replacePersonalWebhookSecret(w.id))), "New secret made"); }}>Replace secret</Button>
        <Button size="sm" variant="outline" disabled={pending} onClick={() => run(async () => unwrap(await setPersonalWebhookEnabled(w.id, !w.enabled)), w.enabled ? "Switched off" : "Switched on; nothing missed is resent")}>{w.enabled ? "Switch off" : "Switch on"}</Button>
      </div>
      <Log log={log} name={w.name} pending={pending} run={run} canResend={false} />
    </li>
  );
}

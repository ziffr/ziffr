"use client";
// Personal Webhooks (GLOSSARY: Personal Webhook; spec 0037) in the workspace settings: the switch "People may add their
// own Webhooks" and the list of every Personal Webhook with whose it is, the masked address, its state, its last send
// and Remove. Owners and Admins only; the core checks again. What a Webhook sent is its person's: the log shows
// statuses and times, never the messages.
import { useTransition } from "react";
import { toast } from "sonner";
import type { PersonalWebhookAdminInfo } from "@ziffr/core/personal-webhooks";
import type { WebhookLogEntry } from "@ziffr/core/webhook-log";
import { Button } from "@/components/ui/button";
import { shown, unwrap } from "@/lib/action-error";
import { removePersonalWebhook, setPersonalWebhooksAllowed } from "@/app/personal-webhook-actions";
import { EVENTS, Log, OFF, when, type Run } from "./webhooks";

/** The switch and the list of Personal Webhooks. */
export function PersonalWebhooks({ allowed, webhooks, logs }: { allowed: boolean; webhooks: Omit<PersonalWebhookAdminInfo, "ownerId">[]; logs: Record<string, WebhookLogEntry[]> }) {
  const [pending, start] = useTransition();
  const run: Run = (f, ok) => start(async () => { try { await f(); if (ok) toast.success(ok); } catch (err) { toast.error("Not done", { description: shown(err) }); } });
  return (
    <section aria-labelledby="personal-webhooks-heading" className="space-y-4 border-t border-border pt-6">
      <div>
        <h2 id="personal-webhooks-heading" className="font-medium">Personal Webhooks</h2>
        <p className="max-w-prose text-sm text-muted-foreground">
          A Personal Webhook is an address that one person adds for themselves under You → Your Webhooks. It hears only what that person may see, at the moment it is sent, and acts as them. It ends when the person leaves the Workspace.
        </p>
      </div>
      <label className="flex max-w-prose items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" checked={allowed} disabled={pending} onChange={(e) => {
          const on = e.target.checked;
          if (!on && !confirm("Switch this off? Every Personal Webhook is paused: nothing is sent to them, and what happens in the meantime is not sent later.")) return;
          run(async () => unwrap(await setPersonalWebhooksAllowed(on)), on ? "People may add their own Webhooks" : "Personal Webhooks are paused");
        }} />
        <span><strong>People may add their own Webhooks</strong><br /><span className="text-muted-foreground">Off unless you switch it on. Off pauses every Personal Webhook and hides Add on their pages; on again resumes them. Both are in the Audit log.</span></span>
      </label>
      {!allowed && webhooks.length > 0 && <p role="status" className="text-sm text-destructive">Paused: the switch is off, so nothing is sent to the Personal Webhooks below.</p>}
      {webhooks.length === 0 ? <p className="text-sm text-muted-foreground">No Personal Webhooks yet.</p> : (
        <ul className="space-y-3">
          {webhooks.map((w) => (
            <li key={w.id} className="space-y-2 rounded-[var(--radius-card)] border border-border p-4 text-sm">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="font-medium">{w.name}</span>
                <span>of {w.ownerName || "a person"}</span>
                <span className="font-mono text-xs text-muted-foreground">{w.address}</span>
                {!w.enabled && <span className="text-destructive">{OFF[w.disabledReason ?? "owner"]}</span>}
                <span className="text-muted-foreground">{w.lastSendAt ? `last send ${when(w.lastSendAt)}` : "nothing sent yet"}</span>
                <Button size="sm" variant="outline" className="ml-auto" disabled={pending} aria-label={`Remove ${w.name} of ${w.ownerName || "a person"}`} onClick={() => { if (confirm(`Remove the Webhook “${w.name}” of ${w.ownerName || "this person"}? Nothing more is sent to it, and they are told that you removed it.`)) run(async () => unwrap(await removePersonalWebhook(w.id)), "Webhook removed"); }}>Remove</Button>
              </div>
              <p className="text-muted-foreground">{w.events.length ? <>Hears: {w.events.map((e) => EVENTS.find((x) => x.id === e)?.label ?? e).join("; ")}.</> : "Hears no events."}</p>
              <Log log={logs[w.id] ?? []} name={w.name} pending={pending} run={run} canResend={false} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

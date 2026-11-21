"use client";
// Connectors, Delivery Preferences and the Outbox (GLOSSARY). Email goes out for real once it is set up (spec 0004);
// for the simulated Connectors, and in the demo, the buttons under each Delivery play the recipient answering: they say
// what would happen, and save nothing (#271).
import { isActionError, shown as refusal, unwrap, type ActionError } from "@/lib/action-error";
import { RelativeTime } from "@/components/relative-time";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { BellRing, CheckCircle2, Hash, Mail, MessageCircle, MessageSquare, Send, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { askForMissingValues, emailRemindersAgain, sendDueReminders, setPreference, simulatePromptAnswer, simulateReply, simulateTicketClose } from "@/app/connector-actions";
import { CAPABILITY_LABEL, CONNECTORS, CONNECTOR_IDS, type ConnectorId, type PreferenceKind } from "@ziffr/core/connectors/index";
import type { Profile } from "@ziffr/core/types";
import { cn } from "@/lib/utils";
import { DemoControls } from "@/components/demo-controls";
import { WayLine } from "@/components/way-state";
import type { WayState } from "@ziffr/core/what-works-here";

export type PrefRow = { user_id: string | null; kind: PreferenceKind; connector: ConnectorId };
export type DeliveryRow = {
  id: number; connector: ConnectorId; recipient_id: string; sender_id: string | null; kind: string; action_id: number | null;
  subject: string; body: string; external_ref: string | null; status: "sent" | "answered" | "closed"; created_at: string;
  /** Whether an email really went out (spec 0004); "outbox" is recorded only, as for the simulated Connectors. */
  mail_state: "outbox" | "queued" | "sending" | "sent" | "failed"; last_error: string | null;
  actions: { kind: "question" | "task"; status: string; question: string } | null;
  prompts: { source: string; answered_at: string | null; submitter_id: string; metric_id: number } | null;
};
type TokenRow = { code: string; metric_id: number; submitter_id: string };

const ICON: Record<ConnectorId, typeof Mail> = { slack: MessageSquare, email: Mail, telegram: Send, whatsapp: MessageCircle, tickets: Ticket };
const KINDS: { id: PreferenceKind; label: string }[] = [
  { id: "question", label: "Questions" },
  { id: "task", label: "Tasks" },
  { id: "reminder", label: "Reminders" },
  { id: "update", label: "Replies and updates" },
];

/** Connectors, Delivery Preferences and the Outbox. `email` says whether this Ziffr sends real email, and takes
 * replies; `optedOut`, whether the viewer stopped Prompts and reminders by email here (spec 0004); `slack`, whether a
 * Slack workspace is connected (spec 0007). */
export function ConnectorsScreen({ viewer, isOwner, people, prefs, deliveries, tokens, optedOut, email, demo, slack = "off", telegram = "off", ways = [] }: { viewer: string; isOwner: boolean; people: Profile[]; prefs: PrefRow[]; deliveries: DeliveryRow[]; tokens: TokenRow[]; optedOut: boolean; email: "off" | "send" | "both"; demo: boolean; slack?: "off" | "connected"; telegram?: "off" | "on"; ways?: WayState[] }) {
  const [pending, start] = useTransition();
  // Asking and reminding by hand is what the schedule does each morning: in the demo anyone sees it (and is told the
  // demo can't be changed); elsewhere owners and admins get it as a fallback, explained, and members do not see it.
  const runNow = (
    <span className="flex flex-wrap gap-2">
      <Button variant="outline" disabled={pending} onClick={() => start(async () => { const n = await askForMissingValues(); if (isActionError(n)) { toast.error("Not done", { description: n.error }); return; } toast.success(n ? `Made ${n} request${n === 1 ? "" : "s"} for missing values. The Outbox shows which have gone out.` : "Nobody is missing a value for the current period"); })}>
        <Hash aria-hidden /> Ask for missing values now
      </Button>
      <Button variant="outline" disabled={pending} onClick={() => start(async () => { const n = await sendDueReminders(); if (isActionError(n)) { toast.error("Not done", { description: n.error }); return; } toast.success(n ? `Made ${n} reminder${n === 1 ? "" : "s"} for open tasks. The Outbox shows which have gone out.` : "No open tasks due in the next two days"); })}>
        <BellRing aria-hidden /> Send due reminders now
      </Button>
    </span>
  );
  const name = (id: string | null) => people.find((p) => p.id === id)?.name.split(" ")[0] ?? "Someone";
  const pref = (user: string | null, kind: PreferenceKind) => prefs.find((p) => p.user_id === user && p.kind === kind)?.connector ?? null;

  return (
    <div className="space-y-12">
      {optedOut && (
        <p role="status" className="stock flex flex-wrap items-center gap-3 rounded-[var(--radius-card)] p-4 text-sm">
          You stopped requests for numbers and reminders by email in this workspace.
          <Button size="sm" variant="outline" disabled={pending} onClick={() => start(async () => { const r = await emailRemindersAgain(); if (isActionError(r)) { toast.error("Not done", { description: r.error }); return; } toast.success("You get them by email again"); })}>Get them by email again</Button>
        </p>
      )}
      <section aria-labelledby="c-h">
        <h2 id="c-h" className="mb-3 text-[length:var(--text-lg)]">Connected systems</h2>
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {CONNECTOR_IDS.map((id) => {
            const c = CONNECTORS[id];
            const Icon = ICON[id];
            return (
              <li key={id} className="stock rounded-[var(--radius-card)] p-4 text-sm">
                <div className="flex items-center gap-2 font-semibold"><Icon aria-hidden className="size-4" /> {c.label}</div>
                <p className="mt-1 text-muted-foreground">{c.blurb}</p>
                <ul className="mt-3 space-y-0.5 text-xs">
                  {c.capabilities.map((k) => <li key={k} className="flex items-center gap-1.5"><CheckCircle2 aria-hidden className="size-3.5 text-[var(--color-success)]" /> {CAPABILITY_LABEL[k]}</li>)}
                </ul>
                {c.sourceId && demo && <Link href="/sources" className="mt-3 inline-block text-xs underline">Try sending a value</Link>}
                {/* Real, simulated or off, from the core's whatWorksHere (spec 0021), so it says what the queue does. */}
                {ways.find((w) => w.way === id) ? <WayLine way={ways.find((w) => w.way === id)!} className="mt-3" /> : (
                  <p className="mt-3 text-xs text-muted-foreground">{id === "email" && email !== "off" ? (email === "both" ? "Sends real email; replies come back." : "Sends real email; answers are given in Ziffr.") : id === "slack" && slack === "connected" ? "Sends real direct messages; answers in the thread come back." : id === "telegram" && telegram === "on" ? "Sends real messages to everyone who connected their Telegram; replies come back." : demo ? "Played in the demo: answer below as the recipient." : "Not connected yet. Ziffr keeps what it would send in the Outbox below."}</p>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="p-h">
        <h2 id="p-h" className="text-[length:var(--text-lg)]">Who gets what, where</h2>
        <p className="mt-1 mb-3 max-w-prose text-sm text-muted-foreground">Everyone chooses for themselves; the team default covers the rest. Replies about a question or task stay where it started, so a ticket collects its comments. Whoever asks can pick another way for one message.</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Person</th>
                {KINDS.map((k) => <th key={k.id} className="py-2 pr-3 font-medium">{k.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {[{ id: null as string | null, label: "Team default", can: isOwner }, ...people.filter((p) => !p.contact).map((p) => ({ id: p.id as string | null, label: p.name, can: p.id === viewer }))].map((row) => (
                <tr key={row.id ?? "team"} className="border-t border-border">
                  <th scope="row" className="py-2 pr-3 text-left font-medium">{row.label}{row.id === viewer && <span className="font-normal text-muted-foreground">, you</span>}</th>
                  {KINDS.map((k) => (
                    <td key={k.id} className="py-2 pr-3">
                      <select
                        aria-label={`${k.label} for ${row.label}`}
                        disabled={!row.can || pending}
                        value={pref(row.id, k.id) ?? ""}
                        onChange={(e) => start(async () => { const r = await setPreference(row.id, k.id, (e.target.value || null) as ConnectorId | null); if (isActionError(r)) toast.error("Not saved", { description: r.error }); })}
                        className="h-9 w-full rounded-[var(--radius-input)] border border-input bg-card px-2 disabled:opacity-70"
                      >
                        {row.id !== null && <option value="">Team default ({CONNECTORS[pref(null, k.id) ?? "email"].label})</option>}
                        {CONNECTOR_IDS.map((c) => <option key={c} value={c}>{CONNECTORS[c].label}</option>)}
                      </select>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="o-h">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="o-h" className="text-[length:var(--text-lg)]">Outbox</h2>
            <p className="mt-1 text-sm text-muted-foreground">What Ziffr sent, newest first, as it looks on the other side.{demo ? " Answer as the recipient to see what would come back." : ""}</p>
          </div>
        </div>
        {demo ? (
          <DemoControls className="mt-4" hint="In a real workspace Ziffr asks for missing values and reminds people of due tasks by itself each morning, and an Owner or Admin can start it here.">{runNow}</DemoControls>
        ) : isOwner && (
          <details className="mt-4 rounded-[var(--radius-card)] border border-border p-4 text-sm">
            <summary className="cursor-pointer font-medium">Run now</summary>
            <p className="mt-2 mb-3 max-w-prose text-muted-foreground">Ziffr does this by itself every morning. Use it when the schedule did not run, or right after adding people: it asks everyone whose value for the current period is missing, and reminds people of tasks due in the next two days.</p>
            {runNow}
          </details>
        )}
        {deliveries.length === 0 ? (
          <p className="mt-4 rounded-[var(--radius-card)] border border-dashed border-[var(--color-rule-2)] p-6 text-sm text-muted-foreground">Nothing sent yet. On a dashboard, open a widget&rsquo;s ⋯ menu to ask a question or assign a task.</p>
        ) : (
          <ol className="mt-4 space-y-3">
            {deliveries.map((d) => <DeliveryCard key={d.id} d={d} demo={demo} to={name(d.recipient_id)} formCode={d.prompts ? tokens.find((t) => t.metric_id === d.prompts!.metric_id && t.submitter_id === d.prompts!.submitter_id)?.code : undefined} />)}
          </ol>
        )}
      </section>
    </div>
  );
}

/** One Delivery, drawn the way its system shows it. */
function DeliveryCard({ d, to, formCode, demo }: { d: DeliveryRow; to: string; formCode?: string; demo: boolean }) {
  const [reply, setReply] = useState("");
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const c = CONNECTORS[d.connector];
  const Icon = ICON[d.connector];
  const isPrompt = d.kind === "prompt" && d.prompts;
  const answerHere = isPrompt && (d.prompts!.source === "slack" || d.prompts!.source === "mail" || d.prompts!.source === "telegram") && !d.prompts!.answered_at;
  // Playing the recipient works in the demo only; the core refuses it elsewhere, so the buttons stay away too.
  const canReply = demo && ((c.capabilities.includes("replies") && d.action_id) || answerHere);
  const canClose = demo && d.connector === "tickets" && d.actions?.kind === "task" && d.actions.status === "open";
  // In the demo nothing is saved: the answer says what would have happened.
  const play = (f: () => Promise<string | ActionError>) => start(async () => { try { toast.info("Not saved: this is the demo", { description: unwrap(await f()) }); setOpen(false); setReply(""); } catch (err) { toast.error("Not done", { description: refusal(err) }); } });

  return (
    <li className="stock rounded-[var(--radius-card)] p-4 text-sm">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <Icon aria-hidden className="size-4 text-foreground" />
        <span className="font-medium text-foreground">{c.label}</span>
        <span>to {to}</span>
        <RelativeTime at={d.created_at} />
        {d.status !== "sent" && <span className="rounded-[var(--radius-input)] border border-border px-1.5">{d.status === "answered" ? "Answered" : "Closed"}</span>}
        {d.mail_state !== "outbox" && <MailState state={d.mail_state} error={d.last_error} connector={d.connector} />}
        {/* What never left Ziffr says so, with the reason a trial kept it back when there is one (spec 0021). */}
        {d.mail_state === "outbox" && <span title={d.last_error ?? undefined} className="rounded-[var(--radius-input)] border border-border px-1.5">{d.last_error ?? "Simulated, not sent"}</span>}
        {d.action_id && <Link href={`/actions/${d.action_id}`} className="ml-auto underline">Open thread</Link>}
      </div>
      <div className={cn("mt-2 rounded-[var(--radius-input)] p-3", d.connector === "slack" && "border-l-4 border-[var(--color-rule-2)] bg-[var(--muted)]", d.connector === "whatsapp" && "max-w-md rounded-2xl rounded-tl-sm bg-[color-mix(in_oklab,var(--color-success)_10%,var(--card))]", d.connector === "email" && "border border-border", d.connector === "tickets" && "border border-border bg-[var(--muted)]")}>
        <div className="font-medium">{d.subject}</div>
        <pre className="mt-1 font-[family-name:var(--font-body)] text-sm whitespace-pre-wrap text-muted-foreground">{shown(d)}</pre>
      </div>
      {isPrompt && !answerHere && !d.prompts!.answered_at && formCode && (
        <Link href={`/submit/${formCode}`} className="mt-2 inline-flex min-h-8 items-center px-3 text-sm underline">Open the form as {to}</Link>
      )}
      {(canReply || canClose) && (
        <div className="mt-2">
          {!open ? (
            <div className="flex flex-wrap gap-1">
              {canReply && <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>Answer as {to}</Button>}
              {canClose && <Button variant="ghost" size="sm" disabled={pending} onClick={() => play(() => simulateTicketClose(d.id))}>Close ticket as {to}</Button>}
            </div>
          ) : (
            <form className="space-y-2" onSubmit={(e) => {
              e.preventDefault();
              if (isPrompt) start(async () => {
                const r = await simulatePromptAnswer(d.id, reply);
                if (isActionError(r)) { toast.error("Not recorded", { description: r.error }); return; }
                (r.ok ? toast.info : toast.error)(r.ok ? "Would be recorded; not saved in the demo" : "Would not be recorded", { description: r.detail });
                if (r.ok) { setOpen(false); setReply(""); }
              });
              else play(() => simulateReply(d.id, reply));
            }}>
              <Textarea rows={2} value={reply} onChange={(e) => setReply(e.target.value)} placeholder={`Answer as ${to} in ${c.label}`} aria-label={`Answer as ${to}`} autoFocus />
              <p className="text-xs text-muted-foreground">{isPrompt ? "Reply with the number, e.g. 42, or a breakdown with one row per line." : c.replyHint}</p>
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={pending || !reply.trim()}>Send in {c.label}</Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
              </div>
            </form>
          )}
        </div>
      )}
    </li>
  );
}

const MAIL_STATE: Record<Exclude<DeliveryRow["mail_state"], "outbox">, string> = { queued: "Waiting to send", sending: "Sending", sent: "Emailed", failed: "Not sent" };

/** Whether an email, Slack or Telegram Delivery really went out, and why not when it failed. */
function MailState({ state, error, connector }: { state: Exclude<DeliveryRow["mail_state"], "outbox">; error: string | null; connector: string }) {
  return (
    <span title={state === "failed" && error ? error : undefined} className={cn("rounded-[var(--radius-input)] border px-1.5", state === "failed" ? "border-destructive text-destructive" : "border-border")}>
      {state === "sent" && connector === "slack" ? "Sent on Slack" : state === "sent" && connector === "telegram" ? "Sent on Telegram" : MAIL_STATE[state]}{state === "failed" && error ? `: ${error}` : ""}
    </span>
  );
}

/** A Delivery's text as plain words: Slack's link and bold markup taken out, and its escapes undone. */
function shown(d: DeliveryRow): string {
  const plain = d.body.replace(/<([^|>]+)\|([^>]+)>/g, "$2").replace(/\*([^*]+)\*/g, "$1");
  return d.connector === "slack" ? plain.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&") : plain;
}

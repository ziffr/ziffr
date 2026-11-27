"use client";
// Workspace → Connectors → Outbox (GLOSSARY: Delivery, Outbox). Email goes out for real once it is set up (spec 0004);
// for the simulated Connectors, and in the demo, the buttons under each Delivery play the recipient answering: they say
// what would happen, and save nothing (#271). Where visitors may change the demo (spec 0051) they record the answer, as the
// real Connector would; nothing is ever sent.
import { isActionError, shown as refusal, unwrap, type ActionError } from "@/lib/action-error";
import { RelativeTime } from "@/components/relative-time";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { BellRing, Hash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { askForMissingValues, recordSimulatedPromptAnswer, recordSimulatedReply, recordSimulatedTicketClose, sendDueReminders, simulatePromptAnswer, simulateReply, simulateTicketClose } from "@/app/connector-actions";
import { CONNECTORS, type ConnectorId } from "@ziffr/core/connectors/index";
import type { Profile } from "@ziffr/core/types";
import { cn } from "@/lib/utils";
import { DemoControls } from "@/components/demo-controls";
import { ICON } from "./channels";

export type DeliveryRow = {
  id: number; connector: ConnectorId; recipient_id: string; sender_id: string | null; kind: string; action_id: number | null;
  /** The Prompt it asks for; Deliveries with the same one are one request by several ways (#613). */
  prompt_id: number | null; answer_source: string | null;
  subject: string; body: string; external_ref: string | null; status: "sent" | "answered" | "closed"; created_at: string;
  /** Whether an email really went out (spec 0004); "outbox" is recorded only, as for the simulated Connectors. */
  mail_state: "outbox" | "queued" | "sending" | "sent" | "failed"; last_error: string | null;
  actions: { kind: "question" | "task"; status: string; question: string } | null;
  prompts: { source: string; answered_at: string | null; answered_source: string | null; submitter_id: string; metric_id: number } | null;
};
type TokenRow = { code: string; metric_id: number; submitter_id: string };

/** What "Ask for missing values now" did, never calling a request made that goes nowhere because it was stopped. */
function missingWords({ asked, stopped }: { asked: number; stopped: number }): string {
  const held = stopped ? `${stopped} request${stopped === 1 ? " was" : "s were"} not sent: the person asked stopped these messages.` : "";
  if (asked) return [`Made ${asked} request${asked === 1 ? "" : "s"} for missing values. The Outbox shows which have gone out.`, held].filter(Boolean).join(" ");
  return held || "Nobody is missing a value for the current period";
}

/** The Outbox: every Delivery the person may see, newest first, and the Run now buttons. */
export function Outbox({ isOwner, people, deliveries, tokens, demo, changes = false }: { isOwner: boolean; people: Profile[]; deliveries: DeliveryRow[]; tokens: TokenRow[]; demo: boolean; /** Visitors may change the demo: answers are recorded. */ changes?: boolean }) {
  const [pending, start] = useTransition();
  // Asking and reminding by hand is what the schedule does each morning: in the demo anyone sees it (and is told the
  // demo can't be changed); elsewhere owners and admins get it as a fallback, explained, and members do not see it.
  const runNow = (
    <span className="flex flex-wrap gap-2">
      <Button variant="outline" disabled={pending} onClick={() => start(async () => { const n = await askForMissingValues(); if (isActionError(n)) { toast.error("Not done", { description: n.error }); return; } toast.success(missingWords(n)); })}>
        <Hash aria-hidden /> Ask for missing values now
      </Button>
      <Button variant="outline" disabled={pending} onClick={() => start(async () => { const n = await sendDueReminders(); if (isActionError(n)) { toast.error("Not done", { description: n.error }); return; } toast.success(n ? `Made ${n} reminder${n === 1 ? "" : "s"} for open tasks. The Outbox shows which have gone out.` : "No open tasks due in the next two days"); })}>
        <BellRing aria-hidden /> Send due reminders now
      </Button>
    </span>
  );
  const name = (id: string | null) => people.find((p) => p.id === id)?.name.split(" ")[0] ?? "Someone";
  return (
  <section aria-labelledby="o-h">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 id="o-h" className="text-[length:var(--text-lg)]">Outbox</h2>
        <p className="mt-1 text-sm text-muted-foreground">What Ziffr sent, newest first, as it looks on the other side.{demo ? " Answer as the recipient to see what would come back." : ""}</p>
      </div>
    </div>
    {demo ? (
      <DemoControls className="mt-4" hint={changes ? "In a real workspace Ziffr asks for missing values and reminds people of due tasks by itself each morning. Here the requests land in this Outbox and nothing is sent." : "In a real workspace Ziffr asks for missing values and reminds people of due tasks by itself each morning, and an Owner or Admin can start it here."}>{runNow}</DemoControls>
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
        {deliveries.map((d) => <DeliveryCard key={d.id} d={d} demo={demo} changes={changes} ways={d.prompt_id ? deliveries.filter((x) => x.prompt_id === d.prompt_id).length : 1} to={name(d.recipient_id)} formCode={d.prompts ? tokens.find((t) => t.metric_id === d.prompts!.metric_id && t.submitter_id === d.prompts!.submitter_id)?.code : undefined} />)}
      </ol>
    )}
  </section>
  );
}

/** One Delivery, drawn the way its system shows it. */
function DeliveryCard({ d, to, formCode, demo, changes, ways }: { d: DeliveryRow; to: string; formCode?: string; demo: boolean; changes: boolean; ways: number }) {
  const [reply, setReply] = useState("");
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const c = CONNECTORS[d.connector];
  const Icon = ICON[d.connector];
  const isPrompt = d.kind === "prompt" && d.prompts;
  const takes = d.answer_source ?? d.prompts?.source;
  const answerHere = isPrompt && (takes === "slack" || takes === "mail" || takes === "telegram") && !d.prompts!.answered_at;
  // Playing the recipient works in the demo only; the core refuses it elsewhere, so the buttons stay away too.
  const canReply = demo && ((c.capabilities.includes("replies") && d.action_id) || answerHere);
  const canClose = demo && d.connector === "tickets" && d.actions?.kind === "task" && d.actions.status === "open";
  // In the demo nothing is saved, unless visitors may change it: then the answer is recorded and says what it did.
  const play = (f: () => Promise<string | ActionError>) => start(async () => { try { toast.info(changes ? "Recorded in the demo" : "Not saved: this is the demo", { description: unwrap(await f()) }); setOpen(false); setReply(""); } catch (err) { toast.error("Not done", { description: refusal(err) }); } });

  return (
    <li className="stock rounded-[var(--radius-card)] p-4 text-sm">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <Icon aria-hidden className="size-4 text-foreground" />
        <span className="font-medium text-foreground">{c.label}</span>
        <span>to {to}</span>
        <RelativeTime at={d.created_at} />
        {/* One request by several ways: each is a Delivery of its own, and the first answer closes them all (#613). */}
        {d.kind === "test" && <span className="rounded-[var(--radius-input)] border border-border px-1.5">Test</span>}
        {ways > 1 && <span className="rounded-[var(--radius-input)] border border-border px-1.5">One request, {ways} ways</span>}
        {d.status !== "sent" && <span className="rounded-[var(--radius-input)] border border-border px-1.5">{d.status === "answered" ? (ways > 1 && d.prompts?.answered_source && d.prompts.answered_source in ANSWERED_ON ? `Answered on ${ANSWERED_ON[d.prompts.answered_source]}` : "Answered") : "Closed"}</span>}
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
              {canClose && <Button variant="ghost" size="sm" disabled={pending} onClick={() => play(() => (changes ? recordSimulatedTicketClose : simulateTicketClose)(d.id))}>Close ticket as {to}</Button>}
            </div>
          ) : (
            <form className="space-y-2" onSubmit={(e) => {
              e.preventDefault();
              if (isPrompt) start(async () => {
                const r = await (changes ? recordSimulatedPromptAnswer : simulatePromptAnswer)(d.id, reply);
                if (isActionError(r)) { toast.error("Not recorded", { description: r.error }); return; }
                (r.ok ? toast.info : toast.error)(r.ok ? (changes ? "Recorded in the demo" : "Would be recorded; not saved in the demo") : (changes ? "Not recorded" : "Would not be recorded"), { description: r.detail });
                if (r.ok) { setOpen(false); setReply(""); }
              });
              else play(() => (changes ? recordSimulatedReply : simulateReply)(d.id, reply));
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

/** Where an answer came from, in words. */
const ANSWERED_ON: Record<string, string> = { slack: "Slack", telegram: "Telegram", mail: "email", web_form: "the form", api: "the API" };
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

"use client";
// Connectors, Delivery Preferences and the Outbox (GLOSSARY). PROTOTYPE: deliveries are simulated;
// the buttons under each one play the recipient answering on the other side.
import Link from "next/link";
import { useState, useTransition } from "react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { BellRing, CheckCircle2, Hash, Mail, MessageCircle, MessageSquare, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { askForMissingValues, sendDueReminders, setPreference, simulatePromptAnswer, simulateReply, simulateTicketClose } from "@/app/connector-actions";
import { CAPABILITY_LABEL, CONNECTORS, CONNECTOR_IDS, type ConnectorId, type PreferenceKind } from "@/connectors";
import type { Profile } from "@ziffr/core/types";
import { cn } from "@/lib/utils";

export type PrefRow = { user_id: string | null; kind: PreferenceKind; connector: ConnectorId };
export type DeliveryRow = {
  id: number; connector: ConnectorId; recipient_id: string; sender_id: string | null; kind: string; action_id: number | null;
  subject: string; body: string; external_ref: string | null; status: "sent" | "answered" | "closed"; created_at: string;
  actions: { kind: "question" | "task"; status: string; question: string } | null;
  prompts: { source: string; answered_at: string | null; submitter_id: string; metric_id: number } | null;
};
type TokenRow = { code: string; metric_id: number; submitter_id: string };

const ICON: Record<ConnectorId, typeof Mail> = { slack: MessageSquare, email: Mail, whatsapp: MessageCircle, tickets: Ticket };
const KINDS: { id: PreferenceKind; label: string }[] = [
  { id: "question", label: "Questions" },
  { id: "task", label: "Tasks" },
  { id: "reminder", label: "Reminders" },
  { id: "update", label: "Replies and updates" },
];

export function ConnectorsScreen({ viewer, isOwner, people, prefs, deliveries, tokens }: { viewer: string; isOwner: boolean; people: Profile[]; prefs: PrefRow[]; deliveries: DeliveryRow[]; tokens: TokenRow[] }) {
  const [pending, start] = useTransition();
  const name = (id: string | null) => people.find((p) => p.id === id)?.name.split(" ")[0] ?? "Someone";
  const pref = (user: string | null, kind: PreferenceKind) => prefs.find((p) => p.user_id === user && p.kind === kind)?.connector ?? null;

  return (
    <div className="space-y-12">
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
                {c.sourceId && <Link href="/sources" className="mt-3 inline-block text-xs underline">Try sending a value</Link>}
                <p className="mt-3 text-xs text-muted-foreground">Simulated in the prototype.</p>
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
                        onChange={(e) => start(async () => { await setPreference(row.id, k.id, (e.target.value || null) as ConnectorId | null); })}
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
            <p className="mt-1 text-sm text-muted-foreground">What Ziffr sent, as it looks on the other side. Answer as the recipient to see it come back.</p>
          </div>
          <span className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={pending} onClick={() => start(async () => { const n = await askForMissingValues(); toast.success(n ? `Asked for ${n} missing value${n === 1 ? "" : "s"}` : "Nobody is missing a value for the current period"); })}>
            <Hash aria-hidden /> Ask for missing values now
          </Button>
          <Button variant="outline" disabled={pending} onClick={() => start(async () => { const n = await sendDueReminders(); toast.success(n ? `Reminded ${n} open task${n === 1 ? "" : "s"}` : "No open tasks due in the next two days"); })}>
            <BellRing aria-hidden /> Send due reminders now
          </Button>
          </span>
        </div>
        {deliveries.length === 0 ? (
          <p className="mt-4 rounded-[var(--radius-card)] border border-dashed border-[var(--color-rule-2)] p-6 text-sm text-muted-foreground">Nothing sent yet. Right-click a widget on a dashboard and ask a question or assign a task.</p>
        ) : (
          <ol className="mt-4 space-y-3">
            {deliveries.map((d) => <DeliveryCard key={d.id} d={d} to={name(d.recipient_id)} formCode={d.prompts ? tokens.find((t) => t.metric_id === d.prompts!.metric_id && t.submitter_id === d.prompts!.submitter_id)?.code : undefined} />)}
          </ol>
        )}
      </section>
    </div>
  );
}

/** One Delivery, drawn the way its system shows it. */
function DeliveryCard({ d, to, formCode }: { d: DeliveryRow; to: string; formCode?: string }) {
  const [reply, setReply] = useState("");
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const c = CONNECTORS[d.connector];
  const Icon = ICON[d.connector];
  const isPrompt = d.kind === "prompt" && d.prompts;
  const answerHere = isPrompt && (d.prompts!.source === "slack" || d.prompts!.source === "mail") && !d.prompts!.answered_at;
  const canReply = (c.capabilities.includes("replies") && d.action_id) || answerHere;
  const canClose = d.connector === "tickets" && d.actions?.kind === "task" && d.actions.status === "open";
  const run = (f: () => Promise<unknown>, ok: string) => start(async () => { try { await f(); toast.success(ok); setOpen(false); setReply(""); } catch (err) { toast.error("Not done", { description: (err as Error).message }); } });

  return (
    <li className="stock rounded-[var(--radius-card)] p-4 text-sm">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <Icon aria-hidden className="size-4 text-foreground" />
        <span className="font-medium text-foreground">{c.label}</span>
        <span>to {to}</span>
        <span>{formatDistanceToNow(new Date(d.created_at), { addSuffix: true })}</span>
        {d.status !== "sent" && <span className="rounded-[var(--radius-input)] border border-border px-1.5">{d.status === "answered" ? "Answered" : "Closed"}</span>}
        {d.action_id && <Link href={`/actions/${d.action_id}`} className="ml-auto underline">Open thread</Link>}
      </div>
      <div className={cn("mt-2 rounded-[var(--radius-input)] p-3", d.connector === "slack" && "border-l-4 border-[var(--color-rule-2)] bg-[var(--muted)]", d.connector === "whatsapp" && "max-w-md rounded-2xl rounded-tl-sm bg-[color-mix(in_oklab,var(--color-success)_10%,var(--card))]", d.connector === "email" && "border border-border", d.connector === "tickets" && "border border-border bg-[var(--muted)]")}>
        <div className="font-medium">{d.subject}</div>
        <pre className="mt-1 font-[family-name:var(--font-body)] text-sm whitespace-pre-wrap text-muted-foreground">{d.body.replace(/<([^|>]+)\|([^>]+)>/g, "$2").replace(/\*([^*]+)\*/g, "$1")}</pre>
      </div>
      {isPrompt && !answerHere && !d.prompts!.answered_at && formCode && (
        <Link href={`/submit/${formCode}`} className="mt-2 inline-flex min-h-8 items-center px-3 text-sm underline">Open the form as {to}</Link>
      )}
      {(canReply || canClose) && (
        <div className="mt-2">
          {!open ? (
            <div className="flex flex-wrap gap-1">
              {canReply && <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>Answer as {to}</Button>}
              {canClose && <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => simulateTicketClose(d.id), "Ticket closed: the task is done in Ziffr")}>Close ticket as {to}</Button>}
            </div>
          ) : (
            <form className="space-y-2" onSubmit={(e) => {
              e.preventDefault();
              if (isPrompt) start(async () => {
                const r = await simulatePromptAnswer(d.id, reply);
                (r.ok ? toast.success : toast.error)(r.ok ? "Value recorded" : "Not recorded", { description: r.detail });
                if (r.ok) { setOpen(false); setReply(""); }
              });
              else run(() => simulateReply(d.id, reply), `${to}'s answer is in the thread`);
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

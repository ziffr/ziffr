"use client";
// The demo's pretend Slack channel and inbox (GLOSSARY: Demo Mode, Source): a message sent here goes through the same
// checks as a real one, and the answer says what would have happened. The demo can't be changed (#271), so nothing is
// saved: what was tried stays on this screen only, marked so, until the page is left.
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { AtSign, Bot, Hash, Mail, Reply, Send } from "lucide-react";
import { simulateMessage } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { IntakeEntry, Profile, Prompt, SourceId } from "@ziffr/core/types";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

type Props = {
  source: Exclude<SourceId, "web_form">;
  prompts: Prompt[];
  log: IntakeEntry[];
  profiles: Profile[];
  viewer: string;
  metricNames: Record<number, string>;
};

/** A message tried in this visit, with what it would have done; kept in the browser only. */
type Tried = { id: number; at: string; sender: string; raw: string; outcome: string; detail: string };

export function Simulator({ source, prompts, log, profiles, viewer, metricNames }: Props) {
  const ident = (p: Profile) => (source === "slack" ? p.slack_handle : p.email);
  const stranger = source === "slack" ? "@max.stranger" : "max@unknown.example";
  const me = profiles.find((p) => p.id === viewer);
  const [sender, setSender] = useState(me ? ident(me) : ident(profiles[0]));
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<Prompt | null>(null);
  const [pending, start] = useTransition();
  const [tried, setTried] = useState<Tried[]>([]);
  const byIdent = Object.fromEntries(profiles.map((p) => [ident(p), p]));

  // Interleave Prompts and messages into one timeline.
  const timeline = [
    ...prompts.map((p) => ({ kind: "prompt" as const, at: p.sent_at, p })),
    ...log.map((l) => ({ kind: "msg" as const, at: l.at, l })),
    ...tried.map((t) => ({ kind: "tried" as const, at: t.at, t })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  const send = () =>
    start(async () => {
      const r = await simulateMessage({ source, sender, text, promptId: replyTo?.id });
      setTried((list) => [...list, { id: list.length, at: new Date().toISOString(), sender, raw: text, outcome: r.outcome, detail: r.detail }]);
      setText("");
      setReplyTo(null);
    });

  const Icon = source === "slack" ? Hash : Mail;
  return (
    <section className="flex min-h-[28rem] flex-col overflow-hidden stock rounded-[var(--radius-card)]">
      <div className={cn("flex items-center gap-2 border-b px-4 py-2.5 text-sm font-medium", source === "slack" ? "bg-primary text-primary-foreground" : "bg-[var(--color-paper-3)] text-foreground")}>
        <Icon className="size-4" /> {source === "slack" ? "ziffr-reports" : "reports@ziffr.example"}
        <span className="ml-auto text-xs font-normal opacity-80">simulated</span>
      </div>
      <div className="flex max-h-[26rem] flex-1 flex-col-reverse overflow-y-auto">
        <ul className="space-y-3 p-4">
          {timeline.length === 0 && <li className="text-sm text-muted-foreground">Nothing here yet.</li>}
          {timeline.map((t) =>
            t.kind === "prompt" ? (
              <li key={`p${t.p.id}`} className="flex gap-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-input)] bg-primary text-primary-foreground"><Bot aria-hidden className="size-4" /></span>
                <div className="min-w-0 flex-1">
                  <div className="text-xs"><span className="font-semibold">Ziffr</span> <span className="text-muted-foreground">to {profiles.find((p) => p.id === t.p.submitter_id)?.name.split(" ")[0]}, {format(new Date(t.at), "d MMM HH:mm")}</span></div>
                  <div className="text-sm">{t.p.text}</div>
                  {t.p.answered_at ? (
                    <div className="mt-1 text-xs text-[var(--color-success)]">✓ answered</div>
                  ) : (
                    <button
                      onClick={() => {
                        setReplyTo(t.p);
                        const p = profiles.find((x) => x.id === t.p.submitter_id);
                        if (p) setSender(ident(p));
                      }}
                      className="mt-1 -ml-1.5 inline-flex min-h-8 items-center gap-1 rounded-[var(--radius-input)] px-1.5 text-xs font-medium text-foreground hover:bg-muted"
                    >
                      <Reply className="size-3" /> Reply
                    </button>
                  )}
                </div>
              </li>
            ) : t.kind === "tried" ? (
              <li key={`t${t.t.id}`} className="flex gap-2.5">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-md text-xs font-medium text-white" style={{ background: byIdent[t.t.sender]?.color ?? "var(--color-muted)" }}>
                  {(byIdent[t.t.sender]?.name ?? t.t.sender.replace(/^@/, ""))[0].toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-xs"><span className="font-semibold">{byIdent[t.t.sender]?.name ?? t.t.sender}</span> <span className="text-muted-foreground">{format(new Date(t.at), "d MMM HH:mm")}, not saved</span></div>
                  <div className="text-sm whitespace-pre-wrap">{t.t.raw}</div>
                  <Outcome outcome={t.t.outcome} detail={t.t.detail} would />
                </div>
              </li>
            ) : (
              <li key={`m${t.l.id}`} className="flex gap-2.5">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-md text-xs font-medium text-white" style={{ background: byIdent[t.l.sender]?.color ?? "var(--color-muted)" }}>
                  {(byIdent[t.l.sender]?.name ?? t.l.sender.replace(/^@/, ""))[0].toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-xs"><span className="font-semibold">{byIdent[t.l.sender]?.name ?? t.l.sender}</span> <span className="text-muted-foreground">{format(new Date(t.at), "d MMM HH:mm")}</span></div>
                  <div className="text-sm whitespace-pre-wrap">{t.l.raw}</div>
                  <Outcome outcome={t.l.outcome} detail={t.l.detail} token={t.l.token_code} metricName={t.l.metric_id ? metricNames[t.l.metric_id] : undefined} />
                </div>
              </li>
            ),
          )}
        </ul>
      </div>
      <div className="border-t p-3">
        {replyTo && (
          <div className="mb-2 flex items-center gap-2 rounded-md bg-muted px-2 py-1 text-xs">
            <Reply className="size-3" /> Replying to “{replyTo.text}”
            <button className="ml-auto text-muted-foreground hover:text-foreground" onClick={() => setReplyTo(null)}>✕</button>
          </div>
        )}
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="flex h-9 items-center gap-1 rounded-[var(--radius-input)] border border-input bg-card pl-2.5 text-sm text-muted-foreground focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-ring">
            <AtSign aria-hidden className="size-3.5 shrink-0" />
            <span className="sr-only">Send as</span>
            <select value={sender} onChange={(e) => setSender(e.target.value)} className="h-full min-w-0 flex-1 bg-transparent pr-2 text-foreground outline-none">
              {profiles.map((p) => <option key={p.id} value={ident(p)}>{ident(p)}</option>)}
              <option value={stranger}>{stranger} (unknown)</option>
            </select>
          </label>
          <form className="flex flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); if (text.trim()) send(); }}>
            <Input value={text} onChange={(e) => setText(e.target.value)} placeholder={replyTo ? "e.g. 3" : source === "slack" ? "e.g. closed 2 deals" : "e.g. Return rate was 5.4 %"} className="flex-1" />
            <Button type="submit" disabled={pending || !text.trim()} size="icon" aria-label="Send"><Send /></Button>
          </form>
        </div>
      </div>
    </section>
  );
}

const OUTCOME: Record<string, { label: string; ok: boolean }> = {
  recorded: { label: "Recorded", ok: true },
  overwritten: { label: "Overwritten", ok: true },
  added: { label: "Added up", ok: true },
  kept_both: { label: "Kept both", ok: true },
  proposed_locked: { label: "Proposed as a correction", ok: true },
  rejected_duplicate: { label: "Rejected: duplicate", ok: false },
  rejected_no_token: { label: "Rejected: may not submit this metric", ok: false },
  rejected_unknown_sender: { label: "Rejected: unknown sender", ok: false },
  rejected_ambiguous: { label: "Rejected: which metric?", ok: false },
  rejected_no_value: { label: "Rejected: no number", ok: false },
  rejected_source: { label: "Rejected: wrong Source", ok: false },
  rejected_derived: { label: "Rejected: derived metric", ok: false },
  rejected_archived: { label: "Rejected: archived metric", ok: false },
  rejected_period: { label: "Rejected: no such period", ok: false },
  rejected_several_numbers: { label: "Asked back: which number?", ok: false },
  rejected_several_periods: { label: "Asked back: which period?", ok: false },
  rejected_other_period: { label: "Asked back: not the Prompt's period", ok: false },
  rejected_not_a_period: { label: "Asked back: not one of the metric's periods", ok: false },
};

/** What a message did, or for one tried in the demo (`would`), what it would have done. */
function Outcome({ outcome, detail, token, metricName, would }: { outcome: string; detail: string; token?: string | null; metricName?: string; would?: boolean }) {
  const o = OUTCOME[outcome] ?? { label: outcome, ok: false };
  return (
    <div className={cn("mt-1 rounded-md border px-2 py-1 text-xs", o.ok ? "border-[var(--color-rule-2)] bg-[var(--color-paper-2)]" : "border-destructive/30 bg-destructive/5")}>
      {would && <span className="text-muted-foreground">Would be: </span>}
      <span className={cn("font-semibold", o.ok ? "text-[var(--color-success)]" : "text-destructive")}>{o.label}</span>
      {metricName && <span className="text-muted-foreground"> for {metricName}</span>}
      {token && <span className="text-muted-foreground"> with token <code className="fig">{token}</code></span>}
      <div className="text-muted-foreground">{detail}</div>
    </div>
  );
}

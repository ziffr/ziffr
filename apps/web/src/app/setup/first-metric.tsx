"use client";
// First Metric, the Setup Guide's fourth step (spec 0052, ticket 9; GLOSSARY: Setup Guide, Prompt, Submitter, Source,
// Quiet Hours, Outbox). One Metric is tried both ways on one screen. Out: Ziffr asks the person where they chose to be
// asked (Ask me now). In: they answer there, or by the form link, or type the number here. The step ticks from state in
// the core, so this screen only shows what happened and polls the person's own state while it waits: every five seconds
// for ten minutes at most (and not while the tab is hidden), then "Check again". Every word that says where something
// went comes from the core; nothing here decides who may ask.
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isActionError, UNEXPECTED } from "@/lib/action-error";
import type { FirstMetricAsk, FirstMetricProgress, FirstMetricStep } from "@ziffr/core/setup-first-metric";
import { askFirstMetric, askMeForIt, checkFirstMetric, pickMetric, sendFirstValue } from "./first-metric-actions";
import { skipStep } from "./actions";

/** How often the step looks while it waits, and for how long, in milliseconds. */
export const POLL_EVERY_MS = 5_000;
/** The longest the step keeps looking before it asks the person to press Check again. */
export const POLL_FOR_MS = 10 * 60_000;
/** After this long without a Prompt reaching the person, "Didn't arrive?" opens by itself. */
const OPEN_HELP_AFTER_MS = 3 * 60_000;

const SELECT = "h-9 rounded-[var(--radius-input)] border border-input bg-card px-2 text-sm disabled:opacity-70";
const LINK_BUTTON = "inline-flex h-8 items-center rounded-[var(--radius-input)] border border-input px-3 text-sm font-medium hover:bg-muted";

type Line = { label: string; state: string; held: boolean; note: string | null; look: string; at: string | null };

/** One asked way in words: where it went, and what became of it. */
function lineWords(l: Line): string {
  const at = l.at ? ` at ${new Date(l.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "";
  if (l.state === "failed") return `${l.label}: not sent${l.note ? `. ${l.note}` : "."}`;
  if (l.state === "outbox") return `${l.label}: kept in the Outbox${l.note ? `: ${l.note}` : "."}`;
  if (l.held) return `${l.label}: waiting for your Quiet Hours to end.`;
  return `Asked by ${l.label}${at}.`;
}

/** The step. `following` is the next step's name, or null after the last. */
export function FirstMetricStepView({ step, following }: { step: FirstMetricStep; following: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [just, setJust] = useState<(FirstMetricAsk & { at: string }) | null>(null);
  const [progress, setProgress] = useState<FirstMetricProgress | null>(null);
  const [typed, setTyped] = useState("");
  const [sentWords, setSentWords] = useState<string | null>(null);
  const [gaveUp, setGaveUp] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const started = useRef(Date.now());
  const m = step.metric;

  const out = progress?.out ?? step.out;
  const inn = progress?.in ?? step.in;
  const works = progress?.works ?? step.works;
  const done = Boolean(works);
  const value = progress?.value ?? step.value;

  const run = (work: () => Promise<unknown>, then?: (r: unknown) => void) => start(async () => {
    setError(null);
    try {
      const r = await work();
      if (isActionError(r)) { setError(r.error); return; }
      then?.(r);
      router.refresh();
    } catch { setError(UNEXPECTED); }
  });

  const look = useCallback(async () => {
    setNow(Date.now());
    try {
      const r = await checkFirstMetric();
      if (!isActionError(r)) { setProgress(r); if (r.works) router.refresh(); }
    } catch { /* a slow network: the next look tries again */ }
  }, [router]);

  // Looks while it waits: not before there is a Metric to look at, not once the loop works, not while the tab is hidden,
  // and for ten minutes at most. Then it says so and offers Check again.
  useEffect(() => {
    if (!m || done) return;
    started.current = Date.now();
    setGaveUp(false);
    const t = setInterval(() => {
      if (Date.now() - started.current >= POLL_FOR_MS) { clearInterval(t); setGaveUp(true); return; }
      if (document.visibilityState === "visible") void look();
    }, POLL_EVERY_MS);
    return () => clearInterval(t);
  }, [m, done, look]);

  const lines: Line[] = just
    ? just.results.map((r) => ({ label: r.label, state: r.state, held: Boolean(just.held) && r.state === "queued", note: r.note, look: r.look, at: just.at }))
    : step.asked.map((a) => ({ label: a.label, state: a.state, held: a.held, note: a.note, look: a.look, at: a.at }));
  const formCode = just?.formCode ?? step.formCode;
  const asked = lines.length > 0;
  const waited = now - started.current;
  const ownChoices = step.choices.filter((c) => c.id !== m?.id);

  const picker = ownChoices.length > 0 && (
    <label className="text-sm">
      <span className="sr-only">Another Metric</span>
      <select aria-label="Another Metric" className={SELECT} value="" disabled={pending} onChange={(e) => e.target.value && run(() => pickMetric(Number(e.target.value)))}>
        <option value="">Another Metric</option>
        {ownChoices.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
    </label>
  );

  if (!m) {
    return (
      <div className="space-y-4">
        <p className="text-sm">{step.trial ? "This trial has no Test Metric to try." : "There is no Metric to try yet."} Make one, and Ziffr asks you for it and takes your answer.</p>
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/metrics/new?setup=1" className={LINK_BUTTON}>Make a Metric</Link>
          {picker}
        </div>
        <Footer step="first_metric" following={following} pending={pending} run={run} done={false} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-medium">Try {m.name} both ways{step.trial ? " (your trial’s Test Metric)" : ""}</h3>
        {picker}
      </div>

      {!m.mine && (
        <p className="text-sm">{m.ownerName ?? "Someone else"} owns {m.name}. Ask me now is for a Metric you own and send values for yourself, so pick one of your own{ownChoices.length ? " above" : ": make a Metric first"}.{ownChoices.length === 0 && <> <Link href="/metrics/new?setup=1" className="underline">Make a Metric</Link></>}</p>
      )}

      {m.mine && !m.submitting && (
        <div className="stock rounded-[var(--radius-card)] p-3 text-sm">
          <p>You own {m.name}, but you are not one of the people who send its values. Add yourself, and Ziffr asks you for it.</p>
          <Button className="mt-3" size="sm" disabled={pending} onClick={() => run(() => askMeForIt(), () => toast.success("You are asked for it now"))}>Ask me for it</Button>
        </div>
      )}

      {m.canAsk && (
        <>
          <section aria-labelledby="fm-out" className="space-y-2 text-sm">
            <h4 id="fm-out" className="flex items-center gap-2 font-medium">
              {out ? <CheckCircle2 aria-label="Done" className="size-4 text-[var(--color-success)]" /> : <Circle aria-label="Not done yet" className="size-4 text-muted-foreground" />}
              1. Out: Ziffr asks you
            </h4>
            {step.ways.length > 0
              ? <p className="text-muted-foreground">By {step.ways.map((w) => w.label).join(", then ")}, as you chose. <Link href="/setup?step=ways" className="underline">Change it</Link></p>
              : <p className="text-muted-foreground">By the first way that reaches you, with your form link in it. <Link href="/setup?step=ways" className="underline">Choose how</Link></p>}
            {step.quietBefore && !asked && <p role="status">{step.quietBefore}</p>}
            <div className="flex flex-wrap items-center gap-3">
              <Button disabled={pending || Boolean(step.cooldown && !just)} onClick={() => run(() => askFirstMetric(), (r) => { started.current = Date.now(); setJust({ ...(r as FirstMetricAsk), at: new Date().toISOString() }); setGaveUp(false); })}>Ask me now</Button>
              {step.cooldown && !just && <span className="text-xs text-muted-foreground" role="status">{step.cooldown}</span>}
            </div>
            {asked && (
              <ul className="space-y-1" aria-live="polite">
                {lines.map((l, i) => (
                  <li key={i}>
                    <span className="font-medium">{lineWords(l)}</span> {l.state === "sent" || l.state === "queued" ? l.look : null}
                    {l.state === "outbox" && <> <Link href="/connectors/outbox" className="underline">Open the Outbox</Link></>}
                  </li>
                ))}
                {just?.held && <li>{just.held}</li>}
              </ul>
            )}
          </section>

          <section aria-labelledby="fm-in" className="space-y-2 text-sm">
            <h4 id="fm-in" className="flex items-center gap-2 font-medium">
              {inn ? <CheckCircle2 aria-label="Done" className="size-4 text-[var(--color-success)]" /> : <Circle aria-label="Not done yet" className="size-4 text-muted-foreground" />}
              2. In: you answer
            </h4>
            <p className="text-muted-foreground">Answer where it arrived{formCode ? <>, or <a href={`/submit/${formCode}`} target="_blank" rel="noreferrer" className="underline">open your form link</a> (it opens in a new tab)</> : ""}, or type the number here.</p>
            <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (!typed.trim()) return; run(() => sendFirstValue(typed), (r) => { const x = r as { ok: boolean; detail: string }; setSentWords(x.detail); if (x.ok) { setTyped(""); void look(); } }); }}>
              <label className="sr-only" htmlFor="fm-value">Value for {m.name}</label>
              <input id="fm-value" inputMode="decimal" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={m.unit || "Value"} className="h-9 w-40 rounded-[var(--radius-input)] border border-input bg-card px-2 text-sm" />
              <Button type="submit" variant="outline" disabled={pending || !typed.trim()}>Send the value</Button>
            </form>
            {sentWords && <p role="status">{sentWords}</p>}
            {!inn && !gaveUp && <p className="text-muted-foreground" aria-live="polite">Waiting for your value…</p>}
            {!inn && gaveUp && <p className="text-muted-foreground" aria-live="polite">Nothing has come in for ten minutes. <button type="button" className="underline" onClick={() => { started.current = Date.now(); setGaveUp(false); void look(); }}>Check again</button></p>}
            {inn && !done && value && <p role="status">Your value arrived: {value.value} for {value.period}.{!out ? " Ask me now once, so Ziffr is seen to reach you too." : ""}</p>}
          </section>

          {done && (
            <p role="status" className="rounded-[var(--radius-card)] border border-border bg-card p-3 text-sm font-medium">{works}</p>
          )}

          {asked && !done && (
            <details open={waited >= OPEN_HELP_AFTER_MS && !out} className="text-sm">
              <summary className="cursor-pointer font-medium">Didn&rsquo;t arrive?</summary>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {step.checks.map((c, i) => <li key={i}>{c.text}{c.href && c.label ? <> <Link href={c.href} className="underline">{c.label}</Link></> : null}</li>)}
                <li>Or skip the message: type the number above{formCode ? " or use your form link" : ""}.</li>
              </ul>
            </details>
          )}
        </>
      )}

      <Footer step="first_metric" following={following} pending={pending} run={run} done={done} />
      <p role="alert" className="min-h-5 text-sm text-destructive">{error}</p>
    </div>
  );
}

function Footer({ step, following, pending, run, done }: { step: string; following: string | null; pending: boolean; run: (work: () => Promise<unknown>, then?: (r: unknown) => void) => void; done: boolean }) {
  const router = useRouter();
  const go = () => router.push(following ? `/setup?step=${following}` : "/");
  return (
    <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
      {!done && <Button type="button" variant="ghost" disabled={pending} onClick={() => run(() => skipStep(step), go)}>Skip</Button>}
      <Button type="button" disabled={pending || !done} onClick={go}>Go on</Button>
    </div>
  );
}

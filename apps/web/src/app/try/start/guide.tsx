"use client";
// The Trial Guide's steps (ticket 193; GLOSSARY: Trial Guide, Test Metric): one at a time, with where you are, Back
// and Skip on each. Every move is kept by the core, so reopening the guide continues at the step reached. While it
// waits for the answer, it asks the core for the Test Metric's latest value every few seconds.
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Circle, Send } from "lucide-react";
import type { AskNowResult } from "@ziffr/core/ask-now";
import type { GuideStep, GuideValue, GuideWay, TrialGuide } from "@ziffr/core/trial-guide";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { WayLine } from "@/components/way-state";
import { askGuide, guideValue, moveGuide } from "./actions";

const STEPS: { id: GuideStep; label: string }[] = [
  { id: "welcome", label: "Welcome" }, { id: "where", label: "Where" }, { id: "connect", label: "Connect" },
  { id: "ask", label: "Ask me now" }, { id: "done", label: "Done" },
];

/** How often the ask step looks for the answer. */
const POLL_MS = 3000;

/** The guide, starting at the step the core kept. */
export function Guide({ guide }: { guide: TrialGuide }) {
  const [step, setStep] = useState<GuideStep>(guide.step);
  const [ways, setWays] = useState<GuideWay[]>(guide.ways);
  const [pending, start] = useTransition();
  const at = STEPS.findIndex((s) => s.id === step);

  // Moves at once on the page and keeps the step in the core; ways are saved only when the Where step passes them.
  const go = (to: GuideStep, picked?: GuideWay[]) => start(async () => {
    const r = await moveGuide(to, picked);
    if (r?.error) { toast.error(r.error); return; }
    setStep(to);
  });
  const next = (picked?: GuideWay[]) => go(STEPS[Math.min(at + 1, STEPS.length - 1)].id, picked);
  const back = () => go(STEPS[Math.max(at - 1, 0)].id);

  return (
    <div className="mx-auto max-w-xl">
      <ol className="mb-8 flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s.id} aria-current={i === at ? "step" : undefined}
            className={i === at ? "font-semibold text-foreground" : i < at ? "text-foreground" : "text-muted-foreground"}>
            {i + 1}. {s.label}
          </li>
        ))}
      </ol>

      {step === "welcome" && <Welcome guide={guide} />}
      {step === "where" && <Where guide={guide} ways={ways} setWays={setWays} />}
      {step === "connect" && <Connect guide={guide} ways={ways} />}
      {step === "ask" && <Ask guide={guide} ways={ways} onArrived={() => go("done")} />}
      {step === "done" && <Done guide={guide} />}

      <div className="mt-8 flex flex-wrap items-center gap-2 border-t border-border pt-5">
        {at > 0 && <Button variant="ghost" onClick={back} disabled={pending}>Back</Button>}
        <span className="flex-1" />
        {step !== "done" && <Button variant="ghost" onClick={() => next()} disabled={pending}>Skip</Button>}
        {step === "welcome" && <Button onClick={() => next()} disabled={pending}>Start</Button>}
        {step === "where" && <Button onClick={() => next(ways)} disabled={pending || !ways.length}>Next</Button>}
        {step === "connect" && <Button onClick={() => next()} disabled={pending}>Next</Button>}
        {step === "done" && <Link href="/" className="text-sm underline">Leave the guide</Link>}
      </div>
    </div>
  );
}

function Welcome({ guide }: { guide: TrialGuide }) {
  return (
    <section>
      <h1 className="text-[length:var(--text-2xl)] leading-tight">In a few minutes Ziffr asks you for a number, and you answer it</h1>
      <p className="mt-3 text-muted-foreground">
        That is how Ziffr works: it asks people for the numbers they care about, and everyone sees them over time.
        {guide.testMetric
          ? <> Your trial has a Metric for trying it: <strong className="text-foreground">{guide.testMetric.name}</strong>, asked once a day, with nothing in it yet.</>
          : " Your trial was made before it had a Metric for this, so the guide can show you the ways but not ask."}
      </p>
      <p className="mt-3 text-muted-foreground">Pick where Ziffr should ask you, ask, answer, and watch the value arrive here.</p>
    </section>
  );
}

function Where({ guide, ways, setWays }: { guide: TrialGuide; ways: GuideWay[]; setWays: (w: GuideWay[]) => void }) {
  const toggle = (w: GuideWay, on: boolean) => setWays(on ? [...ways, w] : ways.filter((x) => x !== w));
  return (
    <section>
      <h1 className="text-[length:var(--text-2xl)] leading-tight">Where should Ziffr ask you?</h1>
      <p className="mt-3 text-muted-foreground">Pick one or more of the ways marked Real. The others say why they do not work here.</p>
      <ul className="mt-5 space-y-3">
        {guide.choices.map((c) => {
          const way = c.way as GuideWay;
          const pickable = c.state === "real" && c.way !== "whatsapp";
          return (
            <li key={c.way} className="stock rounded-[var(--radius-card)] p-3 text-sm">
              <label className={`flex items-center gap-2 font-semibold ${pickable ? "cursor-pointer" : "text-muted-foreground"}`}>
                <Checkbox checked={pickable && ways.includes(way)} disabled={!pickable} onCheckedChange={(on) => toggle(way, Boolean(on))} />
                {c.label}
              </label>
              <WayLine way={c} className="mt-1 pl-6" />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** What each picked way needs before it can ask, and whether that is done. */
function Connect({ guide, ways }: { guide: TrialGuide; ways: GuideWay[] }) {
  const router = useRouter();
  const HOW: Record<GuideWay, { done: string; todo: string }> = {
    email: { done: `Nothing to do: Ziffr writes to ${guide.email || "the address you signed in with"}.`, todo: "This Ziffr cannot send email, so the request waits in the Outbox." },
    "web-form": { done: "Nothing to do: every request carries a personal form link that works without signing in.", todo: "" },
    slack: { done: "Connected: Ziffr finds you in your Slack workspace by your email address.", todo: "Connect your Slack workspace with Add to Slack on the Connectors page." },
    telegram: { done: "Linked: the bot writes to your Telegram.", todo: "Press Connect Telegram on the Connectors page and start the bot, then come back." },
  };
  const LABEL: Record<GuideWay, string> = { email: "Email", "web-form": "Web form", slack: "Slack", telegram: "Telegram" };
  return (
    <section>
      <h1 className="text-[length:var(--text-2xl)] leading-tight">Connect</h1>
      {!ways.length && <p className="mt-3 text-muted-foreground">You picked no way, so Ziffr asks you by email.</p>}
      <ul className="mt-5 space-y-3">
        {ways.map((w) => {
          const ok = guide.ready[w];
          return (
            <li key={w} className="stock rounded-[var(--radius-card)] p-3 text-sm">
              <div className="flex items-center gap-2 font-semibold">
                {ok ? <CheckCircle2 aria-label="Done" className="size-4 text-[var(--color-success)]" /> : <Circle aria-label="Not done yet" className="size-4 text-muted-foreground" />}
                {LABEL[w]}
              </div>
              <p className="mt-1 pl-6">{ok ? HOW[w].done : HOW[w].todo}</p>
              {!ok && (w === "slack" || w === "telegram") && (
                <p className="mt-2 flex gap-3 pl-6 text-xs">
                  <Link href="/connectors" className="underline">Go to Connectors</Link>
                  <button type="button" className="underline" onClick={() => router.refresh()}>Check again</button>
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Asks, then waits for the answer and shows it the moment it is recorded. */
function Ask({ guide, ways, onArrived }: { guide: TrialGuide; ways: GuideWay[]; onArrived: () => void }) {
  const [sent, setSent] = useState<AskNowResult[] | null>(null);
  const [value, setValue] = useState<GuideValue | null>(null);
  const [pending, start] = useTransition();

  // Looks every few seconds, also before asking (a guide reopened after asking still sees the answer arrive); stops
  // when the value is there or the step is left.
  useEffect(() => {
    if (value) return;
    let stop = false;
    const look = async () => {
      const v = await guideValue().catch(() => null);
      if (!stop && v) setValue(v);
    };
    void look();
    const t = setInterval(look, POLL_MS);
    return () => { stop = true; clearInterval(t); };
  }, [value]);

  const ask = () => start(async () => {
    const r = await askGuide();
    if ("error" in r) { toast.error(r.error); return; }
    setSent(r);
  });

  if (!guide.testMetric) return <p className="text-muted-foreground">This trial has no Metric to ask for. Skip to the end, or try Ask me now on any Metric you submit.</p>;
  const unit = guide.testMetric.unit;
  return (
    <section>
      <h1 className="text-[length:var(--text-2xl)] leading-tight">Ask me now</h1>
      <p className="mt-3 text-muted-foreground">
        Ziffr sends you today&apos;s request for {guide.testMetric.name}{ways.length ? "" : " by email"}. Answer it there, or by the form link in it, with any number.
      </p>
      {!sent && <Button className="mt-5" onClick={ask} disabled={pending}><Send /> Ask me now</Button>}
      {sent && (
        <ul className="mt-5 space-y-1 text-sm">
          {sent.map((s, i) => (
            <li key={i}>
              {s.state === "sent" || s.state === "queued" ? `Asked by ${s.label}.` : `${s.label}: kept in the Outbox${s.note ? `: ${s.note}` : "."}`}
              {s.state === "outbox" && <> <Link href="/connectors" className="underline">Open the Outbox</Link></>}
            </li>
          ))}
        </ul>
      )}
      {sent && ways.includes("web-form") && guide.formCode && (
        <p className="mt-3 text-sm">Or answer right here: <a href={`/submit/${guide.formCode}`} target="_blank" rel="noreferrer" className="underline">open your form</a> (it opens in a new tab).</p>
      )}
      {sent && !value && <p className="mt-5 text-sm text-muted-foreground" aria-live="polite">Waiting for your answer…</p>}
      {value && (
        <div className="mt-5" aria-live="polite">
          <p className="text-[length:var(--text-2xl)] font-semibold">{value.value} {unit}</p>
          <p className="text-sm text-muted-foreground">Arrived just now.</p>
          <Button className="mt-4" onClick={onArrived}>Next</Button>
        </div>
      )}
    </section>
  );
}

/** Where the value shows up and what to do next. */
function Done({ guide }: { guide: TrialGuide }) {
  const [value, setValue] = useState<GuideValue | null>(null);
  useEffect(() => { guideValue().then(setValue).catch(() => {}); }, []);
  return (
    <section>
      <h1 className="text-[length:var(--text-2xl)] leading-tight">{value ? "Your first value is in" : "That is the guide"}</h1>
      {value && guide.testMetric && <p className="mt-3 text-[length:var(--text-2xl)] font-semibold">{value.value} {guide.testMetric.unit}</p>}
      <p className="mt-3 text-muted-foreground">
        {guide.testMetric?.name ?? "The Metric"} is asked again tomorrow. The trial&apos;s other Metrics have made-up history, so their dashboard shows something at once.
      </p>
      <ul className="mt-5 space-y-2 text-sm">
        {guide.testMetric && <li><Link href={`/metrics/${guide.testMetric.slug}`} className="underline">Open {guide.testMetric.name}</Link></li>}
        <li><Link href="/dashboards" className="underline">See the dashboards</Link></li>
        <li><Link href="/try" className="underline">Try it</Link>: every way in and out of Ziffr, and how to try each one.</li>
      </ul>
    </section>
  );
}

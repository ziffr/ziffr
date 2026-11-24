"use client";
// Ways in and out, the Setup Guide's third step (spec 0052, ticket 8; GLOSSARY: Setup Guide, Connector, Source, Delivery
// Preference, Test Message). Two questions on one screen: how numbers come in, and how the person is asked. Each way is
// a card whose state is in words (never colour alone), with the one press that makes it work for this viewer, a "Send me
// a test" where it reaches them, and, where this Ziffr lacks it, whom to ask and how. The cards come from the core's
// `wayCards`; nothing here decides what works. A Member gets cards about themselves only.
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Circle, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AnsweredForm } from "@/components/answered-form";
import { isActionError, UNEXPECTED } from "@/lib/action-error";
import { sendTestMessage, setTelegram, slackLinkCode, telegramLinkStart } from "@/app/connector-actions";
import { connectSlackFromGuide, saveAskMeBy } from "./ways-actions";
import { skipStep } from "./actions";
import type { CardStatus, WayCard, WaysInAndOut } from "@ziffr/core/ways-in-and-out";
import type { TestMessageResult } from "@ziffr/core/test-message";

const STATUS_WORDS: Record<CardStatus, string> = {
  ready: "Ready", "one-click": "One click away", "ask-admin": "Ask an Owner or Admin", "missing-here": "Not set up on this Ziffr", unavailable: "Not available",
};
const SELECT = "h-9 w-full rounded-[var(--radius-input)] border border-input bg-card px-2 text-sm disabled:opacity-70";
const WAY_LABEL = { email: "Email", slack: "Slack", telegram: "Telegram" } as const;

/** What a press of "Send me a test" came to, in Ziffr's own words. */
function resultWords(r: TestMessageResult): string {
  if (r.state === "sent") return `Sent. Look for it in ${r.label}.`;
  if (r.state === "queued") return "Waiting to be sent. It goes out in a moment.";
  return r.note ?? (r.state === "limited" ? "Too many tests for now. Try again a little later." : "Kept in the Outbox.");
}

/** One way: its state, what to press, what is missing and, where it reaches the person, a test. */
function Card({ card }: { card: WayCard }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [slackCode, setSlackCode] = useState<{ code: string; minutes: number } | null>(null);
  const [telegram, setTelegramLink] = useState<{ url: string; minutes: number } | null>(null);
  // One press: its words on a refusal, a refresh on success so the card and the step bar say the new truth.
  const run = (work: () => Promise<unknown>, done?: (r: unknown) => void) => start(async () => {
    setError(null);
    try {
      const r = await work();
      if (isActionError(r)) { setError(r.error); return; }
      done?.(r);
      router.refresh();
    } catch { setError(UNEXPECTED); }
  });
  const ok = card.status === "ready";
  return (
    <li className="stock rounded-[var(--radius-card)] p-3 text-sm" aria-labelledby={`way-${card.way}`}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span id={`way-${card.way}`} className="flex items-center gap-2 font-semibold">
          {ok ? <CheckCircle2 aria-hidden className="size-4 text-[var(--color-success)]" /> : card.status === "one-click" ? <Circle aria-hidden className="size-4 text-muted-foreground" /> : <Info aria-hidden className="size-4 text-muted-foreground" />}
          {card.label}
        </span>
        <span className="text-xs text-muted-foreground">{STATUS_WORDS[card.status]}</span>
      </div>
      <p className="mt-1 pl-6">{card.line}{card.limit ? <span className="text-muted-foreground"> {card.limit}</span> : null}</p>
      {card.help && (
        <p className="mt-1 flex flex-wrap gap-x-4 pl-6 text-xs">
          <a href={card.help.guide} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-8 items-center underline">How to add it</a>
          {card.help.installationPage && <Link href={card.help.installationPage} className="inline-flex min-h-8 items-center underline">Open Installation settings</Link>}
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-start gap-2 pl-6">
        {card.action === "add-slack" && <AnsweredForm action={connectSlackFromGuide}><Button type="submit" size="sm">Add to Slack</Button></AnsweredForm>}
        {card.action === "turn-on-telegram" && <Button size="sm" disabled={pending} onClick={() => run(() => setTelegram(true), () => toast.success("Telegram is on"))}>Turn on Telegram</Button>}
        {card.action === "connect-telegram" && !telegram && <Button size="sm" disabled={pending} onClick={() => run(async () => telegramLinkStart(), (r) => setTelegramLink(r as { url: string; minutes: number }))}>Connect my Telegram</Button>}
        {card.action === "paste" && <Link href="/paste-values" className="inline-flex h-8 items-center rounded-[var(--radius-input)] border border-input px-3 text-sm font-medium hover:bg-muted">Try it</Link>}
        {card.also === "link-slack" && !slackCode && <Button size="sm" variant="outline" disabled={pending} onClick={() => run(async () => slackLinkCode(), (r) => setSlackCode(r as { code: string; minutes: number }))}>Link my Slack account</Button>}
        {card.canTest && <Button size="sm" variant="outline" disabled={pending} onClick={() => run(async () => sendTestMessage(card.way), (r) => setResult(resultWords(r as TestMessageResult)))}>Send me a test</Button>}
      </div>
      {telegram && (
        <p className="mt-2 flex flex-wrap items-center gap-3 pl-6">
          {/* A link the person opens themselves: a window opened after the round trip would be blocked. */}
          <a href={telegram.url} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center rounded-[var(--radius-input)] border border-input px-3 text-sm font-medium hover:bg-muted">Open Telegram</a>
          <span className="text-muted-foreground">and tap Start within {telegram.minutes} minutes, then </span>
          <button type="button" className="underline" onClick={() => router.refresh()}>check again</button>
        </p>
      )}
      {slackCode && <p className="mt-2 pl-6">Send the Ziffr app on Slack this message within {slackCode.minutes} minutes: <code className="rounded bg-[var(--muted)] px-1.5 py-0.5 select-all">link {slackCode.code}</code></p>}
      <p role="status" className="pl-6 text-sm">{result}</p>
      <p role="alert" className="pl-6 text-sm text-destructive">{error}</p>
    </li>
  );
}

/** The step. `following` is the next step's name, or null after the last; `notice` says what "Add to Slack" came to. */
export function WaysInAndOutStep({ data, following, notice }: { data: WaysInAndOut; following: string | null; notice: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const initial = data.askedBy.filter((w) => data.askable.includes(w));
  // Until a choice is saved, the first way that works is proposed: saving it is what ticks the step.
  const [picked, setPicked] = useState<string[]>(initial.length ? initial : data.askable.slice(0, 1));
  const go = () => router.push(following ? `/setup?step=${following}` : "/");
  const run = (work: () => Promise<unknown>, done?: string) => start(async () => {
    setError(null);
    try {
      const r = await work();
      if (isActionError(r)) { setError(r.error); return; }
      if (done) toast.success(done);
      go();
    } catch { setError(UNEXPECTED); }
  });
  const slot = (i: number, value: string) => setPicked((old) => {
    const next = [...old];
    if (value) next[i] = value; else next.splice(i);
    return next.filter((w, j) => next.indexOf(w) === j);
  });
  const options = (i: number) => data.askable.filter((w) => !picked.some((p, j) => p === w && j !== i));
  const nothingWorks = data.askable.length === 0;
  return (
    <div className="space-y-8">
      {notice && <p role="status" className="text-sm font-medium">{notice}</p>}
      <section aria-labelledby="ways-in">
        <h3 id="ways-in" className="text-base font-medium">{data.manages ? "How should numbers come in?" : "How can you send numbers?"}</h3>
        <p className="mb-3 mt-1 text-sm text-muted-foreground">Each way says whether it works on this Ziffr, and what is missing when it does not. Use the ones that suit you.</p>
        <ul className="space-y-3">{data.cards.map((c) => <Card key={c.way} card={c} />)}</ul>
        {data.more.length > 0 && (
          <div className="mt-4 text-sm">
            <h4 className="font-medium">More ways</h4>
            <ul className="mt-1 grid gap-x-6 gap-y-1 sm:grid-cols-2">
              {data.more.map((m) => <li key={m.href}><Link href={m.href} className="underline">{m.label}</Link><span className="text-muted-foreground">: {m.what}</span></li>)}
            </ul>
          </div>
        )}
      </section>

      <section aria-labelledby="ways-out">
        <h3 id="ways-out" className="text-base font-medium">{data.manages ? "How should people be asked and told?" : "How should you be asked?"}</h3>
        <p className="mb-3 mt-1 text-sm text-muted-foreground">Your own choice, saved for you. Ziffr tries the first way, and the others when you pick more than one; others are asked by what they choose, and the default is the first way that reaches them.</p>
        {nothingWorks ? (
          <p className="text-sm">No way of asking reaches you on this Ziffr yet. Requests wait in the Outbox, and every request still carries a personal form link.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            {[0, 1, 2].filter((i) => i === 0 || picked[i - 1]).map((i) => (
              <label key={i} className="block text-sm font-medium">
                {i === 0 ? "Ask me by" : "and also by"}
                <select value={picked[i] ?? ""} disabled={pending} onChange={(e) => slot(i, e.target.value)} className={`mt-1 ${SELECT}`}>
                  {i > 0 && <option value="">None</option>}
                  {options(i).map((w) => <option key={w} value={w}>{WAY_LABEL[w as keyof typeof WAY_LABEL]}</option>)}
                </select>
              </label>
            ))}
          </div>
        )}
        {data.manages && (
          <p className="mt-3 text-sm text-muted-foreground">
            Telling people later needs a Metric or a dashboard first: <Link href="/guide/your-settings" className="underline">Alerts</Link>, <Link href="/guide/workflows" className="underline">a Workflow&rsquo;s Tell step</Link>, and <Link href="/guide/dashboards" className="underline">Snapshots by email and View Links</Link>.
          </p>
        )}
      </section>

      <div className="space-y-3 border-t border-border pt-4">
        <p role="alert" className="min-h-5 text-sm text-destructive">{error}</p>
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" disabled={pending} onClick={() => run(() => skipStep("ways"))}>Skip</Button>
          <Button type="button" disabled={pending} onClick={() => run(() => (nothingWorks ? Promise.resolve({}) : saveAskMeBy(picked)), nothingWorks ? undefined : "Saved")}>{nothingWorks ? "Go on" : "Save and go on"}</Button>
        </div>
      </div>
    </div>
  );
}

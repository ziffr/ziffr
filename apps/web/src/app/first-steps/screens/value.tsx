// First Steps, "Now send your first value" (spec 0067; GLOSSARY: First Steps, Value, Prompt, Held Reply, Quiet Hours,
// Outbox): the loop is closed here. Ziffr asks by email and the person replies, or they type the number, or they leave it
// for later. While a request is out the screen looks every few seconds (and when the person comes back to the tab) for
// ten minutes, then offers Check again. Every sentence about where a request went and what became of a reply comes from
// the core.
import { useCallback, useEffect, useRef, useState } from "react";
import type { FirstValueProgress, FirstValueView } from "@ziffr/core/first-steps-value";
import { STOPPED_SELF } from "@ziffr/core/prompt-route";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { answered, Facts, MAIN_BUTTON, Panel, Quiet, Reading, useShown } from "../closing-parts";
import { Choice, Choices, ScreenHeading } from "../parts";
import { askByEmail, emailAgain, lookForValue, pickValueMetric, readFirstValue, typeValue } from "../value-actions";
import type { ScreenProps } from "./types";

// How often the screen looks while a request is out, and how long it keeps looking by itself, in milliseconds.
const LOOK_EVERY_MS = 5_000;
const LOOK_FOR_MS = 10 * 60_000;

const LINK = "inline-flex min-h-11 items-center underline underline-offset-4 md:min-h-0";
const TITLE = "Now send your first value";

/** Sending in the first value. */
export function ValueScreen({ context, go }: ScreenProps) {
  const ws = context.workspace?.id ?? "";
  const { data, failed, reload } = useShown(() => readFirstValue(ws));
  if (!data) {
    return (
      <>
        <ScreenHeading title={TITLE} />
        <Reading failed={failed} onRetry={() => void reload()} />
      </>
    );
  }
  if (!data.view) {
    return (
      <>
        <ScreenHeading title={TITLE}>There is no metric to send a value for yet.</ScreenHeading>
        <Button type="button" className={MAIN_BUTTON} onClick={() => go("start")}>Add a metric</Button>
      </>
    );
  }
  // A new Metric starts the screen afresh.
  return <SendFirst key={data.view.metric.id} ws={ws} view={data.view} reload={reload} go={go} />;
}

type SendProps = { ws: string; view: FirstValueView; reload: () => Promise<void>; go: ScreenProps["go"] };

/** The screen as drawn from what the core handed over, and what happens on it. */
export function SendFirst({ ws, view, reload, go }: SendProps) {
  const [seen, setSeen] = useState<FirstValueProgress | null>(null);
  const [picked, setPicked] = useState<"mail" | "type" | null>(null);
  const [typed, setTyped] = useState("");
  const [refusal, setRefusal] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [stopped, setStopped] = useState(false);
  // Counts the times the ten minutes of looking started again.
  const [round, setRound] = useState(0);
  const looking = useRef(false);
  const progress = seen ?? view.progress;
  const value = progress.value;
  const { metric, email, request } = view;
  const mode = picked ?? (request ? "mail" : (email.state === "off" || email.state === "unavailable") && metric.canType ? "type" : null);
  const waiting = Boolean(request) && !value;

  const look = useCallback(async () => {
    if (looking.current) return;
    looking.current = true;
    // A slow network says nothing: the next look tries again.
    const r = await answered(() => lookForValue(ws), () => {});
    looking.current = false;
    if (r) setSeen(r);
  }, [ws]);

  useEffect(() => {
    if (!waiting) return;
    const started = Date.now();
    setStopped(false);
    const timer = setInterval(() => {
      if (Date.now() - started >= LOOK_FOR_MS) { clearInterval(timer); setStopped(true); return; }
      if (document.visibilityState === "visible") void look();
    }, LOOK_EVERY_MS);
    // Back from the mail app: look at once.
    const back = () => { if (document.visibilityState === "visible") void look(); };
    document.addEventListener("visibilitychange", back);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", back); };
  }, [waiting, look, round]);

  async function act(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setRefusal(null);
    await work();
    setBusy(false);
  }
  const ask = () => act(async () => {
    const r = await answered(() => askByEmail(ws), setRefusal);
    if (!r) return;
    setSeen(null);
    await reload();
    setPicked("mail");
    setRound((n) => n + 1);
  });
  const send = () => act(async () => {
    if (!typed.trim()) return;
    const r = await answered(() => typeValue(ws, typed), setRefusal);
    if (!r) return;
    if (!r.ok) { setRefusal(r.detail); return; }
    await look();
  });
  const later = <Quiet onClick={() => go(view.chosen ? "done" : "sender")}>Do this later</Quiet>;
  const alert = <p role="alert" className="text-sm text-destructive empty:hidden">{refusal}</p>;

  if (value) {
    return (
      <div className="space-y-6">
        <div>
          <ScreenHeading key="in" title={value.byReply ? "Your reply arrived" : "Value recorded"}>Your number is on record.</ScreenHeading>
          <Facts label="Your first value" rows={[[value.metric, `${value.value} for ${value.period}`]]} />
          {value.waitsApproval && <p className="mt-3 text-sm">It waits for approval. It counts as in.</p>}
        </div>
        <section aria-labelledby="fs-open">
          <h2 id="fs-open" className="mb-2 text-sm font-medium">Now open to you</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            <li>{value.waitsApproval ? "Your dashboard shows this number once it is approved" : "Your dashboard shows its first number"}</li>
            {progress.canInvite && <li>You can invite colleagues</li>}
          </ul>
        </section>
        <Button type="button" className={MAIN_BUTTON} onClick={() => go(view.chosen ? "done" : "sender")}>Go on</Button>
      </div>
    );
  }

  const typeIt = <Quiet onClick={() => { setRefusal(null); setPicked("type"); }}>Type it in here</Quiet>;
  return (
    <div className="space-y-4">
      <ScreenHeading title={TITLE}>
        Until it is in, your dashboard stays empty{view.invitesWait ? " and you cannot invite colleagues" : ""}.{view.others.length > 0 ? " One value of the set is enough." : ""}
      </ScreenHeading>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="min-w-0 text-sm break-words">Your metric: <strong>{metric.name}</strong></p>
        {view.others.length > 0 && (
          <select
            aria-label="Choose another metric" value="" disabled={busy}
            className="h-11 max-w-full rounded-[var(--radius-input)] border border-input bg-card px-2 text-base md:h-9 md:text-sm"
            onChange={(e) => { const id = Number(e.target.value); if (id) void act(async () => { if (await answered(() => pickValueMetric(ws, id), setRefusal)) await reload(); }); }}
          >
            <option value="">Choose another</option>
            {view.others.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        )}
      </div>

      {email.state === "off" && <Panel>This Ziffr cannot send email yet. Whoever runs it can set that up in the Installation settings.</Panel>}
      {email.state === "stopped" && (
        <Panel>
          <p>{STOPPED_SELF.email} Ziffr does not ask you that way until you switch it on again.</p>
          <Button type="button" variant="outline" className="h-11 md:h-9" disabled={busy} onClick={() => void act(async () => { if (await answered(() => emailAgain(ws), setRefusal)) await reload(); })}>Get them by email again</Button>
        </Panel>
      )}
      {mode !== "type" && view.quiet && !request && email.state === "offered" && <Panel>{view.quiet}</Panel>}

      {mode === null && (
        <>
          <Choices>
            {email.state === "offered" && <Choice title="Ask me by email" hint={email.reply ? "Ziffr emails you, and you reply with the number" : "Ziffr emails you a link, and you type the number there"} onPick={() => void ask()} />}
            {metric.canType && <Choice title="Type it in here" hint="Quickest" onPick={() => { setRefusal(null); setPicked("type"); }} />}
          </Choices>
          {alert}
          <div className="text-center">{later}</div>
        </>
      )}

      {mode === "mail" && request && (
        <>
          <Panel role="status">
            <p>{request.words}</p>
            {request.state === "outbox" && <p><a href="/connectors/outbox" className={LINK}>Open the Outbox</a></p>}
          </Panel>
          {progress.reply && <Panel role="status" className="border-primary font-medium">{progress.reply}</Panel>}
          <p role="status" className="text-sm text-muted-foreground">
            {stopped ? "Nothing has come in for ten minutes." : "Waiting for your number…"}
          </p>
          {stopped && <Button type="button" variant="outline" className="h-11 md:h-9" onClick={() => { setRound((n) => n + 1); void look(); }}>Check again</Button>}
          <details className="text-sm">
            <summary className="flex min-h-11 cursor-pointer items-center font-medium md:min-h-0">Nothing arrived?</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {view.checks.map((c) => <li key={c.text}>{c.text}{c.href && c.label ? <> <a href={c.href} className={LINK}>{c.label}</a></> : null}</li>)}
              <li>Or ask again, or type the number here.</li>
            </ul>
          </details>
          {alert}
          <div className="flex flex-wrap gap-2">
            {email.state === "offered" && <Button type="button" variant="outline" className="h-11 md:h-9" disabled={busy} onClick={() => void ask()}>Ask again</Button>}
            {metric.canType && typeIt}
            {later}
          </div>
          {view.cooldown && <p className="text-sm text-muted-foreground">{view.cooldown}</p>}
        </>
      )}

      {mode === "type" && (
        <>
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void send(); }}>
            <div className="space-y-1.5">
              <label htmlFor="fs-value" className="block text-sm font-medium break-words">{metric.name}{metric.unit ? ` (${metric.unit})` : ""}</label>
              <Input id="fs-value" inputMode="decimal" autoComplete="off" autoFocus maxLength={40} value={typed} className="h-11 md:h-9" onChange={(e) => setTyped(e.target.value)} />
            </div>
            {alert}
            <Button type="submit" className={MAIN_BUTTON} disabled={busy || !typed.trim()}>{busy ? "Recording…" : "Record value"}</Button>
          </form>
          <div className="flex flex-wrap justify-center gap-2">
            {request
              ? <Quiet onClick={() => { setRefusal(null); setPicked("mail"); }}>Back to the email</Quiet>
              : email.state === "offered" && <Quiet disabled={busy} onClick={() => void ask()}>Ask me by email instead</Quiet>}
            {later}
          </div>
        </>
      )}
    </div>
  );
}

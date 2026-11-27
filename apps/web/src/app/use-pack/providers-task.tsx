"use client";
// "Choose who provides them", after a Pack's set-up (spec 0068; GLOSSARY: Pack, Submitter, Contact, Workflow): the
// set-up's own question about the numbers nobody provides, with what changes said before it is saved, and who is asked
// from when afterwards. Nothing is sent. It draws what the core answered to this Owner or Admin.
import { useState } from "react";
import { answered } from "@/app/first-steps/closing-parts";
import { ScreenHeading } from "@/app/first-steps/parts";
import { PHONE_ACTIONS, PHONE_BUTTON } from "@/app/setup/phone";
import { buttonVariants } from "@/components/ui/button";
import type { ActionError } from "@/lib/action-error";
import { formatDate } from "@ziffr/core/format";
import type { PackProviders, PackProvidersSet } from "@ziffr/core/pack-after-providers";
import type { StartPerson, StartRoom } from "@ziffr/core/pack-start-steps";
import { cn } from "@/lib/utils";
import { startAnswers, toChoices, type Answers } from "./answers";
import { Lines, NOTE } from "./parts";
import { namesWords, ProvidersScreen } from "./providers";

type Props = { view: PackProviders; save: (providers: StartPerson[]) => Promise<PackProvidersSet | ActionError>; inviteHref: string; done: string };

/** What saving does to the numbers, in lines. */
function changes(view: PackProviders): string[] {
  const flows = [...new Set(view.numbers.flatMap((n) => (n.workflow ? [n.workflow] : [])))];
  const opened = view.numbers.filter((n) => n.opens).map((n) => n.name);
  return [
    ...flows.map((flow) => `Asked by the Workflow “${flow}”: ${namesWords(view.numbers.filter((n) => n.workflow === flow).map((n) => n.name))}.`),
    ...(opened.length ? [`The web form, email, Slack and Telegram open for ${namesWords(opened)}.`] : []),
  ];
}

/** The question, then what it did. */
export function ProvidersTask({ view, save, inviteHref, done }: Props) {
  const room: StartRoom = { metrics: null, trial: null, practice: view.practice };
  const step = { step: "providers" as const, metrics: view.numbers.map((n) => ({ key: String(n.id), name: n.name })), preselected: "me" as const, max: view.max };
  const [answers, setAnswers] = useState<Answers>(() => startAnswers([step], room));
  const [result, setResult] = useState<PackProvidersSet | null>(null);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const back = <a href={done} className={cn(buttonVariants({ variant: "outline" }), PHONE_BUTTON)}>Back to Packs</a>;

  if (result) {
    return (
      <>
        <ScreenHeading key="chosen" title="Chosen">Nothing was sent just now.</ScreenHeading>
        <div className="space-y-5">
          <Lines title="Who is asked" items={result.asked.map((a) => `${a.you ? "You" : a.name}: ${result.numbers} ${result.numbers === 1 ? "number" : "numbers"}, asked from ${a.from ? formatDate(a.from) : "the next run"}.`)} />
          {!view.mail && <p className={NOTE}>Email is not set up here, so requests wait in the Outbox.</p>}
          {result.notes.map((n) => <p key={n} className={NOTE}>{n}</p>)}
          <div className={PHONE_ACTIONS}>
            {result.invite && <a href={inviteHref} className={cn(buttonVariants({ variant: "default" }), PHONE_BUTTON)}>Invite them</a>}
            {back}
          </div>
        </div>
      </>
    );
  }
  if (!view.numbers.length) {
    return (
      <>
        <ScreenHeading title="Nothing to choose">Somebody provides each of these numbers already. Change that on a Metric&rsquo;s page.</ScreenHeading>
        {back}
      </>
    );
  }
  async function choose() {
    if (busy) return;
    setBusy(true);
    setRefusal(null);
    const r = await answered(() => save(toChoices(answers, [step], "1,234.5").providers ?? []), setRefusal);
    setBusy(false);
    if (r) { setResult(r); window.scrollTo(0, 0); }
  }
  return (
    <ProvidersScreen
      step={step} answers={answers} onChange={setAnswers} onContinue={() => void choose()} room={room} me={view.me} people={view.people}
      choosing={{
        label: busy ? "Saving…" : "Save",
        under: (
          <>
            <Lines title="What changes" items={changes(view)} />
            {view.trial && <p className={NOTE}>In a trial, nothing is sent to a Contact. Once you have sent one value yourself, you can invite them.</p>}
            <p role="alert" className="text-sm text-destructive empty:hidden">{refusal}</p>
          </>
        ),
      }}
    />
  );
}

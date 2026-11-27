"use client";
// "Ready to start?" (spec 0068; GLOSSARY: Pack, Contact, Submitter, Approver, Share, Trial Workspace): everything in
// one place before anything happens: who does what, who is asked and when, what is made, what is left out, the proposed
// Shares, the confirmations and why it cannot go on. Nothing is sent by "Set it up".
// It shows only the plan of the person's own answers, in names they may see.
import { useId } from "react";
import { ScreenHeading } from "@/app/first-steps/parts";
import type { StartPlan } from "@ziffr/core/pack-start-plan";
import type { StartDeclarations, StartRoom, StartStep } from "@ziffr/core/pack-start-steps";
import type { Answers } from "./answers";
import { Card, Lines, NOTE, StepForm, Tick } from "./parts";
import { namesWords } from "./providers";
import { askedWhen, type SetUpClock } from "./when";

type Props = {
  steps: StartStep[]; answers: Answers; onChange: (answers: Answers) => void; onSetUp: () => void;
  /** What the answers would make; null while it is being worked out. */
  plan: StartPlan | null;
  /** Why the answers could not be checked. */
  failed: string | null;
  declarations: StartDeclarations; clock: SetUpClock; room: StartRoom;
  /** Why it cannot be set up here. */
  blocked: string | null;
  /** The texts aimed at assistants to be confirmed before the Pack is installed. */
  assistantTexts: { path: string; text: string }[];
};

const count = (n: number, one: string, many = `${one}s`) => (n === 0 ? null : `${n} ${n === 1 ? one : many}`);
const together = (parts: string[]) => (parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : parts[0] ?? "Nothing");

/** The rows of the summary: what each question was answered with, as the plan reads it. */
function summaryRows(steps: StartStep[], plan: StartPlan, answers: Answers, declarations: StartDeclarations, clock: SetUpClock): [string, string][] {
  const nameOf = (ref: string) => (ref === "me" ? "You" : plan.people.find((p) => p.ref === ref)?.name ?? "");
  const names = (refs: string[]) => refs.map(nameOf).join(", ");
  const rows: [string, string][] = [];
  for (const s of steps) {
    if (s.step === "lines") rows.push([s.name, namesWords(plan.lines.filter((l) => l.repeat === s.repeat).map((l) => l.name)) || "None"]);
    if (s.step === "who") {
      const held = plan.held.find((h) => h.position === s.position && h.line === null);
      rows.push([s.name, held ? `You, until ${nameOf(held.for)} has joined` : names(plan.fills.find((f) => f.position === s.position)?.people ?? []) || "Not answered"]);
    }
    if (s.step === "providers") rows.push(["Provides the numbers", names(plan.providers) || "Nobody for now"]);
    if (s.step === "numbers") rows.push(["Targets", plan.targets.length ? `${plan.targets.length} entered` : "Add later"]);
    if (s.step === "source") rows.push(["Numbers from", answers.source === "system" ? "A system or a spreadsheet, typed until it is connected" : "People type them"]);
  }
  rows.push(["Asked", namesWords(plan.asked.map((a) => nameOf(a.person))) || "Nobody for now"]);
  const when = askedWhen(plan, declarations, clock);
  if (when.length) rows.push(["When", when.join(" ")]);
  rows.push(["Ziffr creates", together([count(plan.metrics.length, "Metric"), count(plan.dashboards.length, "dashboard"), count(plan.decks.length, "slide deck"), count(plan.workflows.length, "Workflow")].filter((x) => x !== null))]);
  if (plan.contacts.length) rows.push(["Added as Contacts", namesWords(plan.contacts.map(nameOf))]);
  return rows;
}

/** The proposed Shares as boxes to tick, off where one shows someone more. */
function Shares({ plan, answers, onChange }: Pick<Props, "answers" | "onChange"> & { plan: StartPlan }) {
  const id = useId();
  if (!plan.shares.length) return null;
  return (
    <section aria-labelledby={id} className="space-y-1.5">
      <h2 id={id} className="text-sm font-medium text-muted-foreground">Share with them</h2>
      <Card className="divide-y divide-border py-1">
        {plan.shares.map((s) => (
          <Tick
            key={s.id}
            title={`${plan.people.find((p) => p.ref === s.person)?.name ?? "Someone"} can ${s.role === "editor" ? "edit" : "see"} the ${s.kind} “${s.item}”`}
            hint={s.showsMore ? "This shows them more than they send themselves." : undefined}
            checked={answers.shares[s.id] ?? s.suggested}
            onChange={(on) => onChange({ ...answers, shares: { ...answers.shares, [s.id]: on } })}
          />
        ))}
      </Card>
    </section>
  );
}

/** Everything before it happens, and "Set it up". */
export function CheckScreen({ steps, answers, onChange, onSetUp, plan, failed, declarations, clock, room, blocked, assistantTexts }: Props) {
  const confirm = assistantTexts.length > 0 && !answers.confirmed;
  const problem = blocked ?? failed ?? (!plan ? "Checking your answers…" : plan.problems[0] ?? (confirm ? "Tick that you read the words aimed at assistants." : null));
  const more = !blocked && plan ? plan.problems.slice(1) : [];
  return (
    <>
      <ScreenHeading title="Ready to start?">Nothing happens before you press Set it up.</ScreenHeading>
      <StepForm problem={problem} onContinue={onSetUp} label="Set it up" note="Nothing is sent yet.">
        {plan && (
          <>
            <dl className="stock divide-y divide-border rounded-[var(--radius-card)] text-sm">
              {summaryRows(steps, plan, answers, declarations, clock).map(([term, words]) => (
                <div key={term} className="flex flex-wrap justify-between gap-x-4 gap-y-0.5 px-4 py-3">
                  <dt className="font-medium">{term}</dt>
                  <dd className="min-w-0 text-muted-foreground break-words sm:max-w-[65%] sm:text-right">{words}</dd>
                </div>
              ))}
            </dl>
            <Shares plan={plan} answers={answers} onChange={onChange} />
            <Lines title="Left out" items={plan.leftOut.map((l) => `Not made: ${l.name}. ${l.why}`)} />
            {plan.notes.map((n) => <p key={n} className={NOTE}>{n}</p>)}
            {room.trial && (plan.contacts.length > 0 || plan.invite.length > 0) && <p className={NOTE}>In a trial, nothing is sent to a Contact. Once you have sent one value yourself, you can invite them.</p>}
          </>
        )}
        {assistantTexts.length > 0 && (
          <div className="rounded-[var(--radius-input)] border border-input p-3 text-sm">
            <p className="font-medium">Words aimed at AI assistants</p>
            <p className="text-muted-foreground">These texts read like instructions to an assistant. Assistants connected to this Workspace read Metric descriptions; they can do only what their key allows, but read these first.</p>
            <ul className="mt-1 space-y-1 break-words">{assistantTexts.map((t) => <li key={t.path}><code>{t.path}</code>: &ldquo;{t.text}&rdquo;</li>)}</ul>
            <Tick title="I read the words aimed at assistants." checked={answers.confirmed} onChange={(confirmed) => onChange({ ...answers, confirmed })} />
          </div>
        )}
        {more.length > 0 && <ul role="alert" className={`${NOTE} space-y-1`}>{more.map((p) => <li key={p}>{p}</li>)}</ul>}
      </StepForm>
    </>
  );
}

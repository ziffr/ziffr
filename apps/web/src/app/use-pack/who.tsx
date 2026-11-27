"use client";
// The question that fills one Position (spec 0068; GLOSSARY: Position, Contact, Approver): I do, someone already here,
// or someone else by name and email address. Only those who may take the Position's places are offered.
import { Choice, Choices, ScreenHeading } from "@/app/first-steps/parts";
import type { StartPickable } from "@ziffr/core/pack-start-plan";
import type { StartRoom, StartStep } from "@ziffr/core/pack-start-steps";
import { eligible, heldWords, meDraft, stepProblem, type Answers, type PersonDraft } from "./answers";
import { Card, NewPersonFields, NOTE, PersonPick, StepForm } from "./parts";

type Props = { step: Extract<StartStep, { step: "who" }>; answers: Answers; onChange: (answers: Answers) => void; onContinue: () => void; room: StartRoom; me: { name: string }; people: StartPickable[] };

/** Who takes one Position. */
export function WhoScreen({ step, answers, onChange, onContinue, room, me, people }: Props) {
  const value = answers.who[step.position] ?? meDraft();
  const set = (person: PersonDraft) => onChange({ ...answers, who: { ...answers.who, [step.position]: person } });
  const here = eligible(people, step.places);
  const left = people.length - here.length;
  return (
    <>
      <ScreenHeading title={step.question}>{step.hint ?? undefined}</ScreenHeading>
      <StepForm problem={stepProblem(step, answers)} onContinue={onContinue}>
        <Choices>
          <Choice title="I do" hint={me.name} selected={value.who === "me"} onPick={() => set({ ...value, who: "me" })} />
          {here.length > 0 && <Choice title="Someone already here" selected={value.who === "here"} onPick={() => set({ ...value, who: "here" })} />}
          {!room.practice && <Choice title="Someone else" hint="By name and email address" selected={value.who === "new"} onPick={() => set({ ...value, who: "new" })} />}
        </Choices>
        {value.who === "here" && <PersonPick label="Who" of={step.name} value={value} onChange={set} people={here} allowNew={false} />}
        {value.who === "new" && (
          <Card className="space-y-3">
            <NewPersonFields value={value} of={step.name} onChange={set} />
            {step.needsRole && <p className={NOTE}>{heldWords(step)}</p>}
          </Card>
        )}
        {room.practice && <p className={NOTE}>This is a Practice Workspace, which takes no new people.</p>}
        {left > 0 && <p className="text-sm text-muted-foreground">Some people here are not offered: Contacts, and Guests for some places, cannot take this one.</p>}
      </StepForm>
    </>
  );
}

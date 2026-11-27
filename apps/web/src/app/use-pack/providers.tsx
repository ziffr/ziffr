"use client";
// "Who provides these numbers?" (spec 0068; GLOSSARY: Submitter, Contact): one answer for every number no Position
// submits. I do, other people (up to five, picked or by name and email address), or nobody for now.
import { Plus, X } from "lucide-react";
import { ScreenHeading } from "@/app/first-steps/parts";
import { Button } from "@/components/ui/button";
import type { StartPickable } from "@ziffr/core/pack-start-plan";
import type { StartRoom, StartStep } from "@ziffr/core/pack-start-steps";
import { eligible, emptyPerson, stepProblem, type Answers, type ProviderDraft, type ProvidersDraft } from "./answers";
import { Card, NOTE, PersonPick, StepForm, TEXT_BUTTON, Tick } from "./parts";

type Props = { step: Extract<StartStep, { step: "providers" }>; answers: Answers; onChange: (answers: Answers) => void; onContinue: () => void; room: StartRoom; me: { name: string }; people: StartPickable[] };

const NAMED = 4;

/** A few names, and how many more there are. */
export const namesWords = (names: string[]) => (names.length <= NAMED + 1 ? names.join(", ") : `${names.slice(0, NAMED).join(", ")} and ${names.length - NAMED} more`);

/** Who provides the numbers. */
export function ProvidersScreen({ step, answers, onChange, onContinue, room, me, people }: Props) {
  const { providers } = answers;
  const set = (patch: Partial<ProvidersDraft>, next = answers.next) => onChange({ ...answers, providers: { ...providers, ...patch }, next });
  const here = eligible(people, ["submit"]);
  const one = (id: number): ProviderDraft => ({ ...emptyPerson(room), id });
  const others = (on: boolean) => {
    const add = on && !providers.people.length;
    set({ others: on, nobody: false, ...(add ? { people: [one(answers.next)] } : {}) }, add ? answers.next + 1 : answers.next);
  };
  return (
    <>
      <ScreenHeading title="Who provides these numbers?">{namesWords(step.metrics.map((m) => m.name))}</ScreenHeading>
      <StepForm problem={stepProblem(step, answers)} onContinue={onContinue}>
        <Card className="divide-y divide-border py-1">
          <Tick title="I do" hint={me.name} checked={providers.me} onChange={(on) => set({ me: on, nobody: false })} />
          <Tick title="Other people" hint={`Up to ${step.max}`} checked={providers.others} onChange={others} />
          <Tick title="Nobody for now" hint="Nobody is asked. You can choose later." checked={providers.nobody} onChange={(on) => set(on ? { nobody: true, me: false, others: false } : { nobody: false })} />
        </Card>
        {providers.others && (
          <>
            <ol className="space-y-3">
              {providers.people.map((p, i) => {
                const of = `person ${i + 1}`;
                return (
                  <li key={p.id}>
                    <Card className="space-y-3">
                      <PersonPick label="Who" of={of} value={p} onChange={(value) => set({ people: providers.people.map((x) => (x.id === p.id ? { ...value, id: p.id } : x)) })} people={here} allowNew={!room.practice} />
                      {providers.people.length > 1 && (
                        <Button type="button" variant="ghost" className={`-ml-3 ${TEXT_BUTTON}`} onClick={() => set({ people: providers.people.filter((x) => x.id !== p.id) })}>
                          <X aria-hidden /> Remove<span className="sr-only"> {of}</span>
                        </Button>
                      )}
                    </Card>
                  </li>
                );
              })}
            </ol>
            {providers.people.length < step.max
              ? <Button type="button" variant="outline" className={TEXT_BUTTON} onClick={() => set({ people: [...providers.people, one(answers.next)] }, answers.next + 1)}><Plus aria-hidden /> Add another</Button>
              : <p className="text-sm text-muted-foreground">At most {step.max} here. Add more on each Metric&rsquo;s page.</p>}
          </>
        )}
        {!providers.nobody && <p className={NOTE}>Nothing is sent now. Whoever you name is asked from the next run.</p>}
      </StepForm>
    </>
  );
}

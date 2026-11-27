"use client";
// The question that lists a Repeat's lines (spec 0068; GLOSSARY: Repeat, Position, Contact, Trial Limit): a name and an
// email address for each, or someone already here, one more or a pasted list, never more than there is room for.
import { useState } from "react";
import { Plus, X } from "lucide-react";
import { ScreenHeading } from "@/app/first-steps/parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { StartRoom } from "@ziffr/core/pack-start-steps";
import type { StartPickable } from "@ziffr/core/pack-start-plan";
import { addPasted, eligible, emptyLine, filledLines, limitWords, meDraft, stepProblem, type Answers, type LineDraft, type LinesStep } from "./answers";
import { Card, NOTE, PersonPick, StepForm, TEXT_BUTTON, TEXT_FIELD } from "./parts";

type Props = { step: LinesStep; answers: Answers; onChange: (answers: Answers) => void; onContinue: () => void; room: StartRoom; me: { name: string }; people: StartPickable[] };

/** Pasting a list: one person to a line, added to what is there. */
function PasteList({ step, answers, onChange, onClose }: Pick<Props, "step" | "answers" | "onChange"> & { onClose: () => void }) {
  const [text, setText] = useState("");
  const [said, setSaid] = useState<string | null>(null);
  const add = () => {
    const done = addPasted(step, answers, text);
    onChange(done.answers);
    if (!done.left.length && done.added) return onClose();
    setText(done.left.join("\n"));
    setSaid(done.left.length ? `Added ${done.added}. These are left: they are not readable, or there is no room for them.` : "Nobody new in this list.");
  };
  return (
    <Card className="space-y-3">
      <label className="block text-sm font-medium">
        {step.person ? "One person on each line, such as: Ana Silva, ana@company.com" : "One name on each line"}
        <Textarea className="mt-1 min-h-32 text-base md:text-sm" value={text} onChange={(e) => setText(e.target.value)} maxLength={20_000} />
      </label>
      {said && <p role="status" className={NOTE}>{said}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" className={TEXT_BUTTON} disabled={!text.trim()} onClick={add}>Add these</Button>
        <Button type="button" variant="ghost" className={TEXT_BUTTON} onClick={onClose}>Close</Button>
      </div>
    </Card>
  );
}

/** The lines of one Repeat. */
export function LinesScreen({ step, answers, onChange, onContinue, room, me, people }: Props) {
  const [pasting, setPasting] = useState(false);
  const lines = answers.lines[step.repeat] ?? [];
  const { allowed } = step.limit;
  const set = (list: LineDraft[], next = answers.next) => onChange({ ...answers, lines: { ...answers.lines, [step.repeat]: list }, next });
  const change = (id: number, patch: Partial<LineDraft>) => set(lines.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const filled = filledLines(step, answers).length;
  const limit = limitWords(step.limit, room.trial !== null);
  return (
    <>
      <ScreenHeading title={step.question}>{step.person ? "Name and email are enough. Nothing is sent yet." : "A name for each is enough. Nothing is sent yet."}</ScreenHeading>
      <StepForm problem={stepProblem(step, answers)} onContinue={onContinue}>
        {allowed > 0 && lines.length > 0 && (
          <ol className="space-y-3">
            {lines.map((line, i) => {
              const of = `line ${i + 1}`;
              return (
                <li key={line.id}>
                  <Card className="space-y-3">
                    {step.asksName && (
                      <label className="block text-sm font-medium">
                        {step.name}<span className="sr-only">, {of}</span>
                        <Input className={TEXT_FIELD} value={line.name} maxLength={60} autoComplete="off" onChange={(e) => change(line.id, { name: e.target.value })} />
                      </label>
                    )}
                    {step.person && <PersonPick label="Who" of={of} value={line.person} onChange={(person) => change(line.id, { person })} people={eligible(people, step.person.places)} me={me.name} allowNew={!room.practice} />}
                    {step.others.map((o) => (
                      <PersonPick key={o.position} label={o.question} of={of} value={line.others[o.position] ?? meDraft()} onChange={(person) => change(line.id, { others: { ...line.others, [o.position]: person } })} people={eligible(people, o.places)} me={me.name} allowNew={!room.practice} />
                    ))}
                    {lines.length > 1 && (
                      <Button type="button" variant="ghost" className={`-ml-3 ${TEXT_BUTTON}`} onClick={() => set(lines.filter((l) => l.id !== line.id))}>
                        <X aria-hidden /> Remove<span className="sr-only"> {of}</span>
                      </Button>
                    )}
                  </Card>
                </li>
              );
            })}
          </ol>
        )}
        {pasting && <PasteList step={step} answers={answers} onChange={onChange} onClose={() => setPasting(false)} />}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {lines.length < allowed && (
            <Button type="button" variant="outline" className={TEXT_BUTTON} onClick={() => set([...lines, emptyLine(step, room, answers.next)], answers.next + 1)}>
              <Plus aria-hidden /> Add another
            </Button>
          )}
          {allowed > 0 && !pasting && <Button type="button" variant="ghost" className={TEXT_BUTTON} onClick={() => setPasting(true)}>Paste a list</Button>}
          <p className="text-sm text-muted-foreground" aria-live="polite">{filled > 0 ? `${filled} listed. ` : ""}{limit}{lines.length >= allowed && allowed > 0 ? ", all taken." : "."}</p>
        </div>
      </StepForm>
    </>
  );
}

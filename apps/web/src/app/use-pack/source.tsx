"use client";
// "Where do the numbers come from?" (spec 0068; GLOSSARY: Source, Feed, Automation Template): people type them, or a
// system or a spreadsheet sends them. Whoever was chosen to provide them also types them until it is connected.
import { Choice, Choices, ScreenHeading } from "@/app/first-steps/parts";
import type { StartStep } from "@ziffr/core/pack-start-steps";
import type { Answers } from "./answers";
import { NOTE, StepForm } from "./parts";
import { namesWords } from "./providers";

type Props = { step: Extract<StartStep, { step: "source" }>; answers: Answers; onChange: (answers: Answers) => void; onContinue: () => void; /** The names of the n8n templates, by their id. */ templates: Record<string, string> };

/** Where a system's numbers come from. */
export function SourceScreen({ step, answers, onChange, onContinue, templates }: Props) {
  const named = step.templates.flatMap((id) => templates[id] ?? []);
  return (
    <>
      <ScreenHeading title="Where do the numbers come from?">These can come from a system: {namesWords(step.metrics.map((m) => m.name))}.</ScreenHeading>
      <StepForm problem={null} onContinue={onContinue}>
        <Choices>
          <Choice title="People type them" hint="Works from the start" selected={answers.source === "typed"} onPick={() => onChange({ ...answers, source: "typed" })} />
          <Choice
            title="From our system or a spreadsheet"
            hint={`Someone technical connects it once.${named.length ? ` There are ready templates for ${namesWords(named)}.` : ""}`}
            selected={answers.source === "system"} onPick={() => onChange({ ...answers, source: "system" })}
          />
        </Choices>
        {answers.source === "system" && <p className={NOTE}>Until it is connected, the people you named type these numbers. After that, remove them from those Metrics.</p>}
      </StepForm>
    </>
  );
}

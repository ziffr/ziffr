// The Setup Guide's step bar (spec 0052; GLOSSARY: Setup Guide): an ordered list, each step a link with its state in
// words (done, skipped, to do, comes next), never in colour alone. A step that is not built yet still opens, and says
// what it will do, so no link leads nowhere.
import Link from "next/link";
import type { SetupStep, SetupStepId } from "@ziffr/core/setup-steps";
import { STEP_INFO } from "./step-info";

function stateOf(s: SetupStep): string {
  return s.ticked ? "Done" : s.skipped ? "Skipped" : STEP_INFO[s.id].built ? "To do" : "Comes next";
}

/** The viewer's steps in order, the one shown marked as the current step. On a phone: "Step 2 of 5" over one segment per step
 * (each a link at least 44 px tall, its state in words for screen readers); from the small breakpoint: the full list. */
export function StepBar({ steps, current }: { steps: SetupStep[]; current: SetupStepId }) {
  const at = Math.max(0, steps.findIndex((s) => s.id === current));
  return (
    <>
      <nav aria-label="Setup steps" className="mb-6 sm:hidden">
        <p className="text-sm font-medium">Step {at + 1} of {steps.length}: <span className="font-semibold">{STEP_INFO[current].label}</span></p>
        <ol className="mt-2 grid auto-cols-fr grid-flow-col gap-1.5">
          {steps.map((s, i) => (
            <li key={s.id}>
              <Link
                href={`/setup?step=${s.id}`}
                aria-current={s.id === current ? "step" : undefined}
                aria-label={`${i + 1}. ${STEP_INFO[s.id].label}, ${stateOf(s)}`}
                className="group flex min-h-11 items-center outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <span className={`h-1.5 w-full rounded-full ${s.id === current ? "bg-foreground" : s.ticked ? "bg-foreground/50" : s.skipped ? "border border-dashed border-foreground/50" : "bg-border"}`} />
              </Link>
            </li>
          ))}
        </ol>
      </nav>
      <DesktopBar steps={steps} current={current} />
    </>
  );
}

function DesktopBar({ steps, current }: { steps: SetupStep[]; current: SetupStepId }) {
  return (
    <nav aria-label="Setup steps" className="mb-8 hidden sm:block">
      <ol className="flex flex-wrap gap-x-1 gap-y-2">
        {steps.map((s, i) => {
          const here = s.id === current;
          return (
            <li key={s.id}>
              <Link
                href={`/setup?step=${s.id}`}
                aria-current={here ? "step" : undefined}
                className={`flex flex-col rounded-[var(--radius-input)] border px-3 py-2 text-sm outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${here ? "border-foreground/40 bg-card font-semibold" : "border-transparent text-muted-foreground hover:bg-card"}`}
              >
                <span>{i + 1}. {STEP_INFO[s.id].label}</span>
                <span className="text-xs font-normal">{stateOf(s)}</span>
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

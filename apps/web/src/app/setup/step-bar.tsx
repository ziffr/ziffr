// The Setup Guide's step bar (spec 0052; GLOSSARY: Setup Guide): an ordered list, each step a link with its state in
// words (done, skipped, to do, comes next), never in colour alone. A step that is not built yet still opens, and says
// what it will do, so no link leads nowhere.
import Link from "next/link";
import type { SetupStep, SetupStepId } from "@ziffr/core/setup-steps";
import { STEP_INFO } from "./step-info";

function stateOf(s: SetupStep): string {
  return s.ticked ? "Done" : s.skipped ? "Skipped" : STEP_INFO[s.id].built ? "To do" : "Comes next";
}

/** The viewer's steps in order, the one shown marked as the current step. */
export function StepBar({ steps, current }: { steps: SetupStep[]; current: SetupStepId }) {
  return (
    <nav aria-label="Setup steps" className="mb-8">
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

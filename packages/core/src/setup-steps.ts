// The Setup Guide's steps, worked out from facts (spec 0052, spec 0067; GLOSSARY: Setup Guide, Business Function). Pure:
// facts in, steps out, so every rule is a table test. Only a Member has steps: a new Owner has First Steps. A step is
// ticked only from what the person has; the only thing a click stores is skipping a step.
import type { WorkspaceRoleName } from "./actor";

/** The guide's steps, in order. */
export const SETUP_STEPS = ["about", "ways"] as const;
/** One of the guide's steps. */
export type SetupStepId = (typeof SETUP_STEPS)[number];

/** What the viewer has, read by the core and never carrying values or other people's details. */
export type SetupFacts = {
  /** The viewer's Delivery Preference for Prompts begins with a way that is real here. */
  preferenceReal: boolean;
  /** The viewer received a Test Message that was sent. */
  testMessageSent: boolean;
  /** The viewer has set their Business Function (any value, "something else" included). */
  businessFunctionSet: boolean;
};

/** One step as the viewer sees it. A skipped step is done for "finished" but is not ticked. */
export type SetupStep = { id: SetupStepId; ticked: boolean; skipped: boolean; done: boolean; next: boolean };

/** The viewer's steps, which is next, and whether they are all done (ticked or skipped). */
export type SetupSteps = { steps: SetupStep[]; next: SetupStepId | null; finished: boolean; ticked: number; total: number };

/** The steps a Workspace Role sees: a Member both, everyone else none. */
export function stepsFor(role: WorkspaceRoleName): readonly SetupStepId[] {
  return role === "member" ? SETUP_STEPS : [];
}

/** Whether one step is ticked, from facts alone. */
export function tickedStep(id: SetupStepId, facts: SetupFacts): boolean {
  return id === "about" ? facts.businessFunctionSet : facts.preferenceReal || facts.testMessageSent;
}

/** The steps a viewer sees, ticked from facts, and which comes next: the first neither ticked nor skipped. `skipped` is
 * the viewer's own. A role without steps is finished. */
export function setupSteps(facts: SetupFacts, role: WorkspaceRoleName, skipped: readonly string[] = []): SetupSteps {
  const steps: SetupStep[] = stepsFor(role).map((id) => {
    const ticked = tickedStep(id, facts);
    const was = skipped.includes(id);
    return { id, ticked, skipped: was, done: ticked || was, next: false };
  });
  const first = steps.find((s) => !s.done);
  if (first) first.next = true;
  return { steps, next: first?.id ?? null, finished: steps.every((s) => s.done), ticked: steps.filter((s) => s.ticked).length, total: steps.length };
}

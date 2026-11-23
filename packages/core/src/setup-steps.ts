// The Setup Guide's steps, worked out from facts (spec 0052; GLOSSARY: Setup Guide, Workspace Profile, Business
// Function). Pure: facts in, steps out, so every rule is a table test. A step is ticked only from what the Workspace
// has; the only things a click stores are skipping a step and choosing "Explore on my own" (a starting point).
import type { WorkspaceRoleName } from "./actor";

/** The guide's steps, in order. */
export const SETUP_STEPS = ["about", "start", "ways", "first_metric", "team"] as const;
/** One of the guide's steps. */
export type SetupStepId = (typeof SETUP_STEPS)[number];

/** The steps a Member has: only the two about themselves, and only these may be skipped on a person's own row. */
export const MEMBER_STEPS = ["about", "ways"] as const satisfies readonly SetupStepId[];

/** What the Workspace has, counted by the core and never carrying values or other people's details. */
export type SetupFacts = {
  /** The Workspace Profile has an industry and a country. */
  profileAnswered: boolean;
  /** The Workspace's clock was saved at least once (`workspaces.clock_set_at`). */
  clockSet: boolean;
  /** At least one Pack is installed. */
  packInstalled: boolean;
  /** How many Metrics the Workspace has (archived ones included: they were made). */
  metrics: number;
  /** "Explore on my own" was chosen. */
  startedFromScratch: boolean;
  /** The viewer's Delivery Preference for Prompts begins with a way that is real here. */
  preferenceReal: boolean;
  /** The viewer received a Test Message that was sent. */
  testMessageSent: boolean;
  /** The guide's Metric has a Prompt to the viewer that was sent or is held only by Quiet Hours. */
  promptOut: boolean;
  /** The guide's Metric has a value the viewer submitted through a Source, since the guide began. */
  valueIn: boolean;
  /** The Workspace has a member besides the Owner who opened it. */
  hasOtherMember: boolean;
  /** An invitation is waiting. */
  openInvitation: boolean;
  /** Domain Joining is on. */
  domainJoining: boolean;
  /** A Contact is a Submitter of at least one Metric. */
  contactSubmits: boolean;
  /** The viewer has set their Business Function (any value, "something else" included). */
  businessFunctionSet: boolean;
};

/** Which steps were skipped: by the Workspace (Owners and Admins share these) and by the viewer (a Member's own). */
export type SetupSkips = { workspace: readonly string[]; person: readonly string[] };

/** One step as the viewer sees it. A skipped step is done for "finished" but is not ticked. */
export type SetupStep = { id: SetupStepId; ticked: boolean; skipped: boolean; done: boolean; next: boolean };

/** The viewer's steps, which is next, and whether they are all done (ticked or skipped). */
export type SetupSteps = { steps: SetupStep[]; next: SetupStepId | null; finished: boolean; ticked: number; total: number };

/** The steps a Workspace Role sees: Owners and Admins all five, a Member the two about themselves, a Guest none. */
export function stepsFor(role: WorkspaceRoleName): readonly SetupStepId[] {
  return role === "owner" || role === "admin" ? SETUP_STEPS : role === "member" ? MEMBER_STEPS : [];
}

/** Whether one step is ticked for a viewer of this role, from facts alone. */
export function tickedStep(id: SetupStepId, facts: SetupFacts, role: WorkspaceRoleName): boolean {
  switch (id) {
    // A Member answers only their own function; Owners and Admins answer for the Workspace.
    case "about": return role === "member" ? facts.businessFunctionSet : facts.profileAnswered && facts.clockSet;
    case "start": return facts.packInstalled || facts.metrics > 0 || facts.startedFromScratch;
    case "ways": return facts.preferenceReal || facts.testMessageSent;
    case "first_metric": return facts.promptOut && facts.valueIn;
    case "team": return facts.hasOtherMember || facts.openInvitation || facts.domainJoining || facts.contactSubmits;
  }
}

/** The steps a viewer sees, ticked from facts, and which comes next: the first neither ticked nor skipped. A Member's
 * skips are their own; Owners' and Admins' are the Workspace's. A Guest has no steps and is finished. */
export function setupSteps(facts: SetupFacts, role: WorkspaceRoleName, skips: SetupSkips = { workspace: [], person: [] }): SetupSteps {
  const own = role === "member" ? skips.person : skips.workspace;
  const steps: SetupStep[] = stepsFor(role).map((id) => {
    const ticked = tickedStep(id, facts, role);
    const skipped = own.includes(id);
    return { id, ticked, skipped, done: ticked || skipped, next: false };
  });
  const first = steps.find((s) => !s.done);
  if (first) first.next = true;
  return { steps, next: first?.id ?? null, finished: steps.every((s) => s.done), ticked: steps.filter((s) => s.ticked).length, total: steps.length };
}

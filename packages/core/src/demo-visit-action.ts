// The one door a visitor's change goes through (GLOSSARY: Demo Mode, Demo Reset; spec 0051, ticket 8). The web app runs every
// server action that spec 0051 opens inside `runDemoVisit`, with the visit's cookies read: where visitors may change the demo and
// the action is open or limited (demo-changes.ts), the change is counted against the write budget once (`checkDemoBudget`) and
// then runs as a visit (`visitingDemo`), so the database lets it through only for a table on its allow-list and only for the
// current Generation. Everywhere else (the setting off, a blocked action, a real Workspace) the work runs as it always did and
// is refused as it always was: `visiting` is false then, and the work must not treat its texts as a visitor's.
import { type Actor } from "./actor";
import { checkDemoBudget, DemoBudgetUsed, takeDemoWorkflowRun } from "./demo-budget";
import { demoAllows } from "./demo-changes";
import { DemoLimit, DemoReadOnly, DemoSeededWords, DemoShowcase, DemoStale } from "./demo";
import { DemoTextRefused } from "./demo-text";
import { visitingDemo } from "./demo-visiting";
import { settingsInEffect } from "./settings-in-effect";
import { DEMO_WORKSPACE_ID } from "./team";

/** What a request says about the visit: the id from the demo cookie (null when it holds none), the Generation the page was drawn in
 * (the demo bar's cookie, null when absent) and the headers, for the network address. Only ever read from the request. */
export type DemoRequest = { visitId: string | null; generation: number | null; headers: { get(name: string): string | null } };

/** Options of one operation: whether it runs the Workflows, which only one visitor may do each minute. */
export type DemoVisitOptions = { workflowRun?: boolean };

/** Runs a demo visit's work for one server action (its key in demo-changes.ts). The work is told whether it is a visit that may
 * change the demo (`visiting`): then the texts it takes must be cleaned first (`demoTextForVisit`). Refuses, before any
 * work, a visit with no id or no Generation, one past a budget, and a second Workflow run in a minute. */
export async function runDemoVisit<T>(operation: string, who: DemoRequest, work: (visiting: boolean) => Promise<T>, options: DemoVisitOptions = {}): Promise<T> {
  const settings = await settingsInEffect();
  if (!demoAllows(operation, settings)) return work(false);
  // No id or no Generation: a page that was not drawn by the demo bar. Refused like a change the demo does not take.
  if (!who.visitId) throw new DemoReadOnly(settings);
  if (who.generation === null) throw new DemoStale();
  const actor: Pick<Actor, "workspaceId"> = { workspaceId: DEMO_WORKSPACE_ID };
  await checkDemoBudget(actor, { visitId: who.visitId, headers: who.headers });
  if (options.workflowRun) await takeDemoWorkflowRun(actor);
  return visitingDemo({ generation: who.generation, visit: who.visitId }, () => work(true));
}

/** The words of an error that a visit's change is refused with in the demo (budget, text rules, a stale page, a full limit,
 * the showcase or seeded words), or null for any other error, so a form that does not use `attempt` shows these and nothing else. */
export function demoVisitRefusal(e: unknown): string | null {
  return e instanceof DemoBudgetUsed || e instanceof DemoTextRefused || e instanceof DemoStale || e instanceof DemoLimit || e instanceof DemoShowcase || e instanceof DemoSeededWords ? e.message : null;
}

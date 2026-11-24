import "server-only";
// A visitor's change to the demo (GLOSSARY: Demo Mode; spec 0051): the one wrapper a server action that the demo opens
// (`open` or `limited` in packages/core/src/demo-changes.ts) runs its work in. In the demo, with the setting in effect, it
// counts the change once against the write budget (`checkDemoBudget`: per address, network, visit and demo) and runs the work
// under the visit's scope, so the database lets its writes through for a demo visit of the current Generation and for no one
// else. Anywhere else, and in the demo where the action is not open or the setting is off, it runs the work as it always
// was: the database then refuses the demo as before. The words are checked by the core where it saves them
// (`demo-visitor-words.ts`).
import { cookies, headers } from "next/headers";
import { DemoReadOnly, DemoStale } from "@ziffr/core/demo";
import { checkDemoBudget } from "@ziffr/core/demo-budget";
import { demoAllows } from "@ziffr/core/demo-changes";
import { visitingDemo } from "@ziffr/core/demo-visiting";
import { DEMO_WORKSPACE_ID } from "@ziffr/core/team";
import { attempt } from "./action-result";
import { DEMO_GENERATION_COOKIE, DEMO_VISIT_COOKIE, visitIdOf } from "./demo-visit-cookie";
import { currentActor } from "./viewer";

/** Runs a server action's work as the demo's rules ask: see the module's comment. `operation` is the action's key in
 * demo-changes.ts ("canvas-actions:placeWidget"); an action that is not open there gets no visit's scope. */
export async function asVisitor<T>(operation: string, work: () => Promise<T>): Promise<T> {
  const actor = await currentActor();
  if (actor.workspaceId !== DEMO_WORKSPACE_ID || !demoAllows(operation)) return work();
  const jar = await cookies();
  const visit = visitIdOf(jar.get(DEMO_VISIT_COOKIE)?.value);
  if (!visit) throw new DemoReadOnly();
  // The Generation the page was drawn in comes with the change; without one (a page that never drew the demo bar) the
  // change is refused as stale rather than written into a demo the visitor has not seen.
  const generation = Number(jar.get(DEMO_GENERATION_COOKIE)?.value);
  if (!Number.isSafeInteger(generation) || generation < 0) throw new DemoStale();
  await checkDemoBudget(actor, { visitId: visit, headers: await headers() });
  return visitingDemo({ generation, visit }, work);
}

/** `attempt` (a refusal answered as words) around `asVisitor`: how an opened server action is written. */
export function attemptAsVisitor<T>(operation: string, work: () => Promise<T>) {
  return attempt(() => asVisitor(operation, work));
}

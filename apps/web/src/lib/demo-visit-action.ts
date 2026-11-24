import "server-only";
// A demo visit's change as a server action does it (GLOSSARY: Demo Mode, Demo Reset; spec 0051, ticket 8): reads the visit's
// cookies (its id, and the Generation the page was drawn in) and hands them to the core's one door, `runDemoVisit`. Outside the
// demo, and wherever visitors may not change it or the action is not open, the work runs as it always did.
import { cookies, headers } from "next/headers";
import { runDemoVisit, type ChargeValues, type DemoVisitOptions } from "@ziffr/core/demo-visit-action";
import { demoChangesInEffect } from "@ziffr/core/demo-reset-decision";
import { settingsInEffect } from "@ziffr/core/settings-in-effect";
import { isDemo } from "./auth";
import { DEMO_GENERATION_COOKIE, DEMO_VISIT_COOKIE, visitIdOf } from "./demo-visit-cookie";

/** The Generation a cookie says, or null when it is not a number the demo bar wrote. */
function generationOf(value: string | undefined): number | null {
  return value !== undefined && /^[0-9]{1,15}$/.test(value) ? Number(value) : null;
}

/** Whether this is a demo visit on an Installation where visitors may change the demo (spec 0051): the words of a screen that
 * says "nothing is saved" change only then. */
export async function visitorsMayChangeDemo(): Promise<boolean> {
  return (await isDemo()) && demoChangesInEffect(await settingsInEffect());
}

/** Runs the work of one server action (its key in packages/core/src/demo-changes.ts). `visiting` tells the work whether it is a
 * visit that may change the demo: then the texts it takes go through the text rules (`demoTextForVisit`) first. */
export async function inDemoVisit<T>(operation: string, work: (visiting: boolean, charge: ChargeValues) => Promise<T>, options: DemoVisitOptions = {}): Promise<T> {
  if (!(await isDemo())) return work(false, async () => {});
  const jar = await cookies();
  return runDemoVisit(operation, { visitId: visitIdOf(jar.get(DEMO_VISIT_COOKIE)?.value), generation: generationOf(jar.get(DEMO_GENERATION_COOKIE)?.value), headers: await headers() }, work, options);
}

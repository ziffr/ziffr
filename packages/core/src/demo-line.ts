// What the demo's line on every page is told (GLOSSARY: Demo Mode, Demo Reset; spec 0051, ticket 7): the Generation the demo
// is in, when it began and when it is next due to start fresh, with the server's time. Installation-wide state, no
// Workspace data and nobody's, so it takes no Actor; the web app asks only for a demo visit, where visitors may change the demo.
import { nextResetWindowStart, type DemoLineFacts } from "./demo-reset-line";
import { readDemoState } from "./demo-reset";

/** The facts for the demo bar at `now`, or null where the demo has no state row (nothing to count down to). */
export async function demoLineFacts(now: Date = new Date()): Promise<DemoLineFacts | null> {
  const state = await readDemoState();
  if (!state) return null;
  return { generation: state.generation, resetAt: state.resetAt ? state.resetAt.getTime() : null, nextResetAt: nextResetWindowStart(now).getTime(), serverNow: now.getTime() };
}

// Where Home sends a person before showing a dashboard, and where the old Setup Guide address sends an Owner or Admin
// (spec 0052, spec 0067; GLOSSARY: First Steps, Setup Guide). Pure, so each is one table test. The targets are fixed
// relative paths and never come from the request. Home leads once: the core notes it, so there is no loop.
import { FIRST_STEPS_PATH } from "@ziffr/core/first-steps-screens";

/** The fixed paths Home may send someone to. */
export type HomeRedirect = typeof FIRST_STEPS_PATH | "/setup" | null;

/** What is waiting for the person (an Owner's First Steps, else a Member's Setup Guide), or null to show their
 * dashboard. */
export function homeRedirect(pending: { firstSteps: boolean; setupGuide: boolean }): HomeRedirect {
  return pending.firstSteps ? FIRST_STEPS_PATH : pending.setupGuide ? "/setup" : null;
}

/** Where `/setup` sends an Owner or Admin, who have no Setup Guide: the step they asked for lives on its own page now. */
export function managersSetupTarget(step: string | undefined): "/connectors" | "/team" | "/" {
  return step === "ways" ? "/connectors" : step === "team" ? "/team" : "/";
}

// Where Home sends a person before showing a dashboard (spec 0010 ticket 193 for the Trial Guide, spec 0052 for the Setup
// Guide; GLOSSARY: Setup Guide, Trial Guide). Pure, so the order is one table test. Targets are fixed relative paths and
// never come from the request. The Trial Guide goes first: a trial Workspace keeps going to it (until the guides are
// joined, spec 0052 ticket 12). The Setup Guide goes only while the person has not opened it: /setup writes "seen" on its
// first render, so Home can lead there once and never again, and neither page redirects back to the other, so no loop.

/** The fixed paths Home may send someone to. */
export type HomeRedirect = "/try/start" | "/setup" | null;

/** The first guide that is waiting for the person, or null to show their dashboard. */
export function homeRedirect(pending: { trialGuide: boolean; setupGuide: boolean }): HomeRedirect {
  if (pending.trialGuide) return "/try/start";
  if (pending.setupGuide) return "/setup";
  return null;
}

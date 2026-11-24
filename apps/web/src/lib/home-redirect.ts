// Where Home sends a person before showing a dashboard (spec 0052, ticket 12; GLOSSARY: Setup Guide). Pure, so the order is
// one table test. The target is a fixed relative path and never comes from the request. The Setup Guide goes only while the
// person has not opened it: /setup writes "seen" on its first render, so Home can lead there once and never again, and
// /setup never redirects back, so no loop. A trial's Owner has no guide of their own: it is the same Setup Guide.

/** The fixed paths Home may send someone to. */
export type HomeRedirect = "/setup" | null;

/** The guide that is waiting for the person, or null to show their dashboard. */
export function homeRedirect(pending: { setupGuide: boolean }): HomeRedirect {
  return pending.setupGuide ? "/setup" : null;
}

// A demo-only Installation (GLOSSARY: Demo Mode; spec 0051, final review D6) takes no new Workspace: the demo must stay its
// only one, because the database lets visitors write only while no other Workspace exists. An account made directly in the
// auth service could otherwise create one and switch the demo off for everyone.

/** The words for the refusal. */
export const DEMO_TAKES_NO_WORKSPACES = "This Ziffr is a demo and takes no new Workspaces.";

/** Refuses, in plain words, a new Workspace (made or imported) where this Ziffr is a public demo and nothing else (`ZIFFR_DEMO_ONLY=1`, a server setting). */
export function refuseNewWorkspaceInDemoOnly(env: Record<string, string | undefined> = process.env): void {
  if (env.ZIFFR_DEMO_ONLY === "1") throw new Error(DEMO_TAKES_NO_WORKSPACES);
}

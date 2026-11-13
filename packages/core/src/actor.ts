// Who is acting, in which Workspace, with which Workspace Role (GLOSSARY: Workspace, Workspace Role, Access Key).
// Every core function takes an Actor first and checks the workspace before anything else.

/** A Workspace Role (GLOSSARY: Workspace Role). */
export type WorkspaceRoleName = "owner" | "admin" | "member" | "guest";

/** Someone acting in one Workspace: a signed-in person, or an Access Key acting for one. */
export type Actor = {
  personId: string;
  workspaceId: string;
  role: WorkspaceRoleName;
  /** Set when an Access Key acts for the person; it can do no more than its scopes allow. */
  key?: { id: string; scopes: string[] };
};

/** What a Workspace Role may do in its workspace as a whole. */
export type Capability = "create" | "share" | "manage-members" | "manage-themes" | "manage-groups" | "billing";

const CAN: Record<WorkspaceRoleName, Capability[]> = {
  owner: ["create", "share", "manage-members", "manage-themes", "manage-groups", "billing"],
  admin: ["create", "share", "manage-members", "manage-themes", "manage-groups"],
  member: ["create", "share"],
  guest: [],
};

/** Whether the actor's Workspace Role allows this. Guests create and share nothing; only owners handle billing. */
export function can(actor: Actor, capability: Capability): boolean {
  return CAN[actor.role].includes(capability);
}

/** Thrown when an actor may not do or see something; callers turn it into "not found" or "forbidden". */
export class Forbidden extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "Forbidden";
  }
}

/** Refuses anything from another workspace. Called first by every core function that touches stored rows. */
export function assertSameWorkspace(actor: Actor, ...rows: ({ workspace_id: string } | null | undefined)[]): void {
  for (const row of rows) if (!row || row.workspace_id !== actor.workspaceId) throw new Forbidden();
}

/** Refuses unless the actor's role allows the capability. */
export function assertCan(actor: Actor, capability: Capability): void {
  if (!can(actor, capability)) throw new Forbidden(`Your role cannot ${capability.replace("-", " ")}.`);
}

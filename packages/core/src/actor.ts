// Who is acting, in which Workspace, with which Workspace Role (GLOSSARY: Workspace, Workspace Role, Access Key).
// Every core function takes an Actor first and checks the workspace before anything else.

/** A Workspace Role (GLOSSARY: Workspace Role). */
export type WorkspaceRoleName = "owner" | "admin" | "member" | "guest";

/** A signed-in person acting in one Workspace. Core functions take this; an Access Key is not one (see KeyActor). */
export type Actor = {
  personId: string;
  workspaceId: string;
  role: WorkspaceRoleName;
  /** Never set on a person's Actor: keys are KeyActors, so no function accepts a key unless it says so. */
  key?: undefined;
};

/** An Access Key acting for its creator in one Workspace (GLOSSARY: Access Key). Deny by default: only functions
 * that take `Actor | KeyActor` accept it, and those check its scopes. */
export type KeyActor = Omit<Actor, "key"> & { key: { id: string; scopes: string[] } };

/** What a Workspace Role may do in its workspace as a whole. */
export type Capability = "create" | "share" | "manage-members" | "manage-themes" | "manage-groups" | "billing";

const CAN: Record<WorkspaceRoleName, Capability[]> = {
  owner: ["create", "share", "manage-members", "manage-themes", "manage-groups", "billing"],
  admin: ["create", "share", "manage-members", "manage-themes", "manage-groups"],
  member: ["create", "share"],
  guest: [],
};

/** Whether the actor's Workspace Role allows this. Guests create and share nothing; only owners handle billing. An
 * Access Key has none of these: it only reads and submits within its scopes (see assertScope). */
export function can(actor: Actor | KeyActor, capability: Capability): boolean {
  if (actor.key) return false;
  return CAN[actor.role].includes(capability);
}

/** What an Access Key may be allowed to do. */
export type Scope = "metrics:read" | "values:submit";

/** Every scope a key can have. */
export const SCOPES: Scope[] = ["metrics:read", "values:submit"];

/** Refuses an Access Key without the scope; a signed-in person passes (their role decides elsewhere). */
export function assertScope(actor: Actor | KeyActor, scope: Scope): void {
  if (actor.key && !actor.key.scopes.includes(scope)) throw new Forbidden(`This key may not ${scope.replace(":", " ")}.`);
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

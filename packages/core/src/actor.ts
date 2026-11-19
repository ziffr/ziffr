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

/** A Feed Key acting for its Feed (GLOSSARY: Feed, Feed Key; spec 0012). It is nobody: it has no person and no role,
 * so no function written for people or their keys accepts it (they need `personId`). Only the Feed functions take it. */
export type FeedActor = { feedId: string; workspaceId: string; feed: true; key: { id: string; scopes: string[] } };

/** The only thing a Feed Key may do: record values for its Feed's Metrics. Never given to a person's key. */
export const FEED_SCOPE = "feed:submit";

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

/** What an Access Key may be allowed to do. "metrics:write" creates Metrics owned by the key's creator (spec 0003),
 * and only while the creator's role may create. "metrics:edit" changes the Metrics the creator owns or edits: their
 * Target Range, Target Series, Projections and Unusual Value check (ticket #211), only while the creator's role may
 * create; a scope of its own, so keys made before it can do no more than they could. "dashboards:read" reads the dashboards the creator sees,
 * "dashboards:write" builds them (spec 0014), only while the creator's role may create and only what they may change. */
export type Scope = "metrics:read" | "values:submit" | "metrics:write" | "metrics:edit" | "dashboards:read" | "dashboards:write";

/** Every scope a key can have. */
export const SCOPES: Scope[] = ["metrics:read", "values:submit", "metrics:write", "metrics:edit", "dashboards:read", "dashboards:write"];

/** Each scope by the label the key form and the consent screen give it, so a refusal names what to tick. */
export const SCOPE_LABEL: Record<Scope, string> = { "metrics:read": "Read metrics", "values:submit": "Submit values", "metrics:write": "Create metrics", "metrics:edit": "Change metrics", "dashboards:read": "Read dashboards", "dashboards:write": "Build dashboards" };

/** Why a key without this scope is refused, in the same words wherever it is refused (API and core alike). */
export const scopeRefusal = (scope: Scope) => `This key lacks the scope "${SCOPE_LABEL[scope]}" (${scope}).`;

/** Scopes only a creator whose role may create can give a key. */
export const CREATING_SCOPES: Scope[] = ["metrics:write", "metrics:edit", "dashboards:write"];

/** Refuses an Access Key without the scope; a signed-in person passes (their role decides elsewhere). */
export function assertScope(actor: Actor | KeyActor, scope: Scope): void {
  if (actor.key && !actor.key.scopes.includes(scope)) throw new Forbidden(scopeRefusal(scope));
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

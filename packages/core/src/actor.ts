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

/** A Webhook that called back, signed with its own secret (GLOSSARY: Webhook; spec 0034). Like a Feed it is nobody: no
 * person and no role, so no function written for people accepts it (they need `personId`); only the inbound Webhook
 * functions take it, and they act on Actions sent to that Webhook only. `name` is the Webhook's name at that moment. */
export type WebhookActor = { webhookId: string; workspaceId: string; webhook: true; name: string };

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
 * "dashboards:write" builds them (spec 0014), only while the creator's role may create and only what they may change.
 * "alerts:write" makes, changes and removes the creator's own Alerts (spec 0032): a scope of its own because an Alert sends
 * messages, and apart from "values:submit" and "metrics:edit" because it records and changes no Metric; any role that
 * signs in may hold it, since an Alert is only ever the creator's own. "actions:read" lists the Actions waiting for the
 * creator or asked by them, "actions:write" replies, closes, reopens and marks done in their name (ticket #427; the
 * creator's own Actions only). "values:approve" approves a value or sends it back: a person's check, so only a
 * program's key may hold it, never an assistant (ASSISTANT_SCOPES leaves it out), and never ticked by default.
 * "view-links:write" makes, lists and revokes View Links to the creator's own dashboards (ticket #435): a View Link publishes
 * data to people outside the workspace, so the same rules, and only while the creator's role may share.
 * "usage:read" reads the Workspace's own Usage figures as counts (ticket #370, spec 0031): for a program's key only, and
 * only while the creator is an Owner or Admin, as the Usage page is.
 * "workflows:write" makes, changes and deletes the creator's own Workflows and their steps (ticket #433), only while the
 * creator's role may create; "workflows:people" on top names the Approvers and who a Tell step tells: who approves is a
 * person's decision, so it is key-only like "values:approve".
 * "shares:write", "groups:write" and "people:write" (ticket #434) change who sees what: Shares and access requests, Groups
 * and who is in them, people, Contacts, invitations and join requests. Key-only too, and a key holds each only while
 * its creator's role has the matching capability (checkKeyRequest). */
export type Scope = "metrics:read" | "values:submit" | "metrics:write" | "metrics:edit" | "dashboards:read" | "dashboards:write" | "alerts:write" | "actions:read" | "actions:write" | "values:approve" | "view-links:write" | "usage:read" | "workflows:write" | "workflows:people" | "shares:write" | "groups:write" | "people:write";

/** Every scope a key can have. */
export const SCOPES: Scope[] = ["metrics:read", "values:submit", "metrics:write", "metrics:edit", "dashboards:read", "dashboards:write", "alerts:write", "actions:read", "actions:write", "values:approve", "view-links:write", "usage:read", "workflows:write", "workflows:people", "shares:write", "groups:write", "people:write"];

/** The scopes only a program's key may hold: approving is a person's check (ticket #427), and text in a Thread could
 * talk an assistant into it, so no assistant is offered them and none can be granted them. */
export const KEY_ONLY_SCOPES: Scope[] = ["values:approve", "view-links:write", "usage:read", "workflows:people", "shares:write", "groups:write", "people:write"];

/** The scopes an assistant may be given on the consent screen (spec 0023). */
export const ASSISTANT_SCOPES: Scope[] = SCOPES.filter((s) => !KEY_ONLY_SCOPES.includes(s));

/** Each scope by the label the key form and the consent screen give it, so a refusal names what to tick. */
export const SCOPE_LABEL: Record<Scope, string> = { "metrics:read": "Read metrics", "values:submit": "Submit values", "metrics:write": "Create metrics", "metrics:edit": "Change metrics", "dashboards:read": "Read dashboards", "dashboards:write": "Build dashboards", "alerts:write": "Manage alerts", "actions:read": "Read questions and tasks", "actions:write": "Answer questions and tasks", "values:approve": "Approve values", "view-links:write": "Manage View Links", "usage:read": "Read usage figures", "workflows:write": "Build workflows", "workflows:people": "Name who approves and who is told", "shares:write": "Share and answer access requests", "groups:write": "Manage groups", "people:write": "Invite and remove people" };

/** Why a key without this scope is refused, in the same words wherever it is refused (API and core alike). */
export const scopeRefusal = (scope: Scope) => `This key lacks the scope "${SCOPE_LABEL[scope]}" (${scope}).`;

/** Scopes only a creator whose role may create can give a key. */
export const CREATING_SCOPES: Scope[] = ["metrics:write", "metrics:edit", "dashboards:write", "view-links:write", "workflows:write", "workflows:people"];

/** Refuses an Access Key without the scope; a signed-in person passes (their role decides elsewhere). */
export function assertScope(actor: Actor | KeyActor, scope: Scope): void {
  if (actor.key && !actor.key.scopes.includes(scope)) throw new Forbidden(scopeRefusal(scope));
}

/** Thrown when a request cannot be done for a reason the person asking may be told in words (a period not over, an end
 * date out of range): the API answers 422 with it, and only with errors of this kind (ticket #435). */
export class Refused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Refused";
  }
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

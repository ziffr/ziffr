// Workspace settings (spec 0006, tickets #96 and #97; GLOSSARY: Workspace, Workspace Role, Workspace Profile): the
// workspace's name and its Workspace Profile. Owners and Admins change them, never in the demo; every member reads.
import { Forbidden, type Actor } from "./actor";
import { db } from "./db";
import { HIDDEN_CHARACTERS } from "./profile";
import { DEMO_WORKSPACE_ID } from "./team";
import { checkProfile, type WorkspaceProfile } from "./workspace-profile";

/** The longest name a workspace can have. */
export const MAX_WORKSPACE_NAME = 80;

// The demo is shared by every visitor: what one of them stored there, all the others would see.
function assertManages(actor: Actor, what: string) {
  if (actor.key || (actor.role !== "owner" && actor.role !== "admin")) throw new Forbidden(`Only Owners and Admins change the workspace's ${what}.`);
  if (actor.workspaceId === DEMO_WORKSPACE_ID) throw new Forbidden("The demo keeps its settings.");
}

/** The workspace's name. */
export async function workspaceName(actor: Actor): Promise<string> {
  const { data } = await db().from("workspaces").select("name").eq("id", actor.workspaceId).single();
  return String(data?.name ?? "");
}

/** Renames the actor's workspace, for Owners and Admins. */
export async function renameWorkspace(actor: Actor, name: unknown): Promise<void> {
  assertManages(actor, "name");
  if (typeof name !== "string" || HIDDEN_CHARACTERS.test(name)) throw new Error("Give the workspace a name without hidden characters.");
  const clean = name.trim().replace(/\s+/g, " ");
  if (!clean) throw new Error("Give the workspace a name.");
  if ([...clean].length > MAX_WORKSPACE_NAME) throw new Error(`Keep the name to ${MAX_WORKSPACE_NAME} characters.`);
  const { error } = await db().from("workspaces").update({ name: clean }).eq("id", actor.workspaceId);
  if (error) throw new Error("The name could not be saved.");
}

/** What kind of business the actor's workspace belongs to, for any member (a Guest too: it describes the team, not a
 * person). The Metric Catalog reads it to suggest Metrics; every field is null until set. */
export async function workspaceProfile(actor: Actor): Promise<WorkspaceProfile> {
  const { data } = await db().from("workspaces").select("industry, segment, country, currency, employee_band, revenue_band").eq("id", actor.workspaceId).single();
  // Read back through the same check, so a caller only ever gets values from the lists.
  const r = checkProfile({ industry: data?.industry, segment: data?.segment, country: data?.country, currency: data?.currency, employeeBand: data?.employee_band, revenueBand: data?.revenue_band });
  return r.ok ? r.profile : { industry: null, segment: null, country: null, currency: null, employeeBand: null, revenueBand: null };
}

/** Sets the whole Workspace Profile, for Owners and Admins; a field left out or null is cleared. Every value must be
 * on its list. */
export async function setWorkspaceProfile(actor: Actor, input: unknown): Promise<WorkspaceProfile> {
  assertManages(actor, "profile");
  const r = checkProfile(input);
  if (!r.ok) throw new Error(`Pick the ${r.field === "employeeBand" ? "number of people" : r.field === "revenueBand" ? "revenue" : r.field} from the list.`);
  const p = r.profile;
  const { error } = await db().from("workspaces").update({ industry: p.industry, segment: p.segment, country: p.country, currency: p.currency, employee_band: p.employeeBand, revenue_band: p.revenueBand }).eq("id", actor.workspaceId);
  if (error) throw new Error("The profile could not be saved.");
  return p;
}

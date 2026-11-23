// The people of an imported Workspace Export (spec 0040, ticket 9; GLOSSARY: Workspace Export, Invitation): a person in
// the file is a held invitation, never an account or a Contact. It says nothing and sends nothing until the new Owner
// presses "Invite everyone", cannot be accepted before, and keeps what the file says of that person (their name, the
// Groups they were in, what was shared with them, the Metrics they owned or sent values for) as a small plan that is
// applied the moment they join. Nothing here reads the file: the plan was made by the import from rows it had made
// itself, so every id in it is a row of this Workspace, and it is checked against the Workspace again when applied.
// Security: the plan holds database ids of the Workspace's own rows and the person's name as text from the file (shown
// escaped, never put into HTML or a link); applying it never gives more than the file named, only to the person who
// proved the invited address, and a Guest owns nothing.
import { db } from "./db";
import { randomBytes } from "node:crypto";

/** What a held invitation keeps of a person of the file. */
export type ImportPlan = {
  /** The name the file gives them, for the Team page; never used as a sign-in or an address. */
  name: string;
  /** Groups to join, by id. */
  groups: number[];
  /** Things shared with them as Viewers, by type and id. */
  shares: { type: "metric" | "dashboard" | "deck"; id: number }[];
  /** Metrics they send values for. */
  submits: number[];
  /** Metrics they own: only for an Admin or Member, never a Guest. */
  owns: number[];
};

/** The most of each list a plan keeps: a Workspace's limits of the format (Metrics, Shares) cut it, not a hostile file. */
export const PLAN_LISTS = 20_000;

/** A new, empty plan for a person. */
export const emptyPlan = (name: string): ImportPlan => ({ name, groups: [], shares: [], submits: [], owns: [] });

/** Makes a person's held invitation. It lasts a year held, and 14 days from the moment it is released. */
export async function holdInvitation(workspaceId: string, createdBy: string, person: { email: string; role: "admin" | "member" | "guest" }, plan: ImportPlan): Promise<void> {
  const { error } = await db().from("invitations").insert({
    workspace_id: workspaceId, token: randomBytes(24).toString("base64url"), email: person.email.toLowerCase(), role: person.role, created_by: createdBy,
    expires_at: new Date(Date.now() + 365 * 86_400_000).toISOString(), held_at: new Date().toISOString(), import_plan: plan,
  });
  if (error) throw new Error("A person of the file could not be kept as an invitation.");
}

/** A plan as stored, or null when it is not one: only numbers and known words are read, whatever the column holds. */
function readPlan(raw: unknown): ImportPlan | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const ids = (v: unknown) => (Array.isArray(v) ? v.slice(0, PLAN_LISTS).filter((n): n is number => Number.isSafeInteger(n) && n > 0) : []);
  const shares = Array.isArray(r.shares) ? r.shares.slice(0, PLAN_LISTS).flatMap((s) => {
    const x = s as { type?: unknown; id?: unknown };
    return (x?.type === "metric" || x?.type === "dashboard" || x?.type === "deck") && Number.isSafeInteger(x.id) && (x.id as number) > 0 ? [{ type: x.type as "metric" | "dashboard" | "deck", id: x.id as number }] : [];
  }) : [];
  return { name: typeof r.name === "string" ? r.name.slice(0, 120) : "", groups: ids(r.groups), shares, submits: ids(r.submits), owns: ids(r.owns) };
}

/** Applies a joined person's plan in the Workspace of their invitation: Groups, Shares as Viewer, Submitter Tokens
 * and the Metrics they owned. Each row is looked up in the Workspace first, so a plan naming a row that is gone, or
 * another Workspace's, does nothing for it. Never throws for one row: the person has joined either way. */
export async function applyImportPlan(workspaceId: string, personId: string, role: string, rawPlan: unknown): Promise<void> {
  const plan = readPlan(rawPlan);
  if (!plan) return;
  const ws = workspaceId;
  const inWorkspace = async (table: "groups" | "metrics" | "dashboards" | "decks", ids: number[]): Promise<number[]> => {
    const found: number[] = [];
    for (let i = 0; i < ids.length; i += 500) {
      const { data } = await db().from(table).select("id").eq("workspace_id", ws).in("id", ids.slice(i, i + 500));
      found.push(...(data ?? []).map((r) => Number(r.id)));
    }
    return found;
  };
  const [groups, submits, owns, dashboards, decks, metricShares] = await Promise.all([
    inWorkspace("groups", plan.groups), inWorkspace("metrics", plan.submits), role === "guest" ? Promise.resolve([]) : inWorkspace("metrics", plan.owns),
    inWorkspace("dashboards", plan.shares.filter((s) => s.type === "dashboard").map((s) => s.id)), inWorkspace("decks", plan.shares.filter((s) => s.type === "deck").map((s) => s.id)),
    inWorkspace("metrics", plan.shares.filter((s) => s.type === "metric").map((s) => s.id)),
  ]);
  const chunks = <T>(rows: T[]) => Array.from({ length: Math.ceil(rows.length / 500) }, (_, i) => rows.slice(i * 500, i * 500 + 500));
  for (const part of chunks(groups.map((g) => ({ group_id: g, user_id: personId, workspace_id: ws })))) await db().from("group_members").upsert(part);
  const shares = [...dashboards.map((id) => ["dashboard", id] as const), ...decks.map((id) => ["deck", id] as const), ...metricShares.map((id) => ["metric", id] as const)];
  for (const part of chunks(shares.map(([type, id]) => ({ object_type: type, object_id: id, user_id: personId, role: "viewer", workspace_id: ws })))) await db().from("shares").insert(part);
  for (const part of chunks(submits.map((m) => ({ code: `tk-${randomBytes(18).toString("base64url")}`, metric_id: m, submitter_id: personId })))) await db().from("tokens").insert(part);
  // Ownership moves only from the Owner who imported (never from someone who took a Metric over since).
  const { data: owner } = await db().from("memberships").select("user_id").eq("workspace_id", ws).eq("role", "owner").order("created_at").limit(1).maybeSingle();
  if (owner && owns.length) for (const part of chunks(owns)) await db().from("metrics").update({ owner_id: personId }).eq("workspace_id", ws).eq("owner_id", owner.user_id as string).in("id", part);
}

// The Workspace's View Designs (spec 0024, GLOSSARY: View Design): designs people brought in, which everyone in the
// Workspace can choose like a built-in View. Only Owners and Admins add or remove one, and both are in the Audit Log.
// Security: every design is checked (checkViewDesign: schema, limits, plain text only) before it is stored, and read
// back through the same checks, so a row changed by hand still cannot reach the renderer unchecked.
import { db } from "./db";
import { Forbidden, type Actor } from "./actor";
import { audit } from "./audit-log";
import { checkViewDesign, checkViewDesignValue, type ViewDesign } from "./view-design";
import type { Problem } from "./json-check";
import { checkedDesignSetting } from "./widget-designs";
import type { WidgetSettings } from "./types";

/** A View Design added to a Workspace. */
export type WorkspaceDesign = { id: number; name: string; body: ViewDesign; addedBy: string | null; createdAt: string };

/** At most this many designs in a Workspace, so the list stays one people can choose from. */
export const MAX_WORKSPACE_DESIGNS = 100;

// A person, not a program: Access Keys and Feeds have no say over the Workspace's designs.
function assertPerson(actor: Actor) {
  if ((actor as { key?: unknown }).key) throw new Forbidden();
}

function assertManages(actor: Actor) {
  assertPerson(actor);
  if (actor.role !== "owner" && actor.role !== "admin") throw new Forbidden("Only Owners and Admins add View Designs to the Workspace.");
}

/** The Workspace's View Designs, oldest first, for anyone in it but Guests. */
export async function listViewDesigns(actor: Actor): Promise<WorkspaceDesign[]> {
  assertPerson(actor);
  if (actor.role === "guest") return [];
  const { data, error } = await db().from("view_designs").select("id, name, body, added_by, created_at").eq("workspace_id", actor.workspaceId).order("id");
  if (error) throw new Error("The View Designs could not be read.");
  return (data ?? []).flatMap((r) => {
    const res = checkViewDesignValue(r.body);
    return res.ok ? [{ id: Number(r.id), name: String(r.name), body: res.design, addedBy: (r.added_by as string | null) ?? null, createdAt: String(r.created_at) }] : [];
  });
}

/** A design setting for a widget on a dashboard or in the Pool: the Workspace's design of that id, as stored, or the
 * widget's own copy unchanged. So a widget draws only a design an Owner or Admin added, or one it already had (its
 * copy stays when the design is removed from the Workspace). Anything else is refused. */
export async function allowedDesign(actor: Actor, next: WidgetSettings["design"], current?: WidgetSettings["design"]): Promise<WidgetSettings["design"]> {
  if (!next) return next;
  if (current && JSON.stringify(current) === JSON.stringify(next)) return current;
  if (!next.id) throw new Forbidden("Only a View Design added to the Workspace can be placed.");
  const { data } = await db().from("view_designs").select("id, body").eq("id", next.id).eq("workspace_id", actor.workspaceId).maybeSingle();
  if (!data) throw new Forbidden("This View Design is no longer in the Workspace.");
  return checkedDesignSetting({ id: Number(data.id), body: data.body });
}

/** The result of adding a design: its id, or every problem found in the file, with its line. */
export type AddResult = { ok: true; id: number } | { ok: false; problems: Problem[] };

/** Adds a View Design to the Workspace from the text of its file (Owners and Admins; audited). The file is checked
 * here, on the server, whatever the browser checked before. */
export async function addViewDesign(actor: Actor, text: string): Promise<AddResult> {
  assertManages(actor);
  const res = checkViewDesign(typeof text === "string" ? text : "");
  if (!res.ok) return res;
  const { count } = await db().from("view_designs").select("id", { count: "exact", head: true }).eq("workspace_id", actor.workspaceId);
  if ((count ?? 0) >= MAX_WORKSPACE_DESIGNS) throw new Error(`A Workspace keeps at most ${MAX_WORKSPACE_DESIGNS} View Designs; remove one first.`);
  const { data, error } = await db().from("view_designs").insert({ workspace_id: actor.workspaceId, name: res.design.name, body: res.design, added_by: actor.personId }).select("id").single();
  if (error || !data) throw new Error("The View Design could not be added.");
  await audit(actor, { kind: "view_design.added", object: { type: "view_design", id: Number(data.id), name: res.design.name } });
  return { ok: true, id: Number(data.id) };
}

/** Removes a View Design from the Workspace (Owners and Admins; audited). Widgets drawn with it keep their copy. */
export async function removeViewDesign(actor: Actor, id: number): Promise<void> {
  assertManages(actor);
  if (!Number.isInteger(id)) throw new Forbidden();
  const { data } = await db().from("view_designs").delete().eq("id", id).eq("workspace_id", actor.workspaceId).select("name").maybeSingle();
  if (!data) throw new Forbidden();
  await audit(actor, { kind: "view_design.removed", object: { type: "view_design", id, name: String(data.name) } });
}

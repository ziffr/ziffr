// Workspace settings (spec 0006, tickets #96 and #97; spec 0022, ticket #108; GLOSSARY: Workspace, Workspace Role,
// Workspace Profile, Number Style): the workspace's name, its Workspace Profile and its Number Style. Owners and Admins
// change them, never in the demo; every member reads.
import { Forbidden, type Actor } from "./actor";
import { audit } from "./audit-log";
import { db } from "./db";
import { isNumberStyle, numberStyleForCountry, type NumberStyle } from "./number-style";
import { HIDDEN_CHARACTERS } from "./profile";
import { DEMO_WORKSPACE_ID } from "./team";
import { checkProfile, COUNTRIES, type WorkspaceProfile } from "./workspace-profile";

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
  const before = await workspaceName(actor);
  const { error } = await db().from("workspaces").update({ name: clean }).eq("id", actor.workspaceId);
  if (error) throw new Error("The name could not be saved.");
  if (before !== clean) await audit(actor, { kind: "workspace.renamed", object: { type: "workspace", id: actor.workspaceId }, details: { from: before, to: clean } });
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
  const before = await workspaceProfile(actor);
  const { error } = await db().from("workspaces").update({ industry: p.industry, segment: p.segment, country: p.country, currency: p.currency, employee_band: p.employeeBand, revenue_band: p.revenueBand }).eq("id", actor.workspaceId);
  if (error) throw new Error("The profile could not be saved.");
  // Only values from the fixed lists, so the details hold nothing a person typed.
  const changed = (Object.keys(p) as (keyof WorkspaceProfile)[]).filter((k) => before[k] !== p[k]);
  if (changed.length) await audit(actor, { kind: "workspace.profile_changed", object: { type: "workspace", id: actor.workspaceId }, details: Object.fromEntries(changed.flatMap((k) => { const key = k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`); return [[`from_${key}`, before[k]], [`to_${key}`, p[k]]]; })) });
  return p;
}

/** A workspace's Number Style and where it comes from: `chosen` once an Owner or Admin picked it; until then it
 * follows `fromCountry`, the Workspace Profile's country, and is the default when that is null. */
export type WorkspaceNumberStyle = { style: NumberStyle; chosen: boolean; fromCountry: string | null };

async function numberStyleIn(workspaceId: string): Promise<WorkspaceNumberStyle> {
  const { data } = await db().from("workspaces").select("number_style, country").eq("id", workspaceId).maybeSingle();
  if (isNumberStyle(data?.number_style)) return { style: data.number_style, chosen: true, fromCountry: null };
  // Only a country from the list counts, the same check the Workspace Profile is read back through.
  const country = typeof data?.country === "string" && (COUNTRIES as readonly string[]).includes(data.country) ? data.country : null;
  return { style: numberStyleForCountry(country), chosen: false, fromCountry: country };
}

/** The Number Style of a workspace, for code that has already checked who may see it. */
export async function numberStyleOf(workspaceId: string): Promise<NumberStyle> {
  return (await numberStyleIn(workspaceId)).style;
}

/** The actor's workspace's Number Style and whether it was chosen or follows the country, for any member (a Guest
 * too: every value they see is written in it). */
export async function workspaceNumberStyle(actor: Pick<Actor, "workspaceId">): Promise<WorkspaceNumberStyle> {
  return numberStyleIn(actor.workspaceId);
}

/** Sets the workspace's Number Style, for Owners and Admins; audited. Once set it no longer follows the country. */
export async function setNumberStyle(actor: Actor, style: unknown): Promise<NumberStyle> {
  assertManages(actor, "Number Style");
  if (!isNumberStyle(style)) throw new Error("Pick a Number Style from the list.");
  const before = await numberStyleIn(actor.workspaceId);
  if (before.chosen && before.style === style) return style;
  const { error } = await db().from("workspaces").update({ number_style: style }).eq("id", actor.workspaceId);
  if (error) throw new Error("The Number Style could not be saved.");
  // One of the four keys, or null for a style that followed the country: nothing a person typed.
  await audit(actor, { kind: "workspace.number_style_changed", object: { type: "workspace", id: actor.workspaceId }, details: { from: before.chosen ? before.style : null, to: style } });
  return style;
}

// @ts-nocheck
// Settable limits (ticket #518; GLOSSARY: Settable Limit): the values in effect for a Workspace and a person, and the
// operations that set them. The effective value is person ⊂ Workspace ⊂ Installation, resolved in one place
// (`effectiveLimit`), so a reader never combines levels by itself. Owners and Admins set the Workspace level, each
// person their own; the level above is the ceiling, checked here on the server and by the database. Every change is
// audited with the limit's key and two numbers, nothing a person typed. Never in the demo, never with a key.
import { Forbidden, Refused, type Actor } from "./actor";
import { audit } from "./audit-log";
import { db } from "./db";
import { refuseInDemo } from "./demo";
import { sendingLimit } from "./sending-limit";
import { isLimitKey, LIMIT_DEFINITIONS, limitDefinition, limitProblem, resolveLimit, type InstallationValues, type LimitDefinition, type LimitKey, type LimitView } from "./limit-levels";

/** A refusal of a limit, in words for the person; every screen shows its message. */
export class LimitRefused extends Refused {}

type Row = Record<string, number | null> | null;

async function installationValues(): Promise<InstallationValues> {
  const [alertsPerPerson, alertMessagesPerPerson] = await Promise.all([sendingLimit("alertsPerPerson"), sendingLimit("alertMessagesPerPerson")]);
  return { alertsPerPerson, alertMessagesPerPerson };
}

async function workspaceRow(workspaceId: string): Promise<Row> {
  const { data, error } = await db().from("workspace_settable_limits").select("*").eq("workspace_id", workspaceId).maybeSingle();
  // A failed read must not look like "nothing set": that would put the Installation's higher value in effect.
  if (error) throw new Error("The limits could not be read.");
  return (data as Row) ?? null;
}

async function personRow(workspaceId: string, personId: string): Promise<Row> {
  const { data, error } = await db().from("person_settable_limits").select("*").eq("workspace_id", workspaceId).eq("person_id", personId).maybeSingle();
  if (error) throw new Error("The limits could not be read.");
  return (data as Row) ?? null;
}

const stored = (row: Row, d: LimitDefinition): number | null => {
  const v = row?.[d.column];
  return typeof v === "number" ? v : null;
};

/** The value of a limit in effect for a Workspace and, where the limit has a person level, a person: the Installation's
 * value, lowered by the Workspace, lowered by the person. For code that has already checked who may know it. */
export async function effectiveLimit(key: LimitKey, workspaceId: string, personId?: string | null): Promise<number> {
  const d = limitDefinition(key);
  const [inst, ws, person] = await Promise.all([
    installationValues(),
    d.workspace ? workspaceRow(workspaceId) : Promise.resolve(null),
    d.person && personId ? personRow(workspaceId, personId) : Promise.resolve(null),
  ]);
  return resolveLimit(d, inst, stored(ws, d), stored(person, d));
}

function assertManages(actor: Actor): void {
  if (actor.key || (actor.role !== "owner" && actor.role !== "admin")) throw new Forbidden("Only Owners and Admins change the workspace's limits.");
}

function view(d: LimitDefinition, ceiling: number, set: number | null, effective: number): LimitView {
  return { key: d.key, label: d.label, help: d.help, unit: d.unit, min: d.min, max: d.lowerOnly ? Math.min(d.max, ceiling) : d.max, ceiling, set, effective };
}

/** The limits Owners and Admins may set for the Workspace, with what each is set to and what is in effect. */
export async function workspaceSettableLimits(actor: Actor): Promise<LimitView[]> {
  assertManages(actor);
  const [inst, row] = await Promise.all([installationValues(), workspaceRow(actor.workspaceId)]);
  return LIMIT_DEFINITIONS.filter((d) => d.workspace).map((d) => view(d, resolveLimit(d, inst, null, null), stored(row, d), resolveLimit(d, inst, stored(row, d), null)));
}

/** Parses what a page sent: null clears (follow the level above), otherwise a whole number. */
function parse(d: LimitDefinition, value: unknown): number | null {
  if (value === null) return null;
  if (typeof value !== "number") throw new LimitRefused(`${d.label} is a whole number.`);
  return value;
}

async function write(table: "workspace_settable_limits" | "person_settable_limits", keys: Record<string, string>, d: LimitDefinition, value: number | null): Promise<void> {
  const { error } = await db().from(table).upsert({ ...keys, [d.column]: value, updated_at: new Date().toISOString() }, { onConflict: Object.keys(keys).join(",") });
  if (error) throw new LimitRefused("The limit could not be saved.");
}

/** Sets or clears (null) one limit for the actor's Workspace, for Owners and Admins; audited. A value above what the
 * Installation allows, below the minimum or not a whole number is refused. */
export async function setWorkspaceSettableLimit(actor: Actor, key: unknown, value: unknown): Promise<void> {
  assertManages(actor);
  refuseInDemo(actor);
  if (!isLimitKey(key) || !limitDefinition(key).workspace) throw new LimitRefused("That is not a limit a Workspace sets.");
  const d = limitDefinition(key);
  const next = parse(d, value);
  const [inst, row] = await Promise.all([installationValues(), workspaceRow(actor.workspaceId)]);
  if (next !== null) {
    const problem = limitProblem(d, next, resolveLimit(d, inst, null, null));
    if (problem) throw new LimitRefused(problem);
  }
  const before = stored(row, d);
  if (before === next) return;
  await write("workspace_settable_limits", { workspace_id: actor.workspaceId }, d, next);
  await audit(actor, { kind: "workspace.settable_limit_changed", object: { type: "workspace", id: actor.workspaceId }, details: { limit: d.key, from: before, to: next } });
}

/** The limits the acting person may set for themselves in this Workspace. The ceiling of a lower-only limit is the
 * Workspace's value. Never for a key. */
export async function mySettableLimits(actor: Actor): Promise<LimitView[]> {
  if (actor.key) throw new Forbidden();
  const [inst, ws, mine] = await Promise.all([installationValues(), workspaceRow(actor.workspaceId), personRow(actor.workspaceId, actor.personId)]);
  return LIMIT_DEFINITIONS.filter((d) => d.person).map((d) => view(d, resolveLimit(d, inst, stored(ws, d), null), stored(mine, d), resolveLimit(d, inst, stored(ws, d), stored(mine, d))));
}

/** Sets or clears (null) one limit for the acting person in this Workspace; audited. Only down from what the Workspace
 * allows. Another person's limits cannot be set: the person is always the actor. */
export async function setMySettableLimit(actor: Actor, key: unknown, value: unknown): Promise<void> {
  if (actor.key) throw new Forbidden();
  refuseInDemo(actor);
  if (!isLimitKey(key) || !limitDefinition(key).person) throw new LimitRefused("That is not a limit a person sets.");
  const d = limitDefinition(key);
  const next = parse(d, value);
  const [inst, ws, mine] = await Promise.all([installationValues(), workspaceRow(actor.workspaceId), personRow(actor.workspaceId, actor.personId)]);
  if (next !== null) {
    const problem = limitProblem(d, next, resolveLimit(d, inst, stored(ws, d), null));
    if (problem) throw new LimitRefused(problem);
  }
  const before = stored(mine, d);
  if (before === next) return;
  await write("person_settable_limits", { workspace_id: actor.workspaceId, person_id: actor.personId }, d, next);
  await audit(actor, { kind: "person.settable_limit_changed", object: { type: "person", id: actor.personId }, details: { limit: d.key, from: before, to: next } });
}

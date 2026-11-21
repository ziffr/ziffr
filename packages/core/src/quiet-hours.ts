// Quiet Hours (ticket #519; GLOSSARY: Quiet Hours, Prompt, Alert): when a person is left alone. A person sets their own
// in Your settings, Owners and Admins set the Workspace's default for those who set none. A Prompt, a reminder or an
// Alert that would be sent inside them waits and goes out when they end: only its message is held, never an Approval's
// or any other Due Date, and nothing is dropped (rules in quiet-rules.ts). Every function takes the Actor first; a
// person reads and sets only their own, and everyone in the Workspace reads its default.
// Security: the hold is decided here once, where a Delivery is made (holdFor, used by deliveries.ts), so no sender has
// a way around it; what leaves is a time, never the rule of any person.
import { Forbidden, type Actor } from "./actor";
import { audit } from "./audit-log";
import { db } from "./db";
import { refuseInDemo } from "./demo";
import { checkRule, neverQuiet, quietEnd, type QuietRule } from "./quiet-rules";
import { knownTimeZone, workspaceClock } from "./workspace-clock";

/** The kinds of Delivery that wait out quiet hours: asking for numbers, reminding, and telling of an Alert. */
export const HELD_KINDS = ["prompt", "reminder", "alert"] as const;

type Row = { person_id: string | null; from_hour: number; to_hour: number; days: number[]; time_zone: string | null };
const ruleOf = (r: Row): QuietRule => ({ fromHour: r.from_hour, toHour: r.to_hour, days: [...r.days].sort((a, b) => a - b), timeZone: r.time_zone });

/** What the settings screens show: the person's own rule (null while they follow the default), the Workspace default
 * (null when it has none) and the Workspace's time zone, which a rule without its own zone is read in. */
export type QuietHoursView = { mine: QuietRule | null; workspace: QuietRule | null; workspaceTimeZone: string };

/** A person's own row and the Workspace's default row (two plain queries, so nothing is built into a filter). */
async function rowsFor(workspaceId: string, personId: string): Promise<{ own: Row | null; team: Row | null }> {
  const cols = "person_id, from_hour, to_hour, days, time_zone";
  const [own, team] = await Promise.all([
    db().from("quiet_hours").select(cols).eq("workspace_id", workspaceId).eq("person_id", personId).maybeSingle(),
    db().from("quiet_hours").select(cols).eq("workspace_id", workspaceId).is("person_id", null).maybeSingle(),
  ]);
  // A failed read is an error, never "no quiet hours": a message must not go out early because the lookup failed.
  if (own.error || team.error) throw new Error("The quiet hours could not be read.");
  return { own: (own.data as Row | null) ?? null, team: (team.data as Row | null) ?? null };
}

/** The actor's own quiet hours, the Workspace default and the Workspace's time zone. */
export async function quietHours(actor: Actor): Promise<QuietHoursView> {
  if (actor.key) throw new Forbidden();
  const [{ own, team }, clock] = await Promise.all([rowsFor(actor.workspaceId, actor.personId), workspaceClock(actor)]);
  return { mine: own ? ruleOf(own) : null, workspace: team ? ruleOf(team) : null, workspaceTimeZone: clock.timeZone };
}

/** Writes or clears one row in one statement (set_quiet_hours): a null rule removes it. */
async function write(workspaceId: string, personId: string | null, rule: QuietRule | null): Promise<void> {
  const { error } = await db().rpc("set_quiet_hours", { p_workspace: workspaceId, p_person: personId, p_from: rule?.fromHour ?? 0, p_to: rule?.toHour ?? 0, p_days: rule?.days ?? [], p_zone: rule?.timeZone ?? null, p_clear: rule === null });
  if (error) throw new Error("The quiet hours could not be saved.");
}

/** Sets the actor's own quiet hours, or with null goes back to the Workspace's default. A rule that is never quiet
 * opts out of the default. Only one's own; never in the demo. */
export async function setMyQuietHours(actor: Actor, input: unknown): Promise<void> {
  if (actor.key) throw new Forbidden();
  await refuseInDemo(actor);
  const rule = input === null ? null : checkRule(input, knownTimeZone);
  if (typeof rule === "string") throw new Error(rule);
  await write(actor.workspaceId, actor.personId, rule);
}

/** Sets the Workspace's default quiet hours (null removes them), for Owners and Admins. It covers everyone who has set
 * none of their own, in the Workspace's time zone. Recorded in the Audit Log. */
export async function setWorkspaceQuietHours(actor: Actor, input: unknown): Promise<void> {
  if (actor.key || (actor.role !== "owner" && actor.role !== "admin")) throw new Forbidden("Only Owners and Admins set the Workspace's quiet hours.");
  await refuseInDemo(actor);
  const rule = input === null ? null : checkRule(input, knownTimeZone);
  if (typeof rule === "string") throw new Error(rule);
  // The default is read in the Workspace's zone: a zone of its own would not mean the same to everyone.
  const clean = rule && { ...rule, timeZone: null };
  const before = (await quietHours(actor)).workspace;
  await write(actor.workspaceId, null, clean && neverQuiet(clean) ? null : clean);
  await audit(actor, { kind: "workspace.quiet_hours_changed", object: { type: "workspace", id: actor.workspaceId }, details: { from: before ? describe(before) : "none", to: clean && !neverQuiet(clean) ? describe(clean) : "none" } });
}

/** A rule in words for the Audit Log, such as "19:00–07:00, Saturday and Sunday". */
function describe(r: QuietRule): string {
  const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return [r.fromHour === r.toHour ? "" : `${hh(r.fromHour)}–${hh(r.toHour)}`, r.days.map((d) => names[d]).join(" ")].filter(Boolean).join(", ");
}

/** When a message of this kind to this person may go out: null at once, or the instant their quiet hours end. The
 * person's own rule decides, else the Workspace's default, in the person's time zone or else the Workspace's. The one
 * place quiet hours are checked: a Delivery is given this as its `not_before` where it is made. Other kinds never wait. */
export async function holdFor(workspaceId: string, recipientId: string, kind: string, now = new Date()): Promise<Date | null> {
  if (!(HELD_KINDS as readonly string[]).includes(kind)) return null;
  const [{ own, team }, { data: ws, error }] = await Promise.all([rowsFor(workspaceId, recipientId), db().from("workspaces").select("time_zone").eq("id", workspaceId).single()]);
  if (error) throw new Error("The quiet hours could not be read.");
  const row = own ?? team;
  if (!row) return null;
  return quietEnd(ruleOf(row), now, String(ws?.time_zone ?? "UTC"));
}

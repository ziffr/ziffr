// A workspace's clock (spec 0005, ticket #84; GLOSSARY: Workflow, Due Date): which day it is there, and the hour its
// Workflows run. Days in Ziffr (periods, Due Dates, Away) are calendar days; this says which one "today" is for a team.
import { Forbidden, type Actor } from "./actor";
import { db } from "./db";
import { DEMO_WORKSPACE_ID } from "./team";

/** A workspace's time zone and the hour (0–23) its Workflows run. */
export type WorkspaceClock = { timeZone: string; runHour: number };

/** Whether the runtime knows this IANA time zone name, such as Europe/Berlin. */
export function knownTimeZone(name: unknown): name is string {
  if (typeof name !== "string" || !/^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){0,2}$|^UTC$/.test(name)) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: name });
    return true;
  } catch {
    return false;
  }
}

/** The calendar day (YYYY-MM-DD) and the hour (0–23) an instant is in a time zone. */
export function localTime(instant: Date, timeZone: string): { day: string; hour: number } {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
    .formatToParts(instant).map((p) => [p.type, p.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

/** The actor's workspace's clock. */
export async function workspaceClock(actor: Actor): Promise<WorkspaceClock> {
  const { data } = await db().from("workspaces").select("time_zone, run_hour").eq("id", actor.workspaceId).single();
  return { timeZone: (data?.time_zone as string) ?? "UTC", runHour: Number(data?.run_hour ?? 8) };
}

/** Sets the workspace's time zone and run hour, for Owners and Admins. Not in the demo, which is never scheduled. */
export async function setWorkspaceClock(actor: Actor, clock: WorkspaceClock): Promise<void> {
  if (actor.role !== "owner" && actor.role !== "admin") throw new Forbidden("Only Owners and Admins set the workspace's time.");
  if (actor.workspaceId === DEMO_WORKSPACE_ID) throw new Forbidden("The demo keeps its own time.");
  if (!knownTimeZone(clock?.timeZone)) throw new Error("Pick a time zone from the list.");
  const hour = Number(clock.runHour);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) throw new Error("Pick an hour from 0 to 23.");
  const { error } = await db().from("workspaces").update({ time_zone: clock.timeZone, run_hour: hour }).eq("id", actor.workspaceId);
  if (error) throw new Error("The time could not be saved.");
}

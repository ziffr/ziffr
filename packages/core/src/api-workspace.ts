// What a program needs to know about a Workspace's clock and its creator's reach (GLOSSARY: Workspace, Prompt; ticket
// #614): so an assistant can set "ask me at 13:00" in the right time zone and know where a Prompt reaches the person.
import { assertScope, type Actor, type KeyActor } from "./actor";
import { reachOf } from "./prompt-reach";
import { workspaceClock } from "./workspace-clock";

/** The Workspace's time zone, the hour its Workflows ask at, its week start, and the ways the key's creator can be reached now. */
export async function workspaceReach(actor: Actor | KeyActor): Promise<{ time_zone: string; run_hour: number; week_start: "monday" | "sunday"; reached_by: ("email" | "slack" | "telegram")[] }> {
  assertScope(actor, "metrics:read");
  const [clock, reach] = await Promise.all([workspaceClock({ personId: actor.personId, workspaceId: actor.workspaceId, role: "member" }), reachOf(actor.workspaceId, actor.personId)]);
  return { time_zone: clock.timeZone, run_hour: clock.runHour, week_start: clock.weekStart === 0 ? "sunday" : "monday", reached_by: (["email", "slack", "telegram"] as const).filter((w) => reach[w]) };
}

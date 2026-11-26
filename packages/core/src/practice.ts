// Practice Workspaces (spec 0063; GLOSSARY: Practice Workspace, Made-up Person): nothing leaves one. Every place that
// sends, or that would let somebody else in, asks `heldBack` here first. It fails closed: a question that cannot be
// answered sends nothing. The database refuses the same things again (migration 20270208090000), so a place that
// forgets to ask still cannot queue a message or keep a connection to the outside.
import { Forbidden } from "./actor";
import { db } from "./db";
import { ServerFault } from "./server-fault";

/** Why a Delivery of a Practice Workspace stays in the Outbox, as the Outbox says it. */
export const PRACTICE_HELD = "Practice Workspace: nothing is sent.";
/** The refusal of something that would send from a Practice Workspace, or let somebody else in. */
export const PRACTICE_REFUSED = "This is a Practice Workspace: nothing is sent from it, and nobody else can be let in.";

/** Thrown where a person asks for something a Practice Workspace never does; its message is for people. */
export class PracticeRefused extends Forbidden {
  constructor() {
    super(PRACTICE_REFUSED);
    this.name = "PracticeRefused";
  }
}

/** The ways something can leave a Workspace, or somebody can look into it from outside. A new way is added here, so it
 * has to be named by whoever adds it. */
export type WayOut = "email" | "slack" | "telegram" | "webhook" | "invitation" | "view_link" | "calendar_link" | "billing" | "feedback" | "marketplace_report";

/** Who something would reach, where the place that sends knows it. */
export type Reaches = { recipientId?: string; address?: string };

/** What a Practice Workspace may nevertheless do, by way: nothing. An allowance is a narrow, named case here and the
 * same case in the database's practice_allows(), and nowhere else; whatever it does not name stays refused. */
const ALLOWED: Partial<Record<WayOut, (reaches: Reaches) => boolean>> = {};

// Whether a Workspace is a Practice Workspace never changes (the database refuses to change the mark), so an answer
// read once holds for as long as the process runs. Only answers about a Workspace that exists are kept.
const known = new Map<string, boolean>();
const KEPT = 10_000;

/** Whether a Workspace is a Practice Workspace. Throws when it cannot be read; one that is gone counts as one, since
 * nothing is sent for a Workspace that is not there. */
export async function isPracticeWorkspace(workspaceId: string): Promise<boolean> {
  const before = known.get(workspaceId);
  if (before !== undefined) return before;
  const { data, error } = await db().from("workspaces").select("practice_for").eq("id", workspaceId).maybeSingle();
  if (error) throw new ServerFault("Whether this Workspace may send could not be read, so nothing was sent.");
  if (!data) return true;
  const practice = data.practice_for !== null;
  if (known.size >= KEPT) known.clear();
  known.set(workspaceId, practice);
  return practice;
}

/** Whether this must not leave the Workspace by this way. Asked where it would leave, with who it would reach when that
 * is known. Throws, so nothing leaves, when it cannot be answered. */
export async function heldBack(workspaceId: string, way: WayOut, reaches: Reaches = {}): Promise<boolean> {
  return (await isPracticeWorkspace(workspaceId)) && ALLOWED[way]?.(reaches) !== true;
}

/** Refuses, in plain words, what a Practice Workspace never does. */
export async function assertMayLeave(workspaceId: string, way: WayOut, reaches: Reaches = {}): Promise<void> {
  if (await heldBack(workspaceId, way, reaches)) throw new PracticeRefused();
}

/** Whether an address is under the reserved name .invalid, which can never be routed: a made-up person's address. The
 * mail transport takes none, whichever Workspace or none it comes from. */
export function neverRouted(address: string): boolean {
  const domain = String(address).slice(String(address).lastIndexOf("@") + 1).trim().toLowerCase().replace(/[.>\s]+$/, "");
  return domain === "invalid" || domain.endsWith(".invalid");
}

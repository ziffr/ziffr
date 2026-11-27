// The Value Note an Approval's task message quotes (GLOSSARY: Value Note, Approval, Delivery; spec 0064). Internal to
// the core: it checks no Actor of the caller, so only a sender that has read the queued Delivery itself calls it. The
// words are put in as the message leaves and never kept with the Delivery: the Outbox, whose other readers may not see
// the value, never holds them, and words deleted for good meanwhile never go out. They are read with the note core as
// the recipient, now, so it decides whether they see the value and which names they read (AGENTS.md rule 3).
import { db } from "../db";
import { withQuotedNote } from "../note-quote";
import type { ConnectorId } from "../connectors/index";

/** A Delivery's words, with the period's newest Value Note quoted where it is the task of an open Approval going to its
 * Approver. Any other message, and one whose period has no note they may read, comes back as it was. */
export async function withApprovalNote(body: string, d: { workspace_id: string; recipient_id: string; kind: string; action_id?: number | null }, via: ConnectorId): Promise<string> {
  if (d.kind !== "task" || !d.action_id) return body;
  try {
    const { data: a } = await db().from("actions").select("metric_id, period_start, purpose, status, assignee_id").eq("id", d.action_id).eq("workspace_id", d.workspace_id).maybeSingle();
    if (a?.purpose !== "approval" || a.status !== "open" || a.assignee_id !== d.recipient_id) return body;
    const { data: member } = await db().from("memberships").select("role").eq("workspace_id", d.workspace_id).eq("user_id", d.recipient_id).maybeSingle();
    if (!member) return body;
    // Loaded here, not at the top: the note core reads through modules that themselves send messages.
    const { periodValueNotes } = await import("../value-notes");
    const notes = await periodValueNotes({ personId: d.recipient_id, workspaceId: d.workspace_id, role: member.role }, a.metric_id as number, String(a.period_start));
    const [newest, ...others] = notes?.current ?? [];
    return newest ? withQuotedNote(body, via, { author: newest.author, words: newest.words, more: others.length }) : body;
  } catch (e) {
    // The approval is asked either way: the note is on the task's page. The error's own words never hold the note's.
    console.error("An Approval's Value Note could not be quoted:", e instanceof Error ? e.message : "unknown");
    return body;
  }
}

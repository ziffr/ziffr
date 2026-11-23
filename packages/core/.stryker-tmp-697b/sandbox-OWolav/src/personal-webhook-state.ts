// @ts-nocheck
// Personal Webhooks, the small shared rules (GLOSSARY: Personal Webhook; spec 0037, ticket #641): whether the Workspace
// allows them, whether a person still may have one, and the notice when one fails. Kept apart from personal-webhooks.ts
// so that the sending code can ask without importing the operations. Nothing here takes an Actor: the callers are the
// core's own jobs, which already know who they act for.
import { db } from "./db";
import { deliverNotice } from "./deliveries";
import { recordAudit } from "./audit-log";
import { WEBHOOK_DAYS_FAILING_BEFORE_OFF, WEBHOOK_FAILURES_BEFORE_OFF } from "./webhook-limits";

/** The Workspace Roles that may have a Personal Webhook: not Guests (they see only what is shared with them), and a
 * Contact has no Workspace Role at all. */
export const PERSONAL_WEBHOOK_ROLES = ["owner", "admin", "member"] as const;

/** Whether the Workspace's switch "People may add their own Webhooks" is on. Off for every Workspace until an Owner or Admin switches it on. */
export async function personalWebhooksAllowed(workspaceId: string): Promise<boolean> {
  const { data } = await db().from("workspaces").select("personal_webhooks_allowed").eq("id", workspaceId).maybeSingle();
  return data?.personal_webhooks_allowed === true;
}

/** Whether a person's Personal Webhooks may send now: the switch is on and the person is an Owner, Admin or Member. Judged at every send. */
export async function personalWebhookMayRun(workspaceId: string, personId: string): Promise<boolean> {
  if (!(await personalWebhooksAllowed(workspaceId))) return false;
  const { data } = await db().from("memberships").select("role").eq("workspace_id", workspaceId).eq("user_id", personId).maybeSingle();
  return (PERSONAL_WEBHOOK_ROLES as readonly string[]).includes(String(data?.role));
}

/** Tells the person that their Personal Webhook was switched off by its failing (not the Owners: it is theirs), and
 * records it in the Audit Log. The address arrives masked. Best effort: the switch-off has happened. */
export async function tellPersonSwitchedOff(workspaceId: string, personId: string, name: string, address: string, reason: "failing" | "gone", webhookId: string): Promise<void> {
  try {
    const why = reason === "gone" ? "its address answered that it is gone (410)" : `it kept failing: ${WEBHOOK_FAILURES_BEFORE_OFF} sends in a row, or no success for ${WEBHOOK_DAYS_FAILING_BEFORE_OFF} days`;
    await deliverNotice(workspaceId, { recipientId: personId, senderId: null, subject: `Your Webhook was switched off: ${name}`, text: `Your Webhook "${name}" (${address}) was switched off because ${why}. Nothing more is sent to it until you switch it on again; nothing is resent then.`, link: "/settings" });
  } catch (e) {
    console.error("Personal Webhooks: could not tell the person:", (e as Error).message);
  }
  await recordAudit(workspaceId, null, { kind: "webhook.personal_switched_off_failing", object: { type: "webhook", id: webhookId, name }, details: { address, owner_id: personId, reason } });
}

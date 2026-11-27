// What a block stops (spec 0066; GLOSSARY: Blocked User). Auth refuses a blocked account's sign-in and ends its
// sessions by itself; this is the question every other way of acting as a person asks: keys and assistants, Personal
// Webhooks, replies by email and chat, personal form links, Calendar Links, and the messages Ziffr would send them.
// What is blocked is the account, so a Contact or a Feed, which have none, never are.
import { db } from "./db";
import { trialHoldsBack } from "./trials";

/** Whether the person's account is blocked. It throws when that cannot be read: nothing acts on a guess. */
export async function personBlocked(personId: string): Promise<boolean> {
  const { data, error } = await db().rpc("person_blocked", { p_person: String(personId).slice(0, 64) });
  if (error) throw new Error("Ziffr could not check this account. Try again in a moment.");
  return data === true;
}

/** Why a message stays in the Outbox when its recipient is blocked, or when that cannot be told. */
export const BLOCKED_HOLDS_BACK = {
  blocked: "Kept in the Outbox: this person is blocked.",
  unreadable: "Kept in the Outbox: Ziffr could not check this person's account.",
} as const;

/** Why a Delivery to this recipient may not leave for real, or null when it may: they are blocked, or the Workspace
 * is a trial that holds it back. Asked when a Delivery is made and by each Connector right before it sends. */
export async function sendingHeldBack(workspaceId: string, recipientId: string): Promise<string | null> {
  try {
    if (await personBlocked(recipientId)) return BLOCKED_HOLDS_BACK.blocked;
  } catch {
    // Fails closed, as a trial that cannot be read does.
    return BLOCKED_HOLDS_BACK.unreadable;
  }
  return trialHoldsBack(workspaceId, recipientId);
}

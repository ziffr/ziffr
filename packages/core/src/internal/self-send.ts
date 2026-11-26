// What every message a person sends to themself shares (GLOSSARY: Test Message, Screen Link): who may, the one limit
// both count against, and what became of the Delivery. Server only. Nothing here names a recipient other than the
// person it is called for, so callers pass the acting person's own ids.
import { db } from "../db";
import { shownReason } from "../ask-now";
import { TEST_PER_DAY, TEST_PER_DAY_IN_TRIAL, TEST_PER_WAY_PER_WINDOW, TEST_WINDOW_MINUTES, type TestWay } from "../test-message-words";
import { trialEndsAt } from "../trials";

/** Whether the person is a member of the Workspace now and not a Guest. Read again: the role on an Actor may be old. */
export async function maySendToSelf(workspaceId: string, personId: string): Promise<boolean> {
  const { data } = await db().from("memberships").select("role").eq("workspace_id", workspaceId).eq("user_id", personId).maybeSingle();
  return Boolean(data) && data?.role !== "guest";
}

/** A claimed place under the limit, or which limit stops this press, when it resets and the day's cap in effect. */
export type SelfSendClaim = { ok: true } | { ok: false; limit: "window" | "day"; resetsAt: string; perDay: number };

/** Claims one message to oneself by this way, under a lock in the database: at most 3 by one way in 10 minutes and 20 a
 * day by all ways (5 in a trial, so these cannot use up the trial's shared messages). `failed` is what the person is
 * told when the limit cannot be read: nothing is sent then. */
export async function claimSelfSend(workspaceId: string, personId: string, way: TestWay, failed: string): Promise<SelfSendClaim> {
  const perDay = (await trialEndsAt(workspaceId)) ? TEST_PER_DAY_IN_TRIAL : TEST_PER_DAY;
  const { data: claim, error } = await db().rpc("claim_test_message", {
    p_workspace: workspaceId, p_person: personId, p_way: way,
    p_per_window: TEST_PER_WAY_PER_WINDOW, p_window_minutes: TEST_WINDOW_MINUTES, p_per_day: perDay,
  });
  if (error || typeof claim !== "string") throw new Error(failed);
  if (claim === "ok") return { ok: true };
  const [limit, resetsAt] = claim.split("|");
  if ((limit !== "window" && limit !== "day") || !resetsAt) throw new Error(failed);
  return { ok: false, limit, resetsAt, perDay };
}

/** What became of the person's own Delivery: sent, waiting, or kept in the Outbox with why. Only Ziffr's own reasons are
 * given: a mail server's or a provider's words never reach the browser. */
export async function selfSendOutcome(workspaceId: string, personId: string, id: number | null, keep: string | null): Promise<{ state: "sent" | "queued" | "kept"; note: string | null }> {
  const { data: d } = id ? await db().from("deliveries").select("mail_state, last_error").eq("id", id).eq("workspace_id", workspaceId).eq("recipient_id", personId).maybeSingle() : { data: null };
  const state = d?.mail_state === "sent" ? "sent" : d?.mail_state === "queued" || d?.mail_state === "sending" ? "queued" : "kept";
  return { state, note: state === "kept" ? shownReason(keep ?? (d?.last_error as string | null)) ?? "It stayed in the Outbox." : null };
}

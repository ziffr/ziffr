// The way back without a sign-in for someone who stopped requests by email (issue #1333; GLOSSARY: Prompt, Delivery,
// Metric Owner): the owner may have one message sent that asks "Would you like these again?". Nothing changes until the
// person opens its link and confirms.
// Security: the owner never sees the link (it is made as the message is sent, and only its hash is kept); the message
// goes only to the mailbox the person stopped from, through the same limits as every Delivery (trial, Practice, demo
// and Blocked rules); at most once in RESUME_AGAIN_DAYS per person and Workspace, claimed in the database; the link
// works once, for RESUME_DAYS, and a GET changes nothing.
import { db } from "./db";
import { Forbidden, type Actor } from "./actor";
import { deliverResumeAsk } from "./deliveries";
import { hashed, mayAskToResume, RESUME_DAYS } from "./internal/delivery-send";
import { addressIn, mailboxMark, mailOn } from "./mail";
import { mailRepliesReturn } from "./prompt-reach";
import { allowedWays } from "./prompt-route";
import { openNames } from "./sealed-columns";
import { DEMO_WORKSPACE_ID } from "./team";
import { personBlocked } from "./user-block";
import type { SourceId } from "./types";

/** How long until a person may be asked again, in days. */
export const RESUME_AGAIN_DAYS = 30;
/** The secret of a link: 32 random bytes in base64url. */
const SECRET = /^[A-Za-z0-9_-]{43}$/;

/** What the owner is told when the address on file is not the one the person stopped from. */
const OTHER_ADDRESS = "Ziffr sends this only to the email address they unsubscribed from, and that is not the one kept for them now.";

/** The Metric's owner has the person asked whether they want requests by email again. Refused for anyone but the owner
 * of a Metric the person sends values for, for the person themselves, in the demo, and again within RESUME_AGAIN_DAYS.
 * Answers, in words, what became of the message. `metricId` and `personId` are untrusted. */
export async function askToResumeEmail(actor: Actor, metricId: number, personId: string): Promise<string> {
  const ws = actor.workspaceId;
  if (actor.key || actor.role === "guest" || ws === DEMO_WORKSPACE_ID || !Number.isInteger(metricId) || typeof personId !== "string" || personId === actor.personId) throw new Forbidden();
  const { data: m } = await db().from("metrics").select("sources, formula, archived_at").eq("id", metricId).eq("workspace_id", ws).eq("owner_id", actor.personId).maybeSingle();
  if (!m) throw new Forbidden("Only the Metric's owner can have them asked.");
  const { data: token } = await db().from("tokens").select("id").eq("workspace_id", ws).eq("metric_id", metricId).eq("submitter_id", personId).is("stands_in_for", null).limit(1);
  if (!token?.length) throw new Forbidden("They do not send values for this Metric.");
  if (m.formula || m.archived_at || !allowedWays(m.sources as SourceId[], await mailRepliesReturn(ws)).email) throw new Error("This Metric is not asked for by email.");
  const { data: stop } = await db().from("email_opt_outs").select("person_id").eq("workspace_id", ws).eq("person_id", personId).maybeSingle();
  if (!stop) throw new Error("They get these emails.");
  if (!(await mailOn())) throw new Error("This Ziffr sends no email.");
  const address = await addressIn(ws, personId);
  if (!address || !(await mayAskToResume(ws, personId, mailboxMark(address)))) throw new Error(OTHER_ADDRESS);
  const { data: claimed, error } = await db().rpc("claim_resume_ask", { p_workspace: ws, p_person: personId, p_days: RESUME_AGAIN_DAYS });
  if (error) throw new Error("That did not work. Try again.");
  if (claimed !== true) throw new Error(`They were asked lately. This can be sent once in ${RESUME_AGAIN_DAYS} days.`);
  const { data: profiles } = await db().from("profiles").select("id, name").in("id", [actor.personId, personId]);
  const names = await openNames(ws, profiles);
  const named = (id: string) => String(names?.find((p) => p.id === id)?.name ?? "Someone");
  const id = await deliverResumeAsk(ws, {
    recipientId: personId, senderId: actor.personId, subject: "Would you like requests for numbers by email again?",
    text: `${named(actor.personId)} asks whether you would like to be asked for numbers by email again. You unsubscribed from these emails.\nIf you do nothing, nothing changes. The link works once, for ${RESUME_DAYS} days.`,
  });
  const { data: d } = await db().from("deliveries").select("mail_state, last_error").eq("id", id ?? 0).eq("workspace_id", ws).maybeSingle();
  if (d?.mail_state === "sent") return `${named(personId)} was sent the question. Nothing changes unless they confirm.`;
  if (d?.mail_state === "queued" || d?.mail_state === "sending") return `${named(personId)} will be sent the question shortly. Nothing changes unless they confirm.`;
  return "The question was not sent. The Outbox shows why.";
}

/** The stop a link of that message would take back, or null: the link is unknown, used or over, the person is blocked,
 * or the address kept for them is no longer the one it went to. */
async function stopFor(secret: string) {
  if (!SECRET.test(String(secret))) return null;
  const { data: stop } = await db().from("email_opt_outs").select("workspace_id, person_id, address_hash").eq("resume_hash", hashed(secret)).gt("resume_until", new Date().toISOString()).maybeSingle();
  if (!stop || (await personBlocked(stop.person_id as string))) return null;
  const address = await addressIn(stop.workspace_id as string, stop.person_id as string);
  return address && mailboxMark(address) === stop.address_hash ? stop : null;
}

/** Whether a link still does something (for the page that asks first). Changes nothing. */
export async function resumeLinkValid(secret: string): Promise<boolean> {
  return Boolean(await stopFor(secret));
}

/** The person confirms: requests by email are on again for them in that Workspace. Once; `secret` is untrusted. */
export async function resumeByLink(secret: string): Promise<boolean> {
  const stop = await stopFor(secret);
  if (!stop) return false;
  // One statement: the link goes with the row, so it works once, also when pressed twice at once.
  const { data } = await db().from("email_opt_outs").delete().eq("workspace_id", stop.workspace_id).eq("person_id", stop.person_id)
    .eq("resume_hash", hashed(secret)).gt("resume_until", new Date().toISOString()).select("person_id");
  return Boolean(data?.length);
}

// Erasing one person (spec 0071; GLOSSARY: Deleted person). What holds a person, and what becomes of it, is listed
// column by column in the database (`person_references`); this runs the three steps around the removal of their sign-in.
// The Workspaces come first: by now the person is a member of none (each was deleted, or handed over and left). A person
// nothing refers to is deleted entirely; otherwise their row stays as a Deleted person, with no sign-in, address or name.
// The Audit Log keeps its entries as they are, until they expire.
import { Forbidden, Refused } from "./actor";
import { db } from "./db";
import { serverAdminAddresses, type InstallationActor } from "./installation-admins";
import { mailboxKey } from "./mail";
import { recordPersonalWebhookEnds } from "./personal-webhooks";
import { ServerFault } from "./server-fault";
import { signInAddressKey } from "./sign-in-limits";

const FAILED = "Ziffr could not finish deleting your account. Try again.";

/** What is left of an erased person: nothing ("deleted"), or their row as a Deleted person ("kept"). */
export type Erased = "deleted" | "kept";

/**
 * Erases the acting person: only ever themselves. Every step can run again, so a failed run is simply repeated; it is
 * finished only when the sign-in service no longer knows the person. Refused while they are a member of a Workspace, and
 * for the only Installation Admin of an Installation other people use.
 */
export async function erasePerson(actor: InstallationActor): Promise<Erased> {
  const id = String(actor?.personId ?? "").slice(0, 64);
  if (!id) throw new Forbidden();
  // The Personal Webhooks that ended with their place somewhere reach the Audit Log before the notes of it go.
  await recordPersonalWebhookEnds();
  const { data: who, error: unread } = await db().from("profiles").select("email").eq("id", id).maybeSingle();
  if (unread) throw new ServerFault(FAILED);
  if (!who) return "deleted";
  const address = (who.email as string | null) ?? null;
  const { data, error } = await db().rpc("erase_person", {
    p_person: id,
    p_address: address,
    p_mailbox: address ? mailboxKey(address) : null,
    p_sign_in_key: address ? signInAddressKey(address) : null,
    p_server_admins: serverAdminAddresses(),
  });
  if (error) throw new ServerFault(FAILED);
  const { outcome, auth_user_id: signIn } = data as { outcome: string; auth_user_id?: string | null };
  if (outcome === "none") return "deleted";
  if (outcome === "member") throw new Refused("You are still a member of a Workspace. Leave or delete each Workspace first.");
  if (outcome === "only_admin") throw new Refused("You are the only Installation Admin and other people use this Installation. Add another Installation Admin first.");
  if (outcome === "not_a_person") throw new Forbidden("Only a person who signs in can be erased.");
  if (outcome !== "ok") throw new ServerFault(FAILED);
  if (signIn) {
    // Already gone is done. Anything else leaves the sign-in linked, so the next run finds it again.
    const { error: kept } = await db().auth.admin.deleteUser(signIn);
    if (kept && kept.status !== 404) throw new ServerFault(FAILED);
  }
  const { data: left, error: unfinished } = await db().rpc("finish_erasing_person", { p_person: id });
  if (unfinished || (left !== "deleted" && left !== "kept")) throw new ServerFault(FAILED);
  return left;
}

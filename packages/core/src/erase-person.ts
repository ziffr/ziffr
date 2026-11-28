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
import { openNames, openRows, sealedPatch, UNREADABLE_NAME } from "./sealed-columns";
import { ServerFault } from "./server-fault";
import { signInAddressKey } from "./sign-in-limits";
import { DEMO_WORKSPACE_ID } from "./team";

const FAILED = "Ziffr could not finish deleting your account. Try again.";

/** The longest person id there is; a longer one names nobody and is refused, never cut to one that may. */
const PERSON_ID_MAX = 64;

/**
 * The person a sign-in is linked to, or null when it is linked to nobody yet. `erased` marks a Deleted person, whose
 * sign-in is still there when its removal failed: it must not be treated as anyone's. Takes no Actor: it is how the
 * account the sign-in service has just verified becomes one.
 */
export async function linkedPerson(authUserId: string): Promise<{ personId: string; erased: boolean } | null> {
  const { data, error } = await db().from("profiles").select("id, erased_at").eq("auth_user_id", authUserId).maybeSingle();
  if (error) throw new ServerFault("Ziffr could not check your sign-in. Try again.");
  return data ? { personId: data.id as string, erased: data.erased_at !== null } : null;
}

/** A name as it is compared between people: one that differs only in case or spacing counts as the same. */
const sameName = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();

/**
 * The names under which older hand-over versions, which hold no ids, may be rewritten: per Workspace tied to the person,
 * each of their names that nobody else there has or had, Contacts included (their sealed names are opened here and go
 * nowhere). A Workspace where not every name opens is left out, so its messages stay.
 */
async function namesOnlyTheirs(personId: string): Promise<{ workspace_id: string; name: string }[]> {
  const { data, error } = await db().rpc("person_version_names", { p_person: personId });
  if (error) throw new ServerFault(FAILED);
  const places = new Map<string, { person_id: string; name: string }[]>();
  for (const r of (data ?? []) as { workspace_id: string; person_id: string; name: string }[]) {
    places.set(r.workspace_id, [...(places.get(r.workspace_id) ?? []), r]);
  }
  const found: { workspace_id: string; name: string }[] = [];
  for (const [workspaceId, named] of places) {
    const others = named.filter((r) => r.person_id !== personId).map((r) => ({ id: r.person_id, name: r.name }));
    const opened = await openNames(workspaceId, others).catch(() => null);
    if (!opened || opened.some((p) => p.name === UNREADABLE_NAME)) continue;
    const taken = new Set(opened.map((p) => sameName(p.name)));
    for (const r of named) if (r.person_id === personId && !taken.has(sameName(r.name))) found.push({ workspace_id: workspaceId, name: r.name });
  }
  return found;
}

/**
 * The intake rows from this mailbox that matched nobody, each with the sender to keep instead. The sender is sealed and
 * has no address key, so every unmatched row is opened and compared; a Workspace whose key does not open is passed over.
 */
async function unmatchedIntake(mailbox: string): Promise<{ id: number; sender: string }[]> {
  const found: { id: number; sender: string }[] = [];
  for (let after = 0; ;) {
    const { data, error } = await db().from("intake_log").select("id, workspace_id, sender")
      .is("sender_id", null).neq("workspace_id", DEMO_WORKSPACE_ID).gt("id", after).order("id").limit(1000);
    if (error) throw new ServerFault(FAILED);
    if (!data.length) return found;
    after = data[data.length - 1].id as number;
    const places = new Map<string, typeof data>();
    for (const r of data) places.set(r.workspace_id as string, [...(places.get(r.workspace_id as string) ?? []), r]);
    for (const [workspaceId, rows] of places) {
      for (const row of await openRows("intake_log", workspaceId, rows).catch(() => [])) {
        const sender = row.sender as string | null;
        if (!sender?.includes("@") || mailboxKey(sender) !== mailbox) continue;
        const patch = await sealedPatch("intake_log", workspaceId, row.id as number, { sender: "Deleted person" });
        found.push({ id: row.id as number, sender: patch.sender as string });
      }
    }
  }
}

/** What is left of an erased person: nothing ("deleted"), or their row as a Deleted person ("kept"). */
export type Erased = "deleted" | "kept";

/**
 * Erases the acting person: only ever themselves. Every step can run again, so a failed run is simply repeated; it is
 * finished only when the sign-in service no longer knows the person. Refused while they are a member of a Workspace, and
 * for the only Installation Admin of an Installation other people use.
 */
export async function erasePerson(actor: InstallationActor): Promise<Erased> {
  const id = String(actor?.personId ?? "");
  if (!id || id.length > PERSON_ID_MAX) throw new Forbidden();
  // The Personal Webhooks that ended with their place somewhere reach the Audit Log before the notes of it go.
  await recordPersonalWebhookEnds();
  const { data: who, error: unread } = await db().from("profiles").select("email").eq("id", id).maybeSingle();
  if (unread) throw new ServerFault(FAILED);
  if (!who) return "deleted";
  const address = (who.email as string | null) ?? null;
  const mailbox = address ? mailboxKey(address) : null;
  // Found before step one and applied inside its transaction, so a refusal changes none of it.
  const found = { names: await namesOnlyTheirs(id), intake: mailbox ? await unmatchedIntake(mailbox) : [] };
  const { data, error } = await db().rpc("erase_person", {
    p_person: id,
    p_address: address,
    p_mailbox: mailbox,
    p_sign_in_key: address ? signInAddressKey(address) : null,
    p_server_admins: serverAdminAddresses(),
    p_found: found,
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

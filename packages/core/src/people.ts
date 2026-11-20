// People of a Workspace (GLOSSARY: Contact, Workspace Role): its members, who sign in, and its Contacts, who have no
// login and only submit values. Pure: callers load the rows, these functions decide.
import type { Profile } from "./types";
import { HIDDEN_CHARACTERS } from "./profile";
import { isSealed } from "./workspace-keys";

/** A row that belongs to a Workspace. */
type InWorkspace = { workspace_id: string };

/** How a workspace knows a Contact: the person, and how this workspace reaches and recognises them. */
export type ContactRow = InWorkspace & { person_id: string; email: string | null; slack_handle: string | null; phone: string | null };

/** The channels a sender is recognised on. */
export type SenderSource = "slack" | "mail";

// NFC as the blind indexes take it (workspace-keys.ts), so the same address in another Unicode form is the same.
const norm = (s: string | null | undefined) => String(s ?? "").normalize("NFC").trim().toLowerCase();

/** Everyone a workspace knows: its members, then its Contacts with the details this workspace keeps for them.
 * Someone who is both a member and a contact counts as a member. Contacts of other workspaces are left out. */
export function peopleOf(ws: string, members: readonly Profile[], contacts: readonly ContactRow[], contactProfiles: readonly Profile[]): Profile[] {
  const memberIds = new Set(members.map((m) => m.id));
  const known = contacts
    .filter((c) => c.workspace_id === ws && !memberIds.has(c.person_id))
    .flatMap((c) => {
      const p = contactProfiles.find((x) => x.id === c.person_id);
      return p ? [{ ...p, email: c.email ?? "", slack_handle: c.slack_handle ?? "", phone: c.phone, contact: true }] : [];
    });
  return [...members.map((m) => ({ ...m, contact: false })), ...known];
}

/** Who sent a message on Slack or by mail, among the people of one workspace; nobody when no one matches or the
 * sender is empty. Handles and addresses are compared without case. */
export function recogniseSender(people: readonly Profile[], source: SenderSource, sender: string): Profile | undefined {
  const s = norm(sender);
  if (!s) return undefined;
  return people.find((p) => norm(source === "slack" ? p.slack_handle : p.email) === s);
}

/** A Contact's details as given, cleaned up, or the reason they cannot be kept. A Slack handle gets its "@". */
export function cleanContact(input: { name: string; email?: string; slackHandle?: string; phone?: string }):
  { ok: true; name: string; email: string | null; slack_handle: string | null; phone: string | null } | { ok: false; reason: string } {
  const name = String(input.name ?? "").trim().slice(0, 80);
  const email = norm(input.email) || null;
  const handle = norm(input.slackHandle).replace(/^@?/, "@");
  const slack_handle = handle === "@" ? null : handle;
  const phone = String(input.phone ?? "").trim() || null;
  if (!name) return { ok: false, reason: "Give the contact a name." };
  // Never text that reads as a sealed value (spec 0028), nor characters that could hide one name behind another.
  if (isSealed(name) || HIDDEN_CHARACTERS.test(name)) return { ok: false, reason: "The name has characters that cannot be shown." };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, reason: "That email address does not look right." };
  if (slack_handle && !/^@[a-z0-9._-]{1,80}$/.test(slack_handle)) return { ok: false, reason: "A Slack handle has letters, digits, dots, dashes or underscores." };
  if (phone && !/^\+?[0-9 ()/-]{5,30}$/.test(phone)) return { ok: false, reason: "That phone number does not look right." };
  if (!email && !slack_handle && !phone) return { ok: false, reason: "Add an email address, a Slack handle or a phone number." };
  return { ok: true, name, email, slack_handle, phone };
}

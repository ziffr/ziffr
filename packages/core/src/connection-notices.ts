// Telling a person by email that a Telegram or Slack account was connected to them, or stopped being theirs (spec 0016,
// spec 0007; GLOSSARY: Connector, Delivery). The email goes to the address the Workspace keeps for them, never by the
// chat service it is about. A notice about an account a code connected carries a link that disconnects it with no
// sign-in.
// Security: that link is signed (unsubscribe-token.ts) for one connection, named by the Workspace, the person and the
// moment it was made, so it can only end that one and does nothing once it was replaced; it never connects anything,
// which is why it does not expire. Opening it only asks; the page's button disconnects and drops any code the person
// had waiting. Notices are limited per person and Workspace. Sending one never fails what caused it.
import { db } from "./db";
import { deliverEmailNotice } from "./deliveries";
import { CONNECTION_NOTICE, connectedWords, DISCONNECT_PATH, disconnectedWords, type ChatService, type NoticeWords } from "./connection-notice-words";
import { headerSafe } from "./mail";
import { unsubscribeSigner } from "./unsubscribe-token";

/** Connection notices one person gets in an hour at most, per Workspace. */
export const CONNECTION_NOTICES_PER_HOUR = 5;
/** Connection notices one person gets in 24 hours at most, per Workspace. */
export const CONNECTION_NOTICES_PER_DAY = 20;

const LINKS = { telegram: "telegram_links", slack: "slack_links" } as const;
const CODES = { telegram: "telegram_link_codes", slack: "slack_link_codes" } as const;

const signer = unsubscribeSigner("ziffr/account-disconnect/v1", /^(telegram|slack)\|[0-9a-f-]{36}\|[^|\s]{1,100}\|\d{10,16}$/u, 400);

/** The Workspace's name, and a moment as its people read the clock. */
async function placeAndTime(workspaceId: string, at: Date): Promise<{ workspace: string; when: string }> {
  const { data } = await db().from("workspaces").select("name, time_zone").eq("id", workspaceId).maybeSingle();
  const written = (timeZone: string) => `${new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeStyle: "short", timeZone }).format(at)} (${timeZone})`;
  let when: string;
  try {
    when = written(String(data?.time_zone ?? "UTC"));
  } catch {
    when = written("UTC");
  }
  return { workspace: headerSafe(String(data?.name ?? "Ziffr")), when };
}

/** Whether another notice may go to this person now. */
async function underLimit(workspaceId: string, personId: string): Promise<boolean> {
  const since = async (hours: number) => (await db().from("deliveries").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("recipient_id", personId).eq("external_ref", CONNECTION_NOTICE).gt("created_at", new Date(Date.now() - hours * 3_600_000).toISOString())).count ?? 0;
  const [hour, day] = await Promise.all([since(1), since(24)]);
  return hour < CONNECTION_NOTICES_PER_HOUR && day < CONNECTION_NOTICES_PER_DAY;
}

/** Makes the notice's Delivery, within the limit; a notice that cannot be made is logged and changes nothing. */
async function send(workspaceId: string, personId: string, words: () => Promise<NoticeWords & { link: string | null }>, queue: boolean): Promise<void> {
  try {
    if (!(await underLimit(workspaceId, personId))) return;
    await deliverEmailNotice(workspaceId, { recipientId: personId, ...(await words()), ref: CONNECTION_NOTICE, queue });
  } catch (e) {
    console.error("A connection notice could not be sent:", e instanceof Error ? e.message : e);
  }
}

/** Tells a member that an account was just connected to them, by a code they made or by their email address. `linkedAt`
 * is the moment the connection was stored with. With `queue`, the email is left to the deliveries job, for a caller
 * that must not wait on the mail server. The caller has checked the person is a member. */
export async function tellConnected(c: { workspaceId: string; personId: string; service: ChatService; account: string; by: "code" | "email"; linkedAt: Date; queue?: boolean }): Promise<void> {
  await send(c.workspaceId, c.personId, async () => {
    // An account found by address would be found again, so such a notice says what does help instead.
    const token = c.by === "code" ? signer.sign(`${c.service}|${c.workspaceId}|${c.personId}|${c.linkedAt.getTime()}`) : null;
    const words = connectedWords({ service: c.service, account: c.account, by: c.by, disconnect: token !== null, ...(await placeAndTime(c.workspaceId, c.linkedAt)) });
    return { ...words, link: token ? `${DISCONNECT_PATH}${token}` : `/connectors?account=${c.service}` };
  }, c.queue ?? false);
}

/** Tells a member or Contact that the account connected to them was just connected to someone else in the Workspace. */
export async function tellDisconnected(c: { workspaceId: string; personId: string; service: ChatService; queue?: boolean }): Promise<void> {
  await send(c.workspaceId, c.personId, async () => {
    const { data } = await db().from("memberships").select("user_id").eq("workspace_id", c.workspaceId).eq("user_id", c.personId).maybeSingle();
    const words = disconnectedWords({ service: c.service, member: Boolean(data), ...(await placeAndTime(c.workspaceId, new Date())) });
    return { ...words, link: data ? `/connectors?account=${c.service}` : null };
  }, c.queue ?? false);
}

/** The connection a link's token names, and whether it is still the person's; null for a token Ziffr did not sign. */
async function named(token: string) {
  const subject = signer.verify(token);
  if (!subject) return null;
  const [service, workspaceId, personId, at] = subject.split("|") as [ChatService, string, string, string];
  const { data } = await db().from(LINKS[service]).select("linked_at").eq("workspace_id", workspaceId).eq("person_id", personId).maybeSingle();
  const linkedAt = data && new Date(data.linked_at as string).getTime() === Number(at) ? (data.linked_at as string) : null;
  const { data: w } = await db().from("workspaces").select("name").eq("id", workspaceId).maybeSingle();
  return w ? { service, workspaceId, personId, linkedAt, workspace: String(w.name) } : null;
}

/** What the page behind a disconnect link says: the service, the Workspace and whether that connection still stands.
 * Changes nothing. Null for any other link. Carries only what the email that holds the link says. */
export async function chatDisconnectView(token: string): Promise<{ service: ChatService; workspace: string; connected: boolean } | null> {
  const c = await named(token);
  return c ? { service: c.service, workspace: c.workspace, connected: c.linkedAt !== null } : null;
}

/** Ends the connection a disconnect link names, if it still stands, with no sign-in, and drops a code the person had
 * waiting for that service. Using it again changes nothing. Null for any other link. */
export async function disconnectByLink(token: string): Promise<{ service: ChatService; workspace: string } | null> {
  const c = await named(token);
  if (!c) return null;
  if (c.linkedAt !== null) {
    const { error } = await db().from(LINKS[c.service]).delete().eq("workspace_id", c.workspaceId).eq("person_id", c.personId).eq("linked_at", c.linkedAt);
    if (error) throw new Error("The account could not be disconnected.");
    await db().from(CODES[c.service]).delete().eq("workspace_id", c.workspaceId).eq("person_id", c.personId);
  }
  return { service: c.service, workspace: c.workspace };
}

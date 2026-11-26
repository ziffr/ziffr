// Telling a person by email that a Telegram or Slack account was connected to them, or stopped being theirs (spec 0016,
// spec 0007; GLOSSARY: Connector, Delivery). The email goes to the address the Workspace keeps for them, never by the
// chat service it is about. A notice about an account a code connected carries a link that disconnects it with no
// sign-in.
// Security: that link is signed (unsubscribe-token.ts), with the secrets key only, for one connection, named by the Workspace, the person and the
// moment it was made, so it can only end that one and does nothing once it was replaced; it never connects anything,
// which is why it does not expire. Opening it only asks; the page's button disconnects, drops any code the person had
// waiting and writes an Audit Log entry. When a notice goes, and when a summary takes its place, is
// connection-notice-rules.ts. Sending one never fails what caused it.
import { recordAudit } from "./audit-log";
import { db } from "./db";
import { deliverEmailNotice } from "./deliveries";
import { CONNECTION_NOTICE, NOTICE_HISTORY_HOURS, noticeRef, SUMMARY_NOTICE, whatToSend, type EarlierNotice } from "./connection-notice-rules";
import { connectedWords, DISCONNECT_PATH, disconnectedWords, summaryWords, type ChatService, type NoticeWords } from "./connection-notice-words";
import { headerSafe } from "./mail";
import { openNames } from "./sealed-columns";
import { unsubscribeSigner } from "./unsubscribe-token";

const LINKS = { telegram: "telegram_links", slack: "slack_links" } as const;
const CODES = { telegram: "telegram_link_codes", slack: "slack_link_codes" } as const;

// Without ZIFFR_SECRETS_KEY no link is made or accepted, and the notice points to Connectors instead.
const signer = unsubscribeSigner("ziffr/account-disconnect/v1", /^(telegram|slack)\|[0-9a-f-]{36}\|[^|\s]{1,100}\|\d{10,16}$/u, 400, { secretsKeyOnly: true });

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

/** The connection notices made for this person in this Workspace in the last day. Where they cannot be read, none: a
 * notice then goes. */
async function earlierNotices(workspaceId: string, personId: string): Promise<EarlierNotice[]> {
  const since = new Date(Date.now() - NOTICE_HISTORY_HOURS * 3_600_000).toISOString();
  const { data } = await db().from("deliveries").select("external_ref, created_at, mail_state").eq("workspace_id", workspaceId).eq("recipient_id", personId)
    .like("external_ref", `${CONNECTION_NOTICE}:%`).gt("created_at", since).order("id", { ascending: false }).limit(500);
  return (data ?? []).map((d) => ({ ref: d.external_ref as string, at: new Date(d.created_at as string).getTime(), failed: d.mail_state === "failed" }));
}

/** One thing to tell a person: which notice it is (`ref`), whom, about which service, and whether to leave the email to
 * the deliveries job. */
type About = { workspaceId: string; personId: string; service: ChatService; ref: string; queue?: boolean };

async function isMember(workspaceId: string, personId: string): Promise<boolean> {
  const { data } = await db().from("memberships").select("user_id").eq("workspace_id", workspaceId).eq("user_id", personId).maybeSingle();
  return Boolean(data);
}

/** Makes the notice's Delivery, or the summary in its place, or neither (connection-notice-rules.ts); one that cannot be
 * made is logged and changes nothing. */
async function send(about: About, words: () => Promise<NoticeWords & { link: string | null }>): Promise<void> {
  const { workspaceId, personId } = about;
  try {
    const what = whatToSend(await earlierNotices(workspaceId, personId), about.ref, Date.now());
    if (what === "nothing") return;
    let mail: NoticeWords & { link: string | null };
    if (what === "notice") mail = await words();
    else {
      const member = await isMember(workspaceId, personId);
      mail = { ...summaryWords({ member, ...(await placeAndTime(workspaceId, new Date())) }), link: member ? `/connectors?account=${about.service}` : null };
    }
    await deliverEmailNotice(workspaceId, { recipientId: personId, ...mail, ref: what === "notice" ? about.ref : SUMMARY_NOTICE, queue: about.queue });
  } catch (e) {
    console.error("A connection notice could not be sent:", e instanceof Error ? e.message : e);
  }
}

/** Tells a member that an account was just connected to them, by a code they made or by their email address. `accountId`
 * is the service's own id for it, `account` its name as the email shows it, `linkedAt` the moment the connection was
 * stored with. With `queue`, the email is left to the deliveries job, for a caller that must not wait on the mail
 * server. The caller has checked the person is a member. */
export async function tellConnected(c: { workspaceId: string; personId: string; service: ChatService; accountId: string; account: string; by: "code" | "email"; linkedAt: Date; queue?: boolean }): Promise<void> {
  await send({ workspaceId: c.workspaceId, personId: c.personId, service: c.service, ref: noticeRef("got", c.service, c.accountId), queue: c.queue }, async () => {
    // An account found by address would be found again, so such a notice says what does help instead.
    const token = c.by === "code" ? signer.sign(`${c.service}|${c.workspaceId}|${c.personId}|${c.linkedAt.getTime()}`) : null;
    const words = connectedWords({ service: c.service, account: c.account, by: c.by, disconnect: token !== null, ...(await placeAndTime(c.workspaceId, c.linkedAt)) });
    return { ...words, link: token ? `${DISCONNECT_PATH}${token}` : `/connectors?account=${c.service}` };
  });
}

/** Tells a member or Contact that the account connected to them (`accountId`) was just connected to someone else in the
 * Workspace. */
export async function tellDisconnected(c: { workspaceId: string; personId: string; service: ChatService; accountId: string; queue?: boolean }): Promise<void> {
  await send({ workspaceId: c.workspaceId, personId: c.personId, service: c.service, ref: noticeRef("lost", c.service, c.accountId), queue: c.queue }, async () => {
    const member = await isMember(c.workspaceId, c.personId);
    const words = disconnectedWords({ service: c.service, member, ...(await placeAndTime(c.workspaceId, new Date())) });
    return { ...words, link: member ? `/connectors?account=${c.service}` : null };
  });
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

/** A person's name as the Audit Log keeps it, or null when it cannot be read. */
async function nameOf(workspaceId: string, personId: string): Promise<string | null> {
  const { data } = await db().from("profiles").select("id, name").eq("id", personId).maybeSingle();
  if (!data) return null;
  return openNames(workspaceId, [data]).then(([p]) => (p?.name as string | undefined) ?? null, () => null);
}

/** Ends the connection a disconnect link names, if it still stands, with no sign-in, drops a code the person had waiting
 * for that service and records it in the Audit Log. Using it again changes and records nothing. Null for any other
 * link. */
export async function disconnectByLink(token: string): Promise<{ service: ChatService; workspace: string } | null> {
  const c = await named(token);
  if (!c) return null;
  if (c.linkedAt !== null) {
    const { data: ended, error } = await db().from(LINKS[c.service]).delete().eq("workspace_id", c.workspaceId).eq("person_id", c.personId).eq("linked_at", c.linkedAt).select("person_id");
    if (error) throw new Error("The account could not be disconnected.");
    await db().from(CODES[c.service]).delete().eq("workspace_id", c.workspaceId).eq("person_id", c.personId);
    // In the name of the person the email went to, as the link carries no sign-in (as for a held reply they confirm).
    if (ended?.length) await recordAudit(c.workspaceId, c.personId, { kind: `${c.service}.account_disconnected`, object: { type: "person", id: c.personId, name: await nameOf(c.workspaceId, c.personId) } });
  }
  return { service: c.service, workspace: c.workspace };
}

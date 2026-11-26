// The words of a connection notice (GLOSSARY: Connector, Delivery; spec 0016, spec 0007): what a person is emailed when a
// Telegram or Slack account is connected to them, or stops being theirs. Pure: no database. Security: whoever holds a chat account chose its name, so a name stands in these words only cleaned of
// everything that could be an address or a link; nothing here names another person.

/** A chat service whose accounts are connected to people. */
export type ChatService = "telegram" | "slack";

const SERVICE: Record<ChatService, string> = { telegram: "Telegram", slack: "Slack" };
/** What the button that disconnects one's own account is called on the Connectors page. */
const OWN_DISCONNECT: Record<ChatService, string> = { telegram: "Disconnect", slack: "Forget me on Slack" };

/** Where the page that disconnects an account from an email's link lives, before the link's token. */
export const DISCONNECT_PATH = "/api/disconnect-chat/";

/** A name from a chat service as it may stand in an email: letters, digits, spaces, apostrophes and hyphens, cut short. */
function cleaned(...parts: unknown[]): string {
  const shown = parts.filter((v): v is string => typeof v === "string").join(" ").replace(/[^\p{L}\p{M}\p{N} '’-]+/gu, " ").replace(/\s+/g, " ").trim();
  return Array.from(shown).slice(0, 40).join("").trim();
}

const fields = (v: unknown) => (v && typeof v === "object" ? v : {}) as Record<string, unknown>;

/** A Telegram account as Telegram names its sender: the display name, cleaned, and the @username, which has a fixed shape. */
export function telegramAccountName(from: unknown): string {
  const f = fields(from);
  const name = cleaned(f.first_name, f.last_name);
  const user = typeof f.username === "string" && /^[A-Za-z0-9_]{3,32}$/.test(f.username) ? `@${f.username}` : "";
  return name && user ? `“${name}” (${user})` : user || (name ? `“${name}”` : "an account without a name");
}

/** A Slack account: its display name, cleaned, when Slack gave one, its member ID, and the Slack workspace's name. */
export function slackAccountName(user: unknown, userId: string, team: unknown): string {
  const u = fields(user);
  const profile = fields(u.profile);
  const name = [profile.display_name, profile.real_name, u.real_name, u.name].map((v) => cleaned(v)).find(Boolean);
  const place = cleaned(team);
  return `${name ? `“${name}” (member ID ${userId})` : `member ID ${userId}`}${place ? ` in the Slack workspace “${place}”` : ""}`;
}

/** An email's subject and paragraphs. */
export type NoticeWords = { subject: string; text: string };

/** What a member is told when an account is connected to them: `by` a code they made, or found by their email address.
 * `disconnect` says whether the email carries the link that disconnects it. */
export function connectedWords(n: { service: ChatService; workspace: string; when: string; account: string; by: "code" | "email"; disconnect: boolean }): NoticeWords {
  const service = SERVICE[n.service];
  const found = n.by === "email";
  const action = found
    ? `If this is your account, there is nothing to do. If it is not, open Connectors with the workspace “${n.workspace}” chosen, choose Link my Slack account and send the code from your own Slack account: it replaces this one. Tell an Owner or Admin of the workspace too; they can disconnect Slack.`
    : `If this was you, there is nothing to do. If it was not, ${n.disconnect ? "open the link below and press Disconnect" : `open Connectors with the workspace “${n.workspace}” chosen and choose ${OWN_DISCONNECT[n.service]} there`}, then tell an Owner or Admin of the workspace.`;
  return {
    subject: `${service} was connected to you in Ziffr`,
    text: [
      `${found ? `Ziffr found your ${service} account by your email address and connected it to you` : `${service} was connected to you`} in the workspace “${n.workspace}” on ${n.when}.`,
      `${service} account: ${n.account}`,
      `Ziffr can send your messages from this workspace to that account, and what it answers counts as yours, approvals included.`,
      action,
    ].join("\n\n"),
  };
}

/** What a person is told in place of single notices when there are more than those go out for. */
export function summaryWords(n: { workspace: string; when: string; member: boolean }): NoticeWords {
  return {
    subject: "Several account connections in Ziffr",
    text: [
      `Telegram or Slack accounts were connected to you, or moved away from you, in the workspace “${n.workspace}” more often than Ziffr emails you about one by one. The latest was on ${n.when}. For now Ziffr holds back further emails about single connections there.`,
      n.member
        ? `Open Connectors with the workspace “${n.workspace}” chosen and check what is connected to you under Telegram and Slack. Disconnect what you did not connect, and tell an Owner or Admin of the workspace.`
        : "If you did not expect this, tell an Owner or Admin of the workspace, or the person who asks you for numbers.",
    ].join("\n\n"),
  };
}

/** What a person is told when the account connected to them was connected to someone else in the Workspace. */
export function disconnectedWords(n: { service: ChatService; workspace: string; when: string; member: boolean }): NoticeWords {
  const service = SERVICE[n.service];
  return {
    subject: `${service} was disconnected from you in Ziffr`,
    text: [
      `On ${n.when}, the ${service} account connected to you in the workspace “${n.workspace}” was connected to someone else there. Ziffr no longer sends it your messages or takes your answers from it.`,
      n.member
        ? `If you did not expect this, tell an Owner or Admin of the workspace. To connect an account again, open Connectors with the workspace “${n.workspace}” chosen.`
        : "If you did not expect this, tell an Owner or Admin of the workspace, or the person who asks you for numbers. To connect an account again, use your personal form.",
    ].join("\n\n"),
  };
}

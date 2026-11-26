// Links in an email (GLOSSARY: Delivery): how every address Ziffr sends is shown. In the HTML part the main action is a
// button and every other link has a few words, never the whole address as text; in the plain-text part each address
// Ziffr added stands whole on a line of its own, in angle brackets (RFC 3986, appendix C), so no mail app cuts it in
// two. Nothing is shortened, redirected or counted: a link goes where it says.
//
// Who may make a button matters: names, comments and messages in an email are people's words, and any of them may hold
// an address, also one of this Ziffr. So the button and Ziffr's own wording of a link come only from the address Ziffr
// itself added, handed on by whoever worded the message; it is never looked for among the lines. Every other address
// is shown by where it really leads. Pure.

/** The addresses that are this Ziffr: ZIFFR_SITE_URL, as every link Ziffr writes starts with it. */
export type OwnAddresses = readonly string[];

/** The button of an email: its words and where it leads, always an address Ziffr itself added. */
export type MailAction = { label: string; url: string };

/** A name people chose, as it may stand in a line of Ziffr's own: "://" is broken, so it is never a link. */
export const unlinked = (name: string) => name.replace(/:\/\//g, ": //");

// The path below this Ziffr's address ("/" for the address itself), or null for an address that is not this Ziffr's.
// Compared up to a slash, so https://ziffr.example.com.evil.test is somewhere else.
function ownPath(url: string, own: OwnAddresses): string | null {
  for (const address of own) {
    const base = address.replace(/\/+$/, "");
    if (!base) continue;
    if (url === base) return "/";
    if (url.startsWith(`${base}/`)) return url.slice(base.length);
  }
  return null;
}

/** A line that ends with one of these addresses, whole (also in angle brackets): its indent, the words before the
 * address and the address. Null for any other line, and for a quoted one ("> …"), which holds a person's words. */
export function linkLine(line: string, urls: readonly string[]): { indent: string; words: string; url: string } | null {
  if (/^\s*>/.test(line)) return null;
  const whole = line.trimEnd();
  const at = Math.max(whole.lastIndexOf(" "), whole.lastIndexOf("\t"));
  const last = whole.slice(at + 1);
  const url = urls.find((u) => u && (last === u || last === `<${u}>`));
  return url ? { indent: /^\s*/.exec(whole)![0], words: whole.slice(0, at + 1).trim(), url } : null;
}

/** The plain-text part: each line that ends with an address Ziffr added (`urls`) keeps its words and has the address
 * below them, alone, in angle brackets. Everything else stays as written, and doing it twice changes nothing. */
export function plainWords(text: string, urls: readonly string[]): string {
  return text.replace(/\r\n?/g, "\n").split("\n").map((line) => {
    const found = linkLine(line, urls);
    if (!found) return line;
    const { indent, words, url } = found;
    return `${words ? `${indent}${words}\n` : ""}${indent}<${url}>`;
  }).join("\n");
}

// The words Ziffr writes before a link it appends to a Delivery (deliveries.ts, connectors/email.ts).
const APPENDED = /^(?:Open|Open your form|Enter it in your form|Answer it in Ziffr|Answer by replying to this email, or open it in Ziffr): (\S+)$/;

/** The address Ziffr appended to a Delivery's words: the one on their very last line, written as Ziffr writes it there
 * and leading to this Ziffr; null otherwise. Only the last line is read: Ziffr adds its link after everything a person
 * wrote, so no words of theirs can stand in its place (a message without a link ends with words of Ziffr's). */
export function appendedLink(text: string, own: OwnAddresses): string | null {
  const url = APPENDED.exec(text.slice(text.trimEnd().lastIndexOf("\n") + 1).trimEnd())?.[1];
  return url && ownPath(url, own) !== null ? url : null;
}

// What a button says, by where it leads; the first that fits.
const BUTTONS: [RegExp, string][] = [
  [/^\/submit\//, "Open your form"],
  [/^\/invite\//, "Accept the invitation"],
  [/^\/api\/confirm-reply\//, "Check your reply"],
  [/^\/api\/confirm-telegram\//, "Check the request"],
  [/^\/api\/disconnect-chat\//, "Not you? Disconnect it"],
  [/^\/connectors/, "Open Connectors"],
  [/^\/v\//, "Open the dashboard"],
  [/^\/dashboards\/\d+\/snapshots\//, "Open the Snapshot"],
  [/^\/dashboards\//, "Open the dashboard"],
  [/^\/metrics\/[^/?#]/, "Open the Metric"],
  [/^\/workflows/, "Open the Workflow"],
  [/^\/settings\/usage/, "Open the Usage page"],
  [/^\/settings\/(export|workspace\/download)/, "Download your data"],
  [/^\/(\?panel=feedback)$/, "Open My feedback"],
  [/^\/$/, "Open Ziffr"],
];

/** The button to an address Ziffr added, in the words that fit where it leads. */
export function buttonTo(url: string, own: OwnAddresses): MailAction {
  const path = ownPath(url, own);
  return { url, label: (path !== null && BUTTONS.find(([at]) => at.test(path))?.[1]) || "Open in Ziffr" };
}

// How much of an address's path is shown.
const PATH_SHOWN = 20;

/** The words of a link inside the text, which a person may have written: where it really leads, as its host and the
 * start of its path, so it can never pass for something it is not. */
export function shownTarget(url: string): string {
  try {
    const { host, pathname, search, hash } = new URL(url);
    const path = `${pathname}${search}${hash}`.replace(/^\/$/, "");
    return `${host}${path.length > PATH_SHOWN ? `${path.slice(0, PATH_SHOWN)}…` : path}`;
  } catch {
    return "Link";
  }
}

// Words before an address that only say "here it is": the button says that already. "Answer it in Ziffr" is not one
// of them: it also says that a reply to the email is not taken.
const SAID_BY_THE_BUTTON = new Set(["Open", "Open it here", "Open this Ziffr", "Open your form", "Join here", "Enter it in your form"]);

/** The text above and below the button: the action's line is taken out, its words kept as a sentence unless the button
 * says them already, and a colon that pointed at the address becomes a full stop. `before` is the whole text, and
 * `after` empty, when no line ends with the address. */
export function aroundAction(text: string, url: string): { before: string; after: string } {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  let at = lines.length - 1;
  while (at >= 0 && !linkLine(lines[at], [url])) at--;
  if (at < 0) return { before: text, after: "" };
  const { words } = linkLine(lines[at], [url])!;
  const above = lines.slice(0, at);
  if (words && !SAID_BY_THE_BUTTON.has(words.replace(/:$/, ""))) above.push(words);
  return { before: above.join("\n").trimEnd().replace(/:$/, "."), after: lines.slice(at + 1).join("\n") };
}

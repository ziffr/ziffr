// Links in an email (GLOSSARY: Delivery): how every address Ziffr sends is shown, whoever worded the message. In the
// HTML part the main action is a button and every other link has a few words, never the address as text; in the
// plain-text part every address of this Ziffr stands whole on a line of its own, in angle brackets (RFC 3986,
// appendix C), so no mail app cuts it in two. Nothing is shortened, redirected or counted: a link goes where it says.
// Only an address of this Ziffr becomes a button, so words a person wrote can never make one that leads elsewhere.
// Pure.

/** The addresses that are this Ziffr: ZIFFR_SITE_URL, as every link Ziffr writes starts with it. */
export type OwnAddresses = readonly string[];

/** A button or a worded link: its words and where it leads. */
export type MailAction = { label: string; url: string };

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

/** A line that ends with an address of this Ziffr (also one already in angle brackets): its indent, the words before
 * the address and the address. Null for any other line, and for a quoted one ("> …"), which holds a person's words. */
export function linkLine(line: string, own: OwnAddresses): { indent: string; words: string; url: string } | null {
  if (/^\s*>/.test(line)) return null;
  const whole = line.trimEnd();
  const at = Math.max(whole.lastIndexOf(" "), whole.lastIndexOf("\t"));
  const last = whole.slice(at + 1);
  // In angle brackets the address is exactly what stands between them; bare, punctuation after it is the sentence's.
  const url = /^<([^<>]+)>[.,;:!?)]*$/.exec(last)?.[1] ?? last.replace(/[.,;:!?)]+$/, "");
  if (!/^https?:\/\//i.test(url) || ownPath(url, own) === null) return null;
  return { indent: /^\s*/.exec(whole)![0], words: whole.slice(0, at + 1).trim(), url };
}

/** The plain-text part: every line that ends with an address of this Ziffr keeps its words and has the address below
 * them, alone, in angle brackets. Everything else stays as written, and doing it twice changes nothing. */
export function plainWords(text: string, own: OwnAddresses): string {
  return text.replace(/\r\n?/g, "\n").split("\n").map((line) => {
    const found = linkLine(line, own);
    if (!found) return line;
    const { indent, words, url } = found;
    return `${words ? `${indent}${words}\n` : ""}${indent}<${url}>`;
  }).join("\n");
}

const UNSUBSCRIBE = /^\/api\/unsubscribe\//;

// What a button says, by where it leads; the first that fits.
const BUTTONS: [RegExp, string][] = [
  [/^\/submit\//, "Open your form"],
  [/^\/invite\//, "Accept the invitation"],
  [/^\/api\/confirm-reply\//, "Check your reply"],
  [UNSUBSCRIBE, "Stop these emails"],
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

/** The words of the button to an address of this Ziffr. */
export function buttonWords(url: string, own: OwnAddresses): string {
  const path = ownPath(url, own);
  return (path !== null && BUTTONS.find(([at]) => at.test(path))?.[1]) || "Open in Ziffr";
}

/** The words of a link inside the text. An address elsewhere, which only a person can have written, names its host, so
 * the reader sees where it leads before opening it. */
export function linkWords(url: string, own: OwnAddresses): string {
  const path = ownPath(url, own);
  if (path !== null) return UNSUBSCRIBE.test(path) ? "Stop these emails" : "Link to Ziffr";
  try { return `Link to ${new URL(url).host}`; } catch { return "Link"; }
}

/** The main action of a message: the last line that ends with an address of this Ziffr, which is where Ziffr's own
 * words put it (a stop link is never it: that one has its place in the footer). Null when there is none. */
export function mainAction(text: string, own: OwnAddresses): MailAction | null {
  const lines = text.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const found = linkLine(lines[i], own);
    if (found && !UNSUBSCRIBE.test(ownPath(found.url, own)!)) return { label: buttonWords(found.url, own), url: found.url };
  }
  return null;
}

// Words before an address that only say "here it is": the button says that already. "Answer it in Ziffr" is not one
// of them: it also says that a reply to the email is not taken.
const SAID_BY_THE_BUTTON = new Set(["Open", "Open it here", "Open this Ziffr", "Open your form", "Join here", "Enter it in your form"]);

/** The text above and below the button: the action's line is taken out, its words kept as a sentence unless the button
 * says them already, and a colon that pointed at the address becomes a full stop. `before` is the whole text, and
 * `after` empty, when no line ends with the address. */
export function aroundAction(text: string, url: string): { before: string; after: string } {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  let at = -1;
  for (let i = lines.length - 1; i >= 0 && at < 0; i--) if (linkLine(lines[i], [url])?.url === url) at = i;
  if (at < 0) return { before: text, after: "" };
  const { words } = linkLine(lines[at], [url])!;
  const above = lines.slice(0, at);
  if (words && !SAID_BY_THE_BUTTON.has(words.replace(/:$/, ""))) above.push(words);
  return { before: above.join("\n").trimEnd().replace(/:$/, "."), after: lines.slice(at + 1).join("\n") };
}

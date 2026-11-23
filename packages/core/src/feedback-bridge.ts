// The GitHub post made from a Feedback (spec 0049, ticket #917; GLOSSARY: Feedback): the one place that decides what
// of a feedback leaves Ziffr. Pure, so a test can prove it. ANONYMITY is a property of this function: it reads exactly
// five fields (kind, words, route, app version, public reference) and nothing else of the row, so no person, Workspace,
// email, id or Metric data can reach GitHub, whatever the row carries. The words are the person's own and public (the
// form says so); they are made harmless text: control, zero-width and bidirectional characters removed, @-mentions and
// issue references defanged so nobody is pinged or linked, the length capped, and the words put inside a code fence
// longer than any run of backticks in them so nothing in them can render as markdown, a link, an image or HTML.
import { cleanAppVersion, FEEDBACK_WORDS_MAX, feedbackKind, storedRoute, type FeedbackKind } from "./feedback-rules";

/** What the post is made from: these five fields and nothing else of a feedback. */
export type FeedbackToPost = { kind: string; words: string; route: string | null; app_version: string | null; public_ref: string };

/** What goes to GitHub: an issue with labels, or a Discussion in a category. */
export type GithubPost =
  | { target: "issue"; title: string; body: string; labels: string[] }
  | { target: "discussion"; title: string; body: string; categoryId: string };

/** The label every filed problem carries. */
export const FEEDBACK_LABEL = "feedback";
const TITLE_MAX = 80;
const REF = /^[0-9a-f]{16}$/;
// Zero-width, bidirectional, invisible-format and tag characters, the soft hyphen, C1 controls and the line/paragraph separators.
const INVISIBLE = /[\u00ad\u0080-\u009f\u061c\u180e\u200b-\u200f\u2028\u2029\u202a-\u202e\u2060-\u206f\ufeff\u{e0000}-\u{e007f}]/gu;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
/** The one invisible character the defanging puts in, after an `@` or a `#`; the tests allow it nowhere else. */
export const DEFANG = "\u200b";

/** The marker the post carries so a retry can find it again; the public reference is opaque and never derived from a person. */
export const markerFor = (publicRef: string): string => `ziffr-feedback-${publicRef}`;

/** The words made safe to post: invisible and control characters removed, line breaks plain, mentions and references
 * defanged (`@name`, `#123`, `owner/repo#123`, `GH-123`), cut to the length limit. */
export function neutraliseWords(input: string): string {
  const plain = String(input).replace(/\r\n?/g, "\n").replace(INVISIBLE, "").replace(CONTROL, "");
  const defanged = plain.replace(/@(?=[A-Za-z0-9_])/g, `@${DEFANG}`).replace(/#(?=\d)/g, `#${DEFANG}`).replace(/\bGH-(?=\d)/gi, (m) => m + DEFANG);
  return [...defanged.trim()].slice(0, FEEDBACK_WORDS_MAX).join("");
}

/** Words from outside (a team comment on GitHub) made plain for storing: line breaks plain, control, zero-width and
 * bidirectional characters removed, edges trimmed, cut to `max` characters (with an ellipsis when cut). Nothing is
 * defanged: they are shown as plain text, never as markdown or a link. */
export function plainWords(input: unknown, max: number): string {
  const plain = (typeof input === "string" ? input : "").replace(/\r\n?/g, "\n").replace(INVISIBLE, "").replace(CONTROL, "").trim();
  const chars = [...plain];
  return chars.length > max ? `${chars.slice(0, max - 1).join("").trimEnd()}…` : plain;
}

/** A code fence longer than any run of backticks in the text, so nothing inside can close it. */
const fenceFor = (text: string): string => "`".repeat(Math.max(3, ...(text.match(/`+/g) ?? []).map((r) => r.length + 1)));

function titleOf(words: string): string {
  const first = words.split("\n").map((l) => l.replace(/\s+/g, " ").trim()).find((l) => l !== "") ?? "";
  const chars = [...first];
  return chars.length === 0 ? "Feedback from a Ziffr user" : chars.length > TITLE_MAX ? `${chars.slice(0, TITLE_MAX - 1).join("")}…` : first;
}

/** The post for one feedback: an issue labelled `feedback` for a problem, a Discussion in `categoryId` for an idea or a
 * question. Throws when the kind or the reference is not one this system makes, so nothing odd is ever posted. */
export function buildGithubPost(feedback: FeedbackToPost, categoryId: string): GithubPost {
  const kind: FeedbackKind | null = feedbackKind(feedback.kind);
  if (!kind) throw new Error("Not a feedback kind.");
  if (typeof feedback.public_ref !== "string" || !REF.test(feedback.public_ref)) throw new Error("Not a feedback reference.");
  const words = neutraliseWords(feedback.words);
  if (words === "") throw new Error("Nothing to post.");
  // Checked again here: the stored values were checked on the way in, a row is still only data.
  const route = storedRoute(feedback.route);
  const version = cleanAppVersion(feedback.app_version);
  const fence = fenceFor(words);
  const body = [
    `**From a Ziffr user** (${kind})`, "",
    `${fence}\n${words}\n${fence}`, "",
    ...(route ? [`Page: \`${route}\``] : []),
    ...(version ? [`App version: \`${version}\``] : []),
    `Reference: ${markerFor(feedback.public_ref)}`,
  ].join("\n");
  const title = titleOf(words);
  return kind === "problem" ? { target: "issue", title, body, labels: [FEEDBACK_LABEL] } : { target: "discussion", title, body, categoryId };
}

/** The first line of every comment made from a person's reply. */
const REPLY_HEADER = "**A Ziffr user replied:**";
const REPLY_LAST_LINE = /^Reference: ziffr-feedback-[0-9a-f]{16}-[1-9][0-9]{0,15}$/;

/** Whether a comment body has the shape of one of OUR relayed replies: the header on its first line and the reply marker as
 * its very last line. The person's words sit between, inside a fence the neutralising keeps closed, so they can never be the
 * last line; a team comment (which may be written from the same GitHub account) that quotes a marker anywhere but last is
 * therefore an answer, and only a comment written to look like a relayed reply (by someone with the account) is not. */
export function isRelayedReply(body: string): boolean {
  const lines = String(body).replace(/\r\n?/g, "\n").trim().split("\n");
  return lines[0]?.trim() === REPLY_HEADER && REPLY_LAST_LINE.test((lines[lines.length - 1] ?? "").trim());
}

/** The marker a reply's comment carries as its last line, so a retry can find it again (the message id is ours, opaque). */
export const replyMarkerFor = (publicRef: string, messageId: number): string => `${markerFor(publicRef)}-${messageId}`;

/** The comment made from a person's reply: "A Ziffr user replied:", the words as neutralised and fenced as in the post
 * itself, and the marker. Reads the words, the public reference and the message id only: nothing of the person. Throws
 * when there is nothing to post or the reference or id is not one this system makes. */
export function buildGithubReply(reply: { words: string; public_ref: string; message_id: number }): string {
  if (typeof reply.public_ref !== "string" || !REF.test(reply.public_ref)) throw new Error("Not a feedback reference.");
  if (!Number.isSafeInteger(reply.message_id) || reply.message_id < 1) throw new Error("Not a message.");
  const words = neutraliseWords(reply.words);
  if (words === "") throw new Error("Nothing to post.");
  const fence = fenceFor(words);
  return [REPLY_HEADER, "", `${fence}\n${words}\n${fence}`, "", `Reference: ${replyMarkerFor(reply.public_ref, reply.message_id)}`].join("\n");
}

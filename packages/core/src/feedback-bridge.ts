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

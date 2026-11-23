// What GitHub tells the feedback bridge (spec 0049, ticket #918; GLOSSARY: Feedback): the signature check and the reading of
// an event, pure so every rule is tested without a database or a network. Everything here is UNTRUSTED input: a body is
// believed only when its signature is right, and even then only the few fields below are read, each checked for its shape.
// Anonymity: the commenter's GitHub login is looked at (to tell the bot and bots from people, and never kept): the event
// this returns carries the words, the comment's number and the post's number, and nothing that names the commenter.
import { createHmac, timingSafeEqual } from "node:crypto";
import { plainWords } from "./feedback-bridge";

/** The shortest webhook secret accepted: a short one is refused as if there were none. */
export const WEBHOOK_SECRET_MIN = 32;
/** The longest team comment kept, in characters; longer is cut. */
export const TEAM_WORDS_MAX = 2000;
/** Who counts as the Ziffr team: GitHub's own word for a comment's author. Anyone may comment on a public post, and a
 * stranger's words must not arrive under the Ziffr team's name. */
export const TEAM_ASSOCIATIONS: readonly string[] = ["OWNER", "MEMBER", "COLLABORATOR"];

/** What an event means for a feedback. `ref` is the comment's reference, one per comment, so a comment is taken once. */
export type GithubFeedbackEvent =
  | { type: "comment"; kind: "issue" | "discussion"; number: number; ref: string; words: string; at: string | null }
  | { type: "edit"; kind: "issue" | "discussion"; number: number; ref: string; words: string; at: string }
  | { type: "remove"; kind: "issue" | "discussion"; number: number; ref: string }
  | { type: "status"; kind: "issue" | "discussion"; number: number; status: "open" | "closed" | "answered" };

/** Whether the secret is long enough to be one. */
export const webhookSecretUsable = (secret: string | undefined): secret is string => typeof secret === "string" && secret.length >= WEBHOOK_SECRET_MIN;

const SIGNATURE = /^sha256=([0-9a-f]{64})$/;

/** Whether `header` (X-Hub-Signature-256) is the HMAC-SHA256 of the raw body under the secret, compared in constant time. */
export function githubSignatureValid(body: Uint8Array, header: string | null, secret: string): boolean {
  const given = SIGNATURE.exec(header ?? "")?.[1];
  if (!given || !webhookSecretUsable(secret)) return false;
  const wanted = createHmac("sha256", secret).update(body).digest();
  return timingSafeEqual(Buffer.from(given, "hex"), wanted);
}

const obj = (v: unknown): Record<string, unknown> | null => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const positive = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v > 0;
const LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})(\[bot\])?$/;

/** What one GitHub event means, or null when it is none of ours: another repository, another event or action, a pull
 * request, a comment by the bot (a relayed reply, never echoed back), by another bot or by someone who is not on the team.
 * `repo` is `owner/name` and `bot` the bot's login; both come from our own settings, never from the event. */
export function readGithubEvent(name: string, payload: unknown, ctx: { repo: string; bot: string }): GithubFeedbackEvent | null {
  const p = obj(payload);
  if (!p || typeof p.action !== "string") return null;
  if (typeof obj(p.repository)?.full_name !== "string" || (obj(p.repository)!.full_name as string).toLowerCase() !== ctx.repo.toLowerCase()) return null;
  const action = p.action;
  if (name === "issues" || name === "discussion") {
    const kind = name === "issues" ? "issue" : "discussion";
    const post = obj(p[name === "issues" ? "issue" : "discussion"]);
    if (!post || !positive(post.number) || (name === "issues" && post.pull_request != null)) return null;
    const status = action === "closed" ? "closed" : action === "reopened" ? "open" : name === "discussion" && action === "answered" ? "answered" : null;
    return status ? { type: "status", kind, number: post.number, status } : null;
  }
  if (name === "issue_comment" || name === "discussion_comment") {
    if (action !== "created" && action !== "edited" && action !== "deleted") return null;
    const kind = name === "issue_comment" ? "issue" : "discussion";
    const post = obj(p[kind]);
    const comment = obj(p.comment);
    if (!post || !comment || !positive(post.number) || !positive(comment.id) || (action !== "deleted" && typeof comment.body !== "string")) return null;
    // A comment on a pull request is not feedback.
    if (kind === "issue" && post.pull_request != null) return null;
    const ref = `${kind}-comment:${comment.id}`;
    // A deletion needs no author: it only ever touches a stored team message with this reference.
    if (action === "deleted") return { type: "remove", kind, number: post.number, ref };
    const user = obj(comment.user);
    const login = user?.login;
    if (typeof login !== "string" || !LOGIN.test(login)) return null;
    // The bot's own comment is a relayed reply; another bot (a stale-bot, a CI notice) is not an answer from the team.
    if (login.toLowerCase() === ctx.bot.toLowerCase() || user?.type === "Bot" || login.endsWith("[bot]")) return null;
    if (typeof comment.author_association !== "string" || !TEAM_ASSOCIATIONS.includes(comment.author_association)) return null;
    const words = plainWords(comment.body, TEAM_WORDS_MAX);
    if (words === "") return null;
    // The comment's own last-change time: an edit is applied only when it is newer than the stored one (so a late or replayed one cannot undo a later one).
    const at = typeof comment.updated_at === "string" && Number.isFinite(Date.parse(comment.updated_at)) ? new Date(comment.updated_at).toISOString() : null;
    if (action === "edited") return at ? { type: "edit", kind, number: post.number, ref, words, at } : null;
    return { type: "comment", kind, number: post.number, ref, words, at };
  }
  return null;
}

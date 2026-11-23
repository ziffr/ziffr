// What GitHub tells the feedback bridge (spec 0049, ticket #918): the signature check and the reading of events, with
// forged, foreign and hostile input. No database, no network.
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildGithubReply, plainWords, replyMarkerFor } from "./feedback-bridge";
import { githubSignatureValid, readGithubEvent, TEAM_WORDS_MAX, webhookSecretUsable } from "./feedback-webhook-rules";

const SECRET = "s".repeat(40);
const sign = (body: string, secret = SECRET) => `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
const ctx = { repo: "ziffr/ziffr", bot: "ziffr-feedback-bot" };
const repository = { full_name: "ziffr/ziffr" };
const team = "MEMBER";
const comment = (over: Record<string, unknown> = {}) => ({ id: 42, body: "Thanks, fixed in the next release.", user: { login: "maintainer-ann", type: "User" }, author_association: team, ...over });
const issueComment = (over: Record<string, unknown> = {}, post: Record<string, unknown> = {}) => ({ action: "created", repository, issue: { number: 7, ...post }, comment: comment(over) });

describe("the signature", () => {
  it("accepts the HMAC-SHA256 of the raw bytes under the secret and nothing else", () => {
    const body = '{"a":1}';
    const bytes = new TextEncoder().encode(body);
    expect(githubSignatureValid(bytes, sign(body), SECRET)).toBe(true);
    expect(githubSignatureValid(bytes, sign(body, "t".repeat(40)), SECRET)).toBe(false);
    expect(githubSignatureValid(new TextEncoder().encode('{"a":2}'), sign(body), SECRET)).toBe(false);
    // The whole body is signed: the same JSON laid out differently is another body.
    expect(githubSignatureValid(new TextEncoder().encode('{"a": 1}'), sign(body), SECRET)).toBe(false);
  });

  it("refuses a missing, malformed, short or sha1 header and a short secret", () => {
    const bytes = new TextEncoder().encode("{}");
    const good = sign("{}");
    for (const bad of [null, "", good.slice(7), good.toUpperCase(), good.slice(0, -2), `${good}00`, `sha1=${good.slice(7, 47)}`, `sha256= ${good.slice(7)}`, `sha256=${"z".repeat(64)}`]) expect(githubSignatureValid(bytes, bad, SECRET)).toBe(false);
    const short = "s".repeat(10);
    expect(githubSignatureValid(bytes, sign("{}", short), short)).toBe(false);
    expect(webhookSecretUsable(undefined)).toBe(false);
    expect(webhookSecretUsable("")).toBe(false);
    expect(webhookSecretUsable(SECRET)).toBe(true);
  });
});

describe("a comment from the team", () => {
  it("becomes a comment on the issue or discussion it was made on, with a reference of its own", () => {
    expect(readGithubEvent("issue_comment", issueComment(), ctx)).toEqual({ type: "comment", kind: "issue", number: 7, ref: "issue-comment:42", words: "Thanks, fixed in the next release." });
    const d = { action: "created", repository, discussion: { number: 3 }, comment: comment({ id: 99 }) };
    expect(readGithubEvent("discussion_comment", d, ctx)).toMatchObject({ type: "comment", kind: "discussion", number: 3, ref: "discussion-comment:99" });
  });

  it("never carries the commenter: no login, no association, no id of theirs, whatever the payload holds", () => {
    const e = readGithubEvent("issue_comment", { ...issueComment({ user: { login: "maintainer-ann", type: "User", id: 5, email: "ann@corp.example" }, body: "Hi" }), sender: { login: "maintainer-ann" } }, ctx);
    const json = JSON.stringify(e);
    for (const leak of ["maintainer-ann", "ann@corp", "MEMBER", "sender", "login"]) expect(json).not.toContain(leak);
    expect(Object.keys(e!).sort()).toEqual(["kind", "number", "ref", "type", "words"]);
  });

  it("is not echoed when the bot made it (a relayed reply), in any letter case, and not when another bot did", () => {
    expect(readGithubEvent("issue_comment", issueComment({ user: { login: "ziffr-feedback-bot", type: "User" } }), ctx)).toBeNull();
    expect(readGithubEvent("issue_comment", issueComment({ user: { login: "Ziffr-Feedback-Bot", type: "User" } }), ctx)).toBeNull();
    expect(readGithubEvent("issue_comment", issueComment({ user: { login: "ziffr-feedback-bot[bot]", type: "Bot" } }), { ...ctx, bot: "ziffr-feedback-bot[bot]" })).toBeNull();
    expect(readGithubEvent("issue_comment", issueComment({ user: { login: "stale[bot]", type: "Bot" } }), ctx)).toBeNull();
    expect(readGithubEvent("issue_comment", issueComment({ user: { login: "dependabot", type: "Bot" } }), ctx)).toBeNull();
  });

  it("is taken only from the team: a stranger's comment on a public post is not an answer from the Ziffr team", () => {
    for (const association of ["NONE", "CONTRIBUTOR", "FIRST_TIME_CONTRIBUTOR", "FIRST_TIMER", "MANNEQUIN", undefined, 7]) expect(readGithubEvent("issue_comment", issueComment({ author_association: association }), ctx)).toBeNull();
    for (const association of ["OWNER", "MEMBER", "COLLABORATOR"]) expect(readGithubEvent("issue_comment", issueComment({ author_association: association }), ctx)).not.toBeNull();
  });

  it("keeps the words as plain text: controls and bidi stripped, line breaks plain, links and mentions left as written, length capped", () => {
    const e = readGithubEvent("issue_comment", issueComment({ body: `See [this](https://evil.example/x) @victim‮​\r\nline\u0000two` }), ctx);
    expect(e).toMatchObject({ words: "See [this](https://evil.example/x) @victim\nlinetwo" });
    const long = readGithubEvent("issue_comment", issueComment({ body: "x".repeat(TEAM_WORDS_MAX + 500) }), ctx);
    expect([...(long as { words: string }).words]).toHaveLength(TEAM_WORDS_MAX);
    expect((long as { words: string }).words.endsWith("…")).toBe(true);
  });

  it("is ignored when there is nothing left of the words", () => {
    expect(readGithubEvent("issue_comment", issueComment({ body: "​‮  " }), ctx)).toBeNull();
    expect(readGithubEvent("issue_comment", issueComment({ body: 7 }), ctx)).toBeNull();
  });

  it("is ignored with any other action, on a pull request, from another repository, or malformed", () => {
    expect(readGithubEvent("issue_comment", { ...issueComment(), action: "pinned" }, ctx)).toBeNull();
    expect(readGithubEvent("issue_comment", issueComment({}, { pull_request: { url: "x" } }), ctx)).toBeNull();
    expect(readGithubEvent("issue_comment", { ...issueComment(), repository: { full_name: "evil/ziffr" } }, ctx)).toBeNull();
    expect(readGithubEvent("issue_comment", { ...issueComment(), repository: undefined }, ctx)).toBeNull();
    expect(readGithubEvent("issue_comment", issueComment({}, { number: -1 }), ctx)).toBeNull();
    expect(readGithubEvent("issue_comment", issueComment({}, { number: "7" }), ctx)).toBeNull();
    expect(readGithubEvent("issue_comment", issueComment({ id: 1.5 }), ctx)).toBeNull();
    expect(readGithubEvent("issue_comment", issueComment({ user: { login: "bad login!", type: "User" } }), ctx)).toBeNull();
    for (const junk of [null, undefined, "x", 7, [], {}]) expect(readGithubEvent("issue_comment", junk, ctx)).toBeNull();
  });

  it("reads the repository without regard to letter case", () => {
    expect(readGithubEvent("issue_comment", { ...issueComment(), repository: { full_name: "Ziffr/Ziffr" } }, ctx)).not.toBeNull();
  });
});

describe("a team comment edited or deleted", () => {
  it("follows an edit with the new words, under the same rules as a new comment", () => {
    expect(readGithubEvent("issue_comment", { ...issueComment({ body: "Better words\u202e" }), action: "edited" }, ctx)).toEqual({ type: "edit", kind: "issue", number: 7, ref: "issue-comment:42", words: "Better words" });
    expect(readGithubEvent("issue_comment", { ...issueComment({ author_association: "NONE" }), action: "edited" }, ctx)).toBeNull();
    expect(readGithubEvent("issue_comment", { ...issueComment({ user: { login: "ziffr-feedback-bot", type: "User" } }), action: "edited" }, ctx)).toBeNull();
    expect(readGithubEvent("issue_comment", { ...issueComment({ body: "\u200b" }), action: "edited" }, ctx)).toBeNull();
  });
  it("follows a deletion by its reference only, carrying no words and no author", () => {
    const e = readGithubEvent("discussion_comment", { action: "deleted", repository, discussion: { number: 3 }, comment: { id: 9 } }, ctx);
    expect(e).toEqual({ type: "remove", kind: "discussion", number: 3, ref: "discussion-comment:9" });
    expect(readGithubEvent("issue_comment", { action: "deleted", repository: { full_name: "evil/ziffr" }, issue: { number: 7 }, comment: { id: 9 } }, ctx)).toBeNull();
    expect(readGithubEvent("issue_comment", { action: "deleted", repository, issue: { number: 7, pull_request: {} }, comment: { id: 9 } }, ctx)).toBeNull();
  });
});

describe("a post closed or reopened", () => {
  const status = (name: string, action: string, key = name === "issues" ? "issue" : "discussion", extra: Record<string, unknown> = {}) => readGithubEvent(name, { action, repository, [key]: { number: 5, ...extra } }, ctx);
  it("closes and reopens an issue and a discussion", () => {
    expect(status("issues", "closed")).toEqual({ type: "status", kind: "issue", number: 5, status: "closed" });
    expect(status("issues", "reopened")).toEqual({ type: "status", kind: "issue", number: 5, status: "open" });
    expect(status("discussion", "closed")).toEqual({ type: "status", kind: "discussion", number: 5, status: "closed" });
    expect(status("discussion", "reopened")).toEqual({ type: "status", kind: "discussion", number: 5, status: "open" });
  });
  it("takes an answered discussion as answered, and nothing else of the actions", () => {
    expect(status("discussion", "answered")).toEqual({ type: "status", kind: "discussion", number: 5, status: "answered" });
    expect(status("issues", "answered")).toBeNull();
    for (const action of ["opened", "edited", "labeled", "deleted", "transferred", "locked", "unanswered", ""]) { expect(status("issues", action)).toBeNull(); expect(status("discussion", action)).toBeNull(); }
  });
  it("ignores another event name, another repository and a post that is not a number", () => {
    expect(readGithubEvent("push", { action: "closed", repository, issue: { number: 5 } }, ctx)).toBeNull();
    expect(readGithubEvent("pull_request", { action: "closed", repository, issue: { number: 5 } }, ctx)).toBeNull();
    expect(readGithubEvent("issues", { action: "closed", repository: { full_name: "evil/ziffr" }, issue: { number: 5 } }, ctx)).toBeNull();
    expect(status("issues", "closed", "issue", { number: "5" })).toBeNull();
  });
});

describe("the comment made from a person's reply", () => {
  const REF = "0123456789abcdef";
  const reply = (over: Record<string, unknown> = {}) => buildGithubReply({ words: "It still fails.", public_ref: REF, message_id: 12, ...over });
  it("says a Ziffr user replied, fences the words and ends with the marker the retry searches for", () => {
    expect(reply()).toBe(["**A Ziffr user replied:**", "", "```\nIt still fails.\n```", "", `Reference: ${replyMarkerFor(REF, 12)}`].join("\n"));
    expect(replyMarkerFor(REF, 12)).toBe("ziffr-feedback-0123456789abcdef-12");
  });
  it("neutralises mentions and invisible characters and cannot be closed from the inside", () => {
    const body = reply({ words: "cc @victim #12‮ ``` ![x](https://evil.example) <img src=x>" });
    expect(body).not.toContain("@victim");
    expect(body).not.toContain("‮");
    expect(body.split("\n")[2].startsWith("````")).toBe(true);
  });
  it("reads only the words, the reference and the id: nothing else of the row reaches the comment", () => {
    const rich = { words: "Hello", public_ref: REF, message_id: 3, person_id: "p_ben123", email: "ben@secret-corp.example", workspace_id: "99999999-8888-7777-6666-000000000000" };
    const body = buildGithubReply(rich);
    for (const leak of ["p_ben123", "ben@secret", "99999999"]) expect(body).not.toContain(leak);
  });
  it("refuses a made-up reference or id, and words with nothing in them", () => {
    expect(() => reply({ public_ref: "p_ben123" })).toThrow();
    expect(() => reply({ public_ref: `${REF}\n@victim` })).toThrow();
    expect(() => reply({ message_id: 0 })).toThrow();
    expect(() => reply({ message_id: 1.5 })).toThrow();
    expect(() => reply({ words: "​‮" })).toThrow();
  });
});

describe("plain words", () => {
  it("handles anything that is not a string as empty", () => {
    for (const v of [null, undefined, 7, {}, ["a"]]) expect(plainWords(v, 10)).toBe("");
  });
});

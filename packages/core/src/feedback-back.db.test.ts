// Feedback coming back from GitHub and going out again, against the real database (spec 0049, ticket #918): a team comment
// becomes a message once (replay and redelivery change nothing), statuses follow GitHub, the person is told without the
// words, a reply is theirs only and limited, and posting a reply never posts twice. A fake GitHub stands in.
// Serial with the other DB files.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Forbidden } from "./actor";
import { db } from "./db";
import { createFeedback, getMyFeedback, replyToFeedback } from "./feedback";
import { receiveGithubFeedbackEvent } from "./feedback-back";
import { replyMarkerFor } from "./feedback-bridge";
import { GithubError, type GithubCommentClient } from "./feedback-github";
import { postFeedbackReplies } from "./feedback-replies";
import { FEEDBACK_REPLIES_PER_FEEDBACK_PER_DAY } from "./feedback-rules";
import { openRows } from "./sealed-columns";
import { forgetStoredSettings } from "./settings-in-effect";
import { workspace } from "./test/db-fixtures";

const cleanups: (() => Promise<void>)[] = [];
const authUsers: string[] = [];
const saved = process.env.ZIFFR_CLOUD_KEY;
beforeEach(() => { process.env.ZIFFR_CLOUD_KEY = "k".repeat(32); forgetStoredSettings(); });
afterEach(async () => {
  for (const c of cleanups.splice(0)) await c();
  for (const id of authUsers.splice(0)) await db().auth.admin.deleteUser(id);
  if (saved === undefined) delete process.env.ZIFFR_CLOUD_KEY; else process.env.ZIFFR_CLOUD_KEY = saved;
  forgetStoredSettings();
  vi.restoreAllMocks();
});

const ctx = { repo: "ziffr/ziffr", bot: "ziffr-bot" };
const repository = { full_name: "ziffr/ziffr" };
let n = 1000;
const delivery = () => `d-${Date.now()}-${n++}-aaaaaaaa`;
const issueComment = (number: number, id: number, body = "We fixed it.", over: Record<string, unknown> = {}) =>
  ({ action: "created", repository, issue: { number }, comment: { id, body, user: { login: "maintainer-ann", type: "User" }, author_association: "MEMBER", ...over } });
const take = (event: string, payload: unknown, id = delivery()) => receiveGithubFeedbackEvent({ deliveryId: id, event, payload }, ctx);

async function sender() {
  const w = await workspace(); cleanups.push(w.cleanup);
  const id = await w.person("member");
  const { data } = await db().auth.admin.createUser({ email: `fb-${id.slice(2, 10)}@back.test`, email_confirm: true });
  authUsers.push(data.user!.id);
  await db().from("profiles").update({ auth_user_id: data.user!.id }).eq("id", id);
  return { w, id, actor: w.actor(id, "member") };
}
/** A feedback that is filed as issue/discussion `number` and open. */
async function filed(s: Awaited<ReturnType<typeof sender>>, number: number, kind: "issue" | "discussion" = "issue", status = "open") {
  const f = await createFeedback(s.actor, { kind: kind === "issue" ? "problem" : "idea", words: "The chart is wrong." });
  await db().from("feedback").update({ status, github_kind: kind, github_number: number, github_url: `https://github.com/ziffr/ziffr/issues/${number}`, filed_at: new Date().toISOString() }).eq("id", f.id);
  return f.id;
}
const status = async (id: string) => (await db().from("feedback").select("status").eq("id", id).single()).data!.status;
const num = () => 100000 + Math.floor(Math.random() * 800000);
// A notice's subject and body are sealed with the Workspace Key, so they are opened to be read.
const notices = async (s: Awaited<ReturnType<typeof sender>>) => {
  const { data } = await db().from("deliveries").select("id, subject, body, kind").eq("recipient_id", s.id).eq("kind", "notice").eq("workspace_id", s.w.id);
  return { data: await openRows("deliveries", s.w.id, data ?? []) };
};

describe("a comment from the team", () => {
  it("is added to the person's conversation as from the team, marks it answered and tells the person without the words", async () => {
    const s = await sender(); const number = num(); const id = await filed(s, number);
    expect(await take("issue_comment", issueComment(number, 1, "Secret answer words"))).toBe("comment");
    const mine = await getMyFeedback(s.actor, id);
    expect(mine?.status).toBe("answered");
    expect(mine?.messages).toEqual([expect.objectContaining({ fromTeam: true, words: "Secret answer words" })]);
    const told = (await notices(s)).data ?? [];
    expect(told).toHaveLength(1);
    expect(told[0].subject).toBe("The Ziffr team answered your feedback");
    expect(JSON.stringify(told)).not.toContain("Secret answer");
  });

  it("does not keep who wrote it", async () => {
    const s = await sender(); const number = num(); const id = await filed(s, number);
    await take("issue_comment", issueComment(number, 2));
    const { data } = await db().from("feedback_messages").select("*").eq("feedback_id", id);
    expect(JSON.stringify(data)).not.toContain("maintainer-ann");
    expect(JSON.stringify(await getMyFeedback(s.actor, id))).not.toContain("maintainer-ann");
  });

  it("changes nothing the second time: the same delivery, and the same comment under another delivery", async () => {
    const s = await sender(); const number = num(); const id = await filed(s, number);
    const same = delivery();
    expect(await take("issue_comment", issueComment(number, 3), same)).toBe("comment");
    expect(await take("issue_comment", issueComment(number, 3), same)).toBe("replay");
    expect(await take("issue_comment", issueComment(number, 3))).toBe("comment");
    expect((await getMyFeedback(s.actor, id))!.messages).toHaveLength(1);
    expect((await notices(s)).data).toHaveLength(1);
  });

  it("tells once for a run of comments", async () => {
    const s = await sender(); const number = num(); const id = await filed(s, number);
    await take("issue_comment", issueComment(number, 4)); await take("issue_comment", issueComment(number, 5));
    expect((await getMyFeedback(s.actor, id))!.messages).toHaveLength(2);
    expect((await notices(s)).data).toHaveLength(1);
  });

  it("stores nothing for an unknown post, the bot, a stranger, or the same number in the other kind of post", async () => {
    const s = await sender(); const number = num(); const id = await filed(s, number);
    expect(await take("issue_comment", issueComment(num(), 6))).toBe("comment");
    expect(await take("issue_comment", issueComment(number, 7, "x", { user: { login: "ziffr-bot", type: "User" } }))).toBe("ignored");
    expect(await take("issue_comment", issueComment(number, 8, "x", { author_association: "NONE" }))).toBe("ignored");
    expect(await take("discussion_comment", { action: "created", repository, discussion: { number }, comment: issueComment(number, 9).comment })).toBe("comment");
    expect((await getMyFeedback(s.actor, id))!.messages).toHaveLength(0);
  });

  it("does not leak into another person's feedback or view", async () => {
    const a = await sender(); const b = await sender(); const number = num();
    await filed(a, number); const other = await filed(b, num());
    await take("issue_comment", issueComment(number, 10));
    expect((await getMyFeedback(b.actor, other))!.messages).toHaveLength(0);
    expect((await notices(b)).data).toHaveLength(0);
  });

  it("does not leave a closed feedback answered", async () => {
    const s = await sender(); const number = num(); const id = await filed(s, number, "issue", "closed");
    await take("issue_comment", issueComment(number, 11));
    expect(await status(id)).toBe("closed");
  });

  it("gives the delivery back when handling fails, so a redelivery can try again", async () => {
    const s = await sender(); const number = num(); await filed(s, number);
    const id = delivery();
    const real = db().rpc.bind(db());
    vi.spyOn(db(), "rpc").mockImplementation(((name: string, args: never) => (name === "feedback_take_team_comment" ? Promise.resolve({ data: null, error: { message: "boom" } }) : real(name, args))) as never);
    await expect(take("issue_comment", issueComment(number, 12), id)).rejects.toThrow();
    vi.restoreAllMocks();
    expect(await take("issue_comment", issueComment(number, 12), id)).toBe("comment");
  });

  it("is refused off the central version", async () => {
    delete process.env.ZIFFR_CLOUD_KEY; forgetStoredSettings();
    await expect(take("issue_comment", issueComment(1, 1))).rejects.toBeInstanceOf(Forbidden);
  });

  it("follows an edit with the new words and a deletion with a plain line, for a team message only", async () => {
    const s = await sender(); const number = num(); const id = await filed(s, number);
    await take("issue_comment", issueComment(number, 30, "First words"));
    await replyToFeedback(s.actor, id, "My reply");
    await take("issue_comment", { ...issueComment(number, 30, "Corrected words"), action: "edited" });
    expect((await getMyFeedback(s.actor, id))!.messages.map((m) => m.words)).toEqual(["Corrected words", "My reply"]);
    await take("issue_comment", { action: "deleted", repository, issue: { number }, comment: { id: 30 } });
    expect((await getMyFeedback(s.actor, id))!.messages.map((m) => m.words)).toEqual(["This answer was removed.", "My reply"]);
  });

  it("answers a second delivery of an id that is still being handled with an error, and a finished one with replay", async () => {
    const s = await sender(); const number = num(); await filed(s, number);
    const id = delivery();
    // A claim that has not finished (another request is in the middle of it).
    expect((await db().rpc("feedback_claim_github_delivery", { p_id: id })).data).toBe("new");
    await expect(take("issue_comment", issueComment(number, 31), id)).rejects.toThrow("being handled");
    await db().rpc("feedback_release_github_delivery", { p_id: id });
    expect(await take("issue_comment", issueComment(number, 31), id)).toBe("comment");
    expect(await take("issue_comment", issueComment(number, 31), id)).toBe("replay");
  });
});

describe("closing and reopening on GitHub", () => {
  const post = (name: "issues" | "discussion", action: string, number: number) => ({ action, repository, [name === "issues" ? "issue" : "discussion"]: { number } });
  it("shows as the status: closed, then open again; a discussion answered only from open", async () => {
    const s = await sender(); const number = num(); const id = await filed(s, number);
    await take("issues", post("issues", "closed", number)); expect(await status(id)).toBe("closed");
    await take("issues", post("issues", "reopened", number)); expect(await status(id)).toBe("open");
    const d = num(); const did = await filed(s, d, "discussion");
    await take("discussion", post("discussion", "answered", d)); expect(await status(did)).toBe("answered");
    await take("discussion", post("discussion", "closed", d)); expect(await status(did)).toBe("closed");
    await take("discussion", post("discussion", "answered", d)); expect(await status(did)).toBe("closed");
  });
  it("ignores the same number in the other kind of post", async () => {
    const s = await sender(); const number = num(); const id = await filed(s, number);
    await take("discussion", post("discussion", "closed", number));
    expect(await status(id)).toBe("open");
  });
});

describe("a person's reply", () => {
  it("is stored under their own feedback only, cleaned, and reopens an answered one", async () => {
    const s = await sender(); const other = await sender(); const number = num(); const id = await filed(s, number); const theirs = await filed(other, num());
    await take("issue_comment", issueComment(number, 20));
    expect(await replyToFeedback(s.actor, id, "  Thanks\u0000, still broken ")).toMatchObject({ fromTeam: false, words: "Thanks, still broken" });
    expect((await getMyFeedback(s.actor, id))!.status).toBe("open");
    await expect(replyToFeedback(s.actor, theirs, "hello")).rejects.toThrow("not found");
    await expect(replyToFeedback(s.actor, id, "x".repeat(2001))).rejects.toThrow();
    await expect(replyToFeedback(s.actor, id, "   ")).rejects.toThrow();
    await expect(replyToFeedback(s.actor, "not-an-id", "hi")).rejects.toThrow("not found");
  });
  it("is limited per feedback per day", async () => {
    const s = await sender(); const id = await filed(s, num());
    for (let i = 0; i < FEEDBACK_REPLIES_PER_FEEDBACK_PER_DAY; i++) await replyToFeedback(s.actor, id, `reply ${i}`);
    await expect(replyToFeedback(s.actor, id, "one more")).rejects.toThrow("enough");
  });
  it("is refused in plain words unless the feedback is open or answered", async () => {
    const s = await sender(); const closed = await filed(s, num(), "issue", "closed");
    const waiting = (await createFeedback(s.actor, { kind: "problem", words: "Not reviewed yet." })).id;
    await expect(replyToFeedback(s.actor, closed, "Hello")).rejects.toThrow("This feedback is closed.");
    await expect(replyToFeedback(s.actor, waiting, "Hello")).rejects.toThrow("You can reply once your feedback is open.");
    expect((await getMyFeedback(s.actor, closed))!.messages).toHaveLength(0);
    expect((await getMyFeedback(s.actor, waiting))!.messages).toHaveLength(0);
  });
  it("is refused by the database too, whatever the core checked", async () => {
    const s = await sender(); const closed = await filed(s, num(), "issue", "closed");
    const { data } = await db().rpc("feedback_reply_create", { p_person: s.id, p_feedback: closed, p_words: "x", p_per_feedback: 5, p_per_person: 15, p_total: 100 });
    expect(data ?? []).toHaveLength(0);
  });
  it("is refused to a Contact, a key and anyone off the central version", async () => {
    const s = await sender(); const id = await filed(s, num());
    await expect(replyToFeedback({ ...s.actor, key: { id: "k" } as never }, id, "hi")).rejects.toBeInstanceOf(Forbidden);
    delete process.env.ZIFFR_CLOUD_KEY; forgetStoredSettings();
    await expect(replyToFeedback(s.actor, id, "hi")).rejects.toBeInstanceOf(Forbidden);
  });
});

/** A GitHub that remembers the comments it was given; `failNext` makes the next calls fail. */
function fakeGithub() {
  const comments: { post: { kind: string; number: number }; body: string; id: number }[] = [];
  const state = { failNext: 0 };
  const client: GithubCommentClient = {
    botLogin: async () => "ziffr-bot",
    async findComment(post, marker) { return comments.find((c) => c.post.number === post.number && c.body.endsWith(`Reference: ${marker}`)) ?? null; },
    async comment(post, body) {
      if (state.failNext > 0) { state.failNext--; throw new GithubError("GitHub answered 502."); }
      const made = { post, body, id: 900 + comments.length };
      comments.push(made);
      return { id: made.id };
    },
  };
  return { client, comments, state };
}
const aged = (id: number) => db().from("feedback_messages").update({ post_attempted_at: new Date(Date.now() - 3_600_000).toISOString() }).eq("id", id);
const messageRow = async (feedbackId: string) => (await db().from("feedback_messages").select("*").eq("feedback_id", feedbackId).eq("from_team", false).single()).data!;

describe("posting a reply to GitHub", () => {
  it("posts it anonymously once, records it and posts nothing for a feedback that is not filed yet", async () => {
    const s = await sender(); const g = fakeGithub(); const number = num();
    const id = await filed(s, number);
    const waiting = (await createFeedback(s.actor, { kind: "problem", words: "Not filed yet." })).id;
    await replyToFeedback(s.actor, id, "It still fails on Tuesdays.");
    // Written before it was refused (the way a reply queued before closing would be): the worker must not post it.
    await db().from("feedback_messages").insert({ feedback_id: waiting, from_team: false, words: "Waiting reply." });
    expect(await postFeedbackReplies(g.client)).toMatchObject({ claimed: 1, posted: 1, failed: 0 });
    expect(await postFeedbackReplies(g.client)).toMatchObject({ claimed: 0 });
    expect(g.comments).toHaveLength(1);
    expect(g.comments[0].post).toEqual({ kind: "issue", number });
    expect(g.comments[0].body).toContain("A Ziffr user replied:");
    for (const leak of [s.id, s.w.id, "Not filed yet", "Waiting reply"]) expect(g.comments[0].body).not.toContain(leak);
    expect(await messageRow(id)).toMatchObject({ post_error: null, github_comment_ref: "issue-comment:900" });
    expect((await messageRow(id)).posted_at).not.toBeNull();
  });

  it("never posts a reply of a feedback that has been closed or is not open since it was written", async () => {
    const s = await sender(); const g = fakeGithub(); const id = await filed(s, num());
    await replyToFeedback(s.actor, id, "Queued before closing.");
    await db().from("feedback").update({ status: "closed" }).eq("id", id);
    expect(await postFeedbackReplies(g.client)).toMatchObject({ claimed: 0 });
    expect(g.comments).toHaveLength(0);
    await db().from("feedback").update({ status: "open" }).eq("id", id);
    expect(await postFeedbackReplies(g.client)).toMatchObject({ claimed: 1, posted: 1 });
  });

  it("claims and posts one reply at a time", async () => {
    const s = await sender(); const g = fakeGithub(); const id = await filed(s, num());
    await replyToFeedback(s.actor, id, "One"); await replyToFeedback(s.actor, id, "Two");
    const claims: number[] = [];
    const real = db().rpc.bind(db());
    vi.spyOn(db(), "rpc").mockImplementation(((name: string, args: Record<string, unknown>) => { if (name === "feedback_claim_replies") claims.push(Number(args.p_limit)); return real(name, args as never); }) as never);
    expect(await postFeedbackReplies(g.client)).toMatchObject({ claimed: 2, posted: 2 });
    expect(claims.slice(0, 2)).toEqual([1, 1]);
  });

  it("records a failure with a fixed phrase, retries later, and stops at the attempts cap", async () => {
    const s = await sender(); const g = fakeGithub(); const id = await filed(s, num());
    await replyToFeedback(s.actor, id, "Please look again.");
    g.state.failNext = 99;
    for (let i = 0; i < 5; i++) { await postFeedbackReplies(g.client); await aged((await messageRow(id)).id); }
    expect(await postFeedbackReplies(g.client)).toMatchObject({ claimed: 0 });
    expect(await messageRow(id)).toMatchObject({ post_attempts: 5, post_error: "GitHub answered 502." });
  });

  it("does not post twice when an earlier try posted and crashed before recording: it finds its own marker", async () => {
    const s = await sender(); const g = fakeGithub(); const number = num(); const id = await filed(s, number);
    await replyToFeedback(s.actor, id, "Please look again.");
    const row = await messageRow(id);
    g.comments.push({ post: { kind: "issue", number }, body: `**A Ziffr user replied:**\n\nReference: ${replyMarkerFor((await db().from("feedback").select("public_ref").eq("id", id).single()).data!.public_ref, row.id)}`, id: 4242 });
    await db().from("feedback_messages").update({ post_attempts: 1, post_attempted_at: new Date(Date.now() - 3_600_000).toISOString() }).eq("id", row.id);
    expect(await postFeedbackReplies(g.client)).toMatchObject({ claimed: 1, found: 1, posted: 0 });
    expect(g.comments).toHaveLength(1);
    expect(await messageRow(id)).toMatchObject({ github_comment_ref: "issue-comment:4242" });
  });

  it("is refused off the central version", async () => {
    delete process.env.ZIFFR_CLOUD_KEY; forgetStoredSettings();
    await expect(postFeedbackReplies(fakeGithub().client)).rejects.toBeInstanceOf(Forbidden);
  });
});

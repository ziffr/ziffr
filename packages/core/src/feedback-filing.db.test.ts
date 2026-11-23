// Filing feedback on GitHub against the real database (spec 0049, ticket #917): only open feedback without a post is
// filed, a retry never files twice, a failure is recorded with a cap, and nothing personal is in what was posted.
// A fake GitHub stands in. Serial with the other DB files.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Forbidden } from "./actor";
import { db } from "./db";
import { createFeedback } from "./feedback";
import { FILING_MAX_ATTEMPTS, fileFeedback } from "./feedback-filing";
import { GithubError, type GithubClient, type GithubPlace } from "./feedback-github";
import type { GithubPost } from "./feedback-bridge";
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
});

async function sender() {
  const w = await workspace(); cleanups.push(w.cleanup);
  const id = await w.person("member");
  const { data } = await db().auth.admin.createUser({ email: `fb-${id.slice(2, 10)}@filing.test`, email_confirm: true });
  authUsers.push(data.user!.id);
  await db().from("profiles").update({ auth_user_id: data.user!.id }).eq("id", id);
  return { w, id, actor: w.actor(id, "member") };
}
const make = async (s: Awaited<ReturnType<typeof sender>>, status: string, over: Record<string, unknown> = {}) => {
  const f = await createFeedback(s.actor, { kind: "problem", words: "The chart is wrong.", route: "/dashboards/q1", appVersion: "0.11.0", ...over });
  await db().from("feedback").update({ status }).eq("id", f.id);
  return f.id;
};
const row = async (id: string) => (await db().from("feedback").select("*").eq("id", id).single()).data!;
/** Lets the retry wait pass without waiting. */
const aged = (id: string) => db().from("feedback").update({ filing_attempted_at: new Date(Date.now() - 3_600_000).toISOString() }).eq("id", id);

/** A GitHub that remembers what it was given; `failNext` makes the next calls fail, `crashAfterCreate` makes the record fail by throwing from find on a later call. */
function fakeGithub() {
  const posts: { post: GithubPost; place: GithubPlace }[] = [];
  const state = { failNext: 0, finds: 0 };
  const client: GithubClient = {
    async find(kind, ref) {
      state.finds++;
      return posts.find((p) => p.post.body.includes(ref) && p.place.kind === kind)?.place ?? null;
    },
    async create(post) {
      if (state.failNext > 0) { state.failNext--; throw new GithubError("GitHub answered 502."); }
      const place: GithubPlace = { kind: post.target, number: posts.length + 1, url: `https://github.com/ziffr/ziffr/${post.target === "issue" ? "issues" : "discussions"}/${posts.length + 1}` };
      posts.push({ post, place });
      return place;
    },
  };
  return { client, posts, state };
}
const cfg = { categoryId: "DIC_x" };

describe("which feedback is filed", () => {
  it("files an open one, records number and link, and leaves one waiting for review, answered and closed alone", async () => {
    const s = await sender(); const g = fakeGithub();
    const open = await make(s, "open"); const waiting = await make(s, "waiting_for_review"); const answered = await make(s, "answered"); const closed = await make(s, "closed");
    const counts = await fileFeedback(g.client, cfg);
    expect(counts).toMatchObject({ claimed: 1, filed: 1, failed: 0 });
    expect(await row(open)).toMatchObject({ github_kind: "issue", github_number: 1, github_url: "https://github.com/ziffr/ziffr/issues/1", filing_error: null });
    expect((await row(open)).filed_at).not.toBeNull();
    for (const id of [waiting, answered, closed]) expect(await row(id)).toMatchObject({ github_number: null, filing_attempts: 0 });
  });

  it("files an idea or a question as a Discussion, and never files the same feedback twice", async () => {
    const s = await sender(); const g = fakeGithub();
    const id = await make(s, "open", { kind: "idea" });
    await fileFeedback(g.client, cfg);
    await fileFeedback(g.client, cfg);
    expect(g.posts).toHaveLength(1);
    expect(await row(id)).toMatchObject({ github_kind: "discussion", github_number: 1 });
  });

  it("posts nothing of the person: not their id, Workspace, email or the feedback's id", async () => {
    const s = await sender(); const g = fakeGithub();
    const id = await make(s, "open");
    await fileFeedback(g.client, cfg);
    const text = JSON.stringify(g.posts[0].post);
    for (const leak of [s.id, s.w.id, id, "filing.test"]) expect(text).not.toContain(leak);
  });

  it("only works on hosted Ziffr", async () => {
    delete process.env.ZIFFR_CLOUD_KEY; forgetStoredSettings();
    await expect(fileFeedback(fakeGithub().client, cfg)).rejects.toBeInstanceOf(Forbidden);
  });
});

describe("failures and retries", () => {
  it("records a failure on the row, waits before trying again, and then files", async () => {
    const s = await sender(); const g = fakeGithub(); g.state.failNext = 1;
    const id = await make(s, "open");
    expect(await fileFeedback(g.client, cfg)).toMatchObject({ claimed: 1, failed: 1, filed: 0 });
    expect(await row(id)).toMatchObject({ github_number: null, filing_attempts: 1, filing_error: "GitHub answered 502." });
    expect(await fileFeedback(g.client, cfg)).toMatchObject({ claimed: 0 });
    await aged(id);
    expect(await fileFeedback(g.client, cfg)).toMatchObject({ claimed: 1, filed: 1 });
    expect(await row(id)).toMatchObject({ github_number: 1, filing_error: null, filing_attempts: 2 });
  });

  it("finds a post an earlier try made before it crashed instead of posting again", async () => {
    const s = await sender(); const g = fakeGithub();
    const id = await make(s, "open");
    // The earlier try posted, then died before it could write the link: the row says one attempt and no post.
    const ref = (await row(id)).public_ref as string;
    await g.client.create({ target: "issue", title: "t", body: `Reference: ziffr-feedback-${ref}`, labels: ["feedback"] });
    await db().from("feedback").update({ filing_attempts: 1, filing_attempted_at: new Date(Date.now() - 3_600_000).toISOString() }).eq("id", id);
    expect(await fileFeedback(g.client, cfg)).toMatchObject({ claimed: 1, found: 1, filed: 0 });
    expect(g.posts).toHaveLength(1);
    expect(await row(id)).toMatchObject({ github_number: 1 });
  });

  it("stops after the most tries and leaves the last error", async () => {
    const s = await sender(); const g = fakeGithub(); g.state.failNext = 100;
    const id = await make(s, "open");
    for (let i = 0; i < FILING_MAX_ATTEMPTS + 2; i++) { await fileFeedback(g.client, cfg); await aged(id); }
    expect(await row(id)).toMatchObject({ filing_attempts: FILING_MAX_ATTEMPTS, github_number: null, filing_error: "GitHub answered 502." });
  });

  it("does not take a feedback another worker holds, and cannot record a second post", async () => {
    const s = await sender(); const g = fakeGithub();
    const id = await make(s, "open");
    await db().rpc("feedback_claim_for_filing", { p_limit: 5, p_max_attempts: FILING_MAX_ATTEMPTS, p_retry_minutes: 10 });
    expect(await fileFeedback(g.client, cfg)).toMatchObject({ claimed: 0 });
    const first = await db().from("feedback").update({ github_kind: "issue", github_number: 5, github_url: "https://github.com/ziffr/ziffr/issues/5", filed_at: new Date().toISOString() }).eq("id", id).is("github_number", null).select("id");
    const second = await db().from("feedback").update({ github_kind: "issue", github_number: 6, github_url: "https://github.com/ziffr/ziffr/issues/6", filed_at: new Date().toISOString() }).eq("id", id).is("github_number", null).select("id");
    expect(first.data).toHaveLength(1);
    expect(second.data).toHaveLength(0);
  });

  it("refuses a half-recorded post and two feedback on one post", async () => {
    const s = await sender();
    const a = await make(s, "open"); const b = await make(s, "open");
    expect((await db().from("feedback").update({ github_number: 1 }).eq("id", a)).error).not.toBeNull();
    const post = { github_kind: "issue", github_number: 42, github_url: "https://github.com/ziffr/ziffr/issues/42", filed_at: new Date().toISOString() };
    expect((await db().from("feedback").update(post).eq("id", a)).error).toBeNull();
    expect((await db().from("feedback").update(post).eq("id", b)).error).not.toBeNull();
  });
});

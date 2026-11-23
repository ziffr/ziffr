// The GitHub client's comments for the feedback bridge back (spec 0049, ticket #918) against a fake fetch: where a reply is
// posted, that only the bot's own comment with the marker is found again, and that the token never shows up in an error.
import { describe, expect, it, vi } from "vitest";
import { buildGithubReply, replyMarkerFor } from "./feedback-bridge";
import { githubClient, GithubError } from "./feedback-github";

const TOKEN = "ghp_SECRET_TOKEN_VALUE";
const config = { token: TOKEN, owner: "ziffr", repo: "ziffr", categoryId: "DIC_x" };
const REF = "0123456789abcdef";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const client = (f: unknown) => githubClient(config, f as typeof fetch);
const reply = buildGithubReply({ words: "Still broken.", public_ref: REF, message_id: 4 });
const marker = replyMarkerFor(REF, 4);

describe("posting a reply", () => {
  it("comments on an issue with the body only, authorised with the token", async () => {
    const f = vi.fn(async () => json({ id: 555 }));
    expect(await client(f).comment({ kind: "issue", number: 7 }, reply)).toEqual({ id: 555 });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.github.com/repos/ziffr/ziffr/issues/7/comments");
    expect(JSON.parse(String(init.body))).toEqual({ body: reply });
    expect((init.headers as Record<string, string>).authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("comments on a Discussion through its id", async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(json({ data: { repository: { discussion: { id: "D_9" } } } }))
      .mockResolvedValueOnce(json({ data: { addDiscussionComment: { comment: { databaseId: 777 } } } }));
    expect(await client(f).comment({ kind: "discussion", number: 3 }, reply)).toEqual({ id: 777 });
    expect(JSON.parse(String((f.mock.calls[1] as unknown as [string, RequestInit])[1].body)).variables).toEqual({ d: "D_9", b: reply });
  });

  it("fails with a fixed phrase and never with the token or GitHub's answer", async () => {
    for (const f of [vi.fn(async () => new Response(`Bad ${TOKEN}`, { status: 401 })), vi.fn(async () => json({})), vi.fn(async () => { throw new Error(TOKEN); })]) {
      const e = await client(f).comment({ kind: "issue", number: 7 }, reply).catch((x) => x);
      expect(e).toBeInstanceOf(GithubError);
      expect(String(e.message)).not.toContain(TOKEN);
      expect(String(e.message)).not.toContain("Bad");
    }
  });
});

describe("finding a reply that may already be posted", () => {
  const comment = (id: number, login: string, body: string) => ({ id, body, user: { login } });
  const mine = `${reply}`;
  const listing = (items: unknown[]) => vi.fn(async (url: string) => (String(url).endsWith("/user") ? json({ login: "ziffr-bot" }) : json(items)));

  it("finds the bot's own comment whose last line is the marker", async () => {
    expect(await client(listing([comment(1, "someone", "hi"), comment(2, "ziffr-bot", mine)])).findComment({ kind: "issue", number: 7 }, marker)).toEqual({ id: 2 });
  });

  it("does not take a comment by someone else that quotes or ends with the marker, or one that only mentions it", async () => {
    const f = listing([comment(1, "attacker", mine), comment(2, "ziffr-bot", `${mine}\nmore`), comment(3, "ziffr-bot", `Reference: ${marker} is quoted here`)]);
    expect(await client(f).findComment({ kind: "issue", number: 7 }, marker)).toBeNull();
  });

  it("finds a Discussion comment by its database id", async () => {
    const f = vi.fn(async (url: string) => (String(url).endsWith("/user") ? json({ login: "ziffr-bot" }) : json({ data: { repository: { discussion: { comments: { nodes: [{ databaseId: 31, body: mine, author: { login: "ziffr-bot" } }] } } } } })));
    expect(await client(f).findComment({ kind: "discussion", number: 3 }, marker)).toEqual({ id: 31 });
  });

  it("asks for the bot's login once", async () => {
    const f = listing([]);
    const c = client(f);
    await c.findComment({ kind: "issue", number: 7 }, marker);
    await c.findComment({ kind: "issue", number: 8 }, marker);
    expect(await c.botLogin()).toBe("ziffr-bot");
    expect(f.mock.calls.filter(([u]) => String(u).endsWith("/user"))).toHaveLength(1);
  });
});

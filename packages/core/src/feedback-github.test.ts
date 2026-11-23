// The GitHub client of the feedback bridge (spec 0049, ticket #917) against a fake fetch: what it sends, where, and that
// the token never shows up in an error. No network, no database.
import { describe, expect, it, vi } from "vitest";
import { buildGithubPost, markerFor } from "./feedback-bridge";
import { FeedbackBridgeNotConfigured, feedbackGithubConfig, githubClient, GithubError } from "./feedback-github";

const TOKEN = "ghp_SECRET_TOKEN_VALUE";
const config = { token: TOKEN, owner: "ziffr", repo: "ziffr", categoryId: "DIC_x" };
const REF = "0123456789abcdef";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const post = (kind: string) => buildGithubPost({ kind, words: "Words", route: null, app_version: null, public_ref: REF }, "DIC_x");

describe("configuration", () => {
  it("names the missing variables and never a value", () => {
    expect(() => feedbackGithubConfig({})).toThrow(FeedbackBridgeNotConfigured);
    expect(() => feedbackGithubConfig({ ZIFFR_FEEDBACK_GITHUB_TOKEN: TOKEN })).toThrow(/ZIFFR_FEEDBACK_GITHUB_REPO.*ZIFFR_FEEDBACK_GITHUB_CATEGORY_ID/);
    try { feedbackGithubConfig({ ZIFFR_FEEDBACK_GITHUB_TOKEN: TOKEN, ZIFFR_FEEDBACK_GITHUB_REPO: "not a repo" }); } catch (e) { expect(String(e)).not.toContain(TOKEN); }
  });
  it("reads owner, repository and category", () => {
    expect(feedbackGithubConfig({ ZIFFR_FEEDBACK_GITHUB_TOKEN: " t ", ZIFFR_FEEDBACK_GITHUB_REPO: "ziffr/ziffr", ZIFFR_FEEDBACK_GITHUB_CATEGORY_ID: "DIC_x" })).toEqual({ token: "t", owner: "ziffr", repo: "ziffr", categoryId: "DIC_x" });
  });
});

describe("the real client", () => {
  it("creates an issue with its labels and only the post's fields, authorised with the token", async () => {
    const fetchImpl = vi.fn(async () => json({ number: 7, html_url: "https://github.com/ziffr/ziffr/issues/7" }));
    const place = await githubClient(config, fetchImpl as unknown as typeof fetch).create(post("problem"));
    expect(place).toEqual({ kind: "issue", number: 7, url: "https://github.com/ziffr/ziffr/issues/7" });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.github.com/repos/ziffr/ziffr/issues");
    expect(Object.keys(JSON.parse(String(init.body))).sort()).toEqual(["body", "labels", "title"]);
    expect((init.headers as Record<string, string>).authorization).toBe(`Bearer ${TOKEN}`);
    expect(init.signal).toBeDefined();
  });

  it("creates a Discussion through the repository id and the category", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(json({ data: { repository: { id: "R_1" } } }))
      .mockResolvedValueOnce(json({ data: { createDiscussion: { discussion: { number: 3, url: "https://github.com/ziffr/ziffr/discussions/3" } } } }));
    const place = await githubClient(config, fetchImpl as unknown as typeof fetch).create(post("idea"));
    expect(place).toEqual({ kind: "discussion", number: 3, url: "https://github.com/ziffr/ziffr/discussions/3" });
    expect(JSON.parse(String((fetchImpl.mock.calls[1] as unknown as [string, RequestInit])[1].body)).variables).toMatchObject({ r: "R_1", c: "DIC_x" });
  });

  describe("finding an earlier post", () => {
    const issue = (number: number, login: string, body: string) => ({ number, html_url: `https://github.com/ziffr/ziffr/issues/${number}`, body, user: { login } });
    const mine = `x\n\nReference: ${markerFor(REF)}`;
    /** A fake GitHub that answers /user with the bot and the search with `items`. */
    const searching = (items: unknown[]) => vi.fn(async (url: string) => (String(url).endsWith("/user") ? json({ login: "ziffr-bot" }) : json({ items })));
    const find = (f: ReturnType<typeof searching>) => githubClient(config, f as unknown as typeof fetch).find("issue", REF);

    it("finds the bot's post, asking for the bot as author and the oldest first", async () => {
      const f = searching([issue(9, "ziffr-bot", mine)]);
      expect(await find(f)).toEqual({ kind: "issue", number: 9, url: "https://github.com/ziffr/ziffr/issues/9" });
      const search = decodeURIComponent(String(f.mock.calls[1][0]));
      expect(search).toContain("author:ziffr-bot");
      expect(search).toContain("sort=created&order=asc");
    });
    it("ignores a post by someone else that carries the marker", async () => {
      expect(await find(searching([issue(8, "someone-else", mine)]))).toBeNull();
    });
    it("ignores a marker that is only inside the words or not the last line", async () => {
      const words = issue(7, "ziffr-bot", `**From a Ziffr user** (problem)\n\n\`\`\`\nhello\nReference: ${markerFor(REF)}\n\`\`\`\n\nReference: ziffr-feedback-ffffffffffffffff`);
      const quoted = issue(6, "ziffr-bot", `${mine}\nmore text after`);
      expect(await find(searching([words, quoted]))).toBeNull();
    });
    it("takes the oldest of the bot's posts, and reads CRLF bodies", async () => {
      expect(await find(searching([issue(12, "ziffr-bot", mine), issue(5, "ZIFFR-BOT", mine.replace(/\n/g, "\r\n"))]))).toMatchObject({ number: 5 });
    });
  });

  it("treats a non-2xx answer, a network failure and a link off github.com as failures that never name the token or GitHub's words", async () => {
    for (const fetchImpl of [
      vi.fn(async () => new Response(`Bad credentials ${TOKEN}`, { status: 401 })),
      vi.fn(async () => json({}, 502)),
      vi.fn(async () => { throw new Error(`socket ${TOKEN}`); }),
      vi.fn(async () => json({ number: 1, html_url: "https://evil.example/1" })),
    ]) {
      const e = await githubClient(config, fetchImpl as unknown as typeof fetch).create(post("problem")).catch((x) => x);
      expect(e).toBeInstanceOf(GithubError);
      expect(String(e.message)).not.toContain(TOKEN);
      expect(String(e.message)).not.toContain("Bad credentials");
    }
  });
});

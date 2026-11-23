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

  it("finds an earlier post by its marker, and not one that only looks similar", async () => {
    const hit = { number: 9, html_url: "https://github.com/ziffr/ziffr/issues/9", body: `x\nReference: ${markerFor(REF)}` };
    const other = { number: 8, html_url: "https://github.com/ziffr/ziffr/issues/8", body: "Reference: ziffr-feedback-ffffffffffffffff" };
    const fetchImpl = vi.fn(async () => json({ items: [other, hit] }));
    expect(await githubClient(config, fetchImpl as unknown as typeof fetch).find("issue", REF)).toEqual({ kind: "issue", number: 9, url: hit.html_url });
    const none = vi.fn(async () => json({ items: [other] }));
    expect(await githubClient(config, none as unknown as typeof fetch).find("issue", REF)).toBeNull();
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

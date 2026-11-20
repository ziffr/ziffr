import { describe, expect, it } from "vitest";
import { figuresFrom, githubFeed, readRepo, settingsFrom, type Fetcher } from "./index.js";

const asset = (name: string, download_count: number) => ({ name, download_count });
const releases = [
  { tag_name: "v0.12.1", assets: [asset("compose.yml", 69), asset("install.sh", 1), asset("other.zip", 500)] },
  { tag_name: "v0.11.0", assets: [asset("compose.yml", 30)] },
  { tag_name: "v0.0.1", draft: true, assets: [asset("compose.yml", 9)] },
  { tag_name: "", assets: [asset("compose.yml", 9)] },
];

describe("figuresFrom", () => {
  it("totals each counted asset and keeps the count per release", () => {
    const f = figuresFrom({ stargazers_count: 7, forks_count: 2 }, releases);
    expect(f.stars).toBe(7);
    expect(f.forks).toBe(2);
    expect(f.downloads["compose.yml"]).toEqual({ total: 99, byRelease: [{ tag: "v0.12.1", count: 69 }, { tag: "v0.11.0", count: 30 }] });
    expect(f.downloads["install.sh"]).toEqual({ total: 1, byRelease: [{ tag: "v0.12.1", count: 1 }, { tag: "v0.11.0", count: 0 }] });
  });
  it("ignores what is not a number or a list", () => {
    const f = figuresFrom(null, [{ tag_name: "v1", assets: [asset("compose.yml", -3), { name: "compose.yml", download_count: "5" }, null] }, null, { tag_name: "v2", assets: "x" }]);
    expect(f.stars).toBe(0);
    expect(f.downloads["compose.yml"].total).toBe(0);
  });
});

describe("githubFeed", () => {
  const feed = githubFeed(async () => figuresFrom({ stargazers_count: 7, forks_count: 2 }, releases));
  const ctx = (slug: string, current: boolean) => ({ slug, period: "2026-11-21", periodEnd: "2026-11-22", current, metric: {} as never });
  it("sends today's counts with the releases as Breakdown", async () => {
    expect(await feed.metrics["github-downloads-compose-yml"].fetch(ctx("x", true))).toEqual({ value: 99, breakdown: [{ label: "v0.12.1", value: 69 }, { label: "v0.11.0", value: 30 }] });
    expect(await feed.metrics["github-stars"].fetch(ctx("x", true))).toBe(7);
    expect(await feed.metrics["github-forks"].fetch(ctx("x", true))).toBe(2);
  });
  it("gives past periods no value, because GitHub has no history", async () => {
    expect(await feed.metrics["github-stars"].fetch(ctx("x", false))).toBeNull();
  });
});

describe("readRepo", () => {
  it("reads the repository and every page of releases, sending the token only to GitHub", async () => {
    const urls: string[] = [];
    const page = (n: number) => Array.from({ length: n }, (_, i) => ({ tag_name: `v${i}`, assets: [asset("compose.yml", 1)] }));
    const fetcher: Fetcher = async (url, init) => {
      urls.push(url);
      expect(url.startsWith("https://api.github.com/repos/ziffr/ziffr")).toBe(true);
      expect(init.headers.authorization).toBe("Bearer t");
      expect(init.redirect).toBe("error");
      const body = url.includes("&page=1") ? page(100) : url.includes("&page=2") ? page(5) : { stargazers_count: 1, forks_count: 0 };
      return { ok: true, status: 200, json: async () => body };
    };
    const f = await readRepo({ repo: "ziffr/ziffr", githubToken: "t" }, { fetcher });
    expect(urls).toHaveLength(3);
    expect(f.downloads["compose.yml"].total).toBe(105);
  });
  it("explains a missing repository and a rate limit", async () => {
    const answer = (status: number): Fetcher => async () => ({ ok: false, status, json: async () => ({}) });
    await expect(readRepo({ repo: "a/b", githubToken: "" }, { fetcher: answer(404) })).rejects.toThrow(/does not know/);
    await expect(readRepo({ repo: "a/b", githubToken: "" }, { fetcher: answer(403) })).rejects.toThrow(/rate limit/);
  });
});

describe("settingsFrom", () => {
  it("is off without a Feed Key", () => expect(settingsFrom({})).toBeNull());
  it("needs the address of the Workspace and a plausible repository", () => {
    expect(() => settingsFrom({ ZIFFR_GITHUB_FEED_KEY: "zk_x" })).toThrow(/ZIFFR_GITHUB_FEED_URL/);
    expect(() => settingsFrom({ ZIFFR_GITHUB_FEED_KEY: "zk_x", ZIFFR_GITHUB_FEED_URL: "https://a", ZIFFR_GITHUB_REPO: "../x" })).toThrow(/owner\/name/);
    expect(settingsFrom({ ZIFFR_GITHUB_FEED_KEY: " zk_x ", ZIFFR_GITHUB_FEED_URL: "https://a" })).toEqual({ repo: "ziffr/ziffr", feedUrl: "https://a", feedKey: "zk_x", githubToken: "" });
  });
});

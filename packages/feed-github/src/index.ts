// The GitHub Feed (spec 0031, GLOSSARY: Feed, Feed Key): a Feed built on @ziffr/feed-kit whose Metrics are the public
// download counts, stars and forks of a GitHub repository. It reads GitHub's public API without a secret and the kit
// sends the numbers with a Feed Key to the operator's own Workspace. The counts are requests GitHub served for release
// assets (bots and retries included), not running Installations. GitHub keeps no history of them, so a value exists
// only for today: past periods are never fetched. Image pulls of ghcr.io are not here: GitHub's API shows a package's
// pull count only to someone signed in, never publicly. No state; the only outgoing request is to api.github.com.
import { defineFeed, type FeedDefinition, type MetricSource } from "@ziffr/feed-kit";

/** The release assets that are counted, and the Metric slug of each. */
export const ASSET_METRICS = { "compose.yml": "github-downloads-compose-yml", "install.sh": "github-downloads-install-sh" } as const;

/** The Metric slugs of the repository's stars and forks. */
export const STARS_METRIC = "github-stars";
/** The Metric slug of the repository's forks. */
export const FORKS_METRIC = "github-forks";

/** Where the Feed reads and where it sends. */
export type GithubSettings = {
  /** The repository, `owner/name` (ZIFFR_GITHUB_REPO, default ziffr/ziffr). */
  repo: string;
  /** Where the Workspace runs (ZIFFR_GITHUB_FEED_URL). */
  feedUrl: string;
  /** The Feed Key of the Feed in that Workspace (ZIFFR_GITHUB_FEED_KEY). */
  feedKey: string;
  /** An optional GitHub token (GITHUB_TOKEN) that only lifts the rate limit; it is sent to api.github.com alone. */
  githubToken: string;
};

/** The settings from an environment, or null while the Feed Key is missing: then the Feed is off and does nothing. */
export function settingsFrom(vars: Record<string, string | undefined>): GithubSettings | null {
  const given = (k: string) => (vars[k] ?? "").trim();
  const feedKey = given("ZIFFR_GITHUB_FEED_KEY");
  if (!feedKey) return null;
  const feedUrl = given("ZIFFR_GITHUB_FEED_URL");
  if (!feedUrl) throw new Error("Set ZIFFR_GITHUB_FEED_URL to where the Workspace runs, such as https://app.ziffr.net.");
  const repo = given("ZIFFR_GITHUB_REPO") || "ziffr/ziffr";
  if (!/^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,99}\/[A-Za-z0-9_-][A-Za-z0-9_.-]{0,99}$/.test(repo)) throw new Error("ZIFFR_GITHUB_REPO must look like owner/name.");
  return { repo, feedUrl, feedKey, githubToken: given("GITHUB_TOKEN") };
}

/** What the Feed knows about the repository after one read. */
export type RepoFigures = {
  stars: number;
  forks: number;
  /** Per asset name: the total and the count per release (by tag), in GitHub's order, newest first. */
  downloads: Record<string, { total: number; byRelease: { tag: string; count: number }[] }>;
};

/** How GitHub is called: a fetch, so tests can stand in for it. */
export type Fetcher = (url: string, init: { headers: Record<string, string>; signal: AbortSignal; redirect: "error" }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

const num = (x: unknown): number => (typeof x === "number" && Number.isFinite(x) && x >= 0 ? x : 0);

/** Maps GitHub's answers (the repository and its releases) to the figures. Draft and unnamed releases are left out;
 * an asset a release lacks counts nothing for it; anything unexpected is ignored, never trusted. */
export function figuresFrom(repo: unknown, releases: unknown[]): RepoFigures {
  const r = (repo ?? {}) as Record<string, unknown>;
  const downloads: RepoFigures["downloads"] = {};
  for (const name of Object.keys(ASSET_METRICS)) downloads[name] = { total: 0, byRelease: [] };
  for (const rel of releases) {
    const release = (rel ?? {}) as Record<string, unknown>;
    if (release.draft === true || typeof release.tag_name !== "string" || !release.tag_name) continue;
    const assets = Array.isArray(release.assets) ? (release.assets as Record<string, unknown>[]) : [];
    for (const name of Object.keys(ASSET_METRICS)) {
      const count = assets.filter((a) => a?.name === name).reduce((s, a) => s + num(a.download_count), 0);
      downloads[name].total += count;
      downloads[name].byRelease.push({ tag: release.tag_name.slice(0, 200), count });
    }
  }
  return { stars: num(r.stargazers_count), forks: num(r.forks_count), downloads };
}

/** Reads the repository and its releases (up to 10 pages of 100) from api.github.com: a few calls per run, well under
 * the 60 an hour that need no token. */
export async function readRepo(settings: Pick<GithubSettings, "repo" | "githubToken">, options: { fetcher?: Fetcher } = {}): Promise<RepoFigures> {
  const call = options.fetcher ?? ((u, init) => fetch(u, init));
  const get = async (path: string): Promise<unknown> => {
    const headers: Record<string, string> = { accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "user-agent": "ziffr-feed-github" };
    if (settings.githubToken) headers.authorization = `Bearer ${settings.githubToken}`;
    // No redirects: the token goes only to the address that was named.
    const res = await call(`https://api.github.com/repos/${settings.repo}${path}`, { headers, signal: AbortSignal.timeout(30_000), redirect: "error" });
    if (res.status === 404) throw new Error(`GitHub does not know the repository ${settings.repo} (404).`);
    if (res.status === 403 || res.status === 429) throw new Error("GitHub's rate limit is reached; the next run tries again.");
    if (!res.ok) throw new Error(`GitHub answered ${res.status}.`);
    return res.json();
  };
  const repo = await get("");
  const releases: unknown[] = [];
  for (let page = 1; page <= 10; page++) {
    const got = await get(`/releases?per_page=100&page=${page}`);
    if (!Array.isArray(got)) throw new Error("GitHub's list of releases is not a list.");
    releases.push(...got);
    if (got.length < 100) break;
  }
  return figuresFrom(repo, releases);
}

/** The Feed: cumulative counts as of today. `read` is called at most once per run, by the first fetch. Past periods
 * get no value, because GitHub cannot say what a count was on an earlier day. */
export function githubFeed(read: () => Promise<RepoFigures>): FeedDefinition {
  let figures: Promise<RepoFigures> | null = null;
  const once = () => (figures ??= read());
  const today = (pick: (f: RepoFigures) => number | { value: number; breakdown: { label: string; value: number }[] }): MetricSource => ({
    fetch: async ({ current }) => (current ? pick(await once()) : null),
  });
  const metrics: Record<string, MetricSource> = {};
  for (const [asset, slug] of Object.entries(ASSET_METRICS)) {
    metrics[slug] = today((f) => ({ value: f.downloads[asset].total, breakdown: f.downloads[asset].byRelease.map((r) => ({ label: r.tag, value: r.count })) }));
  }
  metrics[STARS_METRIC] = today((f) => f.stars);
  metrics[FORKS_METRIC] = today((f) => f.forks);
  return defineFeed({ name: "GitHub", metrics });
}

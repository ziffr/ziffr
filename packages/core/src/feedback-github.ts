// The GitHub side of the feedback bridge (spec 0049, ticket #917; GLOSSARY: Feedback): a small client interface (tests use
// a fake) and the real one, which talks to the GitHub REST API (issues, search) and GraphQL API (Discussions) with the
// Ziffr bot's token. CENTRAL ONLY, like feedback.ts. Security: the token comes from the server's environment and is only
// ever sent in the Authorization header to api.github.com; it is never logged, put in an error or returned. An error
// carries a status and a fixed phrase, never GitHub's answer (which can repeat what was sent).
import { markerFor, type GithubPost } from "./feedback-bridge";

/** Where a post ended up. */
export type GithubPlace = { kind: "issue" | "discussion"; number: number; url: string };

/** What the bridge needs of GitHub; the real client below, a fake in tests. */
export interface GithubClient {
  /** The post that carries this feedback's marker, if there is one (so a retry never files twice). */
  find(kind: "issue" | "discussion", publicRef: string): Promise<GithubPlace | null>;
  /** Makes the post and says where it is. */
  create(post: GithubPost): Promise<GithubPlace>;
}

/** The environment's settings for the bridge. */
export type FeedbackGithubConfig = { token: string; owner: string; repo: string; categoryId: string };

/** Why a call to GitHub failed, in words that are safe to store and show to a maintainer. */
export class GithubError extends Error {}

/** The variables the bridge reads, named in the error when they are missing. */
export const FEEDBACK_GITHUB_ENV = ["ZIFFR_FEEDBACK_GITHUB_TOKEN", "ZIFFR_FEEDBACK_GITHUB_REPO", "ZIFFR_FEEDBACK_GITHUB_CATEGORY_ID"] as const;
/** The bridge is not set up on this server. */
export class FeedbackBridgeNotConfigured extends Error {}

const REPO = /^([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9._-]{1,100})$/;
const TIMEOUT_MS = 15_000;
const API = "https://api.github.com";

/** The settings from the environment (server only), or an error that names the variables that are missing or wrong. */
export function feedbackGithubConfig(env: Record<string, string | undefined> = process.env): FeedbackGithubConfig {
  const token = env.ZIFFR_FEEDBACK_GITHUB_TOKEN?.trim();
  const repo = REPO.exec(env.ZIFFR_FEEDBACK_GITHUB_REPO?.trim() ?? "");
  const categoryId = env.ZIFFR_FEEDBACK_GITHUB_CATEGORY_ID?.trim();
  const missing = [!token && FEEDBACK_GITHUB_ENV[0], !repo && `${FEEDBACK_GITHUB_ENV[1]} (owner/name)`, !categoryId && FEEDBACK_GITHUB_ENV[2]].filter(Boolean);
  if (missing.length > 0 || !token || !repo || !categoryId) throw new FeedbackBridgeNotConfigured(`The feedback bridge needs these settings: ${missing.join(", ")}.`);
  return { token, owner: repo[1], repo: repo[2], categoryId };
}

type Fetch = typeof fetch;

/** The real client: `fetchImpl` is only for tests of this file. */
export function githubClient(config: FeedbackGithubConfig, fetchImpl: Fetch = fetch): GithubClient {
  const headers = { authorization: `Bearer ${config.token}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "content-type": "application/json", "user-agent": "ziffr-feedback-bridge" };
  let repositoryId: string | null = null;
  async function call(path: string, body?: unknown): Promise<unknown> {
    let res: Response;
    try {
      res = await fetchImpl(`${API}${path}`, { method: body === undefined ? "GET" : "POST", headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT_MS), redirect: "error" });
    } catch {
      throw new GithubError("GitHub could not be reached.");
    }
    if (!res.ok) throw new GithubError(`GitHub answered ${res.status}.`);
    try { return await res.json(); } catch { throw new GithubError("GitHub's answer could not be read."); }
  }
  const graphql = async (query: string, variables: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const answer = (await call("/graphql", { query, variables })) as { data?: Record<string, unknown>; errors?: unknown[] } | null;
    if (!answer?.data || (answer.errors?.length ?? 0) > 0) throw new GithubError("GitHub's GraphQL answered with an error.");
    return answer.data;
  };
  const slug = `${config.owner}/${config.repo}`;
  const place = (kind: "issue" | "discussion", node: unknown): GithubPlace | null => {
    const n = node as { number?: unknown; html_url?: unknown; url?: unknown } | null;
    const url = typeof n?.html_url === "string" ? n.html_url : typeof n?.url === "string" ? n.url : "";
    // Only a link on github.com is kept, whatever the answer says.
    return typeof n?.number === "number" && Number.isInteger(n.number) && n.number > 0 && url.startsWith("https://github.com/") ? { kind, number: n.number, url: url.slice(0, 300) } : null;
  };
  return {
    async find(kind, publicRef) {
      const marker = markerFor(publicRef);
      if (kind === "issue") {
        const found = (await call(`/search/issues?q=${encodeURIComponent(`repo:${slug} is:issue in:body "${marker}"`)}&per_page=5`)) as { items?: { body?: unknown }[] } | null;
        const hit = (found?.items ?? []).find((i) => typeof i.body === "string" && i.body.includes(marker));
        return hit ? place("issue", hit) : null;
      }
      const data = await graphql(
        "query($q: String!) { search(query: $q, type: DISCUSSION, first: 5) { nodes { ... on Discussion { number url body } } } }",
        { q: `repo:${slug} in:body "${marker}"` },
      );
      const nodes = ((data.search as { nodes?: { body?: unknown }[] } | undefined)?.nodes ?? []).filter(Boolean);
      const hit = nodes.find((d) => typeof d.body === "string" && d.body.includes(marker));
      return hit ? place("discussion", hit) : null;
    },
    async create(post) {
      if (post.target === "issue") {
        const made = place("issue", await call(`/repos/${slug}/issues`, { title: post.title, body: post.body, labels: post.labels }));
        if (!made) throw new GithubError("GitHub's answer had no issue in it.");
        return made;
      }
      repositoryId ??= String(((await graphql("query($o: String!, $n: String!) { repository(owner: $o, name: $n) { id } }", { o: config.owner, n: config.repo })).repository as { id?: unknown } | null)?.id ?? "");
      if (!repositoryId) throw new GithubError("GitHub's answer had no repository in it.");
      const data = await graphql(
        "mutation($r: ID!, $c: ID!, $t: String!, $b: String!) { createDiscussion(input: { repositoryId: $r, categoryId: $c, title: $t, body: $b }) { discussion { number url } } }",
        { r: repositoryId, c: post.categoryId, t: post.title, b: post.body },
      );
      const made = place("discussion", (data.createDiscussion as { discussion?: unknown } | null)?.discussion);
      if (!made) throw new GithubError("GitHub's answer had no discussion in it.");
      return made;
    },
  };
}

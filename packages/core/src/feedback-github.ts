// The GitHub side of the feedback bridge (spec 0049, ticket #917; GLOSSARY: Feedback): a small client interface (tests use
// a fake) and the real one, which talks to the GitHub REST API (issues, search) and GraphQL API (Discussions) with the
// Ziffr bot's token. CENTRAL ONLY, like feedback.ts. Security: the token comes from the server's environment and is only
// ever sent in the Authorization header to api.github.com; it is never logged, put in an error or returned. An error
// carries a status and a fixed phrase, never GitHub's answer (which can repeat what was sent).
import { isRelayedReply, markerFor, type GithubPost } from "./feedback-bridge";

/** Where a post ended up. */
export type GithubPlace = { kind: "issue" | "discussion"; number: number; url: string };

/** What the bridge needs of GitHub; the real client below, a fake in tests. */
export interface GithubClient {
  /** The post that carries this feedback's marker, if there is one (so a retry never files twice). */
  find(kind: "issue" | "discussion", publicRef: string): Promise<GithubPlace | null>;
  /** Makes the post and says where it is. */
  create(post: GithubPost): Promise<GithubPlace>;
}

/** What the bridge back needs of GitHub (spec 0049, ticket #918): who the bot is, and comments on a post. Kept apart from
 * GithubClient so the filing's fakes need not know of it. */
export interface GithubCommentClient {
  /** The bot's login, asked of GitHub with the token (once), so a comment by the bot can be told from the team's. */
  botLogin(): Promise<string>;
  /** The bot's own comment on this post that carries this marker as its last line, if there is one (so a retry never posts twice). */
  findComment(post: { kind: "issue" | "discussion"; number: number }, marker: string): Promise<{ id: number } | null>;
  /** Makes a comment as the bot and says which. */
  comment(post: { kind: "issue" | "discussion"; number: number }, body: string): Promise<{ id: number }>;
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
export function githubClient(config: FeedbackGithubConfig, fetchImpl: Fetch = fetch): GithubClient & GithubCommentClient {
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
  // The bot's login, asked of GitHub once with the token (never configured by hand, so it cannot drift from the token).
  let login: string | null = null;
  const botLogin = async (): Promise<string> => {
    if (login) return login;
    const me = (await call("/user")) as { login?: unknown } | null;
    if (typeof me?.login !== "string" || !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})(\[bot\])?$/.test(me.login)) throw new GithubError("GitHub's answer had no login in it.");
    return (login = me.login);
  };
  const place = (kind: "issue" | "discussion", node: unknown): GithubPlace | null => {
    const n = node as { number?: unknown; html_url?: unknown; url?: unknown } | null;
    const url = typeof n?.html_url === "string" ? n.html_url : typeof n?.url === "string" ? n.url : "";
    // Only a link on github.com is kept, whatever the answer says.
    return typeof n?.number === "number" && Number.isInteger(n.number) && n.number > 0 && url.startsWith("https://github.com/") ? { kind, number: n.number, url: url.slice(0, 300) } : null;
  };
  const COMMENT_PAGES = 5;
  const idOf = (v: unknown): number | null => (typeof v === "number" && Number.isSafeInteger(v) && v > 0 ? v : null);
  const discussionId = async (number: number): Promise<string> => {
    const data = await graphql("query($o: String!, $n: String!, $num: Int!) { repository(owner: $o, name: $n) { discussion(number: $num) { id } } }", { o: config.owner, n: config.repo, num: number });
    const id = (data.repository as { discussion?: { id?: unknown } | null } | null)?.discussion?.id;
    if (typeof id !== "string" || id === "") throw new GithubError("GitHub's answer had no discussion in it.");
    return id;
  };
  return {
    botLogin,
    async findComment(post, marker) {
      const bot = await botLogin();
      const last = `\nReference: ${marker}`;
      const mine = (body: unknown, who: unknown) => typeof body === "string" && typeof who === "string" && who.toLowerCase() === bot.toLowerCase() && isRelayedReply(body) && body.replace(/\r\n?/g, "\n").trimEnd().endsWith(last);
      if (post.kind === "issue") {
        for (let page = 1; page <= COMMENT_PAGES; page++) {
          const list = (await call(`/repos/${slug}/issues/${post.number}/comments?per_page=100&page=${page}`)) as { id?: unknown; body?: unknown; user?: { login?: unknown } | null }[] | null;
          if (!Array.isArray(list)) return null;
          const hit = list.find((c) => c && mine(c.body, c.user?.login) && idOf(c.id));
          if (hit) return { id: idOf(hit.id)! };
          if (list.length < 100) return null;
        }
        return null;
      }
      const data = await graphql(
        "query($o: String!, $n: String!, $num: Int!) { repository(owner: $o, name: $n) { discussion(number: $num) { comments(last: 100) { nodes { databaseId body author { login } } } } } }",
        { o: config.owner, n: config.repo, num: post.number },
      );
      type Node = { databaseId?: unknown; body?: unknown; author?: { login?: unknown } | null };
      const nodes = ((data.repository as { discussion?: { comments?: { nodes?: Node[] } } | null } | null)?.discussion?.comments?.nodes ?? []).filter(Boolean);
      const hit = nodes.find((c) => mine(c.body, c.author?.login) && idOf(c.databaseId));
      return hit ? { id: idOf(hit.databaseId)! } : null;
    },
    async comment(post, body) {
      if (post.kind === "issue") {
        const id = idOf(((await call(`/repos/${slug}/issues/${post.number}/comments`, { body })) as { id?: unknown } | null)?.id);
        if (!id) throw new GithubError("GitHub's answer had no comment in it.");
        return { id };
      }
      const data = await graphql(
        "mutation($d: ID!, $b: String!) { addDiscussionComment(input: { discussionId: $d, body: $b }) { comment { databaseId } } }",
        { d: await discussionId(post.number), b: body },
      );
      const id = idOf((data.addDiscussionComment as { comment?: { databaseId?: unknown } | null } | null)?.comment?.databaseId);
      if (!id) throw new GithubError("GitHub's answer had no comment in it.");
      return { id };
    },
    async find(kind, publicRef) {
      const marker = markerFor(publicRef);
      // Only the bot's own post counts: anyone may quote a marker, so the author is asked for and checked, the marker must be
      // the post's very last line (the layout buildGithubPost makes; the words sit inside a fence), and the oldest match wins.
      const bot = await botLogin();
      const last = `\nReference: ${marker}`;
      const mine = (body: unknown, login: unknown) => typeof body === "string" && typeof login === "string" && login.toLowerCase() === bot.toLowerCase() && body.replace(/\r\n?/g, "\n").trimEnd().endsWith(last);
      let hits: unknown[];
      if (kind === "issue") {
        const found = (await call(`/search/issues?q=${encodeURIComponent(`repo:${slug} is:issue author:${bot} in:body "${marker}"`)}&sort=created&order=asc&per_page=10`)) as { items?: { body?: unknown; user?: { login?: unknown } | null }[] } | null;
        hits = (found?.items ?? []).filter((i) => i && mine(i.body, i.user?.login));
      } else {
        const data = await graphql(
          "query($q: String!) { search(query: $q, type: DISCUSSION, first: 10) { nodes { ... on Discussion { number url body author { login } } } } }",
          { q: `repo:${slug} author:${bot} in:body sort:created-asc "${marker}"` },
        );
        const nodes = ((data.search as { nodes?: { body?: unknown; author?: { login?: unknown } | null }[] } | undefined)?.nodes ?? []).filter(Boolean);
        hits = nodes.filter((d) => mine(d.body, d.author?.login));
      }
      const places = hits.map((h) => place(kind, h)).filter((p): p is GithubPlace => p !== null);
      return places.sort((x, y) => x.number - y.number)[0] ?? null;
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

// Advisory AI review of one pull request (#578): reads the diff through the GitHub API, asks the Claude API once, and posts
// or updates ONE comment. It runs from the BASE branch's checkout (never the pull request's), with the repository's
// docs from there. Without ANTHROPIC_API_KEY, or when anything fails, it says so and exits 0: it never blocks.
import { readFileSync } from "node:fs";
import { readChapters } from "../../scripts/guide-screens.mjs";
import { MARKER, buildPrompt, commentBody, touchedChapters } from "./ai-review-lib.mjs";

const DEFAULT_MODEL = "claude-haiku-5-5";
const { ANTHROPIC_API_KEY, GITHUB_TOKEN, GITHUB_REPOSITORY, GITHUB_EVENT_PATH, AI_REVIEW_MODEL } = process.env;
const model = (AI_REVIEW_MODEL ?? "").trim() || DEFAULT_MODEL;

const notice = (m) => console.log(`::notice::${m}`);
const gh = (path, init = {}) =>
  fetch(`https://api.github.com/repos/${GITHUB_REPOSITORY}/${path}`, {
    ...init,
    headers: { authorization: `Bearer ${GITHUB_TOKEN}`, "x-github-api-version": "2022-11-28", accept: "application/vnd.github+json", ...init.headers },
  });
async function ghJson(path, init) {
  const r = await gh(path, init);
  if (!r.ok) throw new Error(`GitHub answered ${r.status} for ${path.split("?")[0]}`);
  return r.json();
}

async function main() {
  if (!ANTHROPIC_API_KEY) return notice("No ANTHROPIC_API_KEY in the ai-review environment: no review.");
  const pr = JSON.parse(readFileSync(GITHUB_EVENT_PATH, "utf8")).pull_request;
  const number = Number(pr?.number);
  if (!Number.isInteger(number) || number < 1) throw new Error("no pull request in the event");

  // Only the diff, as text; the prompt keeps 60 KB of it, and 400 KB is the most this holds in memory.
  const diffRes = await gh(`pulls/${number}`, { headers: { accept: "application/vnd.github.diff" } });
  if (!diffRes.ok) throw new Error(`GitHub answered ${diffRes.status} for the diff`);
  const diff = (await diffRes.text()).slice(0, 400_000);

  const files = [];
  for (let page = 1; page <= 10; page++) {
    const batch = await ghJson(`pulls/${number}/files?per_page=100&page=${page}`);
    files.push(...batch.map((f) => String(f.filename)));
    if (batch.length < 100) break;
  }

  const chapters = readChapters(".").map((c) => ({ ...c, text: readFileSync(c.file, "utf8") }));
  const { system, user } = buildPrompt({
    title: String(pr.title ?? "").slice(0, 300),
    files,
    diff,
    agents: readFileSync("AGENTS.md", "utf8"),
    glossary: readFileSync("GLOSSARY.md", "utf8"),
    chapters: touchedChapters(files, chapters),
  });

  // One call, no tools, no web: the model can only answer in text.
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model, max_tokens: 1500, system, messages: [{ role: "user", content: user }] }),
  });
  if (!res.ok) throw new Error(`The Claude API answered ${res.status}`);
  const answer = ((await res.json()).content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  if (!answer.trim()) throw new Error("The Claude API returned no text");

  const body = commentBody(answer, model);
  let existing;
  for (let page = 1; page <= 10 && !existing; page++) {
    const batch = await ghJson(`issues/${number}/comments?per_page=100&page=${page}`);
    existing = batch.find((c) => c.user?.login === "github-actions[bot]" && typeof c.body === "string" && c.body.startsWith(MARKER));
    if (batch.length < 100) break;
  }
  const post = existing
    ? gh(`issues/comments/${existing.id}`, { method: "PATCH", body: JSON.stringify({ body }) })
    : gh(`issues/${number}/comments`, { method: "POST", body: JSON.stringify({ body }) });
  const done = await post;
  // If GitHub refuses the comment, that is fine for an advisory review.
  if (!done.ok) notice(`Could not post the review (GitHub answered ${done.status}).`);
}

main().catch((e) => notice(`AI review skipped: ${e.message}`));

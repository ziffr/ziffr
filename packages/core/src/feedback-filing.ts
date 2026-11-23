// Filing Feedback on GitHub (spec 0049, ticket #917; GLOSSARY: Feedback): the worker's operation. It acts for no person
// (the route is the job secret's) and only on hosted Ziffr (ZIFFR_CLOUD_KEY), like feedback.ts. It takes feedback whose
// status is `open` and that has no GitHub post yet (what waits for review is left alone until the review queue exists),
// builds the post with feedback-bridge.ts (the only thing that decides what leaves) and records the post's number and
// link on the row. Idempotent: a claim in the database marks each try (so two workers never take the same feedback and a
// failed one waits before the next try), a record of the post is written only where none is recorded yet, and a try after
// an earlier one first searches GitHub for the feedback's marker, so a crash between posting and recording never posts twice.
// Security: nothing here logs or stores the token, the words or GitHub's answer; the row keeps a short fixed phrase.
import { Forbidden } from "./actor";
import { db } from "./db";
import { buildGithubPost, type FeedbackToPost } from "./feedback-bridge";
import { type FeedbackGithubConfig, type GithubClient, GithubError } from "./feedback-github";
import { hostedByCloud } from "./installation-days";
import { settingsInEffect } from "./settings-in-effect";

/** How many feedback one call files at most. */
export const FILING_BATCH = 5;
/** How many times a feedback is tried before it is left for a maintainer. */
export const FILING_MAX_ATTEMPTS = 5;
/** Minutes a feedback waits after a try, long enough for GitHub's search to have seen a post a crashed try made. */
export const FILING_RETRY_MINUTES = 10;

/** What a call did, in counts only. */
export type FilingCounts = { claimed: number; filed: number; found: number; failed: number };

type Row = FeedbackToPost & { id: string; filing_attempts: number };

/** Files the open feedback that is not on GitHub yet, a few at a time, and says how it went. Hosted Ziffr only. */
export async function fileFeedback(client: GithubClient, config: Pick<FeedbackGithubConfig, "categoryId">, limit = FILING_BATCH): Promise<FilingCounts> {
  if (!hostedByCloud(await settingsInEffect())) throw new Forbidden();
  const counts: FilingCounts = { claimed: 0, filed: 0, found: 0, failed: 0 };
  const { data, error } = await db().rpc("feedback_claim_for_filing", { p_limit: Math.min(Math.max(Math.trunc(limit) || 0, 0), FILING_BATCH), p_max_attempts: FILING_MAX_ATTEMPTS, p_retry_minutes: FILING_RETRY_MINUTES });
  if (error) throw new Error("Feedback to file could not be read.");
  for (const row of (data ?? []) as Row[]) {
    counts.claimed++;
    try {
      const post = buildGithubPost(row, config.categoryId);
      const kind = post.target;
      // A try after an earlier one may have posted before it crashed: look for the marker first.
      const there = row.filing_attempts > 1 ? await client.find(kind, row.public_ref) : null;
      const place = there ?? (await client.create(post));
      const { data: saved, error: saveError } = await db().from("feedback")
        .update({ github_kind: place.kind, github_number: place.number, github_url: place.url, filed_at: new Date().toISOString(), filing_error: null })
        .eq("id", row.id).is("github_number", null).select("id");
      // A failed write leaves the row without a link; the next try finds the post by its marker.
      if (saveError || (saved ?? []).length === 0) throw new GithubError("The post was made but could not be recorded.");
      counts[there ? "found" : "filed"]++;
    } catch (e) {
      counts.failed++;
      const why = e instanceof GithubError ? e.message : "The post could not be made.";
      await db().from("feedback").update({ filing_error: why.slice(0, 200) }).eq("id", row.id).is("github_number", null);
    }
  }
  return counts;
}

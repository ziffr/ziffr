// Posting a person's replies to GitHub (spec 0049, ticket #918; GLOSSARY: Feedback): the worker's operation, the other half of
// feedback-filing.ts and built the same way. It acts for no person (the route is the job secret's) and only on hosted Ziffr
// (ZIFFR_CLOUD_KEY). It takes the replies people wrote under a feedback that is already filed, builds each comment with
// feedback-bridge.ts (the one place that decides what leaves: "A Ziffr user replied:" and the neutralised, fenced words,
// never a name) and records that it was posted. Idempotent: a claim in the database marks each try, a record is written only
// where none is yet, and a try after an earlier one first looks for the comment's marker among the bot's comments, so a crash
// between posting and recording never posts twice. After the attempts cap a reply is left for a maintainer.
// Security: nothing here logs or stores the token, the words or GitHub's answer; the row keeps a short fixed phrase.
import { Forbidden } from "./actor";
import { db } from "./db";
import { buildGithubReply, replyMarkerFor } from "./feedback-bridge";
import { type GithubCommentClient, GithubError } from "./feedback-github";
import { hostedByCloud } from "./installation-days";
import { settingsInEffect } from "./settings-in-effect";

/** How many replies one call posts at most. */
const REPLY_BATCH = 10;
/** How many times a reply is tried before it is left for a maintainer. */
const REPLY_MAX_ATTEMPTS = 5;
/** Minutes a reply waits after a try, long enough for a comment a crashed try made to be listed. */
const REPLY_RETRY_MINUTES = 5;

/** What a call did, in counts only. */
export type ReplyCounts = { claimed: number; posted: number; found: number; failed: number };

type Row = { message_id: number; message_words: string; post_kind: "issue" | "discussion"; post_number: number; ref: string; attempts: number };

/** Posts the replies that are not on GitHub yet, a few at a time, and says how it went. Hosted Ziffr only. */
export async function postFeedbackReplies(client: GithubCommentClient, limit = REPLY_BATCH): Promise<ReplyCounts> {
  if (!hostedByCloud(await settingsInEffect())) throw new Forbidden();
  const counts: ReplyCounts = { claimed: 0, posted: 0, found: 0, failed: 0 };
  const { data, error } = await db().rpc("feedback_claim_replies", { p_limit: Math.min(Math.max(Math.trunc(limit) || 0, 0), REPLY_BATCH), p_max_attempts: REPLY_MAX_ATTEMPTS, p_retry_minutes: REPLY_RETRY_MINUTES });
  if (error) throw new Error("Replies to post could not be read.");
  for (const row of (data ?? []) as Row[]) {
    counts.claimed++;
    try {
      const body = buildGithubReply({ words: row.message_words, public_ref: row.ref, message_id: row.message_id });
      const post = { kind: row.post_kind, number: row.post_number };
      const there = row.attempts > 1 ? await client.findComment(post, replyMarkerFor(row.ref, row.message_id)) : null;
      const made = there ?? (await client.comment(post, body));
      const { data: saved, error: saveError } = await db().from("feedback_messages")
        .update({ posted_at: new Date().toISOString(), github_comment_ref: `${row.post_kind}-comment:${made.id}`, post_error: null })
        .eq("id", row.message_id).is("posted_at", null).select("id");
      if (saveError || (saved ?? []).length === 0) throw new GithubError("The comment was made but could not be recorded.");
      counts[there ? "found" : "posted"]++;
    } catch (e) {
      counts.failed++;
      const why = e instanceof GithubError ? e.message : "The comment could not be made.";
      await db().from("feedback_messages").update({ post_error: why.slice(0, 200) }).eq("id", row.message_id).is("posted_at", null);
    }
  }
  return counts;
}

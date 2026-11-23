// POST /api/jobs/feedback (spec 0049, tickets #917 and #918; GLOSSARY: Feedback): files a few open Feedback on GitHub through
// the Ziffr bot and posts the replies people wrote under filed ones, for a scheduler to call every few minutes. Only with the
// job secret (lib/jobs.ts) and only on the central version (ZIFFR_CLOUD_KEY); anyone else gets the same bare 404 as for any
// job. It answers counts only. Without the bridge's settings it answers 503 naming the variables (never their values).
import { fileFeedback } from "@ziffr/core/feedback-filing";
import { FeedbackBridgeNotConfigured, feedbackGithubConfig, githubClient } from "@ziffr/core/feedback-github";
import { postFeedbackReplies } from "@ziffr/core/feedback-replies";
import { hostedByCloud } from "@ziffr/core/installation-days";
import { settingsInEffect } from "@ziffr/core/settings-in-effect";
import { jobAuthorized, jobNotFound } from "@/lib/jobs";

const noStore = { "cache-control": "no-store" };

/** Files the next few open Feedback, then posts the next few replies. */
export async function POST(req: Request) {
  if (!jobAuthorized(req) || !hostedByCloud(await settingsInEffect())) return jobNotFound();
  try {
    const config = feedbackGithubConfig();
    const client = githubClient(config);
    // Filing first: a reply waits for its feedback to be on GitHub.
    const filed = await fileFeedback(client, config);
    return Response.json({ ...filed, replies: await postFeedbackReplies(client) }, { headers: noStore });
  } catch (e) {
    if (e instanceof FeedbackBridgeNotConfigured) return Response.json({ error: e.message }, { status: 503, headers: noStore });
    // No detail in the log: an error here can hold the words of a feedback.
    console.error("Feedback filing failed");
    return Response.json({ error: "Filing failed." }, { status: 500, headers: noStore });
  }
}

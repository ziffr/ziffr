// GET /api/slack/oauth (spec 0007, ticket #101): Slack sends the Owner or Admin back here after "Add to Slack". It
// needs their session, like any page; the core takes the code only with the one-time state it made for that very
// person and workspace. The person lands on the Connectors page, or the Setup Guide when they started there, with the outcome's name, never Slack's own words.
import { finishSlackInstall } from "@ziffr/core/slack-connection";
import { cookies } from "next/headers";
import { currentActor } from "@/lib/viewer";
import { SLACK_BACK_COOKIE, slackReturn } from "@/lib/slack-back";

/** Finishes "Add to Slack". */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const site = String(process.env.ZIFFR_SITE_URL ?? url.origin).replace(/\/+$/, "");
  // "Add to Slack" from the Setup Guide leaves a cookie that says so; it is used once, and only its fixed word counts.
  const jar = await cookies();
  const from = jar.get(SLACK_BACK_COOKIE)?.value;
  jar.delete(SLACK_BACK_COOKIE);
  const back = (outcome: string) => Response.redirect(slackReturn(site, outcome, from), 303);
  // The person said no at Slack: nothing to take.
  if (url.searchParams.get("error")) return back("cancelled");
  const actor = await currentActor();
  let outcome: string;
  try {
    outcome = await finishSlackInstall(actor, { code: url.searchParams.get("code") ?? "", state: url.searchParams.get("state") ?? "" });
  } catch {
    outcome = "refused";
  }
  return back(outcome);
}

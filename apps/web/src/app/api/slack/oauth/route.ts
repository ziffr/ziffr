// GET /api/slack/oauth (spec 0007, ticket #101): Slack sends the Owner or Admin back here after "Add to Slack". It
// needs their session, like any page; the core takes the code only with the one-time state it made for that very
// person and workspace.
// The person lands on the Connectors page with the outcome's name, never Slack's own words.
import { finishSlackInstall } from "@ziffr/core/slack-connection";
import { currentActor } from "@/lib/viewer";

/** Finishes "Add to Slack". */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const site = String(process.env.ZIFFR_SITE_URL ?? url.origin).replace(/\/+$/, "");
  const back = (outcome: string) => Response.redirect(`${site}/connectors?slack=${encodeURIComponent(outcome)}`, 303);
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

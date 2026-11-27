// Home (spec 0010, ticket #146): the person's starting dashboard, the one they chose with "Make this my home", else
// the first they own, else the first shared with them. An Owner with unfinished First Steps is led there once (spec
// 0067), and a Member who has not opened their Setup Guide is led to it once (spec 0052): never again by force. With
// nothing to look at yet, the dashboard view asks where to start instead (#1292).
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { DashboardView } from "@/components/dashboard-view";
import { currentActor } from "@/lib/viewer";
import { homeRedirect } from "@/lib/home-redirect";
import { setupGuidePending } from "@ziffr/core/setup-guide";
import { leadToFirstSteps } from "@ziffr/core/first-steps";

/** The home page; leads to First Steps or the Setup Guide when one is waiting, or shows the dashboard. */
export default async function Home() {
  const actor = await currentActor();
  // First Steps draws its own frame, which only a page loaded anew gets: a move inside the app waits for the next load.
  const loaded = (await headers()).get("sec-fetch-dest") !== "empty";
  const to = homeRedirect({ firstSteps: loaded && (await leadToFirstSteps(actor).catch(() => false)), setupGuide: await setupGuidePending(actor) });
  if (to) redirect(to);
  return <DashboardView />;
}

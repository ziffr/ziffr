// Home (spec 0010, ticket #146): the person's starting dashboard, the one they chose with "Make this my home", else
// the first they own, else the first shared with them. A new trial's Owner is led to the Trial Guide first until they
// finish or skip it; anyone else who has a Setup Guide they have not opened yet (a new Owner, a member who has just
// joined) is led to it once (spec 0052), and never again by force: /setup notes that it was seen.
import { redirect } from "next/navigation";
import { DashboardView } from "@/components/dashboard-view";
import { currentActor } from "@/lib/viewer";
import { homeRedirect } from "@/lib/home-redirect";
import { setupGuidePending } from "@ziffr/core/setup-guide";
import { trialGuidePending } from "@ziffr/core/trial-guide";

/** The home page; leads to a guide that is waiting (Trial Guide first, then the Setup Guide) or shows the dashboard. */
export default async function Home() {
  const actor = await currentActor();
  const trialGuide = await trialGuidePending(actor);
  // Only asked when the Trial Guide is not: a trial Workspace keeps going to /try/start.
  const to = homeRedirect({ trialGuide, setupGuide: trialGuide ? false : await setupGuidePending(actor) });
  if (to) redirect(to);
  return <DashboardView />;
}

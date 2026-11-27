// Home (spec 0010, ticket #146): the person's starting dashboard, the one they chose with "Make this my home", else
// the first they own, else the first shared with them. Anyone who has a Setup Guide they have not opened yet (a new
// Owner, a trial's Owner, a member who has just joined) is led to it once (spec 0052), and never again by force: /setup
// notes that it was seen. A trial has no guide of its own. With nothing to look at yet, the dashboard view asks where
// to start instead (#1292).
import { redirect } from "next/navigation";
import { DashboardView } from "@/components/dashboard-view";
import { currentActor } from "@/lib/viewer";
import { homeRedirect } from "@/lib/home-redirect";
import { setupGuidePending } from "@ziffr/core/setup-guide";

/** The home page; leads to the Setup Guide when it is waiting, or shows the dashboard. */
export default async function Home() {
  const actor = await currentActor();
  const to = homeRedirect({ setupGuide: await setupGuidePending(actor) });
  if (to) redirect(to);
  return <DashboardView />;
}

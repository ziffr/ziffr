// Home (spec 0010, ticket #146): the person's starting dashboard, the one they chose with "Make this my home", else
// the first they own, else the first shared with them; the first-run checklist when there is none. A new trial's
// Owner is led to the Trial Guide instead until they finish or skip it.
import { redirect } from "next/navigation";
import { DashboardView } from "@/components/dashboard-view";
import { currentActor } from "@/lib/viewer";
import { trialGuidePending } from "@ziffr/core/trial-guide";

/** The home page; a new trial's Owner goes to the Trial Guide until they finish or skip it (ticket 193). */
export default async function Home() {
  if (await trialGuidePending(await currentActor())) redirect("/try/start");
  return <DashboardView />;
}

// Home (spec 0010, ticket #146): the person's starting dashboard, the one they chose with "Make this my home", else
// the first they own, else the first shared with them; the first-run checklist when there is none.
import { DashboardView } from "@/components/dashboard-view";

export default function Home() {
  return <DashboardView />;
}

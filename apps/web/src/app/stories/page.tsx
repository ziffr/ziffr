// Stories were folded back into dashboards (spec 0013, ticket #174): the old list of stories is the dashboards list.
import { redirect } from "next/navigation";

export default function StoriesPage() {
  redirect("/dashboards");
}

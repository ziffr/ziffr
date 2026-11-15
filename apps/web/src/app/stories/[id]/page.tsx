// Stories were folded back into dashboards (spec 0013, ticket #174): an old story address opens the dashboard in
// its Read view, which reads top to bottom as the story did. The dashboard page decides who may open it.
import { notFound, redirect } from "next/navigation";

export default async function StoryPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  redirect(`/dashboards/${id}?view=read`);
}

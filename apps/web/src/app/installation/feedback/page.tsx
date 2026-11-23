// The review queue of Feedback (spec 0049, ticket #919; GLOSSARY: Feedback, Installation Admin): for the maintainers of
// the central version (ziffr.net), who are its Installation Admins. Anyone else, and every other Installation, gets
// "not found". It shows what was written and where, never who wrote it.
import { notFound, redirect } from "next/navigation";
import { Forbidden } from "@ziffr/core/actor";
import { listFeedbackQueue } from "@ziffr/core/feedback-review";
import { isInstallationAdmin } from "@ziffr/core/installation-admins";
import { PageHeader } from "@/components/page-header";
import { installationActor } from "@/lib/installation";
import { ReviewQueue } from "./queue";

export default async function FeedbackQueuePage() {
  const actor = await installationActor();
  if (!actor) redirect("/login?next=/installation/feedback");
  if (!(await isInstallationAdmin(actor))) notFound();
  let waiting;
  try {
    waiting = await listFeedbackQueue(actor);
  } catch (e) {
    if (e instanceof Forbidden) notFound();
    throw e;
  }
  return (
    <>
      <PageHeader title="Feedback waiting for review" sub="With review first, each feedback waits here until you approve it, edit it or reject it. Approved feedback is filed on GitHub without the person's name. The people who wrote it are not shown." />
      <ReviewQueue items={waiting} />
    </>
  );
}

// The review queue of Feedback (spec 0049, ticket #919; GLOSSARY: Feedback, Installation Admin): for the maintainers of
// the central version (ziffr.net), who are its Installation Admins. Anyone else, and every other Installation, gets
// "not found". It shows what was written and where, never who wrote it.
import { notFound } from "next/navigation";
import { Forbidden } from "@ziffr/core/actor";
import { listFeedbackQueue } from "@ziffr/core/feedback-review";
import { PageHeader } from "@/components/page-header";
import { atAdminAddress, panelPageActor } from "@/lib/installation";
import { PanelNav } from "../panel-nav";
import { ReviewQueue } from "./queue";
import { DesktopOnly } from "@/components/desktop-only";

export default async function FeedbackQueuePage() {
  const actor = await panelPageActor("/installation/feedback");
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
      <PanelNav current="feedback" />
      {!(await atAdminAddress()) && <DesktopOnly path="/installation/feedback" />}
      <ReviewQueue items={waiting} />
    </>
  );
}

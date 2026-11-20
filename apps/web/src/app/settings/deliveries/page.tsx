// Your Deliveries (spec 0006, ticket #95; GLOSSARY: Delivery Preference, Away, Prompt): where Ziffr reaches you,
// whether by email, and when you are away. Only your own; the Connectors page keeps the team default.
import { currentActor } from "@/lib/viewer";
import { isDemo } from "@/lib/auth";
import { myDeliverySettings } from "@ziffr/core/profile";
import { mailOn } from "@ziffr/core/mail";
import { PageHeader } from "@/components/page-header";
import { DeliveriesForm } from "./form";

export default async function DeliveriesPage() {
  const actor = await currentActor();
  const [mine, demo] = await Promise.all([myDeliverySettings(actor), isDemo()]);
  return (
    <>
      <PageHeader title="Your Deliveries" sub="Where Ziffr sends you questions, tasks, reminders and replies, and when someone else is asked instead." />
      <DeliveriesForm viewer={actor.personId} mine={mine.mine} team={mine.team} optedOut={mine.optedOut} away={mine.away} usageDigest={mine.usageDigest} email={!demo && (await mailOn())} />
    </>
  );
}

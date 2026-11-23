// Your Deliveries (spec 0006, ticket #95; GLOSSARY: Delivery Preference, Away, Prompt): where Ziffr reaches you,
// whether by email, and when you are away. Only your own; the Connectors page keeps the team default.
import { currentActor } from "@/lib/viewer";
import { isDemo } from "@/lib/auth";
import { myDeliverySettings } from "@ziffr/core/profile";
import { mailOn } from "@ziffr/core/mail";
import { PageHeader } from "@/components/page-header";
import { quietHours } from "@ziffr/core/quiet-hours";
import { setMyQuietHours } from "@/app/settings-actions";
import { QuietHoursForm } from "../quiet-hours-form";
import { headsUpSettings, mutedMetrics } from "@ziffr/core/heads-up-state";
import { DeliveriesForm } from "./form";
import { HeadsUpForm } from "./heads-up-form";

export default async function DeliveriesPage() {
  const actor = await currentActor();
  const [mine, demo, quiet, heads, muted] = await Promise.all([myDeliverySettings(actor), isDemo(), quietHours(actor), headsUpSettings(actor), mutedMetrics(actor)]);
  return (
    <>
      <PageHeader title="Your Deliveries" sub="Where Ziffr sends you questions, tasks, reminders and replies, and when someone else is asked instead." />
      <DeliveriesForm viewer={actor.personId} mine={mine.mine} team={mine.team} optedOut={mine.optedOut} away={mine.away} usageDigest={mine.usageDigest} email={!demo && (await mailOn())} />
      <section aria-labelledby="heads-ups-heading" className="mt-8 max-w-xl space-y-3 border-t border-border pt-6">
        <div>
          <h2 id="heads-ups-heading" className="font-medium">Heads-ups</h2>
          <p className="text-sm text-muted-foreground">Ziffr looks through the Metrics you may see and tells you, in plain words, when two of them start moving together or stop. Nothing is told when there is nothing to say.</p>
        </div>
        <HeadsUpForm show={heads.show} byMessage={heads.byMessage} muted={muted} canEdit={!demo} />
      </section>
      <section aria-labelledby="quiet-heading" className="mt-8 max-w-xl space-y-3 border-t border-border pt-6">
        <div>
          <h2 id="quiet-heading" className="font-medium">Quiet hours</h2>
          <p className="text-sm text-muted-foreground">No requests for numbers, reminders or Alerts at night or on the days you pick. They wait and are sent when your quiet hours end. A Due Date does not move.</p>
        </div>
        <QuietHoursForm rule={quiet.mine} inherited={quiet.workspace} own canEdit={!demo} workspaceTimeZone={quiet.workspaceTimeZone} save={setMyQuietHours} />
      </section>
    </>
  );
}

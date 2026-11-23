// Your Alerts (spec 0032, ticket #375; GLOSSARY: Alert, Delivery Preference): every Alert you set in this Workspace
// on a Metric you can still see, with where it stands and why it is paused. Only your own; an Alert on a Metric you
// lost sight of is not listed, since its name would show that the Metric exists.
import Link from "next/link";
import { currentActor } from "@/lib/viewer";
import { alertWebhookChoices, listMyAlerts } from "@ziffr/core/alerts";
import { ALERTS_PER_METRIC } from "@ziffr/core/alert-limits";
import { effectiveLimit } from "@ziffr/core/limits";
import { PageHeader } from "@/components/page-header";
import { AlertRows } from "@/components/alerts";
import { listTellSubscriptions } from "@ziffr/core/tell";
import { TellSwitches } from "@/components/tell-switches";

export default async function AlertsPage() {
  const actor = await currentActor();
  const [alerts, webhooks, telling, perPerson, perDay] = await Promise.all([listMyAlerts(actor), alertWebhookChoices(actor), listTellSubscriptions(actor), effectiveLimit("alertsPerPerson", actor.workspaceId), effectiveLimit("alertMessagesPerPerson", actor.workspaceId, actor.personId)]);
  return (
    <>
      <PageHeader title="Your Alerts" sub="Metrics you asked to be told about, and where each Alert stands." />
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          You can hold {perPerson} Alerts in a Workspace, at most {ALERTS_PER_METRIC} on one Metric, and are sent at most {perDay} Alert messages a day (you can lower it under <Link href="/settings/profile" className="underline">Your limits</Link>). You hold {alerts.length} you can see now. Set one with <strong>Alert me…</strong> on a Metric&rsquo;s page.
        </p>
        {alerts.length === 0 ? (
          <p className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-rule-2)] p-8 text-center text-sm text-muted-foreground">No Alerts yet. Open a <Link href="/metrics" className="underline">Metric</Link> and choose Alert me….</p>
        ) : (
          <AlertRows alerts={alerts} showMetric webhooks={webhooks} />
        )}
        {telling.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-sm font-semibold">Workflows that tell you</h2>
            <p className="text-sm text-muted-foreground">A Tell step in a Workflow is set by its owner. You can stop being told by a Workflow here, or with the link in its email.</p>
            <TellSwitches items={telling} />
          </section>
        )}
      </div>
    </>
  );
}

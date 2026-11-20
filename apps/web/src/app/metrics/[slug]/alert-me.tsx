// "Alert me…" on a Metric's page (GLOSSARY: Alert; spec 0032, ticket #375): loads the person's own Alerts on this
// Metric and what it can give, so the page itself stays short. Nothing in the demo, which is read-only.
import { currentActor } from "@/lib/viewer";
import { alertChoices, listMyAlerts } from "@ziffr/core/alerts";
import { AlertMe } from "@/components/alerts";

/** The Alert me… button with its dialog, or nothing in the demo. */
export async function AlertMeButton({ metric, demo }: { metric: { id: number; name: string }; demo: boolean }) {
  if (demo) return null;
  const actor = await currentActor();
  const [mine, choices] = await Promise.all([listMyAlerts(actor, metric.id), alertChoices(actor, metric.id)]);
  return <AlertMe metric={metric} mine={mine} choices={choices} />;
}

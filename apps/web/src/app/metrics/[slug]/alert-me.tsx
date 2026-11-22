// "Alert me…" on a Metric's page (GLOSSARY: Alert; spec 0032, ticket #375): loads the person's own Alerts on this
// Metric and what it can give, so the page itself stays short. Nothing in the demo, which is read-only. The entry sits
// in the page's ⋯ menu (metric-toolbar.tsx); its slide-over opens from there.
import { currentActor } from "@/lib/viewer";
import { alertChoices, alertWebhookChoices, listMyAlerts, type AlertChoices, type MyAlert } from "@ziffr/core/alerts";

/** What the Alert me… slide-over needs, or null in the demo. */
export async function alertMeData(metric: { id: number; name: string }, demo: boolean): Promise<{ metric: { id: number; name: string }; mine: MyAlert[]; choices: AlertChoices; webhooks: Awaited<ReturnType<typeof alertWebhookChoices>> } | null> {
  if (demo) return null;
  const actor = await currentActor();
  const [mine, choices, webhooks] = await Promise.all([listMyAlerts(actor, metric.id), alertChoices(actor, metric.id), alertWebhookChoices(actor)]);
  return { metric, mine, choices, webhooks };
}

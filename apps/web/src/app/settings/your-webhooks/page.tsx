// Your Webhooks (spec 0037, GLOSSARY: Personal Webhook): the addresses a person added for themselves in this Workspace,
// next to Connected assistants. Without the Workspace's switch the page says so and names none. A Guest, a Contact and
// the demo have none. The core returns the address masked and never a secret, and the Metrics offered for picking are
// only those this person sees now; a picked Metric they no longer see is counted, never named.
import { currentActor, viewerId } from "@/lib/viewer";
import { isDemo } from "@/lib/auth";
import { getMetrics } from "@/lib/data";
import { visibleMetricIds } from "@/lib/access";
import { listOwnPersonalWebhooks, ownPersonalWebhookLog } from "@ziffr/core/personal-webhooks";
import { PERSONAL_WEBHOOKS_PER_PERSON, PERSONAL_WEBHOOK_SENDS_PER_PERSON_PER_DAY } from "@ziffr/core/webhook-limits";
import { PERSONAL_WEBHOOK_PICKED_METRICS_MAX } from "@ziffr/core/personal-webhook-hearing";
import { webhookRules } from "@ziffr/core/webhook-trial";
import { daysNow } from "@ziffr/core/keep-days";
import type { WebhookLogEntry } from "@ziffr/core/webhook-log";
import { PageHeader } from "@/components/page-header";
import { YourWebhooks } from "./your-webhooks";

const note = (text: string) => (
  <>
    <PageHeader title="Your Webhooks" />
    <p className="max-w-prose text-sm text-muted-foreground">{text}</p>
  </>
);

export default async function YourWebhooksPage() {
  if (await isDemo()) return note("The demo has no Webhooks: they send data to addresses outside Ziffr, and the demo is shared by everyone.");
  const actor = await currentActor();
  if (actor.role === "guest") return note("Your role in this Workspace does not include Webhooks of your own.");
  const rules = await webhookRules(actor.workspaceId);
  if (!rules.allowed) return note(`${rules.why ?? "Webhooks are not available here."} Every other Workspace can have them.`);
  const { allowed, webhooks } = await listOwnPersonalWebhooks(actor);
  if (!allowed) return note("Your Workspace does not allow personal Webhooks; ask an Owner or Admin.");
  const logs: Record<string, WebhookLogEntry[]> = Object.fromEntries(await Promise.all(webhooks.map(async (w) => [w.id, await ownPersonalWebhookLog(actor, w.id)] as const)));
  // Only Metrics this person sees now may be picked (the core checks again, and at every send).
  const all = await getMetrics();
  const visible = await visibleMetricIds(await viewerId(), all);
  const metrics = all.filter((m) => visible.has(m.id) && !m.archived_at && !m.formula).map((m) => ({ id: m.id, name: m.name })).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <>
      <PageHeader title="Your Webhooks" sub="Addresses of your own that hear what you may see in this Workspace." />
      <YourWebhooks
        webhooks={webhooks}
        logs={logs}
        metrics={metrics}
        limits={{ most: PERSONAL_WEBHOOKS_PER_PERSON, workspaceMost: rules.maxWebhooks, perDay: Math.min(PERSONAL_WEBHOOK_SENDS_PER_PERSON_PER_DAY, rules.sendsPerDay), metrics: PERSONAL_WEBHOOK_PICKED_METRICS_MAX, days: await daysNow("ZIFFR_KEEP_WEBHOOK_LOG_DAYS"), trial: rules.trial }}
      />
    </>
  );
}

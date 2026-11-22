// Webhooks in the workspace settings (spec 0034, GLOSSARY: Webhook): addresses that get signed messages about what
// happens in the Workspace. Owners and Admins only; the demo has none, and a Trial Workspace has fewer (spec 0037). The core checks again and
// returns the address masked and never a secret.
import { currentActor } from "@/lib/viewer";
import { isDemo } from "@/lib/auth";
import { listWebhooks } from "@ziffr/core/webhooks";
import { listPersonalWebhooksForAdmin, personalWebhookLogForAdmin } from "@ziffr/core/personal-webhooks";
import { personalWebhooksAllowed } from "@ziffr/core/personal-webhook-state";
import { webhookLog, type WebhookLogEntry } from "@ziffr/core/webhook-log";
import { webhookRules } from "@ziffr/core/webhook-trial";
import { daysNow } from "@ziffr/core/keep-days";
import { PageHeader } from "@/components/page-header";
import { Webhooks } from "./webhooks";
import { PersonalWebhooks } from "./personal-webhooks";

const note = (text: string) => (
  <>
    <PageHeader title="Webhooks" />
    <p className="max-w-prose text-sm text-muted-foreground">{text}</p>
  </>
);

export default async function WebhooksPage() {
  const actor = await currentActor();
  if (await isDemo()) return note("The demo has no Webhooks: they send a Workspace's data to addresses outside Ziffr, and the demo is shared by everyone.");
  if (actor.role !== "owner" && actor.role !== "admin") return note("Owners and Admins set up Webhooks. Ask one of them to connect a system.");
  // The same rules the core applies when a Webhook is added or sent: a trial has smaller limits, and none at all where the operator switched them off.
  const rules = await webhookRules(actor.workspaceId);
  if (!rules.allowed) return note(`${rules.why ?? "Webhooks are not available here."} Every other Workspace can have them.`);
  const webhooks = await listWebhooks(actor);
  const logs: Record<string, WebhookLogEntry[]> = Object.fromEntries(await Promise.all(webhooks.map(async (w) => [w.id, await webhookLog(actor, w.id)] as const)));
  const [allowed, personal] = await Promise.all([personalWebhooksAllowed(actor.workspaceId), listPersonalWebhooksForAdmin(actor)]);
  // Statuses and times only: what a Personal Webhook sent is its person's.
  const personalLogs: Record<string, WebhookLogEntry[]> = Object.fromEntries(await Promise.all(personal.map(async (w) => [w.id, await personalWebhookLogForAdmin(actor, w.id)] as const)));
  return (
    <>
      <PageHeader title="Webhooks" />
      <Webhooks webhooks={webhooks} logs={logs} limits={{ most: rules.maxWebhooks, days: await daysNow("ZIFFR_KEEP_WEBHOOK_LOG_DAYS"), perDay: rules.sendsPerDay, trial: rules.trial }} />
      <PersonalWebhooks allowed={allowed} webhooks={personal.map((w) => ({ ...w, ownerId: undefined }))} logs={personalLogs} />
    </>
  );
}

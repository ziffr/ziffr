// Webhooks in the workspace settings (spec 0034, GLOSSARY: Webhook): addresses that get signed messages about what
// happens in the Workspace. Owners and Admins only; the demo and a Trial Workspace have none. The core checks again and
// returns the address masked and never a secret.
import { currentActor } from "@/lib/viewer";
import { isDemo } from "@/lib/auth";
import { listWebhooks } from "@ziffr/core/webhooks";
import { webhookLog, type WebhookLogEntry } from "@ziffr/core/webhook-log";
import { trialEndsAt } from "@ziffr/core/trials";
import { sendingLimit } from "@ziffr/core/sending-limit";
import { daysNow } from "@ziffr/core/keep-days";
import { PageHeader } from "@/components/page-header";
import { Webhooks } from "./webhooks";

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
  if (await trialEndsAt(actor.workspaceId)) return note("A trial has no Webhooks: they send Workspace data to addresses outside Ziffr. Every other Workspace can have them.");
  const webhooks = await listWebhooks(actor);
  const logs: Record<string, WebhookLogEntry[]> = Object.fromEntries(await Promise.all(webhooks.map(async (w) => [w.id, await webhookLog(actor, w.id)] as const)));
  return (
    <>
      <PageHeader title="Webhooks" />
      <Webhooks webhooks={webhooks} logs={logs} limits={{ most: await sendingLimit("webhooksPerWorkspace"), days: await daysNow("ZIFFR_KEEP_WEBHOOK_LOG_DAYS"), perDay: await sendingLimit("webhookSendsPerWorkspace") }} />
    </>
  );
}

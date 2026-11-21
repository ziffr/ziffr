// The system's own closes of Actions (GLOSSARY: Action, Webhook; spec 0034, ticket #430): a Metric deleted, a person
// who left, a Workspace closing or deleted. Each Action goes through `changeActionState` with its reason, so `action.done`
// reaches every Webhook once and the external tasks close too. Where the rows are about to go (a Metric or a Workspace
// deleted), the events are also sent at once, before the delete: the send rows would be removed with them.
import { closeActions, type CloseWhere } from "./action-state";
import type { DoneReason } from "./webhook-events";
import { sendWebhooksNow } from "./webhook-send";

/** Closes the open Actions that fit `where` as the system with `reason`; with `beforeDelete` the events are sent now. Returns how many it closed. */
export async function closeForSystem(workspaceId: string, where: CloseWhere, reason: DoneReason, opts: { beforeDelete?: boolean } = {}): Promise<number> {
  if (where.ids && !where.ids.length) return 0;
  const closed = await closeActions(workspaceId, where, { type: "system" }, reason);
  if (opts.beforeDelete && closed) await sendWebhooksNow(workspaceId, where.metricId ?? null);
  return closed;
}

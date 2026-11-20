"use server";
// Webhooks (spec 0034, GLOSSARY: Webhook): thin calls into the core (@ziffr/core/webhooks, webhook-log), which checks
// who may (Owners and Admins, never the demo or a trial) and judges every address. The secret leaves only here, once.
import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/viewer";
import { attempt } from "@/lib/action-result";
import * as hooks from "@ziffr/core/webhooks";
import * as log from "@ziffr/core/webhook-log";

/** Makes a Webhook; returns its id and its secret, shown this once. */
export async function createWebhook(input: { name: string; url: string; events: string[] }) {
  return attempt(async () => {
    const r = await hooks.createWebhook(await currentActor(), { name: String(input?.name ?? ""), url: String(input?.url ?? ""), events: Array.isArray(input?.events) ? input.events.map(String) : [] });
    revalidatePath("/settings/webhooks");
    return r;
  });
}

/** Changes a Webhook's name or events. */
export async function updateWebhook(id: string, change: { name?: string; events?: string[] }) {
  return attempt(async () => {
    await hooks.updateWebhook(await currentActor(), String(id), {
      ...(change?.name !== undefined ? { name: String(change.name) } : {}),
      ...(Array.isArray(change?.events) ? { events: change.events.map(String) } : {}),
    });
    revalidatePath("/settings/webhooks");
  });
}

/** Replaces a Webhook's secret; the new one is returned this once. */
export async function replaceWebhookSecret(id: string) {
  return attempt(async () => {
    const r = await hooks.replaceWebhookSecret(await currentActor(), String(id));
    revalidatePath("/settings/webhooks");
    return r.secret;
  });
}

/** Switches a Webhook on or off. */
export async function setWebhookEnabled(id: string, enabled: boolean) {
  return attempt(async () => {
    await hooks.setWebhookEnabled(await currentActor(), String(id), enabled === true);
    revalidatePath("/settings/webhooks");
  });
}

/** Deletes a Webhook. */
export async function deleteWebhook(id: string) {
  return attempt(async () => {
    await hooks.deleteWebhook(await currentActor(), String(id));
    revalidatePath("/settings/webhooks");
  });
}

/** Sends a test event (`ping`) to a Webhook. */
export async function sendTestWebhook(id: string) {
  return attempt(async () => {
    await log.sendTestWebhook(await currentActor(), String(id));
    revalidatePath("/settings/webhooks");
  });
}

/** Sends a failed message again. */
export async function resendWebhookSend(sendId: string) {
  return attempt(async () => {
    await log.resendWebhookSend(await currentActor(), String(sendId));
    revalidatePath("/settings/webhooks");
  });
}

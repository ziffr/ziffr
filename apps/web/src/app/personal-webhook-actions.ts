"use server";
// Personal Webhooks (spec 0037, GLOSSARY: Personal Webhook): thin calls into the core (@ziffr/core/personal-webhooks),
// which checks who may (a signed-in Owner, Admin or Member for their own; an Owner or Admin for the switch and for
// removing) and judges every address. Each call acts as the current person, never on an id of someone else's:
// the core answers a Webhook that is not theirs like one that is not there. The secret leaves only here, once.
import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/viewer";
import { attempt } from "@/lib/action-result";
import * as mine from "@ziffr/core/personal-webhooks";

const PAGES = ["/settings/your-webhooks", "/settings/webhooks"];
const refresh = () => PAGES.forEach((p) => revalidatePath(p));
/** Whole numbers only: anything else is dropped here and the core checks the rest. */
const ids = (v: unknown): number[] | undefined => (Array.isArray(v) ? v.map((x) => (typeof x === "number" ? x : NaN)) : undefined);

/** Adds a Personal Webhook for the current person; returns its id and its secret, shown this once. */
export async function createPersonalWebhook(input: { name: string; url: string; events: string[]; metricIds: number[] }) {
  return attempt(async () => {
    const r = await mine.createPersonalWebhook(await currentActor(), { name: String(input?.name ?? ""), url: String(input?.url ?? ""), events: Array.isArray(input?.events) ? input.events.map(String) : [], metricIds: ids(input?.metricIds) ?? [] });
    refresh();
    return r;
  });
}

/** Changes the name, address, events or picked Metrics of one's own Personal Webhook. */
export async function updatePersonalWebhook(id: string, change: { name?: string; url?: string; events?: string[]; metricIds?: number[] }) {
  return attempt(async () => {
    await mine.updatePersonalWebhook(await currentActor(), String(id), {
      ...(change?.name !== undefined ? { name: String(change.name) } : {}),
      ...(change?.url !== undefined && String(change.url).trim() ? { url: String(change.url) } : {}),
      ...(Array.isArray(change?.events) ? { events: change.events.map(String) } : {}),
      ...(Array.isArray(change?.metricIds) ? { metricIds: ids(change.metricIds) } : {}),
    });
    refresh();
  });
}

/** Drops the picked Metrics the person can no longer see from one's own Personal Webhook. */
export async function forgetHiddenPersonalMetrics(id: string) {
  return attempt(async () => {
    const n = await mine.forgetHiddenPersonalMetrics(await currentActor(), String(id));
    refresh();
    return n;
  });
}

/** Replaces the secret of one's own Personal Webhook; the new one is returned this once. */
export async function replacePersonalWebhookSecret(id: string) {
  return attempt(async () => {
    const r = await mine.replacePersonalWebhookSecret(await currentActor(), String(id));
    refresh();
    return r.secret;
  });
}

/** Switches one's own Personal Webhook on or off. */
export async function setPersonalWebhookEnabled(id: string, enabled: boolean) {
  return attempt(async () => {
    await mine.setPersonalWebhookEnabled(await currentActor(), String(id), enabled === true);
    refresh();
  });
}

/** Deletes one's own Personal Webhook. */
export async function deletePersonalWebhook(id: string) {
  return attempt(async () => {
    await mine.deletePersonalWebhook(await currentActor(), String(id));
    refresh();
  });
}

/** Sends a test event (`ping`) to one's own Personal Webhook. */
export async function sendTestPersonalWebhook(id: string) {
  return attempt(async () => {
    await mine.sendTestPersonalWebhook(await currentActor(), String(id));
    refresh();
  });
}

/** Switches "People may add their own Webhooks" (Owners and Admins). */
export async function setPersonalWebhooksAllowed(allowed: boolean) {
  return attempt(async () => {
    await mine.setPersonalWebhooksAllowed(await currentActor(), allowed === true);
    refresh();
  });
}

/** Removes someone's Personal Webhook (Owners and Admins); its person is told. */
export async function removePersonalWebhook(id: string) {
  return attempt(async () => {
    await mine.removePersonalWebhook(await currentActor(), String(id));
    refresh();
  });
}

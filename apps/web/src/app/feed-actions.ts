"use server";
// Feeds (spec 0012, GLOSSARY: Feed, Feed Key): thin calls into the core (@ziffr/core/feeds), which checks who may.
import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/viewer";
import { attempt } from "@/lib/action-result";
import * as feeds from "@ziffr/core/feeds";

/** Creates a Feed (Owners and Admins). */
export async function createFeed(name: string) {
  return attempt(async () => {
    await feeds.createFeed(await currentActor(), String(name ?? ""));
    revalidatePath("/settings/feeds");
  });
}

/** Renames a Feed (Owners and Admins). */
export async function renameFeed(feedId: string, name: string) {
  return attempt(async () => {
    await feeds.renameFeed(await currentActor(), String(feedId), String(name ?? ""));
    revalidatePath("/settings/feeds");
  });
}

/** Deletes a Feed: its keys stop, its values stay (Owners and Admins). */
export async function deleteFeed(feedId: string) {
  return attempt(async () => {
    await feeds.deleteFeed(await currentActor(), String(feedId));
    revalidatePath("/settings/feeds");
  });
}

/** Creates a Feed Key; the secret is returned this once and never shown again. */
export async function createFeedKey(feedId: string, input: { name: string; expiresOn: string }) {
  return attempt(async () => {
    const r = await feeds.createFeedKey(await currentActor(), String(feedId), { name: String(input?.name ?? ""), expiresOn: String(input?.expiresOn ?? "") });
    revalidatePath("/settings/feeds");
    return r.secret;
  });
}

/** Revokes a Feed Key (Owners and Admins). */
export async function revokeFeedKey(keyId: number) {
  return attempt(async () => {
    await feeds.revokeFeedKey(await currentActor(), Number(keyId));
    revalidatePath("/settings/feeds");
  });
}

/** Makes a Feed a Submitter of a Metric (its owner and Editors). */
export async function addFeedToMetric(metricId: number, feedId: string) {
  return attempt(async () => {
    await feeds.addFeedToMetric(await currentActor(), Number(metricId), String(feedId));
    revalidatePath("/metrics/[slug]", "page");
  });
}

/** Stops a Feed submitting to a Metric (its owner and Editors). */
export async function removeFeedFromMetric(metricId: number, feedId: string) {
  return attempt(async () => {
    await feeds.removeFeedFromMetric(await currentActor(), Number(metricId), String(feedId));
    revalidatePath("/metrics/[slug]", "page");
  });
}

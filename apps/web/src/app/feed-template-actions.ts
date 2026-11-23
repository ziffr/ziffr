"use server";
// Getting an n8n template for a Feed (spec 0043, ticket 5; GLOSSARY: Automation Template, Feed): a thin call into the
// core (@ziffr/core/feed-template-download), which checks who may and that everything named is this Workspace's. The
// address in the file is this Installation's own (ZIFFR_SITE_URL), never one from the browser.
import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/viewer";
import { attempt } from "@/lib/action-result";
import { SITE_URL } from "@/lib/sign-in";
import { automationTemplateFor } from "@ziffr/core/feed-template-download";

/** Makes the template's file for these Metrics and Feed; a new Feed key is returned this once. */
export async function downloadFeedTemplate(input: { template: string; metrics: number[]; feedId: string | null; newFeedName: string; makeKey: boolean }) {
  return attempt(async () => {
    const feed = input?.feedId ? { id: String(input.feedId) } : { name: String(input?.newFeedName ?? "") };
    const r = await automationTemplateFor(await currentActor(), SITE_URL, {
      template: String(input?.template ?? ""),
      metrics: Array.isArray(input?.metrics) ? input.metrics.map(Number) : [],
      feed,
      makeKey: input?.makeKey === true,
    });
    revalidatePath("/metrics/[slug]", "page");
    revalidatePath("/settings/feeds");
    return r;
  });
}

"use server";
// A Metric's quick look (GLOSSARY: Quick look): a thin call into the core (@ziffr/core/quick-look), which reads it only
// for a Metric the person sees and sends only what the panel draws.
import { currentActor } from "@/lib/viewer";
import { attempt } from "@/lib/action-result";
import { metricQuickLook as coreMetricQuickLook } from "@ziffr/core/quick-look";

/** The quick look of the Metric with this slug, or a refusal in words when the person may not see it. */
export async function metricQuickLook(slug: string) {
  return attempt(async () => coreMetricQuickLook(await currentActor(), String(slug ?? "")));
}

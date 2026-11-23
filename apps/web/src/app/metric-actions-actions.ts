"use server";
// The Actions about a Widget's Metrics (GLOSSARY: Action): a thin call into the core (@ziffr/core/metric-actions),
// which returns only the Actions this person may read, for Metrics they see.
import { currentActor } from "@/lib/viewer";
import { attempt } from "@/lib/action-result";
import { openActionsAboutMetrics } from "@ziffr/core/metric-actions";

/** The open Questions and Tasks about the Metrics with these slugs; the slugs come from the browser, so only strings are kept. */
export async function metricActions(slugs: string[]) {
  return attempt(async () => openActionsAboutMetrics(await currentActor(), Array.isArray(slugs) ? slugs.filter((s): s is string => typeof s === "string" && s.length <= 200) : []));
}

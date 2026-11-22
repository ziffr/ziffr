"use server";
// The details behind a chart point's popup (#789; GLOSSARY: Observation, Source, Submitter, Thread), as a thin call:
// the core checks that the signed-in person sees the Metric and returns only what they may be shown. The browser sends
// a Metric's slug and a period and gets back a Source, a name or none, and a count.
import { currentActor } from "@/lib/viewer";
import { observationDetails, type ObservationDetails } from "@ziffr/core/observation-details";

/** The details of one Observation for the signed-in person; null when it is not theirs to see. */
export async function observationDetailsAction(slug: string, period: string): Promise<ObservationDetails | null> {
  return observationDetails(await currentActor(), slug, period);
}

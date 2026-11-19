"use server";
// The Trial Guide's actions (ticket 193; GLOSSARY: Trial Guide, Test Metric): each calls the core with the current
// person, which checks that they are the Owner of a running Trial Workspace. Words for the person come back as values,
// since production builds hide the message of a thrown error.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { currentActor } from "@/lib/viewer";
import { askTrialGuide, finishTrialGuide, makeGuideFeedKey, saveTrialGuide, type GuideFeedKeyResult, trialGuideValue, type GuideAsked, type GuideStep, type GuideValue, type GuideWay } from "@ziffr/core/trial-guide";

const words = (e: unknown) => ({ error: (e as Error).message });

/** Moves the guide to a step, keeping the ways picked when given. */
export async function moveGuide(step: GuideStep, ways?: GuideWay[]): Promise<{ error: string } | void> {
  try {
    await saveTrialGuide(await currentActor(), step, ways);
    revalidatePath("/try/start");
  } catch (e) { return words(e); }
}

/** Skip the guide: it is finished for good and opens only from the trial's bar; the Owner goes on to their home. */
export async function skipGuide(): Promise<{ error: string } | void> {
  try {
    await finishTrialGuide(await currentActor());
  } catch (e) { return words(e); }
  redirect("/");
}

/** Sends the Test Metric's Prompt by the ways picked; the Owner's own form link comes back with it. */
export async function askGuide(): Promise<GuideAsked | { error: string }> {
  try {
    return await askTrialGuide(await currentActor());
  } catch (e) { return words(e); }
}

/** The Test Metric's latest value, polled while the guide waits for it. */
export async function guideValue(): Promise<GuideValue | null> {
  return trialGuideValue(await currentActor());
}

/** Makes the Feed and Feed Key a program such as n8n sends the Test Metric's values with, or replaces the key. The
 * secret comes back this once and is never stored by the page. */
export async function makeN8nKey(replace: boolean): Promise<GuideFeedKeyResult | { error: string }> {
  try {
    return await makeGuideFeedKey(await currentActor(), replace === true);
  } catch (e) { return words(e); }
}

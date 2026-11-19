"use server";
// The Trial Guide's actions (ticket 193; GLOSSARY: Trial Guide, Test Metric): each calls the core with the current
// person, which checks that they are the Owner of a running Trial Workspace. Words for the person come back as values,
// since production builds hide the message of a thrown error.
import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/viewer";
import type { AskNowResult } from "@ziffr/core/ask-now";
import { askTrialGuide, saveTrialGuide, trialGuideValue, type GuideStep, type GuideValue, type GuideWay } from "@ziffr/core/trial-guide";

const words = (e: unknown) => ({ error: (e as Error).message });

/** Moves the guide to a step, keeping the ways picked when given. */
export async function moveGuide(step: GuideStep, ways?: GuideWay[]): Promise<{ error: string } | void> {
  try {
    await saveTrialGuide(await currentActor(), step, ways);
    revalidatePath("/try/start");
  } catch (e) { return words(e); }
}

/** Sends the Test Metric's Prompt by the ways picked. */
export async function askGuide(): Promise<AskNowResult[] | { error: string }> {
  try {
    return await askTrialGuide(await currentActor());
  } catch (e) { return words(e); }
}

/** The Test Metric's latest value, polled while the guide waits for it. */
export async function guideValue(): Promise<GuideValue | null> {
  return trialGuideValue(await currentActor());
}

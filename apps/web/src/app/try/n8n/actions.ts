"use server";
// The trial's Feed Key for n8n (spec 0052, ticket 12; GLOSSARY: Feed, Feed Key, Test Metric): calls the core with the
// current person, which checks that they are the Owner of a running Trial Workspace. Words for the person come back as
// values, since production builds hide the message of a thrown error.
import { currentActor } from "@/lib/viewer";
import { makeGuideFeedKey, type GuideFeedKeyResult } from "@ziffr/core/trial-feed-key";

/** Makes the Feed and Feed Key a program such as n8n sends the Test Metric's values with, or replaces the key. The
 * secret comes back this once and is never stored by the page. */
export async function makeN8nKey(replace: boolean): Promise<GuideFeedKeyResult | { error: string }> {
  try {
    return await makeGuideFeedKey(await currentActor(), replace === true);
  } catch (e) { return { error: (e as Error).message }; }
}

"use server";
// The Ways in and out step's actions (spec 0052, ticket 8; GLOSSARY: Setup Guide, Delivery Preference, Connector): each
// calls the core with the current person. The other presses of the step (Turn on Telegram, Connect my Telegram, Link my
// Slack, Send me a test) are the Connectors page's own actions; only what is new for the guide is here.
import { currentActor } from "@/lib/viewer";
import { attempt } from "@/lib/action-result";
import { refuseInDemo } from "@ziffr/core/demo";
import { setMyPromptWays } from "@ziffr/core/ways-in-and-out";
import { revalidatePath } from "next/cache";

/** Saves the person's own Delivery Preference for Prompts: up to three ways in order. Untrusted input: the core checks
 * each way against the ones that really work here, and only ever writes the acting person's own preference. */
export async function saveAskMeBy(ways: string[]) {
  return attempt(async () => {
    const actor = await currentActor();
    refuseInDemo(actor);
    await setMyPromptWays(actor, ways);
    revalidatePath("/setup");
  });
}

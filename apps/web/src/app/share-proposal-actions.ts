"use server";
// Share Proposals (GLOSSARY: Share Proposal): the person confirms or declines what an assistant prepared, with their own
// sign-in, through the core. Never reachable with a key: currentActor is the signed-in person, and the core refuses a key anyway.
import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/viewer";
import { attempt } from "@/lib/action-result";
import { confirmShareProposal, declineShareProposal } from "@ziffr/core/share-proposals";

/** Confirms a proposal: makes the View Link or gives the Share, and emails the recipient of a View Link. Answers what happened in words. */
export async function confirmProposal(id: number) {
  return attempt(async () => {
    const done = await confirmShareProposal(await currentActor(), Number(id));
    revalidatePath("/", "layout");
    if (done.kind === "share") return { message: "Shared. They can look at the dashboard in Ziffr now.", linkPath: null };
    return done.emailState === "sent"
      ? { message: "The View Link was made and emailed to the recipient.", linkPath: null }
      // The link is shown only to the person who made it, so they can send it themselves.
      : { message: "The View Link was made, but the email could not be sent. Send them this link yourself:", linkPath: done.linkPath };
  });
}

/** Declines a proposal; nothing was shared or sent. */
export async function declineProposal(id: number) {
  return attempt(async () => {
    await declineShareProposal(await currentActor(), Number(id));
    revalidatePath("/", "layout");
    return { message: "Declined. Nothing was shared or sent." };
  });
}

"use server";
// Feedback (spec 0049, ticket #916; GLOSSARY: Feedback): thin calls into the core (@ziffr/core/feedback), which checks
// that this is hosted Ziffr and that the person may send, and which cleans every value again. The browser sends a kind,
// the words and the page it is on; the app version is read here on the server, so it is never taken from the browser.
// No Workspace data is passed on: the core stores the words, the route (cut down to a plain path) and the version only.
import { currentActor } from "@/lib/viewer";
import { attempt } from "@/lib/action-result";
import { ziffrVersion } from "@/lib/installation";
import { createFeedback, getMyFeedback, listMyFeedback, replyToFeedback } from "@ziffr/core/feedback";

/** Sends the person's feedback. `input` comes from a browser: only its three strings are looked at, and the core checks them. */
export async function sendFeedback(input: { kind: string; words: string; route: string }) {
  return attempt(async () => {
    const version = ziffrVersion()?.replace(/^v/, "") ?? null;
    return createFeedback(await currentActor(), { kind: input?.kind, words: input?.words, route: input?.route, appVersion: version });
  });
}

/** My feedback: what the signed-in person sent, newest first. */
export async function myFeedback() {
  return attempt(async () => listMyFeedback(await currentActor()));
}

/** One of the person's feedback with its conversation; `id` comes from a browser and the core checks it. */
export async function myFeedbackThread(id: string) {
  return attempt(async () => getMyFeedback(await currentActor(), id));
}

/** The person's reply under one of their own feedback (the core checks the id, the words and the limits). */
export async function replyToMyFeedback(input: { id: string; words: string }) {
  return attempt(async () => replyToFeedback(await currentActor(), input?.id, input?.words));
}

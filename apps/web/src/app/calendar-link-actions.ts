"use server";
// Calendar Links (spec 0027, ticket #243; GLOSSARY: Calendar Link): thin calls into the core (@ziffr/core/calendar-links).
// The address is returned once, when it is made; the core keeps only its hash.
import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/viewer";
import { attempt } from "@/lib/action-result";
import * as links from "@ziffr/core/calendar-links";

import { SITE_URL } from "@/lib/sign-in";

/** Makes the person's Calendar Link, ending one they had; answers its address this once. */
export async function makeCalendarLink(input: { noNames?: boolean }) {
  return attempt(async () => {
    const { secret } = await links.makeCalendarLink(await currentActor(), { noNames: typeof input?.noNames === "boolean" ? input.noNames : undefined });
    revalidatePath("/schedule");
    // The Installation's own address, as in sign-in links: never one a request's Host header could choose.
    return `${SITE_URL}/cal/${secret}.ics`;
  });
}

/** Whether the person's Calendar Link shows names; the address stays. */
export async function setCalendarNoNames(noNames: boolean) {
  return attempt(async () => {
    await links.setCalendarNoNames(await currentActor(), noNames === true);
    revalidatePath("/schedule");
  });
}

/** Ends a Calendar Link: the person's own, or, for Owners and Admins, anyone's in the Workspace. */
export async function revokeCalendarLink(personId?: string) {
  return attempt(async () => {
    const actor = await currentActor();
    await links.revokeCalendarLink(actor, typeof personId === "string" ? personId : actor.personId);
    revalidatePath("/schedule");
    revalidatePath("/settings/keys");
  });
}

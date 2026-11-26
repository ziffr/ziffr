"use server";
// Totals (GLOSSARY: Total; spec 0058, "Team totals"): thin calls into the core (@ziffr/core/total-changes and
// total-opening). The core checks who may make, change, open and close a Total, what a browser sends, what was
// confirmed, and refuses the demo and programs.
import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/viewer";
import { attempt } from "@/lib/action-result";
import * as changes from "@ziffr/core/total-changes";
import * as opening from "@ziffr/core/total-opening";

/** A Total's numbers show on its page, in lists and on dashboards: all of them are read afresh. */
const refresh = () => revalidatePath("/", "layout");

/** Makes a Total from the "Add up Metrics" form. */
export async function createTotal(input: changes.TotalInput) {
  return attempt(async () => {
    const made = await changes.createTotal(await currentActor(), { ...input });
    refresh();
    return made;
  });
}

/** Adds a Metric to a Total, counted from the period of a day. */
export async function addTotalPart(totalId: number, partId: number, from: string, confirmOpen?: boolean) {
  return attempt(async () => {
    await changes.addTotalPart(await currentActor(), Number(totalId), Number(partId), String(from), confirmOpen === true);
    refresh();
  });
}

/** Ends a Metric's counting in a Total after the period of a day, or (null) counts it from then on. */
export async function setTotalPartPeriods(totalId: number, partId: number, last: string | null, confirmOpen?: boolean) {
  return attempt(async () => {
    await changes.setTotalPartPeriods(await currentActor(), Number(totalId), Number(partId), { last: last === null ? null : String(last) }, confirmOpen === true);
    refresh();
  });
}

/** Takes a Metric out of a Total altogether; past totals change. */
export async function removeTotalPart(totalId: number, partId: number, confirmOpen?: boolean) {
  return attempt(async () => {
    await changes.removeTotalPart(await currentActor(), Number(totalId), Number(partId), confirmOpen === true);
    refresh();
  });
}

/** Chooses a Total's own target or its Metrics' targets added up. */
export async function setTotalTargets(totalId: number, targets: string, confirmOpen?: boolean) {
  return attempt(async () => {
    await changes.setTotalTargets(await currentActor(), Number(totalId), String(targets), confirmOpen === true);
    refresh();
  });
}

/** What opening a Total would show, for its owner (nothing is changed). */
export async function previewTotalOpening(totalId: number) {
  return attempt(async () => opening.totalOpening(await currentActor(), Number(totalId)));
}

/** Opens a Total, as its owner confirmed the lists with this fingerprint. */
export async function openTotal(totalId: number, fingerprint: string) {
  return attempt(async () => {
    await opening.openTotal(await currentActor(), Number(totalId), String(fingerprint));
    refresh();
  });
}

/** Closes a Total, in effect at once. */
export async function closeTotal(totalId: number) {
  return attempt(async () => {
    await opening.closeTotal(await currentActor(), Number(totalId));
    refresh();
  });
}

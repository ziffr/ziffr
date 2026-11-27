// First Steps (spec 0067; GLOSSARY: First Steps): the questions that make a person's Workspace, and where its Owner comes
// back to. It is for someone signed in who has no Workspace or asked for another (`?another=1`), and for the Owner of
// a Workspace it made and has not finished. Anyone else goes Home. The browser gets that person's own id, their Workspace's answers, the name of its first Metric, a few entries
// of the Metric Catalog to suggest and what they may ask to join, nothing more.
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { firstStepsState } from "@ziffr/core/first-steps";
import { joinableWorkspaces } from "@ziffr/core/invitations";
import { trialEnded } from "@ziffr/core/trials";
import { whatThisZiffrOffers } from "@ziffr/core/what-works-here";
import { importOffered } from "@ziffr/core/workspace-import";
import { demoOnly, isDemo, personFor, sessionUser, signedIn } from "@/lib/auth";
import { currentActor, myWorkspaces } from "@/lib/viewer";
import { cleanSlate } from "./clean";
import { FirstStepsFlow } from "./flow";
import type { FirstStepsContext } from "./screens/types";

export const metadata: Metadata = { title: "First steps" };

const AFTER_NUMBERS = ["value", "sender", "done"];

export default async function FirstStepsPage({ searchParams }: { searchParams: Promise<{ another?: string; unsaved?: string; step?: string }> }) {
  if (demoOnly()) redirect("/login");
  if (await isDemo()) redirect("/");
  const user = await sessionUser();
  if (!user) redirect("/login");
  const personId = await personFor(user);
  const query = await searchParams;

  let workspace: FirstStepsContext["workspace"] = null;
  let clean: FirstStepsContext["clean"] = null;
  if (query.another !== "1" && (await myWorkspaces(personId)).length) {
    const actor = await currentActor();
    // First Steps is the Owner's; an ended trial has only the screen that says so.
    if (actor.role !== "owner" || (await trialEnded(actor.workspaceId))) redirect("/");
    const state = await firstStepsState(actor);
    // Finished, only the last three screens still open: the person may be reading that their number arrived, or go Back.
    if (!state || (state.resume === "finished" && !AFTER_NUMBERS.includes(query.step ?? ""))) redirect("/");
    workspace = { id: actor.workspaceId, ...state };
    clean = await cleanSlate(actor, state.answers);
  }

  // What a newcomer is offered is read only while there is no Workspace to show.
  const who = workspace ? null : await signedIn();
  const context: FirstStepsContext = {
    personId,
    workspace,
    clean,
    joinable: who ? await joinableWorkspaces(who) : [],
    trialDays: workspace ? null : ((await whatThisZiffrOffers()).trial?.days ?? null),
    importOffered: !workspace && importOffered(),
    unsaved: query.unsaved === "1",
  };
  return <FirstStepsFlow context={context} />;
}

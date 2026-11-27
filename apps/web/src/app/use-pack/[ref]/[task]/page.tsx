// The ways after a Pack's set-up (spec 0068, #1345; GLOSSARY: Pack): choose who provides the numbers, set the asked
// numbers for a new period, change who approves, invite the people of the set-up. One screen each, for one install.
// Never in the demo. Only an Owner or Admin opens one; anyone else is told to ask one. The browser gets what the core's read answers to this person for that screen.
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Forbidden, type Actor } from "@ziffr/core/actor";
import { packHolders } from "@ziffr/core/pack-after-holder";
import { packInvite } from "@ziffr/core/pack-after-invite";
import { packNumbers } from "@ziffr/core/pack-after-numbers";
import { packProviders } from "@ziffr/core/pack-after-providers";
import { trialEnded } from "@ziffr/core/trials";
import { numberStyleOf } from "@ziffr/core/workspace-settings";
import { isDemo } from "@/lib/auth";
import { currentActor } from "@/lib/viewer";
import { AskAnOwner } from "../../ask-owner";
import { AFTER_TASKS, packRefOf, type AfterTask } from "../../paths";
import { PackTask, type PackTaskData } from "../../task";

export const metadata: Metadata = { title: "Your Pack" };

const READ: Record<AfterTask, (actor: Actor, installId: number) => Promise<PackTaskData>> = {
  providers: async (actor, id) => ({ task: "providers", view: await packProviders(actor, id) }),
  targets: async (actor, id) => {
    const [view, numberStyle] = await Promise.all([packNumbers(actor, id), numberStyleOf(actor.workspaceId)]);
    return { task: "targets", view, numberStyle };
  },
  approver: async (actor, id) => ({ task: "approver", view: await packHolders(actor, id) }),
  invite: async (actor, id) => ({ task: "invite", pack: (await packInvite(actor, id)).pack }),
};

export default async function PackTaskPage({ params }: { params: Promise<{ ref: string; task: string }> }) {
  if (await isDemo()) notFound();
  const { ref, task } = await params;
  const install = packRefOf(ref);
  const way = AFTER_TASKS.find((t) => t === task);
  if (!install || !("install" in install) || !way) notFound();
  const actor = await currentActor();
  // An ended trial has only the screen that says so, which the app around Home draws.
  if (await trialEnded(actor.workspaceId)) redirect("/");
  if (actor.role !== "owner" && actor.role !== "admin") return <AskAnOwner />;
  // A Pack that is not here, or not of this Workspace, is not found.
  const data = await READ[way](actor, install.install).catch((e: unknown) => { if (e instanceof Forbidden) notFound(); throw e; });
  return <PackTask key={`${install.install} ${way}`} installId={install.install} data={data} />;
}

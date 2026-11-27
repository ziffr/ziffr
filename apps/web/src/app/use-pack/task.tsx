"use client";
// One way after a Pack's set-up as the browser runs it (spec 0068; GLOSSARY: Pack): choose who provides the numbers,
// set the asked numbers for a new period, change who approves, or invite the people of the set-up. One screen in the
// set-up's own frame, with the actions of the server behind it. It decides nothing: the server checks everything.
import { useMemo } from "react";
import { ScreenHeading } from "@/app/first-steps/parts";
import { FRAME_TAP, GuidedFrame } from "@/components/guided-frame";
import { buttonVariants } from "@/components/ui/button";
import type { NumberStyle } from "@ziffr/core/number-style";
import type { PackHolders } from "@ziffr/core/pack-after-holder";
import type { PackNumbers } from "@ziffr/core/pack-after-numbers";
import type { PackProviders } from "@ziffr/core/pack-after-providers";
import { cn } from "@/lib/utils";
import { changeHolder, choosePackProviders, confirmPackCheck, invitePeople, readHolderPlan, readPackInvite, savePackNumbers, sendPackNumber } from "./actions";
import { HolderTask } from "./holder-task";
import { InvitePanel, type InviteActions } from "./invite";
import { NumbersTask } from "./numbers-task";
import { ProvidersTask } from "./providers-task";
import { afterHref, PACKS_PAGE } from "./paths";

/** What one screen shows, read by the page. */
export type PackTaskData =
  | { task: "providers"; view: PackProviders }
  | { task: "targets"; view: PackNumbers; numberStyle: NumberStyle }
  | { task: "approver"; view: PackHolders }
  | { task: "invite"; pack: string };

/** The invitations of one install, as the panel asks for them. */
export const inviteActions = (installId: number): InviteActions => ({
  read: () => readPackInvite(installId),
  send: (metricId, text, whose) => sendPackNumber(installId, metricId, text, whose),
  confirm: (actionId) => confirmPackCheck(installId, actionId),
  invite: (ids) => invitePeople(installId, ids),
});

function Screen({ installId, data }: { installId: number; data: PackTaskData }) {
  const invites = useMemo(() => inviteActions(installId), [installId]);
  switch (data.task) {
    case "providers":
      return <ProvidersTask view={data.view} save={(providers) => choosePackProviders(installId, providers)} inviteHref={afterHref(installId, "invite")} done={PACKS_PAGE} />;
    case "targets":
      return <NumbersTask view={data.view} style={data.numberStyle} save={(input) => savePackNumbers(installId, input)} done={PACKS_PAGE} />;
    case "approver":
      return <HolderTask view={data.view} actions={{ plan: (pick) => readHolderPlan(installId, pick), change: (input) => changeHolder(installId, input) }} done={PACKS_PAGE} />;
    case "invite":
      return (
        <>
          <ScreenHeading title="Invite the people from this set-up">{data.pack}</ScreenHeading>
          <div className="space-y-5">
            <InvitePanel actions={invites} providersHref={afterHref(installId, "providers")} alone />
            {/* A plain link: the app around the Packs page is not drawn here, so it is loaded anew. */}
            <a href={PACKS_PAGE} className={cn(buttonVariants({ variant: "outline" }), "h-11 w-full sm:h-9 sm:w-auto")}>Back to Packs</a>
          </div>
        </>
      );
  }
}

/** The frame and the screen. */
export function PackTask({ installId, data }: { installId: number; data: PackTaskData }) {
  const ways = <a href={PACKS_PAGE} className={cn(buttonVariants({ variant: "ghost" }), FRAME_TAP)}>All packs</a>;
  return (
    <GuidedFrame steps={[]} current={-1} answers={[]} ways={ways} onBack={null}>
      <Screen installId={installId} data={data} />
    </GuidedFrame>
  );
}

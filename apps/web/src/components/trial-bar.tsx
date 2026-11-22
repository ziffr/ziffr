// The bar of a Trial Workspace (spec 0021, ticket 9): on every page, how long the trial has left, with the Trial Guide
// (ticket 193), Try it and the download of its values; and the screen that replaces the app once it has ended.
import Link from "next/link";
import { trialEndedMemberWords, trialMemberWords } from "@ziffr/core/trial-words";
import { EndTrialButton } from "./end-trial-button";
import { WorkspaceExportButton } from "./workspace-export-button";

/** The line above the page while the trial runs, for a Member or Guest: whose trial it is, until when and what follows (the
 * same words as the invitation). No counts and no links to what only Owners and Admins use. */
export function TrialBarForMembers({ owner, endsAt }: { owner: string | null; endsAt: string }) {
  return <p className="mx-auto max-w-7xl px-4 pt-3 text-xs text-muted-foreground sm:px-6">{trialMemberWords(owner, endsAt)}</p>;
}

/** The line above the page while the trial runs, for its Owner and Admins. */
export function TrialBar({ daysLeft, endsAt, isOwner, keeps, usage }: { daysLeft: number; endsAt: string; isOwner?: boolean; keeps?: boolean; usage?: { line: string; reached: string[] } | null }) {
  return (
    <p className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-1 px-4 pt-3 text-xs text-muted-foreground sm:px-6">
      <span>Your trial ends {daysLeft <= 1 ? "within a day" : `in ${daysLeft} days`}, on {endsAt.slice(0, 10)}. {keeps ? "Your Workspace then stays." : <>Subscribe to keep it{isOwner ? <>, or take the <Link href="/settings/export" className="underline underline-offset-2 hover:text-foreground">Workspace Export</Link> and run Ziffr yourself</> : ""}.</>}</span>
      {/* Owners and Admins only (the core decides): what the trial has used of its limits, and any that is reached. */}
      {usage && <span>{usage.line}.{usage.reached.length > 0 && <> {usage.reached.join(" ")}</>}</span>}
      <Link href="/try/start" className="underline underline-offset-2 hover:text-foreground">Trial guide</Link>
      <Link href="/try" className="underline underline-offset-2 hover:text-foreground">Try it</Link>
      <a href="/try/download" className="underline underline-offset-2 hover:text-foreground">Download your values</a>
    </p>
  );
}

/** What a Member or Guest sees instead of the app once the trial has ended: that it has, and who decides. Nothing to download or delete. */
export function TrialEndedForMembers({ owner, cancelled }: { owner: string | null; cancelled?: boolean }) {
  return (
    <div className="mx-auto mt-16 max-w-md text-sm">
      <h1 className="text-[length:var(--text-2xl)] leading-tight">{cancelled ? "This Workspace is closed" : "This trial has ended"}</h1>
      <p className="mt-2 text-muted-foreground">{trialEndedMemberWords(owner)}</p>
    </div>
  );
}

/** What an Owner or Admin sees instead of the app once their trial has ended. */
export function TrialEnded({ deletedAt, cancelled, isOwner, workspaceExport }: { deletedAt: string; cancelled?: boolean; isOwner?: boolean; workspaceExport?: { signedInRecently: boolean } | null }) {
  return (
    <div className="mx-auto mt-16 max-w-md text-sm">
      <h1 className="text-[length:var(--text-2xl)] leading-tight">{cancelled ? "This Workspace is closed" : "This trial has ended"}</h1>
      <p className="mt-2 text-muted-foreground">
        {cancelled ? "Its Size was cancelled. " : ""}Nothing is sent or taken any more, and its keys have stopped. On {deletedAt.slice(0, 10)} it is deleted with everything in it{isOwner ? ", and your account with it" : ""}.
      </p>
      <p className="mt-4">{isOwner ? "To keep your numbers, download them now. " : "The Owner can download the numbers. "}To use Ziffr for real, run it yourself: <a href="https://github.com/ziffr/ziffr" className="underline">github.com/ziffr/ziffr</a>.</p>
      {/* The Owner's whole Workspace as one file a Ziffr you run can import (spec 0040): the file holds every value in the clear. */}
      {workspaceExport && (
        <div className="mt-4 space-y-2">
          <p className="text-muted-foreground">The Workspace Export holds the whole Workspace, for you to run yourself. It holds every value in the clear: keep it private.{!workspaceExport.signedInRecently && " It asks for a sign-in from the last 10 minutes."}</p>
          <WorkspaceExportButton signedInRecently={workspaceExport.signedInRecently} />
        </div>
      )}
      <div className="mt-6 flex flex-wrap gap-3">
        {isOwner && <a href="/try/download" className="inline-flex h-9 items-center rounded-[var(--radius-input)] border border-input px-3 font-medium hover:bg-muted">Download your values</a>}
        {isOwner && <EndTrialButton label="Delete it now" />}
      </div>
    </div>
  );
}

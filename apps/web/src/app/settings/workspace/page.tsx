// Workspace settings, General (spec 0006, tickets #96 and #97; spec 0017, ticket #39; GLOSSARY: Workspace, Workspace
// Profile, Fiscal Year): the workspace's name, its clock, its year start and its Workspace Profile. Owners and Admins
// change them; everyone else reads.
import { currentActor } from "@/lib/viewer";
import { isDemo } from "@/lib/auth";
import { localTime, workspaceClock } from "@ziffr/core/workspace-clock";
import { yearStartChoices } from "@ziffr/core/fiscal-year";
import { workspaceName, workspaceProfile } from "@ziffr/core/workspace-settings";
import { COUNTRIES, CURRENCIES } from "@ziffr/core/workspace-profile";
import { PageHeader } from "@/components/page-header";
import { WorkspaceClock } from "./clock";
import { WorkspaceNameForm, WorkspaceProfileForm } from "./forms";
import { YearStartForm } from "./year-start";

// Names for country and currency codes, in English like the rest of the app; the code itself where none is known.
const named = (codes: readonly string[], type: "region" | "currency") => {
  const names = new Intl.DisplayNames(["en"], { type });
  return codes.map((code) => ({ code, name: names.of(code) ?? code }));
};

export default async function WorkspaceSettingsPage() {
  const actor = await currentActor();
  const [name, time, profile, demo, year] = await Promise.all([workspaceName(actor), workspaceClock(actor), workspaceProfile(actor), isDemo(), yearStartChoices(actor)]);
  // The demo is shared by every visitor, so nobody changes it; the core refuses it too.
  const canEdit = !demo && (actor.role === "owner" || actor.role === "admin");
  return (
    <>
      <PageHeader title="Workspace" sub={canEdit ? "The workspace's name, its day, when its year starts and what kind of business it is." : demo ? "The demo keeps its settings." : "Only Owners and Admins change these."} />
      <div className="max-w-2xl space-y-8">
        <WorkspaceNameForm name={name} canEdit={canEdit} />
        {/* The demo is never scheduled: its clock is the pretend date on the Workflows page. */}
        {!demo && <WorkspaceClock timeZone={time.timeZone} runHour={time.runHour} canEdit={canEdit} />}
        <YearStartForm yearStart={year.yearStart} allowed={year.allowed} why={year.why} canEdit={canEdit} today={localTime(new Date(), time.timeZone).day} />
        <WorkspaceProfileForm profile={profile} canEdit={canEdit} countries={named(COUNTRIES, "region").sort((a, b) => a.name.localeCompare(b.name, "en"))} currencies={named(CURRENCIES, "currency")} />
      </div>
    </>
  );
}

import { currentWorkspaceId, viewerId } from "@/lib/viewer";
import { getPeopleIn, getProfiles } from "@/lib/data";
import { getGroups } from "@/lib/access";
import { PageHeader } from "@/components/page-header";
import { TeamTabs } from "./team-tabs";
import { currentActor } from "@/lib/viewer";
import { businessFunctions } from "@ziffr/core/business-function";
import { teamView } from "@ziffr/core/page-data";
import { signedIn } from "@/lib/auth";
import { openInvitations, openJoinRequests } from "@ziffr/core/invitations";
import { mailOn } from "@ziffr/core/mail";
import { trialEndsAt } from "@ziffr/core/trials";
import type { WorkspaceRoleName } from "@ziffr/core/actor";

export default async function TeamPage() {
  const viewer = await viewerId();
  const actor = await currentActor();
  // A Guest sees only what is shared with them (the core refuses teamView too): not the members, roles or Groups.
  if (actor.role === "guest") return (<><PageHeader title="Team" sub="Guests see what is shared with them. Ask an Owner or Admin who else is in this workspace." /></>);
  const [people, groups, team] = await Promise.all([getProfiles(), getGroups(), teamView(actor)]);
  const canEdit = actor.role === "owner" || actor.role === "admin";
  // A Contact's email, Slack handle and phone go only to owners and admins, who keep them.
  const contacts = (canEdit ? await getPeopleIn(await currentWorkspaceId(), { contactDetails: true }) : people).filter((p) => p.contact);
  const [invitations, joinRequests, who] = await Promise.all([
    canEdit ? openInvitations(actor) : Promise.resolve([]),
    canEdit ? openJoinRequests(actor) : Promise.resolve([]),
    signedIn(),
  ]);
  // Business Functions go to Owners and Admins only (GLOSSARY: Business Function): for a Member the loader is not even
  // called, so nothing of them reaches this page's props, HTML or data.
  const functions = canEdit ? await businessFunctions(actor) : null;
  // Away dates of this workspace's people only (teamView); nobody else's reach the browser.
  const members = people.filter((p) => !p.contact).map((p) => ({ ...p, workspaceRole: (team.roles.find((r) => r.user_id === p.id)?.role ?? "member") as WorkspaceRoleName }));
  return (
    <>
      <PageHeader title="Members and Groups" sub="The people in this workspace and their groups." />
      <TeamTabs data={{ viewer, canEdit, isOwner: actor.role === "owner", people: members, contacts, groups: groups.filter((g) => !g.everyone), away: team.away ?? [], functions, invitations, joinRequests, mailOn: await mailOn(), joinDomain: team.joinDomain, myDomain: who?.verifiedEmail?.split("@")[1] ?? null, trial: Boolean(await trialEndsAt(actor.workspaceId)) }} />
    </>
  );
}

import { currentWorkspaceId, viewerId } from "@/lib/viewer";
import { getPeopleIn, getProfiles } from "@/lib/data";
import { getGroups } from "@/lib/access";
import { PageHeader } from "@/components/page-header";
import { TeamScreen } from "./screen";
import { Members } from "./members";
import { currentActor } from "@/lib/viewer";
import { teamView } from "@ziffr/core/page-data";
import { signedIn } from "@/lib/auth";
import { openInvitations, openJoinRequests } from "@ziffr/core/invitations";
import { mailOn } from "@ziffr/core/mail";
import type { WorkspaceRoleName } from "@ziffr/core/actor";

export default async function TeamPage() {
  const viewer = await viewerId();
  const actor = await currentActor();
  const [people, groups, team] = await Promise.all([getProfiles(), getGroups(), teamView(actor)]);
  const canEdit = actor.role === "owner" || actor.role === "admin";
  // A Contact's email, Slack handle and phone go only to owners and admins, who keep them.
  const contacts = (canEdit ? await getPeopleIn(await currentWorkspaceId(), { contactDetails: true }) : people).filter((p) => p.contact);
  const [invitations, joinRequests, who] = await Promise.all([
    canEdit ? openInvitations(actor) : Promise.resolve([]),
    canEdit ? openJoinRequests(actor) : Promise.resolve([]),
    signedIn(),
  ]);
  const members = people.filter((p) => !p.contact).map((p) => ({ id: p.id, name: p.name, role: (team.roles.find((r) => r.user_id === p.id)?.role ?? "member") as WorkspaceRoleName }));
  // Away dates of this workspace's people only (teamView); nobody else's reach the browser.
  const away = team.away;
  return (
    <>
      <PageHeader title="Members and Groups" sub="The people in this workspace and their groups. Share with a group, or limit a question to one, and whoever joins later is included. Everyone in the workspace is a group of its own: all members except guests." />
      <Members viewer={viewer} members={members} canEdit={canEdit} isOwner={actor.role === "owner"} invitations={invitations} mailOn={await mailOn()} joinRequests={joinRequests} joinDomain={team.joinDomain} myDomain={who?.verifiedEmail?.split("@")[1] ?? null} contacts={contacts} />
      <TeamScreen people={people.filter((p) => !p.contact)} contacts={contacts} groups={groups.filter((g) => !g.everyone)} canEdit={canEdit} viewer={viewer} away={away ?? []} />
    </>
  );
}

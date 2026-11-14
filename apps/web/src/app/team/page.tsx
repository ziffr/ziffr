import { currentWorkspaceId, viewerId } from "@/lib/viewer";
import { getPeopleIn, getProfiles } from "@/lib/data";
import { getGroups } from "@/lib/access";
import { PageHeader } from "@/components/page-header";
import { TeamScreen } from "./screen";
import { Members } from "./members";
import { AccessKeys } from "./keys";
import { listAccessKeys } from "@ziffr/core/access-keys";
import { accessLog } from "@ziffr/core/access-log";
import { isDemo } from "@/lib/auth";
import { currentActor } from "@/lib/viewer";
import { teamView } from "@ziffr/core/page-data";
import { signedIn } from "@/lib/auth";
import { openInvitations, openJoinRequests } from "@ziffr/core/invitations";
import { mailEnabled } from "@ziffr/core/mail";
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
  // The demo has no Access Keys: a key there would act as a made-up person for anyone.
  const keys = (await isDemo()) ? null : await listAccessKeys(actor);
  // Each key's recent calls, for the same people who see the key (its creator, Owners and Admins): the Access Log.
  const logs = keys ? Object.fromEntries(await Promise.all(keys.map(async (k) => [k.id, await accessLog(actor, k.id, 20)] as const))) : {};
  const members = people.filter((p) => !p.contact).map((p) => ({ id: p.id, name: p.name, role: (team.roles.find((r) => r.user_id === p.id)?.role ?? "member") as WorkspaceRoleName }));
  // Away dates of this workspace's people only (teamView); nobody else's reach the browser.
  const away = team.away;
  return (
    <>
      <PageHeader title="Team" sub="The people in this workspace and their groups. Share with a group, or limit a question to one, and whoever joins later is included. Everyone in the workspace is a group of its own: all members except guests." />
      <Members viewer={viewer} members={members} canEdit={canEdit} isOwner={actor.role === "owner"} invitations={invitations} mailOn={mailEnabled()} joinRequests={joinRequests} joinDomain={team.joinDomain} myDomain={who?.verifiedEmail?.split("@")[1] ?? null} contacts={contacts} />
      {keys && <AccessKeys keys={keys} logs={logs} people={Object.fromEntries(people.map((p) => [p.id, p.name]))} viewer={viewer} isOwner={actor.role === "owner"} canCreate={actor.role !== "guest"} />}
      <TeamScreen people={people.filter((p) => !p.contact)} contacts={contacts} groups={groups.filter((g) => !g.everyone)} canEdit={canEdit} viewer={viewer} away={away ?? []} />
    </>
  );
}

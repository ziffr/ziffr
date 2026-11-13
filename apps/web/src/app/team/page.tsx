import { currentWorkspaceId, viewerId } from "@/lib/viewer";
import { db } from "@/lib/db";
import { getPeopleIn, getProfiles } from "@/lib/data";
import { getGroups } from "@/lib/access";
import { PageHeader } from "@/components/page-header";
import { TeamScreen } from "./screen";

export default async function TeamPage() {
  const viewer = await viewerId();
  const [people, groups, { data: me }] = await Promise.all([getProfiles(), getGroups(), db.from("memberships").select("role").eq("workspace_id", await currentWorkspaceId()).eq("user_id", viewer).maybeSingle()]);
  const canEdit = me?.role === "owner" || me?.role === "admin";
  // A Contact's email, Slack handle and phone go only to owners and admins, who keep them.
  const contacts = (canEdit ? await getPeopleIn(await currentWorkspaceId(), { contactDetails: true }) : people).filter((p) => p.contact);
  // Away dates of this workspace's people only; nobody else's reach the browser.
  const { data: away } = await db.from("away").select("*").in("user_id", people.map((p) => p.id));
  return (
    <>
      <PageHeader title="Team" sub="The people in this workspace and their groups. Share with a group, or limit a question to one, and whoever joins later is included. Everyone in the workspace is a group of its own: all members except guests." />
      <TeamScreen people={people.filter((p) => !p.contact)} contacts={contacts} groups={groups.filter((g) => !g.everyone)} canEdit={canEdit} viewer={viewer} away={away ?? []} />
    </>
  );
}

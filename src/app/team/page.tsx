import { viewerId } from "@/lib/viewer";
import { db } from "@/lib/db";
import { getProfiles } from "@/lib/data";
import { getGroups } from "@/lib/access";
import { PageHeader } from "@/components/page-header";
import { TeamScreen } from "./screen";

export default async function TeamPage() {
  const viewer = await viewerId();
  const [people, groups, { data: me }] = await Promise.all([getProfiles(), getGroups(), db.from("profiles").select("is_owner").eq("id", viewer).single()]);
  return (
    <>
      <PageHeader title="Team" sub="The people in this workspace and their groups. Share with a group, or limit a question to one, and whoever joins later is included." />
      <TeamScreen people={people} groups={groups} canEdit={Boolean(me?.is_owner)} />
    </>
  );
}

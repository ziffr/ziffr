// Users (spec 0066; GLOSSARY: User, Blocked User, Installation Admin): everyone who signed up at this Installation,
// for its Installation Admins only. Account facts and how many Workspaces each belongs to; the core checks the admin
// and every action again.
import { installationUsers } from "@ziffr/core/installation-users";
import { PageHeader } from "@/components/page-header";
import { panelPageActor } from "@/lib/installation";
import { PanelPager, PanelSearch } from "../panel-list";
import { PanelNav } from "../panel-nav";
import { UserList } from "./list";

const PATH = "/installation/users";

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const actor = await panelPageActor(PATH);
  const query = await searchParams;
  const users = await installationUsers(actor, { search: query.q, page: query.page });
  return (
    <>
      <PageHeader title="Users" sub="Everyone who signed up at this Ziffr: their account, never what is in a Workspace. Only Installation Admins see this page." />
      <PanelNav current="users" />
      <PanelSearch path={PATH} search={users.search} label="Search by name or email address" />
      {users.rows.length ? <UserList users={users.rows} /> : <p className="text-sm">{users.search ? "No User matches this search." : "Nobody has signed up yet."}</p>}
      <PanelPager path={PATH} noun={["User", "Users"]} total={users.total} page={users.page} pages={users.pages} search={users.search} />
    </>
  );
}

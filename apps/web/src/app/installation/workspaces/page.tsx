// Workspaces (spec 0066; GLOSSARY: Workspace, Trial Workspace, Workspace Limit, Installation Admin): every Workspace's
// name, Owners, kind, dates, limit and counts, for Installation Admins only. Nothing a Workspace holds is read; the core
// checks the admin and every change again.
import { installationWorkspaces, TRIAL_EXTEND_MAX_DAYS } from "@ziffr/core/installation-workspaces";
import { PageHeader } from "@/components/page-header";
import { panelPageActor } from "@/lib/installation";
import { PanelPager, PanelSearch } from "../panel-list";
import { PanelNav } from "../panel-nav";
import { WorkspaceList } from "./list";

const PATH = "/installation/workspaces";

export default async function WorkspacesPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const actor = await panelPageActor(PATH);
  const query = await searchParams;
  const workspaces = await installationWorkspaces(actor, { search: query.q, page: query.page });
  return (
    <>
      <PageHeader title="Workspaces" sub="Each Workspace's name, Owners, kind, limit and counts, never what it holds. The demo and Practice Workspaces are not listed. Only Installation Admins see this page." />
      <PanelNav current="workspaces" />
      <PanelSearch path={PATH} search={workspaces.search} label="Search by Workspace name, or an Owner's name or email address" />
      {workspaces.limitsPinned && <p className="mb-3 max-w-[62ch] text-sm text-muted-foreground">Workspace Limits are set by Ziffr Cloud on this Installation, so they cannot be changed here.</p>}
      {workspaces.rows.length
        ? <WorkspaceList workspaces={workspaces.rows} pinned={workspaces.limitsPinned} maxDays={TRIAL_EXTEND_MAX_DAYS} />
        : <p className="text-sm">{workspaces.search ? "No Workspace matches this search." : "No Workspaces yet."}</p>}
      <PanelPager path={PATH} noun={["Workspace", "Workspaces"]} total={workspaces.total} page={workspaces.page} pages={workspaces.pages} search={workspaces.search} />
    </>
  );
}

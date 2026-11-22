// Workspace Export in the workspace settings (spec 0040, ticket 8; GLOSSARY: Workspace Export): the Workspace as one
// file, for its Owner to keep or to run on another Ziffr. Shows what the file will hold and what it leaves out before
// the download; the download itself is /settings/export/download. Owner only, and never the demo.
import { notFound } from "next/navigation";
import { sessionStartedAt } from "@/lib/session-start";
import { PageHeader } from "@/components/page-header";
import { WorkspaceExportButton } from "@/components/workspace-export-button";
import { isDemo } from "@/lib/auth";
import { currentActor } from "@/lib/viewer";
import { Forbidden } from "@ziffr/core/actor";
import { previewWorkspaceExport, workspaceExportState } from "@ziffr/core/workspace-export";

const SUB = "Everything you may see in this Workspace as one file: its Metrics and their values, dashboards, decks, Workflows, Themes, Groups and Shares, and its people as invitations.";
const WHAT: [keyof Awaited<ReturnType<typeof previewWorkspaceExport>>["counts"], string, string][] = [
  ["metric", "Metric", "Metrics"], ["dashboard", "dashboard", "dashboards"], ["deck", "deck", "decks"], ["workflow", "Workflow", "Workflows"], ["theme", "Theme", "Themes"],
  ["person", "person to invite", "people to invite"], ["group", "Group", "Groups"], ["share", "Share", "Shares"],
];

export default async function WorkspaceExportPage() {
  if (await isDemo()) return (<><PageHeader title="Workspace Export" sub={SUB} /><p className="text-sm text-muted-foreground">The demo can&apos;t be exported.</p></>);
  // Someone who is not a member of this Workspace finds nothing here.
  const actor = await currentActor().catch(() => notFound());
  let preview, state;
  try {
    [preview, state] = await Promise.all([previewWorkspaceExport(actor), workspaceExportState(actor, { sessionStartedAt: await sessionStartedAt() })]);
  } catch (e) {
    if (!(e instanceof Forbidden)) throw e;
    return (<><PageHeader title="Workspace Export" sub={SUB} /><p className="text-sm text-muted-foreground">Only the Workspace&apos;s Owner downloads a Workspace Export.</p></>);
  }
  return (
    <>
      <PageHeader title="Workspace Export" sub={SUB} />
      <div className="max-w-2xl space-y-8 text-sm">
        <section className="space-y-2">
          <p>The file is for another Ziffr to read as a new Workspace, or for you to keep. It is made while you download it, and Ziffr keeps no copy. <strong className="font-medium">It holds every value in the clear: keep it as private as the Workspace.</strong></p>
          <p className="text-muted-foreground">People are in it as invitations that send nothing until the new Owner chooses to. It holds no Access Key, Feed Key, Webhook address or secret and no Connector link: make those again where you run it. It holds what you may see, so a Metric nobody shared with you is not in it.</p>
        </section>
        <section aria-labelledby="holds-h" className="space-y-2">
          <h2 id="holds-h" className="text-base font-semibold">What it will hold</h2>
          <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
            {WHAT.map(([k, one, many]) => <li key={k}>{preview.counts[k].toLocaleString("en")} {preview.counts[k] === 1 ? one : many}</li>)}
          </ul>
          <p className="text-muted-foreground">With every value, Target Series point and Projection of those Metrics.</p>
        </section>
        {preview.leftOut.length > 0 && (
          <section aria-labelledby="left-h" className="space-y-2">
            <h2 id="left-h" className="text-base font-semibold">What stays out</h2>
            <p className="text-muted-foreground">The file keeps to what its format can carry. Nothing is cut short: what does not fit is left out, and said here.</p>
            <ul className="divide-y divide-border rounded-[var(--radius-card)] border border-border">
              {preview.leftOut.map((l, i) => (
                <li key={i} className="px-3 py-2"><span className="font-medium">{l.what}: {l.name}.</span> <span className="text-muted-foreground">{l.why}</span></li>
              ))}
            </ul>
          </section>
        )}
        <section className="space-y-3 border-t border-border pt-6">
          {state.signedInRecently
            ? <p className="text-muted-foreground">You signed in within the last 10 minutes, so you can download it now.</p>
            : <p className="text-muted-foreground">A Workspace Export asks for a sign-in from the last 10 minutes. Sign in again, and you come back here to download it.</p>}
          <WorkspaceExportButton signedInRecently={state.signedInRecently} />
        </section>
      </div>
    </>
  );
}

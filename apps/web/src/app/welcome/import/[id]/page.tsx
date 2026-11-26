// The progress page of an import (spec 0040, ticket 9; GLOSSARY: Workspace Export): where the job is, what it made, and
// at the end either the new Workspace or the first problem of the file with its line. Only the person who started it.
// Everything shown from the file (the Workspace's name, a problem naming a Metric) is text, escaped by the page.
import { notFound, redirect } from "next/navigation";
import { personFor, sessionUser } from "@/lib/auth";
import { importStatus } from "@ziffr/core/workspace-import";
import { AuthHeading, AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { openImported } from "@/app/workspace-import-actions";
import { Refresh } from "./refresh";
import { DesktopOnly } from "@/components/desktop-only";

const COUNTS: [string, string][] = [["groups", "Groups"], ["themes", "Themes"], ["people", "People, kept as invitations"], ["metrics", "Metrics"], ["values", "Values"], ["targets", "Target Series points"], ["projections", "Projections"], ["dashboards", "Dashboards"], ["decks", "Decks"], ["workflows", "Workflows"], ["shares", "Shares"]];

export default async function ImportProgress({ params }: { params: Promise<{ id: string }> }) {
  const user = await sessionUser();
  if (!user) redirect("/login");
  const job = await importStatus(await personFor(user), (await params).id);
  if (!job) notFound();
  const running = job.status !== "done" && job.status !== "failed";
  const shown = COUNTS.filter(([k]) => Number((job.counts as Record<string, number>)[k] ?? 0) > 0);
  return (
    <AuthShell>
      {running && <Refresh />}
      <DesktopOnly path={`/welcome/import/${job.id}`} />
      <AuthHeading title={job.status === "done" ? "Your Workspace is ready" : job.status === "failed" ? "The import did not work" : "Importing a Workspace"}>
        {job.status === "failed" ? "Nothing was kept: no Workspace and no key were left behind." : job.status === "done" ? "Everything the file holds is in a new Workspace, sealed under its own key." : `${job.status === "uploading" ? "Receiving the file" : job.status === "checking" ? "Checking the whole file first" : "Writing the Workspace"}. You can leave this page open or come back to it.`}
      </AuthHeading>
      {job.workspaceName && <p className="mb-3 text-sm">Workspace: <strong>{job.workspaceName}</strong></p>}
      {running && (
        <div className="space-y-2 text-sm" aria-live="polite">
          <p>{job.step}</p>
          <progress className="w-full" max={job.recordsTotal ?? undefined} value={job.recordsTotal ? job.recordsDone : undefined} aria-label="Records read">{job.recordsDone}</progress>
          <p className="text-muted-foreground">{job.recordsDone.toLocaleString("en")}{job.recordsTotal ? ` of ${job.recordsTotal.toLocaleString("en")}` : ""} lines read</p>
        </div>
      )}
      {job.status === "failed" && <p role="alert" className="rounded-[var(--radius-card)] border border-destructive/40 p-3 text-sm">{job.problem}</p>}
      {job.status === "done" && (
        <div className="space-y-3 text-sm">
          <ul className="space-y-1">{shown.map(([k, label]) => <li key={k}>{Number((job.counts as Record<string, number>)[k]).toLocaleString("en")} {label}</li>)}</ul>
          {(job.counts.derivedValuesSkipped ?? 0) > 0 && <p className="text-muted-foreground">{job.counts.derivedValuesSkipped} values of computed Metrics were not imported: Ziffr computes them again.</p>}
          {(job.counts.tagsLeftOut ?? 0) > 0 && <p className="text-muted-foreground">{job.counts.tagsLeftOut} Tags did not fit a limit and were left off.</p>}
          <p className="text-muted-foreground">The people of the file are on the Team page as invitations that have not been sent. Metrics are yours; they pass to the people who owned them when those join. Decks are laid out when you first open them.</p>
          <form action={openImported}><input type="hidden" name="id" value={job.id} /><Button type="submit" className="w-full">Open the Workspace</Button></form>
        </div>
      )}
      {job.status === "failed" && <p className="mt-4 text-sm"><Link className="underline" href="/welcome/import">Try another file</Link></p>}
    </AuthShell>
  );
}

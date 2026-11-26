// New Workspace > From a Workspace Export (spec 0040, ticket 9; GLOSSARY: Workspace Export): the page that takes the
// file. Not offered on hosted Ziffr, where a new Workspace is a trial.
import { redirect } from "next/navigation";
import { isDemo, personFor, sessionUser } from "@/lib/auth";
import { importOffered, latestImport } from "@ziffr/core/workspace-import";
import { AuthHeading, AuthShell } from "@/components/auth-shell";
import { ImportForm } from "./form";
import { DesktopOnly } from "@/components/desktop-only";
import Link from "next/link";

export default async function ImportPage() {
  if (await isDemo()) redirect("/");
  const user = await sessionUser();
  if (!user) redirect("/login");
  if (!importOffered()) redirect("/welcome");
  const running = await latestImport(await personFor(user));
  // One import at a time: one that runs is followed, not started again.
  if (running && (running.status !== "done" && running.status !== "failed")) redirect(`/welcome/import/${running.id}`);
  return (
    <AuthShell>
      <DesktopOnly path="/welcome/import" />
      <AuthHeading title="From a Workspace Export">Choose the file you downloaded from another Ziffr. It becomes a new Workspace, and you are its Owner. The file is as private as the Workspace was: Ziffr reads it once and does not keep it.</AuthHeading>
      <ImportForm />
      <p className="mt-6 text-sm text-muted-foreground">People in the file are not invited yet: you invite them when you are ready. <Link className="underline" href="/welcome?another=1">Start an empty Workspace instead</Link></p>
    </AuthShell>
  );
}

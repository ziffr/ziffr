import { redirect } from "next/navigation";
import { isDemo, personFor, sessionUser, signedIn } from "@/lib/auth";
import { joinableWorkspaces } from "@ziffr/core/invitations";
import { AskToJoin } from "./ask";
import { myWorkspaces } from "@/lib/viewer";
import { WelcomeForm } from "./form";
import { whatThisZiffrOffers } from "@ziffr/core/what-works-here";
import { AuthHeading, AuthShell } from "@/components/auth-shell";
import { importOffered } from "@ziffr/core/workspace-import";
import Link from "next/link";

export default async function WelcomePage({ searchParams }: { searchParams: Promise<{ another?: string }> }) {
  if (await isDemo()) redirect("/");
  const user = await sessionUser();
  if (!user) redirect("/login");
  // Someone who has a workspace comes here only to start another one.
  if ((await myWorkspaces(await personFor(user))).length && !(await searchParams).another) redirect("/");
  const who = await signedIn();
  const joinable = who ? await joinableWorkspaces(who) : [];
  // On a Ziffr that offers trials (spec 0021), every workspace is a trial: say what that means before it is made.
  const trial = (await whatThisZiffrOffers()).trial;
  if (trial) {
    return (
      <AuthShell>
        <AuthHeading title="Start your trial">
          A Trial Workspace for you alone. It starts with one Metric, Cups of coffee, a Workflow that asks you for it each day and a small dashboard, so you can try how values arrive by email, Slack, Telegram, an assistant or a program. Nothing in it is made up: the first value is yours. Nobody else can be invited, and nothing is sent to anyone but you. It ends after {trial.days} days and is then deleted with everything in it.
        </AuthHeading>
        <WelcomeForm />
      </AuthShell>
    );
  }
  return (
    <AuthShell>
      {joinable.length > 0 && <AskToJoin workspaces={joinable} />}
      <AuthHeading title="Start a workspace">A workspace holds your metrics, dashboards and decks. You become its owner and can invite others. If a colleague already uses Ziffr, ask them to invite you instead.</AuthHeading>
      <WelcomeForm />
      {importOffered() && <p className="mt-6 text-sm text-muted-foreground">Coming from another Ziffr? <Link className="underline" href="/welcome/import">Start from a Workspace Export</Link></p>}
    </AuthShell>
  );
}

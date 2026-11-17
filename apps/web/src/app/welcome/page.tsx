import { redirect } from "next/navigation";
import { isDemo, personFor, sessionUser, signedIn } from "@/lib/auth";
import { joinableWorkspaces } from "@ziffr/core/invitations";
import { AskToJoin } from "./ask";
import { myWorkspaces } from "@/lib/viewer";
import { WelcomeForm } from "./form";
import { whatThisZiffrOffers } from "@ziffr/core/what-works-here";

export default async function WelcomePage({ searchParams }: { searchParams: Promise<{ another?: string }> }) {
  if (await isDemo()) redirect("/");
  const user = await sessionUser();
  if (!user) redirect("/login");
  // Someone who has a workspace comes here only to start another one.
  if ((await myWorkspaces(await personFor(user))).length && !(await searchParams).another) redirect("/");
  const who = await signedIn();
  const joinable = who ? await joinableWorkspaces(who) : [];
  // On a Ziffr that offers trials (spec 0021), every workspace is a trial: say what that means before it is made.
  const trial = whatThisZiffrOffers().trial;
  if (trial) {
    return (
      <div className="mx-auto mt-16 max-w-sm">
        <h1 className="text-[length:var(--text-2xl)] leading-tight">Start your trial</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          A Trial Workspace for you alone. It starts with made-up Metrics, a dashboard and a Workflow that asks you, so you can try how values arrive by email, Slack, Telegram, an assistant or a program. Nobody else can be invited, and nothing is sent to anyone but you. It ends after {trial.days} days and is then deleted with everything in it.
        </p>
        <WelcomeForm />
      </div>
    );
  }
  return (
    <div className="mx-auto mt-16 max-w-sm">
      {joinable.length > 0 && <AskToJoin workspaces={joinable} />}
      <h1 className="text-[length:var(--text-2xl)] leading-tight">Start a workspace</h1>
      <p className="mt-2 text-sm text-muted-foreground">A workspace holds your metrics, dashboards and decks. You become its owner and can invite others. If a colleague already uses Ziffr, ask them to invite you instead.</p>
      <WelcomeForm />
    </div>
  );
}

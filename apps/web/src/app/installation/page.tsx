// Installation settings (spec 0025, tickets #196 and #197; GLOSSARY: Installation Settings, Installation Admin): for
// the people who run this Installation and nobody else. While it has no Installation Admin, a signed-in person can
// claim it here with the setup code from the server log; once it has one, anyone else gets "not found".
import { notFound, redirect } from "next/navigation";
import { installationAdmins, installationClaimed, installationEvents, isInstallationAdmin, prepareSetupCode } from "@ziffr/core/installation-admins";
import { installationSettingsView } from "@ziffr/core/installation-settings";
import { workspaceLimitRows } from "@ziffr/core/workspace-limits-admin";
import { PageHeader } from "@/components/page-header";
import { installationActor } from "@/lib/installation";
import { ClaimForm } from "./claim";
import { InstallationScreen } from "./screen";

export default async function InstallationPage() {
  const actor = await installationActor();
  if (!actor) redirect("/login?next=/installation");
  if (await isInstallationAdmin(actor)) {
    const [view, admins, events, limits] = await Promise.all([installationSettingsView(actor), installationAdmins(actor), installationEvents(actor, 20), workspaceLimitRows(actor)]);
    return (
      <>
        <PageHeader title="Installation settings" sub="What this Ziffr talks to, set up here instead of in the server's settings file. Only Installation Admins see this page." />
        <InstallationScreen view={view} admins={admins} events={events} limits={limits} />
      </>
    );
  }
  // Someone else on an Installation that is run already: the page is not there for them.
  if (await installationClaimed()) notFound();
  // The code printed at start may be gone from the log: opening this page prints one if none waits.
  await prepareSetupCode({ fresh: false });
  return (
    <>
      <PageHeader title="Claim this Installation" sub="Nobody runs this Ziffr on the page yet. Whoever can read the server's log can become its first Installation Admin." />
      <ClaimForm />
    </>
  );
}

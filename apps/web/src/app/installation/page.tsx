// Installation settings (spec 0025, tickets #196 and #197; GLOSSARY: Installation Settings, Installation Admin): for
// the people who run this Installation and nobody else. While it has no Installation Admin, a signed-in person can
// claim it here with the setup code from the server log; once it has one, anyone else gets "not found".
import { notFound, redirect } from "next/navigation";
import { installationAdmins, installationClaimed, installationEvents, isInstallationAdmin, prepareSetupCode } from "@ziffr/core/installation-admins";
import { installationAnnouncements } from "@ziffr/core/installation-announcements";
import { installationSettingsView } from "@ziffr/core/installation-settings";
import { inboundMx, replyTestStatus } from "@ziffr/core/installation-replies";
import { installationUsage, usageExclusionChoices, usageKeyInfo } from "@ziffr/core/installation-usage";
import { keyProgress } from "@ziffr/core/workspace-key-progress";
import { workspaceLimitRows } from "@ziffr/core/workspace-limits-admin";
import { PageHeader } from "@/components/page-header";
import { installationActor, ziffrVersion } from "@/lib/installation";
import { ClaimForm } from "./claim";
import { feedbackPromptWords } from "@ziffr/core/feedback-prompt";
import { InstallationScreen } from "./screen";

export default async function InstallationPage() {
  const actor = await installationActor();
  if (!actor) redirect("/login?next=/installation");
  if (await isInstallationAdmin(actor)) {
    const version = ziffrVersion();
    const [view, admins, events, limits, mx, replyTest, usageKey, usageDays, leaveOut, encryption] = await Promise.all([installationSettingsView(actor), installationAdmins(actor), installationEvents(actor, 20), workspaceLimitRows(actor), inboundMx(actor), replyTestStatus(actor), usageKeyInfo(actor), installationUsage(actor), usageExclusionChoices(actor), keyProgress(actor)]);
    const feedback = await feedbackPromptWords(actor);
    const announcements = await installationAnnouncements(actor);
    return (
      <>
        <PageHeader title="Installation settings" sub={`What this Ziffr talks to, set up here instead of in the server's settings file. Only Installation Admins see this page.${version ? ` This is Ziffr ${version}.` : ""}`} />
        <InstallationScreen view={view} admins={admins} events={events} limits={limits} replies={{ mx, test: replyTest }} usage={{ key: usageKey, days: usageDays, leaveOut }} encryption={encryption} feedback={feedback} announcements={announcements} />
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

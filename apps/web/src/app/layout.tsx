import { headers } from "next/headers";
import type { Metadata, Viewport } from "next";
import "./globals.css";
import { dueValueCount, getPeopleIn, getProfiles } from "@/lib/data";
import { currentActor, currentWorkspaceId, myWorkspaces, viewerId } from "@/lib/viewer";
import { isDemo, personFor, sessionUser } from "@/lib/auth";
import { demoEnabled } from "@/lib/demo-mode";
import { settingsGroups, workspaceTree } from "@/lib/settings-links";
import { GuideLink } from "@/components/nav-parts";
import { AppShell } from "@/components/app-shell";
import { sidebarCollapsed } from "@/lib/sidebar-state";
import { guideHref } from "@/lib/user-guide";
import { ViewAs } from "@/components/view-as";
import { demoRoles } from "@ziffr/core/team";
import { can } from "@ziffr/core/actor";
import { Tour } from "@/components/tour";
import { FeedbackPrompt } from "@/components/feedback-prompt";
import { feedbackPromptFor } from "@ziffr/core/feedback-prompt";
import { hostedByCloud } from "@ziffr/core/installation-days";
import { settingsInEffect } from "@ziffr/core/settings-in-effect";
import { pinnedDashboards } from "@ziffr/core/pinned-dashboards";
import { whatThisZiffrOffers } from "@ziffr/core/what-works-here";
import { isInstallationAdmin } from "@ziffr/core/installation-admins";
import { trialStatus } from "@ziffr/core/trial-end";
import { workspaceExportState } from "@ziffr/core/workspace-export";
import { sessionStartedAt } from "@/lib/session-start";
import { TrialBar, TrialBarForMembers, TrialEnded, TrialEndedForMembers } from "@/components/trial-bar";
import { reachedWords, trialUsage, usageLine } from "@ziffr/core/trial-usage";
import { setupLine } from "@ziffr/core/setup-guide";
import { SetupLine } from "@/components/setup-line";
import { OverLimitBar } from "@/components/over-limit-bar";
import { overLimitBanner, sizeAndUsage } from "@ziffr/core/workspace-usage";
import { Suspense } from "react";
import { Toaster } from "@/components/ui/sonner";
import { DemoRefusalLinks } from "@/components/demo-refusal";
import { DemoResetLine } from "@/components/demo-reset-line";
import { AnnouncementLine } from "@/components/announcement-line";
import { DEMO_RESET_ANNOUNCEMENT, announcementScope, announcementsFor, fromInstallation } from "@/lib/announcements";
import { shellOrder } from "@/lib/announcement-state";
import { activeInstallationAnnouncements } from "@ziffr/core/installation-announcements";
import { openFirstSteps } from "@ziffr/core/first-steps";
import { FIRST_STEPS_PATH } from "@ziffr/core/first-steps-screens";
import { FirstStepsLine } from "@/components/first-steps-line";
import { activeWorkspaceAnnouncements } from "@ziffr/core/workspace-announcements";
import { DemoVisitPrefs } from "@/components/demo-visit-prefs";
import { switchableDashboards } from "@ziffr/core/home";
import { demoChangesInEffect } from "@ziffr/core/demo-reset-decision";
import { demoLineFacts } from "@ziffr/core/demo-line";
import { LegalFooter } from "@/components/legal-footer";
import { QuickLookHost } from "@/components/metric-quick-look";
import { MetricActionsHost } from "@/components/metric-actions-panel";
import { ServiceWorker } from "@/components/service-worker";
import { APP_COLOURS } from "@/lib/app-colours";
import { appearanceFor, appearanceForPerson } from "@/lib/appearance";
import { PracticeBar } from "@/components/practice-bar";
import { SlideOverProvider } from "@/components/slide-over-host";
import { atAdminAddress, signedInActor } from "@/lib/installation";
import { installationHref } from "@ziffr/core/admin-address";
import { SITE_URL } from "@/lib/sign-in";
import { signOut } from "@/app/auth-actions";
import { isPracticeWorkspace } from "@ziffr/core/practice";

export const metadata: Metadata = {
  title: "Ziffr",
  description: "Ziffr keeps the record of your numbers: define any number you care about, collect its values from people and systems, and see, share and discuss them over time. A metric tracker for anyone.",
  // Installable (#143): manifest.ts is linked by Next itself; iOS reads its own tags for "Add to Home Screen".
  icons: { icon: [{ url: "/icons/icon.svg", type: "image/svg+xml" }], apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Ziffr", statusBarStyle: "default" },
};

/** The browser's colour around the page (address bar, installed app's title bar), as the manifest's. */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: APP_COLOURS.background },
    { media: "(prefers-color-scheme: dark)", color: APP_COLOURS.backgroundDark },
  ],
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // A View Link page gets the page and nothing of the app around it.
  if ((await headers()).get("x-ziffr-view-link") === "1") {
    return (
      <html lang="en">
        <head>
          <link href="https://api.fontshare.com/v2/css?f[]=general-sans@400,500,600&display=swap" rel="stylesheet" />
          {/* eslint-disable-next-line @next/next/no-page-custom-font */}
          <link href="https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400&display=swap" rel="stylesheet" />
        </head>
        <body className="min-h-screen bg-background font-sans antialiased">{children}<LegalFooter /></body>
      </html>
    );
  }
  // The Admin Address (spec 0066) serves only signing in and the Installation's pages: no Workspace, nothing of the app.
  if (await atAdminAddress()) {
    const who = await signedInActor();
    return (
      <Plain appearance={await appearanceForPerson(who?.personId ?? null)} actions={
        <>
          <a href={SITE_URL} className={PLAIN_LINK}>Open Ziffr</a>
          <a href={`${SITE_URL}${guideHref()}/installation-settings`} className={PLAIN_LINK}>User guide</a>
          {who && <form action={signOut}><button type="submit" className={PLAIN_LINK}>Sign out</button></form>}
        </>
      }>{children}</Plain>
    );
  }
  // Signed out, or signed in without a workspace yet: the page (login, welcome, a form link) and only the name.
  const demo = await isDemo();
  const user = demo ? null : await sessionUser();
  const person = user ? await personFor(user) : null;
  const workspaces = person ? await myWorkspaces(person) : [];
  // First Steps (spec 0067) draws its own frame, before a Workspace exists and after, and so does "Use this pack"
  // (spec 0068) for someone who has a Workspace.
  const asks = await headers();
  const usesPack = workspaces.length > 0 && asks.get("x-ziffr-use-pack") === "1";
  if (!demo && (asks.get("x-ziffr-first-steps") === "1" || usesPack)) {
    const lines = user ? fromInstallation(await activeInstallationAnnouncements({ demo: false })) : [];
    // A Practice Workspace says so on every page (spec 0063), also in this frame; First Steps never runs in one.
    const practice = usesPack && (await isPracticeWorkspace(await currentWorkspaceId()).catch(() => false));
    const startOver = practice && person && (await isInstallationAdmin({ personId: person })) ? installationHref("/installation#practice") : null;
    return (
      <Plain bare appearance={await appearanceForPerson(person)} actions={null}
        lines={<>
          {lines.length > 0 && <AnnouncementLine items={shellOrder([], lines, false)} scope={await announcementScope(false)} />}
          {practice && <PracticeBar fullLoad startOver={startOver} />}
        </>}>
        {children}
      </Plain>
    );
  }
  if (!demo && !workspaces.length) {
    // Signed in without a Workspace yet: the Installation's lines still show (the same read as the shell, nothing of a person).
    const lines = user ? fromInstallation(await activeInstallationAnnouncements({ demo: false })) : [];
    return (
      <Plain appearance={await appearanceForPerson(person)} actions={<GuideLink href={guideHref()} className={PLAIN_LINK}>User guide</GuideLink>}
        lines={lines.length > 0 && <AnnouncementLine items={shellOrder([], lines, false)} scope={await announcementScope(false)} />}>
        {children}
      </Plain>
    );
  }
  const [shown, viewer] = await Promise.all([getProfiles(), viewerId()]);
  const [workspaceId, actor] = await Promise.all([currentWorkspaceId(), currentActor()]);
  const { role } = actor;
  // The demo's Viewing as picker offers all its made-up people, also while viewing as its Guest.
  const profiles = demo ? await getPeopleIn(workspaceId) : shown;
  // A Practice Workspace (spec 0063) says so on every page; nothing of the Setup Guide or feedback is offered there.
  const practice = demo ? false : await isPracticeWorkspace(workspaceId).catch(() => false);
  // A Trial Workspace (spec 0021): its days left on every page, and once it has ended, only the screen that says so.
  const trial = demo ? null : await trialStatus(workspaceId, actor.role);
  // What the trial has used of its limits (spec 0040): Owners and Admins only, counts of this Workspace alone.
  const usageRows = trial && !trial.ended ? await trialUsage(actor) : null;
  const usage = usageRows ? { line: usageLine(usageRows), reached: usageRows.map(reachedWords).filter((w): w is string => w !== null) } : null;
  // Over the Workspace Limit (spec 0029): Owners and Admins see it on every page, with a way to Size and usage.
  const overLimit = !demo && (role === "owner" || role === "admin") ? overLimitBanner(await sizeAndUsage(await currentActor())) : null;
  // The Feedback Prompt (ticket #722): only a signed-in member, never the demo; the core decides, the page gets one flag.
  // The Setup Guide's line (spec 0052): only for someone it applies to (never a Guest or the demo: the core says no), and
  // only counts and a step name go to the browser. A trial that has ended shows its own screen instead.
  const setup = demo || practice || trial?.ended ? { applies: false, shown: false, done: 0, total: 0, next: null } : await setupLine(actor).catch(() => ({ applies: false, shown: false, done: 0, total: 0, next: null }));
  // First Steps (spec 0067): while its Owner has a step left, the core says which; nothing for anyone else.
  const firstSteps = demo || practice || trial?.ended ? null : await openFirstSteps(actor).catch(() => null);
  const feedback = demo || practice ? null : await feedbackPromptFor(actor).catch(() => null);
  const offersTrials = demo && Boolean((await whatThisZiffrOffers()).trial);
  // Only the real person behind the session, never a demo visitor.
  const installationAdmin = person ? await isInstallationAdmin({ personId: person }) : false;
  const due = await dueValueCount();
  // Pinned dashboards (#509): only those this person may open now, with nothing but id and name.
  const pinned = await pinnedDashboards(await currentActor());
  const accountOf = demo ? null : { name: profiles.find((p) => p.id === viewer)?.name ?? "", workspaces, current: workspaceId, installationAdmin, installationHref: installationAdmin ? installationHref("/installation") : undefined, guest: role === "guest", demo: await demoEnabled(), sendFeedback: !practice && hostedByCloud(await settingsInEffect()) };
  // On a phone the demo bar is this one control; "Leave the demo" and the guided tour are in More.
  const demoControls = demo ? <ViewAs profiles={profiles.filter((p) => !p.contact)} current={viewer} roles={await demoRoles()} /> : undefined;
  // The demo saves and sends nothing (spec 0021, #271): say so on every page, and where to get it for real when this Ziffr offers trials.
  // Where visitors may change the demo (spec 0051), the line also says when it starts fresh; elsewhere it stays as it was.
  const demoChanges = demo && demoChangesInEffect(await settingsInEffect());
  const resetLine = demoChanges ? await demoLineFacts().catch(() => null) : null;
  // And pins and Home are the visit's own, kept in its browser: it is told the dashboards the person viewed as may open (id and name only).
  const visitPrefs = demoChanges ? { person: viewer, known: (await switchableDashboards(actor)).map((d) => ({ id: d.id, name: d.name })), demoPinned: pinned.map((p) => ({ id: p.id, name: p.name })) } : null;
  // The Announcement line (GLOSSARY: Announcement): the demo's built-in notice that it is shared or read-only and when it starts
  // fresh (it carries the countdown, so the screen has one notice, not two), then those an Installation Admin wrote, then those
  // an Owner or Admin of this Workspace wrote (none for a Guest or in the demo), all on now for this visit. Each is dismissable for the visit unless it cannot be; only what the line shows is sent.
  const announcements = shellOrder(announcementsFor({ demo, changes: Boolean(demoChanges), offersTrials }), fromInstallation(await activeInstallationAnnouncements({ demo })), Boolean(demoChanges), fromInstallation(await activeWorkspaceAnnouncements(actor)));
  const demoNote = announcements.length ? (
    <AnnouncementLine
      items={announcements}
      scope={await announcementScope(demo)}
      extra={resetLine ? { [DEMO_RESET_ANNOUNCEMENT]: <DemoResetLine key={`${resetLine.generation}:${resetLine.resetAt}:${resetLine.nextResetAt}`} {...resetLine} /> } : {}}
    />
  ) : null;
  const banners = (
    <>
      {practice && <PracticeBar startOver={installationAdmin ? installationHref("/installation#practice") : null} />}
      {/* Owners and Admins get the bar with counts and links; everyone else the plain words (spec 0040). */}
      {trial && !trial.ended && (role === "owner" || role === "admin"
        ? <TrialBar daysLeft={trial.daysLeft} endsAt={trial.endsAt} isOwner={role === "owner"} keeps={trial.keeps} usage={usage} />
        : <TrialBarForMembers owner={trial.ownerName} endsAt={trial.endsAt} />)}
      {/* Under the trial bar (spec 0052). */}
      {setup.shown && <SetupLine done={setup.done} total={setup.total} next={setup.next} />}
      {firstSteps && !firstSteps.hidden && <FirstStepsLine next={firstSteps.next} invitesClosed={firstSteps.invitesClosed} />}
      {overLimit && <OverLimitBar words={overLimit} />}
    </>
  );
  return (
    <html lang="en" data-appearance={await appearanceFor(actor, demo)}>
      <head>
        <link rel="preconnect" href="https://api.fontshare.com" />
        {/* App Router root layout: these load on every route. */}
        <link href="https://api.fontshare.com/v2/css?f[]=general-sans@400,500,600&display=swap" rel="stylesheet" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-screen bg-background font-sans antialiased">
        <PrefsScope visit={visitPrefs}>
        <AppShell workspace={workspaceTree(role)} settings={settingsGroups(role)} pinned={pinned} due={due} guide={guideHref()} account={accountOf} demo={demoControls} people={demo ? { profiles: profiles.filter((p) => !p.contact), current: viewer } : undefined} collapsed={await sidebarCollapsed()} setup={{ applies: setup.applies, shown: setup.shown, continueHref: firstSteps ? `${FIRST_STEPS_PATH}?step=${firstSteps.next}` : null }} banners={<>{demoNote}{banners}</>}>
          {trial?.ended ? (role === "owner" || role === "admin" ? <TrialEnded deletedAt={trial.deletedAt} cancelled={trial.cancelled} isOwner={role === "owner"} workspaceExport={role === "owner" ? await workspaceExportState(actor, { sessionStartedAt: await sessionStartedAt() }).catch(() => null) : null} /> : <TrialEndedForMembers owner={trial.ownerName} cancelled={trial.cancelled} />) : children}
        </AppShell>
        </PrefsScope>
        <LegalFooter className="border-t border-border" />
        {demo && offersTrials && <DemoRefusalLinks />}
        {feedback && <FeedbackPrompt askForStar={feedback.askForStar} />}
        {demo && <Tour key={can(actor, "create") ? "member" : "guest"} guest={!can(actor, "create")} changes={Boolean(demoChanges)} />}
        <Toaster />
        <Suspense fallback={null}><QuickLookHost /><MetricActionsHost /></Suspense>
        <ServiceWorker />
      </body>
    </html>
  );
}

/** A link or button in the header of the plain shell. */
const PLAIN_LINK = "text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline max-md:-my-3 max-md:inline-flex max-md:min-h-11 max-md:items-center";

/** The page without the app around it: Ziffr's name, a few links and the page. `bare` leaves the name, the links and
 * the page's column to the page itself. */
function Plain({ appearance, actions, lines, children, bare }: { appearance: string; actions: React.ReactNode; lines?: React.ReactNode; children: React.ReactNode; bare?: boolean }) {
  return (
    <html lang="en" data-appearance={appearance}>
      <head>
        <link href="https://api.fontshare.com/v2/css?f[]=general-sans@400,500,600&display=swap" rel="stylesheet" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-screen bg-background font-sans antialiased">
        {!bare && (
          <header className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 py-3 sm:px-6">
            <span className="text-lg font-semibold tracking-[-0.03em]">Ziffr</span>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3">{actions}</div>
          </header>
        )}
        {lines}
        {/* Pages that open a panel at the side, such as the Installation's Announcements, need its provider here too. */}
        <SlideOverProvider>
          {bare ? children : <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">{children}</main>}
        </SlideOverProvider>
        <LegalFooter />
        <Toaster />
        <ServiceWorker />
      </body>
    </html>
  );
}

/** Gives the page the visit's own pins and Home where visitors may change the demo (spec 0051); elsewhere it adds nothing. */
function PrefsScope({ visit, children }: { visit: { person: string; known: { id: number; name: string }[]; demoPinned: { id: number; name: string }[] } | null; children: React.ReactNode }) {
  return visit ? <DemoVisitPrefs {...visit}>{children}</DemoVisitPrefs> : <>{children}</>;
}

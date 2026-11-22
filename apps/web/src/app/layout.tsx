import { headers } from "next/headers";
import type { Metadata, Viewport } from "next";
import "./globals.css";
import { dueValueCount, getPeopleIn, getProfiles, openActionCount } from "@/lib/data";
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
import { pinnedDashboards } from "@ziffr/core/pinned-dashboards";
import { whatThisZiffrOffers } from "@ziffr/core/what-works-here";
import { isInstallationAdmin } from "@ziffr/core/installation-admins";
import { keptWords, trialStatus } from "@ziffr/core/trial-end";
import { workspaceExportState } from "@ziffr/core/workspace-export";
import { TrialBar, TrialEnded } from "@/components/trial-bar";
import { reachedWords, trialUsage, usageLine } from "@ziffr/core/trial-usage";
import { OverLimitBar } from "@/components/over-limit-bar";
import { overLimitBanner, sizeAndUsage } from "@ziffr/core/workspace-usage";
import { Suspense } from "react";
import { Toaster } from "@/components/ui/sonner";
import { DemoRefusalLinks } from "@/components/demo-refusal";
import { QuickLookHost } from "@/components/metric-quick-look";
import { ServiceWorker } from "@/components/service-worker";
import { APP_COLOURS } from "@/lib/app-colours";
import { appearanceFor, browserAppearance } from "@/lib/appearance";

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
        <body className="min-h-screen bg-background font-sans antialiased">{children}</body>
      </html>
    );
  }
  // Signed out, or signed in without a workspace yet: the page (login, welcome, a form link) and only the name.
  const demo = await isDemo();
  const user = demo ? null : await sessionUser();
  const person = user ? await personFor(user) : null;
  const workspaces = person ? await myWorkspaces(person) : [];
  if (!demo && !workspaces.length) {
    return (
      <html lang="en" data-appearance={await browserAppearance()}>
        <head>
          <link href="https://api.fontshare.com/v2/css?f[]=general-sans@400,500,600&display=swap" rel="stylesheet" />
          {/* eslint-disable-next-line @next/next/no-page-custom-font */}
          <link href="https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400&display=swap" rel="stylesheet" />
        </head>
        <body className="min-h-screen bg-background font-sans antialiased">
          <header className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
            <span className="text-lg font-semibold tracking-[-0.03em]">Ziffr</span>
            <GuideLink href={guideHref()} className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">User guide</GuideLink>
          </header>
          <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">{children}</main>
          <Toaster />
          <ServiceWorker />
        </body>
      </html>
    );
  }
  const [shown, viewer] = await Promise.all([getProfiles(), viewerId()]);
  const [open, workspaceId, actor] = await Promise.all([openActionCount(viewer), currentWorkspaceId(), currentActor()]);
  const { role } = actor;
  // The demo's Viewing as picker offers all its made-up people, also while viewing as its Guest.
  const profiles = demo ? await getPeopleIn(workspaceId) : shown;
  // A Trial Workspace (spec 0021): its days left on every page, and once it has ended, only the screen that says so.
  const trial = demo ? null : await trialStatus(workspaceId);
  // What the trial has used of its limits (spec 0040): Owners and Admins only, counts of this Workspace alone.
  const usageRows = trial && !trial.ended ? await trialUsage(actor) : null;
  const usage = usageRows ? { line: usageLine(usageRows), reached: usageRows.map(reachedWords).filter((w): w is string => w !== null) } : null;
  // Over the Workspace Limit (spec 0029): Owners and Admins see it on every page, with a way to Size and usage.
  const overLimit = !demo && (role === "owner" || role === "admin") ? overLimitBanner(await sizeAndUsage(await currentActor())) : null;
  // The Feedback Prompt (ticket #722): only a signed-in member, never the demo; the core decides, the page gets one flag.
  const feedback = demo ? null : await feedbackPromptFor(actor).catch(() => null);
  const offersTrials = demo && Boolean((await whatThisZiffrOffers()).trial);
  // Only the real person behind the session, never a demo visitor.
  const installationAdmin = person ? await isInstallationAdmin({ personId: person }) : false;
  const due = await dueValueCount();
  // Pinned dashboards (#509): only those this person may open now, with nothing but id and name.
  const pinned = await pinnedDashboards(await currentActor());
  const accountOf = demo ? null : { name: profiles.find((p) => p.id === viewer)?.name ?? "", workspaces, current: workspaceId, installationAdmin, guest: role === "guest", demo: await demoEnabled() };
  const demoControls = demo ? (
    <>
      <ViewAs profiles={profiles.filter((p) => !p.contact)} current={viewer} roles={await demoRoles()} />
      {/* A full page load, not a client navigation (#14): the header is drawn again without the demo. */}
      <a href="/demo/leave" className="flex h-9 items-center whitespace-nowrap rounded-[var(--radius-input)] px-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">Leave the demo</a>
    </>
  ) : undefined;
  // The demo saves and sends nothing (spec 0021, #271): say so on every page, and where to get it for real when this Ziffr offers trials.
  const demoNote = demo ? (
    <p className="px-4 pt-3 text-xs text-muted-foreground sm:px-6">
      {/* One line on a phone (#535): the short sentence, and the trial link only on bigger screens. */}
      <span className="md:hidden">The demo saves and sends nothing.</span>
      <span className="max-md:hidden">Look around as anyone: nothing you do in the demo is saved, and nothing is sent.</span>
      {offersTrials && <span className="max-md:hidden">{" "}<a href="/demo/leave" className="underline underline-offset-2 hover:text-foreground">Try it for real with a trial of your own</a>.</span>}
    </p>
  ) : null;
  const banners = (
    <>
      {trial && !trial.ended && <TrialBar daysLeft={trial.daysLeft} endsAt={trial.endsAt} kept={trial.keptAs ? keptWords(trial.endsAt, trial.keptAs) : null} usage={usage} />}
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
        <AppShell workspace={workspaceTree(role)} settings={settingsGroups(role)} pinned={pinned} due={due} open={open} guide={guideHref()} account={accountOf} demo={demoControls} people={demo ? { profiles: profiles.filter((p) => !p.contact), current: viewer } : undefined} collapsed={await sidebarCollapsed()} banners={<>{demoNote}{banners}</>}>
          {trial?.ended ? <TrialEnded deletedAt={trial.deletedAt} workspaceExport={role === "owner" ? await workspaceExportState(actor).catch(() => null) : null} /> : children}
        </AppShell>
        {demo && offersTrials && <DemoRefusalLinks />}
        {feedback && <FeedbackPrompt askForStar={feedback.askForStar} />}
        {demo && <Tour key={can(actor, "create") ? "member" : "guest"} guest={!can(actor, "create")} />}
        <Toaster />
        <Suspense fallback={null}><QuickLookHost /></Suspense>
        <ServiceWorker />
      </body>
    </html>
  );
}

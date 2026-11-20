import { headers } from "next/headers";
import type { Metadata, Viewport } from "next";
import "./globals.css";
import { getProfiles, openActionCount } from "@/lib/data";
import { currentActor, currentWorkspaceId, myWorkspaces, viewerId } from "@/lib/viewer";
import { isDemo, personFor, sessionUser } from "@/lib/auth";
import { workspaceLinks } from "@/lib/settings-links";
import { GuideLink, TopBar } from "@/components/top-bar";
import { guideHref } from "@/lib/user-guide";
import { ViewAs } from "@/components/view-as";
import { Tour } from "@/components/tour";
import { whatThisZiffrOffers } from "@ziffr/core/what-works-here";
import { isInstallationAdmin } from "@ziffr/core/installation-admins";
import { trialStatus } from "@ziffr/core/trial-end";
import { TrialBar, TrialEnded } from "@/components/trial-bar";
import { OverLimitBar } from "@/components/over-limit-bar";
import { overLimitBanner, sizeAndUsage } from "@ziffr/core/workspace-usage";
import { Toaster } from "@/components/ui/sonner";
import { ServiceWorker } from "@/components/service-worker";
import { APP_COLOURS } from "@/lib/app-colours";

export const metadata: Metadata = {
  title: "Ziffr",
  description: "A metric tracker for anyone: define any number you care about, collect its values from people and systems, and see, share and discuss them over time.",
  // Installable (#143): manifest.ts is linked by Next itself; iOS reads its own tags for "Add to Home Screen".
  icons: { icon: [{ url: "/icons/icon.svg", type: "image/svg+xml" }], apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Ziffr", statusBarStyle: "default" },
};

/** The browser's colour around the page (address bar, installed app's title bar), as the manifest's. */
export const viewport: Viewport = { themeColor: APP_COLOURS.background };

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
      <html lang="en">
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
  const [profiles, viewer] = await Promise.all([getProfiles(), viewerId()]);
  const [open, workspaceId, { role }] = await Promise.all([openActionCount(viewer), currentWorkspaceId(), currentActor()]);
  // A Trial Workspace (spec 0021): its days left on every page, and once it has ended, only the screen that says so.
  const trial = demo ? null : await trialStatus(workspaceId);
  // Over the Workspace Limit (spec 0029): Owners and Admins see it on every page, with a way to Size and usage.
  const overLimit = !demo && (role === "owner" || role === "admin") ? overLimitBanner(await sizeAndUsage(await currentActor())) : null;
  const offersTrials = demo && Boolean((await whatThisZiffrOffers()).trial);
  // Only the real person behind the session, never a demo visitor.
  const installationAdmin = person ? await isInstallationAdmin({ personId: person }) : false;
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://api.fontshare.com" />
        {/* App Router root layout: these load on every route. */}
        <link href="https://api.fontshare.com/v2/css?f[]=general-sans@400,500,600&display=swap" rel="stylesheet" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-screen bg-background font-sans antialiased">
        <TopBar
          workspace={workspaceLinks(role)}
          open={open}
          guide={guideHref()}
          account={demo ? null : { name: profiles.find((p) => p.id === viewer)?.name ?? "", workspaces, current: workspaceId, installationAdmin }}
          demo={demo ? (
            <>
              <ViewAs profiles={profiles.filter((p) => !p.contact)} current={viewer} />
              {/* A full page load, not a client navigation (#14): the header is drawn again without the demo. */}
              <a href="/demo/leave" className="flex h-9 items-center whitespace-nowrap rounded-[var(--radius-input)] px-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">Leave the demo</a>
            </>
          ) : undefined}
        />
        {/* The demo saves and sends nothing (spec 0021, #271): say so on every page, and where to get it for real when this Ziffr offers trials. */}
        {demo && (
          <p className="mx-auto max-w-7xl px-4 pt-3 text-xs text-muted-foreground sm:px-6">
            Look around as anyone: nothing you do in the demo is saved, and nothing is sent.
            {offersTrials && <>{" "}<a href="/demo/leave" className="underline underline-offset-2 hover:text-foreground">Try it for real with a trial of your own</a>.</>}
          </p>
        )}
        {trial && !trial.ended && <TrialBar daysLeft={trial.daysLeft} endsAt={trial.endsAt} />}
        {overLimit && <OverLimitBar words={overLimit} />}
        <main className="mx-auto max-w-7xl px-4 py-8 pb-32 sm:px-6">{trial?.ended ? <TrialEnded deletedAt={trial.deletedAt} /> : children}</main>
        {demo && <Tour />}
        <Toaster />
        <ServiceWorker />
      </body>
    </html>
  );
}

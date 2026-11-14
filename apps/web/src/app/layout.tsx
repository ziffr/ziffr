import { headers } from "next/headers";
import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { getProfiles, openActionCount } from "@/lib/data";
import { currentWorkspaceId, myWorkspaces, viewerId } from "@/lib/viewer";
import { isDemo, personFor, sessionUser } from "@/lib/auth";
import { AccountMenu } from "@/components/account-menu";
import { ViewAs } from "@/components/view-as";
import { NavLink } from "@/components/nav-link";
import { Tour } from "@/components/tour";
import { ResetButton } from "@/components/reset-button";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "Ziffr",
  description: "One home for your team's business numbers.",
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
      <html lang="en">
        <head>
          <link href="https://api.fontshare.com/v2/css?f[]=general-sans@400,500,600&display=swap" rel="stylesheet" />
          {/* eslint-disable-next-line @next/next/no-page-custom-font */}
          <link href="https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400&display=swap" rel="stylesheet" />
        </head>
        <body className="min-h-screen bg-background font-sans antialiased">
          <header className="mx-auto flex max-w-7xl px-4 py-3 sm:px-6"><span className="text-lg font-semibold tracking-[-0.03em]">Ziffr</span></header>
          <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">{children}</main>
          <Toaster />
        </body>
      </html>
    );
  }
  const [profiles, viewer] = await Promise.all([getProfiles(), viewerId()]);
  const [open, workspaceId] = await Promise.all([openActionCount(viewer), currentWorkspaceId()]);
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
        <header className="sticky top-0 z-30 border-b border-border bg-background">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2 sm:px-6">
            <Link href="/" className="flex items-baseline gap-2 py-1">
              <span className="text-lg font-semibold tracking-[-0.03em]">Ziffr</span>
              {demo && <span className="text-xs text-muted-foreground">demo</span>}
            </Link>
            <nav aria-label="Main" className="order-3 -mx-1.5 flex w-full flex-wrap gap-x-0.5 sm:order-none sm:mx-0 sm:w-auto sm:gap-x-1">
              <NavLink href="/dashboards">Dashboards</NavLink>
              <NavLink href="/analyze">Analyze</NavLink>
              <NavLink href="/decks">Decks</NavLink>
              <NavLink href="/metrics">Metrics</NavLink>
              <NavLink href="/workflows">Workflows</NavLink>
              <NavLink href="/connectors">Connectors</NavLink>
              <NavLink href="/team">Team</NavLink>
              <NavLink href="/activity">Activity</NavLink>
              <NavLink href="/actions">
                Actions
                {open > 0 && <span className="fig text-xs text-muted-foreground" aria-label={`${open} waiting for you`}>{open}</span>}
              </NavLink>
            </nav>
            <div className="ml-auto flex items-center gap-2">
              {demo ? (
                <>
                  <ViewAs profiles={profiles.filter((p) => !p.contact)} current={viewer} />
                  <ResetButton />
                  <Link href="/demo/leave" prefetch={false} className="flex h-9 items-center rounded-[var(--radius-input)] px-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">Leave the demo</Link>
                </>
              ) : (
                <AccountMenu name={profiles.find((p) => p.id === viewer)?.name ?? ""} workspaces={workspaces} current={workspaceId} />
              )}
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-8 pb-32 sm:px-6">{children}</main>
        {demo && <Tour />}
        <Toaster />
      </body>
    </html>
  );
}

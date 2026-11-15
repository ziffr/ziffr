import { headers } from "next/headers";
import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { getProfiles, openActionCount } from "@/lib/data";
import { currentActor, currentWorkspaceId, myWorkspaces, viewerId } from "@/lib/viewer";
import { isDemo, personFor, sessionUser } from "@/lib/auth";
import { workspaceLinks } from "@/lib/settings-links";
import { GuideLink, TopBar } from "@/components/top-bar";
import { guideHref } from "@/lib/user-guide";
import { ViewAs } from "@/components/view-as";
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
          <header className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
            <span className="text-lg font-semibold tracking-[-0.03em]">Ziffr</span>
            <GuideLink href={guideHref()} className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">User guide</GuideLink>
          </header>
          <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">{children}</main>
          <Toaster />
        </body>
      </html>
    );
  }
  const [profiles, viewer] = await Promise.all([getProfiles(), viewerId()]);
  const [open, workspaceId, { role }] = await Promise.all([openActionCount(viewer), currentWorkspaceId(), currentActor()]);
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
          account={demo ? null : { name: profiles.find((p) => p.id === viewer)?.name ?? "", workspaces, current: workspaceId }}
          demo={demo ? (
            <>
              <ViewAs profiles={profiles.filter((p) => !p.contact)} current={viewer} />
              <ResetButton />
              <Link href="/demo/leave" prefetch={false} className="flex h-9 items-center whitespace-nowrap rounded-[var(--radius-input)] px-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">Leave the demo</Link>
            </>
          ) : undefined}
        />
        <main className="mx-auto max-w-7xl px-4 py-8 pb-32 sm:px-6">{children}</main>
        {demo && <Tour />}
        <Toaster />
      </body>
    </html>
  );
}

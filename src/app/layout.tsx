import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { getProfiles, openActionCount } from "@/lib/data";
import { viewerId } from "@/lib/viewer";
import { ViewAs } from "@/components/view-as";
import { NavLink } from "@/components/nav-link";
import { Tour } from "@/components/tour";
import { ResetButton } from "@/components/reset-button";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "Ziffr (prototype)",
  description: "One home for all your numbers. A feedback prototype.",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [profiles, viewer] = await Promise.all([getProfiles(), viewerId()]);
  const open = await openActionCount(viewer);
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
              <span className="text-xs text-muted-foreground">prototype</span>
            </Link>
            <nav aria-label="Main" className="order-3 -mx-1.5 flex w-full flex-wrap gap-x-0.5 sm:order-none sm:mx-0 sm:w-auto sm:gap-x-1">
              <NavLink href="/dashboards">Dashboards</NavLink>
              <NavLink href="/analyze">Analyze</NavLink>
              <NavLink href="/metrics">Metrics</NavLink>
              <NavLink href="/sources">Sources</NavLink>
              <NavLink href="/actions">
                Actions
                {open > 0 && <span className="fig text-xs text-muted-foreground" aria-label={`${open} waiting for you`}>{open}</span>}
              </NavLink>
            </nav>
            <div className="ml-auto flex items-center gap-2">
              <ViewAs profiles={profiles} current={viewer} />
              <ResetButton />
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-8 pb-32 sm:px-6">{children}</main>
        <Tour />
        <Toaster />
      </body>
    </html>
  );
}

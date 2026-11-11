import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { getProfiles, openActionCount } from "@/lib/data";
import { viewerId } from "@/lib/viewer";
import { ViewAs } from "@/components/view-as";
import { NavLink } from "@/components/nav-link";
import { Tour } from "@/components/tour";
import { ResetButton } from "@/components/reset-button";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

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
      <body className={`${geistSans.variable} ${geistMono.variable} min-h-screen bg-muted/30 font-sans antialiased`}>
        <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
            <Link href="/" className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-lg bg-primary font-mono text-sm font-bold text-primary-foreground">Z</span>
              <span className="font-semibold">Ziffr</span>
              <span className="rounded border border-dashed border-amber-500 px-1.5 py-px font-mono text-[10px] font-semibold tracking-wide text-amber-600 uppercase">Prototype</span>
            </Link>
            <nav className="flex flex-wrap items-center gap-1">
              <NavLink href="/dashboards">Dashboards</NavLink>
              <NavLink href="/analyze">Analyze</NavLink>
              <NavLink href="/metrics">Metrics</NavLink>
              <NavLink href="/sources">Sources</NavLink>
              <NavLink href="/actions">
                Actions
                {open > 0 && <span className="rounded-full bg-primary px-1.5 text-[10px] leading-4 font-semibold text-primary-foreground">{open}</span>}
              </NavLink>
            </nav>
            <div className="ml-auto flex items-center gap-2">
              <ViewAs profiles={profiles} current={viewer} />
              <ResetButton />
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 pb-40">{children}</main>
        <Tour />
        <Toaster />
      </body>
    </html>
  );
}

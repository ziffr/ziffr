"use client";
// The app frame of the layout preview (docs/specs/0036-app-layout.md; GLOSSARY: Workspace, Action, Demo Mode): a
// sidebar that collapses to icons, the page as a raised card, ⌘K search in the sidebar, and a tab bar on phones.
// It draws the same links, counts and menus as the top bar (top-bar.tsx) from the same lists, so both always agree.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Activity, BarChart3, Blocks, ChevronsUpDown, CircleHelp, Database, FlaskConical, Hash, Inbox, KeyRound, LayoutDashboard, LogOut, MoreHorizontal, Package, Plug, Plus, Presentation, Rss, ScrollText, Search, Settings2, ShieldCheck, Users, Webhook, Workflow } from "lucide-react";
import { GuideLink, INSTALLATION, MAIN, PhoneMenu, WorkspaceChoices, YOU, type Account, type NavItem } from "@/components/top-bar";
import { OPEN_SEARCH, SearchDialog } from "@/components/search-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarHeader, SidebarInset, SidebarItem, SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { signOut } from "@/app/auth-actions";
import { cn } from "@/lib/utils";

/** An icon for each page; anything not listed gets the settings icon. */
const ICONS: Record<string, React.ReactNode> = {
  "/dashboards": <LayoutDashboard aria-hidden />,
  "/decks": <Presentation aria-hidden />,
  "/metrics": <Hash aria-hidden />,
  "/analyze": <FlaskConical aria-hidden />,
  "/settings/workspace": <Settings2 aria-hidden />,
  "/team": <Users aria-hidden />,
  "/connectors": <Plug aria-hidden />,
  "/workflows": <Workflow aria-hidden />,
  "/sources": <Database aria-hidden />,
  "/settings/packs": <Package aria-hidden />,
  "/settings/keys": <KeyRound aria-hidden />,
  "/settings/feeds": <Rss aria-hidden />,
  "/settings/webhooks": <Webhook aria-hidden />,
  "/activity": <Activity aria-hidden />,
  "/settings/usage": <BarChart3 aria-hidden />,
  "/audit": <ScrollText aria-hidden />,
};

/** Whether `path` is on the page `href` or below it; Home is a dashboard, so Dashboards covers it. */
function isOn(path: string, href: string) {
  return path === href || path.startsWith(href + "/") || (href === "/dashboards" && path === "/");
}

const sheetRow = "flex h-12 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] text-muted-foreground outline-none focus-visible:bg-muted data-[active=true]:font-medium data-[active=true]:text-foreground [&_svg]:size-5";

/** The whole frame. `demo` holds the demo's controls, `banners` the notes that sit above every page. */
export function AppShell({ workspace, open, account, guide, demo, banners, collapsed, children }: { workspace: NavItem[]; open: number; account: Account | null; guide: string; demo?: React.ReactNode; banners?: React.ReactNode; collapsed: boolean; children: React.ReactNode }) {
  const path = usePathname();
  return (
    <TooltipProvider delay={300}>
      <SidebarProvider defaultCollapsed={collapsed}>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm">Skip to the page</a>
        <SearchDialog hideButton />
        <Sidebar aria-label="Sidebar">
          <SidebarHeader>
            <WorkspaceSwitcher account={account} />
            <SidebarItem icon={<Search aria-hidden />} label="Search" tooltip="Search (Ctrl+K)" onClick={() => window.dispatchEvent(new Event(OPEN_SEARCH))} aria-keyshortcuts="Control+K Meta+K" className="border border-sidebar-border bg-background hover:bg-background" hintOnly badge={<kbd className="font-sans text-[11px] text-muted-foreground">⌘K</kbd>} />
          </SidebarHeader>
          <SidebarContent>
            <nav aria-label="Main" className="flex flex-col gap-3">
              <SidebarGroup>
                <SidebarItem render={<Link href="/actions" />} icon={<Inbox aria-hidden />} label="Actions" active={path.startsWith("/actions")} badge={open > 0 ? open : undefined} tooltip={open ? `Actions, ${open} waiting for you` : "Actions"} aria-label={open ? `Actions, ${open} waiting for you` : "Actions"} />
                {MAIN.map((l) => <SidebarItem key={l.href} render={<Link href={l.href} />} icon={ICONS[l.href]} label={l.label} active={isOn(path, l.href)} />)}
              </SidebarGroup>
              <SidebarGroup label="Workspace">
                {workspace.map((l) => <SidebarItem key={l.href} render={<Link href={l.href} />} icon={ICONS[l.href] ?? <Blocks aria-hidden />} label={l.label} active={isOn(path, l.href)} />)}
              </SidebarGroup>
            </nav>
          </SidebarContent>
          <SidebarFooter>
            <SidebarItem render={<GuideLink href={guide}>{null}</GuideLink>} icon={<CircleHelp aria-hidden />} label="User guide" active={path.startsWith("/guide")} />
            {account && <UserMenu account={account} />}
          </SidebarFooter>
        </Sidebar>
        <SidebarInset>
          <header className="flex min-h-10 flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-3 py-1 md:px-4">
            <SidebarTrigger className="hidden md:flex" />
            <Link href="/" className="text-base font-semibold tracking-[-0.03em] md:hidden">Ziffr</Link>
            {demo && <div className="ml-auto flex flex-wrap items-center gap-x-3 [&_label]:text-xs [&_select]:h-7 [&_a]:h-7 [&_a]:text-xs">{demo}</div>}
          </header>
          {banners}
          <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 pb-24 sm:px-6 md:pb-10">{children}</main>
        </SidebarInset>
        <TabBar open={open} workspace={workspace} account={account} guide={guide} />
      </SidebarProvider>
    </TooltipProvider>
  );
}

/** The top of the sidebar: which Workspace this is, and the way to switch; in the demo only its name. */
function WorkspaceSwitcher({ account }: { account: Account | null }) {
  const { collapsed } = useSidebar();
  const [pending, start] = useTransition();
  const current = account?.workspaces.find((w) => w.id === account.current);
  const name = account ? (current?.name ?? "Workspace") : "The demo";
  const tile = <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-xs font-semibold text-sidebar-primary-foreground">{account ? name[0]?.toUpperCase() : <FlaskConical className="size-3.5" />}</span>;
  const label = (
    <span className={cn("min-w-0 flex-1 text-left leading-tight", collapsed && "sr-only")}>
      <span className="block truncate text-[13px] font-medium">{name}</span>
      <span className="block truncate text-[11px] text-muted-foreground">{account ? "Ziffr" : "Read-only, shared"}</span>
    </span>
  );
  const frame = "flex h-10 w-full items-center gap-2 rounded-md px-1.5 outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring";
  if (!account) return <Link href="/" className={frame} title={name}>{tile}{label}</Link>;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger disabled={pending} title={`Workspace: ${name}`} className={cn(frame, collapsed && "justify-center px-0")}>
        {tile}{label}
        {!collapsed && <ChevronsUpDown aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side={collapsed ? "right" : "bottom"} className="w-60">
        <WorkspaceChoices account={account} start={start} />
        <DropdownMenuGroup>
          <DropdownMenuItem render={<Link href="/welcome?another=1" />}><Plus aria-hidden /> New workspace</DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The bottom of the sidebar: the signed-in person and their menu (their pages, Installation settings, sign out). */
function UserMenu({ account }: { account: Account }) {
  const { collapsed } = useSidebar();
  const [pending, start] = useTransition();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger disabled={pending} title={account.name} className={cn("flex h-9 w-full items-center gap-2 rounded-md px-1.5 text-[13px] outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring", collapsed && "justify-center px-0")}>
        <span aria-hidden className="stock flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold">{account.name[0]}</span>
        <span className={cn("min-w-0 flex-1 truncate text-left font-medium", collapsed && "sr-only")}>{account.name}</span>
        {!collapsed && <ChevronsUpDown aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side={collapsed ? "right" : "top"} className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Your settings</DropdownMenuLabel>
          {YOU.map((l) => <DropdownMenuItem key={l.href} render={<Link href={l.href} />}>{l.label}</DropdownMenuItem>)}
          {account.installationAdmin && <DropdownMenuItem render={<Link href={INSTALLATION.href} />}><ShieldCheck aria-hidden /> {INSTALLATION.label}</DropdownMenuItem>}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => start(() => signOut())}><LogOut aria-hidden /> Sign out</DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The phone's way around: four places and More, which opens everything else from the bottom. */
function TabBar({ open, workspace, account, guide }: { open: number; workspace: NavItem[]; account: Account | null; guide: string }) {
  const path = usePathname();
  const [more, setMore] = useState(false);
  // A page change closes More.
  useEffect(() => setMore(false), [path]);
  const link = (href: string, label: string, icon: React.ReactNode, active: boolean, badge?: number) => (
    <Link href={href} data-active={active} aria-current={active ? "page" : undefined} aria-label={badge ? `${label}, ${badge} waiting for you` : label} className={cn(sheetRow, "relative")}>
      {icon}<span>{label}</span>
      {badge ? <span className="fig absolute top-1 left-1/2 ml-1.5 min-w-4 rounded-full bg-foreground px-1 text-center text-[10px] leading-4 text-background">{badge}</span> : null}
    </Link>
  );
  return (
    <>
      <nav aria-label="Tabs" className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-background pb-[env(safe-area-inset-bottom)] md:hidden">
        {link("/dashboards", "Dashboards", <LayoutDashboard aria-hidden />, isOn(path, "/dashboards"))}
        {link("/metrics", "Metrics", <Hash aria-hidden />, isOn(path, "/metrics"))}
        {link("/actions", "Actions", <Inbox aria-hidden />, path.startsWith("/actions"), open)}
        <button type="button" className={sheetRow} aria-haspopup="dialog" onClick={() => window.dispatchEvent(new Event(OPEN_SEARCH))}><Search aria-hidden /><span>Search</span></button>
        <button type="button" className={sheetRow} aria-haspopup="dialog" data-active={more} onClick={() => setMore(true)}><MoreHorizontal aria-hidden /><span>More</span></button>
      </nav>
      <Sheet open={more} onOpenChange={setMore}>
        <SheetContent side="bottom" className="overflow-y-auto pb-[env(safe-area-inset-bottom)] md:hidden">
          <SheetHeader><SheetTitle>More</SheetTitle></SheetHeader>
          <div className="px-2 pb-3"><PhoneMenu workspace={workspace} account={account} guide={guide} /></div>
        </SheetContent>
      </Sheet>
    </>
  );
}

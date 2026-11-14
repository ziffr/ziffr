"use client";
// The top bar (spec 0006, ticket #98; GLOSSARY: Workspace, Action, Demo Mode): what people use every day in view,
// Actions as an inbox with its count, the workspace's own pages in one menu, and one menu button on a phone.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { ChevronDown, Inbox, LogOut, Menu, Plus, X } from "lucide-react";
import { NavLink } from "@/components/nav-link";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { signOut, switchWorkspace } from "@/app/auth-actions";
import { cn } from "@/lib/utils";

/** A link in a menu. */
type NavItem = { href: string; label: string };

/** Where most people spend their day. */
const MAIN: NavItem[] = [
  { href: "/dashboards", label: "Dashboards" },
  { href: "/metrics", label: "Metrics" },
  { href: "/analyze", label: "Analyze" },
  { href: "/decks", label: "Decks" },
];

/** The person's own settings. */
const YOU: NavItem[] = [
  { href: "/settings/profile", label: "Your profile" },
  { href: "/settings/deliveries", label: "Your Deliveries" },
];

const iconButton = "flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-input)] text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring";

/** The signed-in person; null in the demo, where `demo` holds its controls instead. */
export type Account = { name: string; workspaces: { id: string; name: string }[]; current: string };

/** The whole top bar. `workspace` lists the workspace's pages for this person's role; `open` counts the Actions
 * waiting for them; `demo` is the demo's controls, kept in view on every width. */
export function TopBar({ workspace, open, account, demo }: { workspace: NavItem[]; open: number; account: Account | null; demo?: React.ReactNode }) {
  const path = usePathname();
  const [menu, setMenu] = useState(false);
  // A page change closes the phone menu.
  useEffect(() => setMenu(false), [path]);
  const inWorkspace = workspace.some((l) => path === l.href || path.startsWith(l.href + "/"));
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background">
      <div className="mx-auto flex max-w-7xl items-center gap-x-4 px-4 py-2 sm:px-6">
        <Link href="/" className="flex items-baseline gap-2 py-1">
          <span className="text-lg font-semibold tracking-[-0.03em]">Ziffr</span>
          {demo && <span className="text-xs text-muted-foreground">demo</span>}
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-x-1 md:flex">
          {MAIN.map((l) => <NavLink key={l.href} href={l.href}>{l.label}</NavLink>)}
          <DropdownMenu>
            <DropdownMenuTrigger className={cn("inline-flex min-h-10 items-center gap-1 border-b-2 px-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-ring", inWorkspace ? "border-foreground font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
              Workspace <ChevronDown aria-hidden className="size-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuGroup>
                {workspace.map((l) => <DropdownMenuItem key={l.href} render={<Link href={l.href} />}>{l.label}</DropdownMenuItem>)}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>
        <div className="ml-auto flex items-center gap-1">
          {demo && <div className="hidden items-center gap-2 lg:flex">{demo}</div>}
          <Link href="/actions" className={cn(iconButton, "relative w-auto gap-1 px-2", path.startsWith("/actions") && "bg-muted text-foreground")} aria-label={open ? `Actions, ${open} waiting for you` : "Actions"} title="Actions">
            <Inbox aria-hidden className="size-4" />
            {open > 0 && <span className="fig text-xs">{open}</span>}
          </Link>
          {account && <div className="hidden md:block"><AccountMenu account={account} /></div>}
          <button type="button" className={cn(iconButton, "md:hidden")} aria-expanded={menu} aria-controls="phone-menu" aria-label={menu ? "Close the menu" : "Open the menu"} onClick={() => setMenu(!menu)}>
            {menu ? <X aria-hidden className="size-5" /> : <Menu aria-hidden className="size-5" />}
          </button>
        </div>
      </div>
      {/* The demo's controls stay in view on narrower screens, in a row of their own. */}
      {demo && <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 pb-2 sm:px-6 lg:hidden">{demo}</div>}
      {menu && <PhoneMenu workspace={workspace} account={account} />}
    </header>
  );
}

/** Everything in the bar, as one list, for screens too narrow for the bar. */
function PhoneMenu({ workspace, account }: { workspace: NavItem[]; account: Account | null }) {
  const [pending, start] = useTransition();
  const group = (label: string, items: NavItem[]) => (
    <div>
      <h2 className="px-2 pb-1 text-xs font-medium text-muted-foreground">{label}</h2>
      <ul>{items.map((l) => <li key={l.href}><NavLink href={l.href}>{l.label}</NavLink></li>)}</ul>
    </div>
  );
  return (
    <nav id="phone-menu" aria-label="Menu" className="max-h-[calc(100dvh-4rem)] overflow-y-auto border-t border-border px-4 py-3 md:hidden">
      <div className="grid gap-4 sm:grid-cols-3">
        {group("Main", MAIN)}
        {group("Workspace", workspace)}
        {account && group(account.name, YOU)}
      </div>
      {account && (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3 text-sm">
          {account.workspaces.length > 1 && (
            <label className="flex items-center gap-1.5">
              <span className="text-muted-foreground">Workspace</span>
              <select value={account.current} disabled={pending} onChange={(e) => start(() => switchWorkspace(e.target.value))} className="h-9 rounded-[var(--radius-input)] border border-input bg-card px-2">
                {account.workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </label>
          )}
          <Link href="/welcome?another=1" className="flex h-9 items-center gap-1 rounded-[var(--radius-input)] px-2 hover:bg-muted"><Plus aria-hidden className="size-4" /> New workspace</Link>
          <button type="button" disabled={pending} onClick={() => start(() => signOut())} className="flex h-9 items-center gap-1 rounded-[var(--radius-input)] px-2 hover:bg-muted"><LogOut aria-hidden className="size-4" /> Sign out</button>
        </div>
      )}
    </nav>
  );
}

/** The signed-in person's menu: which workspace they are in, switching, a new one, their settings and signing out. */
function AccountMenu({ account }: { account: Account }) {
  const [pending, start] = useTransition();
  const current = account.workspaces.find((w) => w.id === account.current);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger disabled={pending} className="flex h-9 max-w-64 items-center gap-1.5 rounded-[var(--radius-input)] px-2 text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring">
        <span className="truncate font-medium">{account.name}</span>
        <span className="truncate text-muted-foreground">{current?.name}</span>
        <ChevronDown aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {account.workspaces.length > 1 && (
          <>
            <DropdownMenuGroup>
              <DropdownMenuLabel>Workspace</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={account.current} onValueChange={(id) => { if (id !== account.current) start(() => switchWorkspace(String(id))); }}>
                {account.workspaces.map((w) => <DropdownMenuRadioItem key={w.id} value={w.id}>{w.name}</DropdownMenuRadioItem>)}
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuGroup>
          <DropdownMenuItem render={<Link href="/welcome?another=1" />}><Plus aria-hidden /> New workspace</DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {YOU.map((l) => <DropdownMenuItem key={l.href} render={<Link href={l.href} />}>{l.label}</DropdownMenuItem>)}
          <DropdownMenuItem onClick={() => start(() => signOut())}><LogOut aria-hidden /> Sign out</DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

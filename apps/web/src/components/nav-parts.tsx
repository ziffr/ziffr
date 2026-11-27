"use client";
// What the sidebar and its phone sheet share (spec 0036; GLOSSARY: Workspace, Demo Mode): the main destinations, the
// person's own pages, the Workspace list with the demo, and the phone sheet's account row.
import Link from "next/link";
import { useTransition } from "react";
import { LogOut, Plus } from "lucide-react";
import { DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { signOut, switchWorkspace } from "@/app/auth-actions";
import { told } from "@/lib/action-toast";

/** A link in a menu. */
export type NavItem = { href: string; label: string };

/** Where most people spend their day. */
export const MAIN: NavItem[] = [
  // Watch and explain, present (spec 0010, spec 0013), then the numbers themselves.
  { href: "/dashboards", label: "Dashboards" },
  { href: "/decks", label: "Decks" },
  { href: "/metrics", label: "Metrics" },
  { href: "/analyze", label: "Analyze" },
];

/** The person's own settings. */
export const YOU: NavItem[] = [
  { href: "/schedule", label: "My schedule" },
  { href: "/settings/profile", label: "Your profile" },
  { href: "/settings/deliveries", label: "Your Deliveries" },
  { href: "/settings/alerts", label: "Your Alerts" },
  { href: "/settings/appearance", label: "Appearance" },
];

/** The signed-in person; null in the demo, where `demo` holds its controls instead. `installationAdmin` adds the
 * Installation settings to their menu (spec 0025); the page checks again. `demo` is true where this Ziffr offers the
 * demo: it is then listed under their workspaces, set apart by a line, as one more place to switch to. */
export type Account = { name: string; workspaces: { id: string; name: string }[]; current: string; installationAdmin?: boolean; installationHref?: string; guest?: boolean; demo?: boolean; sendFeedback?: boolean };

/** The shared, read-only demo, as it is named under a person's workspaces. */
const DEMO_ENTRY = { href: "/demo", label: "The demo", hint: "read-only, shared" };

/** The Installation's page, for Installation Admins only. */
export const INSTALLATION: NavItem = { href: "/installation", label: "Installation settings" };

/** The link to the user guide: Ziffr's own /guide, or a team's own page in a new tab (ZIFFR_USER_GUIDE_URL). */
export function GuideLink({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) {
  const own = href.startsWith("/");
  return own
    ? <Link href={href} className={className} title="User guide">{children}</Link>
    : <a href={href} target="_blank" rel="noopener noreferrer" className={className} title="User guide">{children}</a>;
}

/** The phone menus' last row: switch Workspace, start a new one, sign out. Used by the sidebar's More sheet. */
export function PhoneAccount({ account }: { account: Account }) {
  const [pending, start] = useTransition();
  return (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3 text-sm">
        {(account.workspaces.length > 1 || account.demo) && (
          <label className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Workspace</span>
            <select value={account.current} disabled={pending} onChange={(e) => { const id = e.target.value; if (id === DEMO_ENTRY.href) { window.location.assign(DEMO_ENTRY.href); return; } start(async () => { told(await switchWorkspace(id)); }); }} className="h-9 rounded-[var(--radius-input)] border border-input bg-card px-2">
              {account.workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              {account.demo && <><option disabled>──────────</option><option value={DEMO_ENTRY.href}>{DEMO_ENTRY.label} ({DEMO_ENTRY.hint})</option></>}
            </select>
          </label>
        )}
        <Link href="/welcome?another=1" className="flex h-9 items-center gap-1 rounded-[var(--radius-input)] px-2 hover:bg-muted"><Plus aria-hidden className="size-4" /> New workspace</Link>
        <button type="button" disabled={pending} onClick={() => start(() => signOut())} className="flex h-9 items-center gap-1 rounded-[var(--radius-input)] px-2 hover:bg-muted"><LogOut aria-hidden className="size-4" /> Sign out</button>
      </div>
  );
}

/** The Workspace list of a menu: pick one to switch to it, and under a line the demo where this Ziffr offers it; then a
 * line before what follows. Nothing when there is only one Workspace and no demo. */
export function WorkspaceChoices({ account, start }: { account: Account; start: (action: () => Promise<void>) => void }) {
  if (account.workspaces.length <= 1 && !account.demo) return null;
  return (
    <>
      <DropdownMenuGroup>
        <DropdownMenuLabel>Workspace</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={account.current} onValueChange={(id) => { if (id !== account.current) start(async () => { told(await switchWorkspace(String(id))); }); }}>
          {account.workspaces.map((w) => <DropdownMenuRadioItem key={w.id} value={w.id}>{w.name}</DropdownMenuRadioItem>)}
        </DropdownMenuRadioGroup>
        {/* The demo is not one of their workspaces: a line sets it apart, but it is switched to the same way. */}
        {account.demo && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem render={<a href={DEMO_ENTRY.href} />}>
              <span>{DEMO_ENTRY.label}</span>
              <span className="ml-auto text-xs text-muted-foreground">{DEMO_ENTRY.hint}</span>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
    </>
  );
}

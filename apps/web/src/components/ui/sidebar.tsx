"use client"
// A collapsible sidebar in the shadcn "sidebar-07" shape (collapses to icons), in the inset style (the page is a
// raised card on a tinted ground), written for Base UI: no Radix. Phones do not use it; they get the bottom tab bar
// (components/app-shell.tsx). The collapsed state is kept in a cookie so the server draws it right on the next visit.

import * as React from "react"
import { PanelLeft } from "lucide-react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { SIDEBAR_COOKIE } from "@/lib/layout-cookie"
import { cn } from "@/lib/utils"

type SidebarState = { collapsed: boolean; toggle: () => void }
const SidebarContext = React.createContext<SidebarState | null>(null)

/** The sidebar's state for its children. */
export function useSidebar(): SidebarState {
  const state = React.useContext(SidebarContext)
  if (!state) throw new Error("useSidebar needs a SidebarProvider")
  return state
}

/** Holds whether the sidebar is collapsed; Ctrl/⌘+B toggles it from anywhere. */
export function SidebarProvider({ defaultCollapsed = false, className, children }: { defaultCollapsed?: boolean; className?: string; children: React.ReactNode }) {
  const [collapsed, setCollapsed] = React.useState(defaultCollapsed)
  const toggle = React.useCallback(() => {
    setCollapsed((c) => {
      try { document.cookie = `${SIDEBAR_COOKIE}=${c ? "open" : "collapsed"}; path=/; max-age=31536000; samesite=lax` } catch { /* a blocked cookie only forgets it */ }
      return !c
    })
  }, [])
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "b") { e.preventDefault(); toggle() }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [toggle])
  return (
    <SidebarContext.Provider value={{ collapsed, toggle }}>
      <div data-slot="sidebar-wrapper" data-state={collapsed ? "collapsed" : "expanded"} className={cn("group/sidebar-wrapper flex min-h-svh w-full bg-sidebar text-sidebar-foreground", className)}>{children}</div>
    </SidebarContext.Provider>
  )
}

/** The sidebar itself: fixed beside the page, 14rem wide, or 3rem of icons when collapsed. Hidden on phones. */
export function Sidebar({ className, children, ...props }: React.ComponentProps<"aside">) {
  const { collapsed } = useSidebar()
  return (
    <aside data-slot="sidebar" data-state={collapsed ? "collapsed" : "expanded"} className={cn("sticky top-0 hidden h-svh shrink-0 flex-col transition-[width] duration-200 ease-out motion-reduce:transition-none md:flex", collapsed ? "w-12" : "w-56", className)} {...props}>
      {children}
    </aside>
  )
}

/** The top part (Workspace switcher, search). */
export function SidebarHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sidebar-header" className={cn("flex flex-col gap-1.5 p-2", className)} {...props} />
}

/** The scrolling middle. */
export function SidebarContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sidebar-content" className={cn("flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overflow-x-hidden p-2", className)} {...props} />
}

/** The bottom part (user menu). */
export function SidebarFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sidebar-footer" className={cn("flex flex-col gap-1 p-2", className)} {...props} />
}

/** A labelled group of items; the label is replaced by a thin line when collapsed. */
export function SidebarGroup({ label, className, children, ...props }: { label?: string } & React.ComponentProps<"div">) {
  const { collapsed } = useSidebar()
  return (
    <div data-slot="sidebar-group" role="group" aria-label={label} className={cn("flex flex-col gap-0.5", className)} {...props}>
      {label && (collapsed ? <div aria-hidden className="mx-2 mb-1 border-t border-sidebar-border" /> : <div aria-hidden className="px-2 pb-1 text-xs font-medium text-muted-foreground">{label}</div>)}
      {children}
    </div>
  )
}

const itemClass = "group/item flex h-7 w-full items-center gap-2 overflow-hidden rounded-md px-2 text-left text-[13px] whitespace-nowrap text-sidebar-foreground outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground data-[active=true]:[&_svg]:text-sidebar-foreground"

/** One row: an icon and a label. Collapsed, only the icon shows and a tooltip names it. `render` makes it a link. */
export const SidebarItem = React.forwardRef<HTMLElement, { icon: React.ReactNode; label: string; active?: boolean; badge?: React.ReactNode; hintOnly?: boolean; render?: React.ReactElement<Record<string, unknown>>; tooltip?: string } & Omit<React.ComponentProps<"button">, "ref">>(
  function SidebarItem({ icon, label, active, badge, hintOnly, render, tooltip, className, children, ...props }, ref) {
    const { collapsed } = useSidebar()
    const inner = (
      <>
        {icon}
        <span className={cn("min-w-0 flex-1 truncate", collapsed && "sr-only")}>{label}</span>
        {badge !== undefined && badge !== null && !(hintOnly && collapsed) && <span className={cn("fig rounded-full px-1.5 text-xs leading-4", hintOnly ? "text-muted-foreground" : "bg-sidebar-primary text-sidebar-primary-foreground", collapsed && "absolute top-0 right-0 min-w-4 px-1 text-center")}>{badge}</span>}
        {children}
      </>
    )
    const common = { "data-active": active ? "true" : undefined, "aria-current": active ? ("page" as const) : undefined, className: cn(itemClass, "relative", collapsed && "justify-center px-0", className) }
    const el = render
      ? React.cloneElement(render, { ...common, ...(props as Record<string, unknown>), ref }, inner)
      : <button type="button" ref={ref as React.Ref<HTMLButtonElement>} {...common} {...props}>{inner}</button>
    if (!collapsed) return el
    return (
      <Tooltip>
        <TooltipTrigger render={el} />
        <TooltipContent side="right">{tooltip ?? label}</TooltipContent>
      </Tooltip>
    )
  }
)

/** The button that collapses and expands the sidebar. */
export function SidebarTrigger({ className }: { className?: string }) {
  const { collapsed, toggle } = useSidebar()
  return (
    <button type="button" onClick={toggle} aria-label={collapsed ? "Expand the sidebar" : "Collapse the sidebar"} aria-keyshortcuts="Control+B Meta+B" title="Toggle sidebar (Ctrl+B)" className={cn("flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring", className)}>
      <PanelLeft aria-hidden className="size-4" />
    </button>
  )
}

/** The page beside the sidebar: a raised card on the tinted ground, full-bleed on phones. */
export function SidebarInset({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="sidebar-inset" className="flex min-w-0 flex-1 flex-col md:py-2 md:pr-2">
      <div className={cn("flex min-w-0 flex-1 flex-col bg-background md:rounded-xl md:border md:border-[var(--color-rule-2)] md:shadow-[0_1px_2px_oklch(20%_0.01_35/0.06),0_4px_14px_-6px_oklch(20%_0.01_35/0.14)]", className)} {...props} />
    </div>
  )
}

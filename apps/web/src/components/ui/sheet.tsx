"use client"
// A slide-over (Base UI Dialog docked to an edge): details open beside the page instead of replacing it. On a phone a
// short one is a bottom sheet (GLOSSARY: Slide-over; spec 0055).

import * as React from "react"
import { Dialog as SheetPrimitive } from "@base-ui/react/dialog"
import { XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/** The slide-over's state; same props as Dialog. */
function Sheet({ ...props }: SheetPrimitive.Root.Props) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />
}

/** The button that opens it. */
function SheetTrigger({ ...props }: SheetPrimitive.Trigger.Props) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

/** Closes it. */
function SheetClose({ ...props }: SheetPrimitive.Close.Props) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

/** The panel, with a dimmed backdrop; `side` is the edge it slides in from (right by default, bottom on phones' menus).
 * A `short` panel on the right side is a bottom sheet on a phone and the usual right panel from 640px up. */
function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  short = false,
  ...props
}: SheetPrimitive.Popup.Props & { side?: "right" | "left" | "bottom"; showCloseButton?: boolean; short?: boolean }) {
  // Decided by CSS alone, so a window that is resized or turned changes shape without losing what is typed in it.
  const rises = short && side === "right"
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Backdrop
        data-slot="sheet-overlay"
        className="fixed inset-0 isolate z-[var(--z-popup)] bg-[color-mix(in_oklab,var(--color-ink)_22%,transparent)] duration-150 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0"
      />
      <SheetPrimitive.Popup
        data-slot="sheet-content"
        data-side={side}
        data-short={rises || undefined}
        className={cn(
          "fixed z-[var(--z-popup)] flex min-w-0 flex-col gap-3 overflow-x-hidden overscroll-contain bg-popover text-sm text-popover-foreground shadow-lg ring-1 ring-foreground/10 outline-none duration-200 ease-out data-open:animate-in data-closed:animate-out motion-reduce:animate-none max-sm:[overflow-wrap:anywhere]",
          side === "right" && "inset-y-0 right-0 h-full w-full max-w-[min(26rem,100vw)]",
          side === "right" && !rises && "data-open:slide-in-from-right data-closed:slide-out-to-right",
          // The two slides sit in media queries that exclude each other, so neither has to undo the other.
          rises && "sm:data-open:slide-in-from-right sm:data-closed:slide-out-to-right max-sm:top-auto max-sm:left-0 max-sm:h-auto max-sm:max-h-[85dvh] max-sm:max-w-none max-sm:rounded-t-xl max-sm:data-open:slide-in-from-bottom max-sm:data-closed:slide-out-to-bottom",
          side === "left" && "inset-y-0 left-0 h-full w-full max-w-[min(20rem,100vw)] data-open:slide-in-from-left data-closed:slide-out-to-left",
          side === "bottom" && "inset-x-0 bottom-0 max-h-[85dvh] rounded-t-xl pb-[env(safe-area-inset-bottom)] data-open:slide-in-from-bottom data-closed:slide-out-to-bottom",
          className
        )}
        {...props}
      >
        {/* A look only: it says "this came up from below". Closing is the button, Escape or a tap beside the sheet. */}
        {(rises || side === "bottom") && (
          <span aria-hidden data-slot="sheet-grab-bar" className={cn("pointer-events-none absolute top-1.5 left-1/2 h-1 w-10 -translate-x-1/2 rounded-full bg-muted-foreground/40", rises && "sm:hidden")} />
        )}
        {children}
        {showCloseButton && (
          <SheetPrimitive.Close render={<Button variant="ghost" size="icon-sm" className="absolute top-2.5 right-2.5 max-sm:top-1.5 max-sm:right-1 max-sm:size-11" />}>
            <XIcon aria-hidden />
            <span className="sr-only">Close</span>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Popup>
    </SheetPrimitive.Portal>
  )
}

/** The title block at the top. */
function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sheet-header" className={cn("flex flex-col gap-1 border-b border-border p-4 pr-12", className)} {...props} />
}

/** The title; names the panel for screen readers. */
function SheetTitle({ className, ...props }: SheetPrimitive.Title.Props) {
  return <SheetPrimitive.Title data-slot="sheet-title" className={cn("text-base font-semibold", className)} {...props} />
}

/** A line under the title. */
function SheetDescription({ className, ...props }: SheetPrimitive.Description.Props) {
  return <SheetPrimitive.Description data-slot="sheet-description" className={cn("text-sm text-muted-foreground", className)} {...props} />
}

export { Sheet, SheetTrigger, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetDescription }

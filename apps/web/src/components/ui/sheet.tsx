"use client"
// A slide-over (Base UI Dialog docked to an edge): details open beside the page instead of replacing it.

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

/** The panel, with a dimmed backdrop; `side` is the edge it slides in from (right by default, bottom on phones' menus). */
function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  ...props
}: SheetPrimitive.Popup.Props & { side?: "right" | "left" | "bottom"; showCloseButton?: boolean }) {
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Backdrop
        data-slot="sheet-overlay"
        className="fixed inset-0 isolate z-50 bg-[color-mix(in_oklab,var(--color-ink)_22%,transparent)] duration-150 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0"
      />
      <SheetPrimitive.Popup
        data-slot="sheet-content"
        data-side={side}
        className={cn(
          "fixed z-50 flex flex-col gap-3 bg-popover text-sm text-popover-foreground shadow-lg ring-1 ring-foreground/10 outline-none duration-200 ease-out data-open:animate-in data-closed:animate-out motion-reduce:animate-none",
          side === "right" && "inset-y-0 right-0 h-full w-full max-w-[26rem] data-open:slide-in-from-right data-closed:slide-out-to-right",
          side === "left" && "inset-y-0 left-0 h-full w-full max-w-[20rem] data-open:slide-in-from-left data-closed:slide-out-to-left",
          side === "bottom" && "inset-x-0 bottom-0 max-h-[85dvh] rounded-t-xl data-open:slide-in-from-bottom data-closed:slide-out-to-bottom",
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <SheetPrimitive.Close render={<Button variant="ghost" size="icon-sm" className="absolute top-2.5 right-2.5" />}>
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

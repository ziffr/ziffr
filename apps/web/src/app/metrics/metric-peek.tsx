"use client";
// A Metric's quick look on the Metrics list (docs/specs/0036-app-layout.md; GLOSSARY: Metric): a slide-over beside the
// list, so a Metric's latest value, target and recent values are read without leaving the list. The page builds the
// content on the server from what the person may see and passes it in; this only opens and closes it.
import Link from "next/link";
import { PanelRightOpen } from "lucide-react";
import { RecordValue } from "./[slug]/record-value";
import type { RecordingOffer } from "@ziffr/core/record-own-value";
import { buttonVariants } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

/** The "Details" button of a row and the slide-over it opens; `children` is the content, `href` the Metric's own page. */
export function MetricPeek({ name, sub, href, record, children }: { name: string; sub: string; href: string; /** Set when the person submits the Metric: the form behind Record a value, the same as on its page. */ record?: RecordingOffer; children: React.ReactNode }) {
  return (
    <Sheet>
      <SheetTrigger aria-label={`Details of ${name}`} title="Details" className="relative z-10 ml-1 inline-flex size-6 items-center justify-center rounded-md text-muted-foreground opacity-0 outline-none hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100 max-md:opacity-100">
        <PanelRightOpen aria-hidden className="size-3.5" />
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{name}</SheetTitle>
          <SheetDescription>{sub}</SheetDescription>
        </SheetHeader>
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">{children}</div>
        <div className="flex flex-col gap-2 border-t border-border p-3">
          {record && <RecordValue offer={record} slideOver wide />}
          <Link href={href} className={buttonVariants({ variant: record ? "outline" : "default", className: "w-full" })}>Open the Metric</Link>
        </div>
      </SheetContent>
    </Sheet>
  );
}

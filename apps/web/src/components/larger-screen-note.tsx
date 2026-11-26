// GLOSSARY: Deck. The short plain note a phone shows above a screen that is made for building, such as the deck editor
// (spec 0055): it says so, and offers what can be done here instead. It never blocks the screen below it.
import Link from "next/link";
import type { ReactNode } from "react";
import { MonitorSmartphone } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

/** "This is easier on a larger screen", why, and one thing to do on a phone; from 640 px wide nothing is shown. */
export function LargerScreenNote({ children, href, action }: { /** Why, in one sentence, and what works here. */ children: ReactNode; href: string; /** The button's words. */ action: ReactNode }) {
  return (
    <div role="note" className="stock mb-5 rounded-[var(--radius-card)] p-4 text-sm sm:hidden">
      <p className="flex items-center gap-2 font-medium"><MonitorSmartphone aria-hidden className="size-4 shrink-0" /> This is easier on a larger screen.</p>
      <p className="mt-1.5 text-muted-foreground">{children}</p>
      <Link href={href} className={buttonVariants({ className: "mt-3 h-11 w-full" })}>{action}</Link>
    </div>
  );
}

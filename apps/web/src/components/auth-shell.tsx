// The frame of the signed-out pages (GLOSSARY: Workspace, Invitation): sign-in, starting a workspace or a trial, an
// invitation. A two-sided card built from shadcn's login-04 block: the form on one side, on the other what Ziffr is,
// with a real screenshot of the demo's Monthly overview dashboard. It holds no data of anyone: the picture is a static
// file and the words are the same for everybody, so nothing here depends on who is asking.
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** What the picture shows, for people who cannot see it. */
const SHOT_ALT = "The demo's Monthly overview dashboard in Ziffr: tiles for Revenue, Margin, Cost and Support tickets, each with its latest value and how it compares with its target, a line chart of Cost over time and a table of Revenue values.";

/** The card around a signed-out page: its content first, what Ziffr is beside it (below it on a phone). */
export function AuthShell({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <Card className={cn("mx-auto mt-4 w-full max-w-5xl gap-0 p-0 sm:mt-8 md:grid md:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]", className)}>
      <div className="flex min-w-0 flex-col justify-center p-6 sm:p-10">{children}</div>
      <aside aria-label="About Ziffr" className="flex min-w-0 flex-col justify-between gap-8 overflow-hidden border-t border-border bg-muted p-6 sm:px-10 md:border-l md:border-t-0 md:pb-0 md:pr-0 md:pt-10">
        <div className="max-w-sm md:pr-10">
          <p className="text-[length:var(--text-lg)] font-medium leading-snug">The numbers you care about, in one place.</p>
          <p className="mt-2 text-sm text-muted-foreground">Define a metric, and Ziffr asks people for its values, or systems send them in. Everyone sees, shares and discusses them over time.</p>
        </div>
        {/* Only from the tablet width up: on a phone the form comes first and the picture would only push it down.
            Hidden images are not fetched (loading=lazy), so a phone never downloads it. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/login-dashboard.webp" width={1400} height={1000} loading="lazy" alt={SHOT_ALT} className="hidden w-full rounded-tl-[var(--radius-card)] border-l border-t border-border bg-background shadow-lg md:block" />
      </aside>
    </Card>
  );
}

/** The heading of the content side: what this page is, and one line under it. */
export function AuthHeading({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <header className="mb-6">
      <h1 className="text-[length:var(--text-2xl)] leading-tight">{title}</h1>
      {children && <p className="mt-2 text-sm text-muted-foreground">{children}</p>}
    </header>
  );
}

/** A refusal or notice above the form, announced to screen readers. */
export function AuthNotice({ children }: { children: React.ReactNode }) {
  return <p role="alert" className="mb-6 rounded-[var(--radius-input)] border border-destructive p-3 text-sm">{children}</p>;
}

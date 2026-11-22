// The frame of the signed-out pages (GLOSSARY: Workspace, Invitation): sign-in, starting a workspace or a trial, an
// invitation. One calm column in the look of ziffr.net (#759): the Ziffr mark, a card with the page's form, and at
// most one small line below it. It holds no data of anyone: the mark is a static file and the words are the same for
// everybody, so nothing here depends on who is asking.
import { cn } from "@/lib/utils";

/** The column around a signed-out page: the mark, its content in a card, what sits below the card (`below`, such as
 * the demo link) and, last, a page footer (`footer`, such as the legal links of hosted Ziffr, #760). */
export function AuthShell({ children, below, footer, className }: { children: React.ReactNode; below?: React.ReactNode; footer?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mx-auto w-full max-w-md pt-2 sm:pt-10", className)}>
      {/* The same mark as the site's header and the app icons; decorative, the heading says where you are. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/ziffr-logo.svg" width={44} height={44} alt="" className="mb-6 size-11" />
      <div className="rounded-[var(--radius-card)] border border-border bg-card p-6 text-card-foreground shadow-[var(--shadow-card)] sm:p-8">{children}</div>
      {below && <div className="mt-6 text-center text-sm text-muted-foreground">{below}</div>}
      {footer && <footer className="mt-10 text-center text-xs text-muted-foreground">{footer}</footer>}
    </div>
  );
}

/** The heading of the card: what this page is, and one line under it. */
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

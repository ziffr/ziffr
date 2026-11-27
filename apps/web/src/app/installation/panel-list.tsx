// What the panel's lists share (spec 0066; GLOSSARY: User, Workspace): a search that is part of the page's address,
// and the way from one page of a list to the next. Plain forms and links, so they work without any script.
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** The search of a list: sends `q` to the list's own address; a new search starts at the first page. */
export function PanelSearch({ path, search, label }: { path: string; search: string; label: string }) {
  return (
    <form action={path} method="get" role="search" className="mb-4 flex max-w-xl flex-wrap items-end gap-2">
      <label className="min-w-0 flex-1 basis-48 text-xs text-muted-foreground">
        <span className="mb-1 block">{label}</span>
        {/* The key redraws the field when the address changes, so it never keeps an older search. */}
        <Input key={search} type="search" name="q" defaultValue={search} maxLength={100} className="w-full text-base md:text-sm" />
      </label>
      <Button type="submit" variant="outline">Search</Button>
      {search && <Link href={path} className={buttonVariants({ variant: "ghost" })}>Show all</Link>}
    </form>
  );
}

/** "52 Users" and, when there is more than one page, the way between them. */
export function PanelPager({ path, noun, total, page, pages, search }: { path: string; noun: [string, string]; total: number; page: number; pages: number; search: string }) {
  const to = (n: number) => `${path}?${new URLSearchParams({ ...(search ? { q: search } : {}), page: String(n) }).toString()}`;
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
      <p className="text-muted-foreground">{total.toLocaleString("en-US")} {total === 1 ? noun[0] : noun[1]}{search ? " found" : ""}{pages > 1 ? `, page ${page} of ${pages}` : ""}</p>
      {page > 1 && <Link href={to(page - 1)} className={buttonVariants({ variant: "outline", className: "min-h-11 md:min-h-0" })}>Previous</Link>}
      {page < pages && <Link href={to(page + 1)} className={buttonVariants({ variant: "outline", className: "min-h-11 md:min-h-0" })}>Next</Link>}
    </div>
  );
}

/** A word in a frame for how a row stands, never a colour alone. */
export function PanelBadge({ children, strong }: { children: React.ReactNode; strong?: boolean }) {
  return <span className={`inline-flex items-center rounded-[var(--radius-input)] border px-1.5 text-xs ${strong ? "border-destructive font-medium text-destructive" : "border-[var(--color-rule-2)] text-[var(--color-ink-2)]"}`}>{children}</span>;
}

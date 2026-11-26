"use client";
// The settings area's side nav (spec 0006; GLOSSARY: Workspace, Workspace Role): your own settings, then the
// workspace's. On a phone it becomes one "Section" menu that always shows where you are, instead of a row
// that scrolls sideways and hides the current page.
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

/** One link of the settings nav. */
export type SettingsLink = { href: string; label: string };

/** The settings nav, in groups such as "You" and "Workspace"; the current page is marked. */
export function SettingsNav({ groups }: { groups: { label: string; links: SettingsLink[] }[] }) {
  const path = usePathname();
  const router = useRouter();
  const isActive = (href: string) => path === href || path.startsWith(href + "/");
  const current = groups.flatMap((g) => g.links).find((l) => isActive(l.href));
  return (
    <div className="min-w-0">
      {/* Phones: one menu, 16 px text so iOS does not zoom, naming the page you are on. */}
      <label className="block md:hidden">
        <span className="mb-1 block text-xs font-medium text-muted-foreground">Section</span>
        {/* Uncontrolled, so the choice shows at once while the page loads; a new page makes a new menu. */}
        <select key={path} defaultValue={current?.href ?? ""} onChange={(e) => router.push(e.target.value)} className="h-11 w-full rounded-[var(--radius-input)] border border-input bg-card px-2 text-base">
          {!current && <option value="" disabled>Choose a section</option>}
          {groups.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.links.map((l) => <option key={l.href} value={l.href}>{l.label}</option>)}
            </optgroup>
          ))}
        </select>
      </label>
      <nav aria-label="Settings" className="hidden md:block">
        <div className="flex gap-6 md:flex-col">
          {groups.map((g) => (
            <div key={g.label} className="shrink-0">
              <h2 className="mb-1 text-xs font-medium text-muted-foreground">{g.label}</h2>
              <ul className="flex gap-1 md:flex-col">
                {g.links.map((l) => {
                  const active = isActive(l.href);
                  return (
                    <li key={l.href}>
                      <Link href={l.href} aria-current={active ? "page" : undefined} className={cn("flex min-h-9 items-center whitespace-nowrap rounded-[var(--radius-input)] px-2 text-sm focus-visible:outline-2 focus-visible:outline-ring", active ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
                        {l.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </nav>
    </div>
  );
}

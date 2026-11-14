"use client";
// The settings area's side nav (spec 0006; GLOSSARY: Workspace, Workspace Role): your own settings, then the
// workspace's. On a phone it becomes one row that scrolls sideways.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/** One link of the settings nav. */
export type SettingsLink = { href: string; label: string };

/** The settings nav, in groups such as "You" and "Workspace"; the current page is marked. */
export function SettingsNav({ groups }: { groups: { label: string; links: SettingsLink[] }[] }) {
  const path = usePathname();
  return (
    <nav aria-label="Settings" className="-mx-4 overflow-x-auto px-4 md:mx-0 md:overflow-visible md:px-0">
      <div className="flex gap-6 md:flex-col">
        {groups.map((g) => (
          <div key={g.label} className="shrink-0">
            <h2 className="mb-1 text-xs font-medium text-muted-foreground">{g.label}</h2>
            <ul className="flex gap-1 md:flex-col">
              {g.links.map((l) => {
                const active = path === l.href || path.startsWith(l.href + "/");
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
  );
}

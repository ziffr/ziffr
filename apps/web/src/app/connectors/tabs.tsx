"use client";
// The tabs of Workspace → Connectors (#532): Channels, Sources, Send values, Outbox and Who gets what, each its own page so a deep
// link lands on one thing. On a phone they scroll sideways inside their own row, with a fade at the edge.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/connectors", label: "Channels" },
  { href: "/connectors/sources", label: "Sources" },
  { href: "/connectors/send", label: "Send values" },
  { href: "/connectors/outbox", label: "Outbox" },
  { href: "/connectors/who-gets-what", label: "Who gets what" },
];

/** The tab row; the open page's tab is marked. */
export function ConnectorsTabs() {
  const path = usePathname();
  return (
    <nav aria-label="Connectors" className="relative -mx-4 mb-6 md:mx-0">
      <ul className="flex gap-1 overflow-x-auto border-b border-border px-4 md:px-0">
        {TABS.map((t) => {
          const active = t.href === "/connectors" ? path === t.href : path === t.href || path.startsWith(t.href + "/");
          return (
            <li key={t.href} className="shrink-0">
              <Link href={t.href} aria-current={active ? "page" : undefined} className={cn("-mb-px flex min-h-11 items-center whitespace-nowrap border-b-2 px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring", active ? "border-foreground font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
      <span aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-[var(--card)] to-transparent md:hidden" />
    </nav>
  );
}

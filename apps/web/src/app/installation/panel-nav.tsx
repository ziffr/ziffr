// The pages of the Installation's panel (spec 0066; GLOSSARY: Installation Settings, Installation Admin): one row of
// links that every page of it shows. Drawn by each page after it checked who is looking, never by a layout, which would
// show it around a "not found" too.
import Link from "next/link";
import { hostedByCloud } from "@ziffr/core/installation-days";
import { settingsInEffect } from "@ziffr/core/settings-in-effect";
import { cn } from "@/lib/utils";

/** A page of the panel. */
type PanelPageId = "settings" | "users" | "workspaces" | "health" | "feedback";

/** The panel's navigation, with the page being read marked. Announcements are a section of Settings, and the feedback
 * review exists only in the central version. */
export async function PanelNav({ current }: { current: PanelPageId }) {
  const central = hostedByCloud(await settingsInEffect());
  const items: { id: PanelPageId | "announcements"; href: string; label: string }[] = [
    { id: "settings", href: "/installation", label: "Settings" },
    { id: "users", href: "/installation/users", label: "Users" },
    { id: "workspaces", href: "/installation/workspaces", label: "Workspaces" },
    { id: "health", href: "/installation/health", label: "Health" },
    { id: "announcements", href: "/installation#announcements", label: "Announcements" },
    ...(central ? [{ id: "feedback" as const, href: "/installation/feedback", label: "Feedback" }] : []),
  ];
  return (
    <nav aria-label="Installation" className="mb-6">
      <ul className="flex flex-wrap gap-2">
        {items.map((i) => (
          <li key={i.id}>
            <Link href={i.href} aria-current={i.id === current ? "page" : undefined}
              className={cn("inline-flex min-h-11 items-center rounded-[var(--radius-input)] border px-3 text-sm hover:bg-muted md:min-h-9", i.id === current ? "border-[var(--color-ink-2)] bg-muted font-medium text-foreground" : "border-border text-muted-foreground")}>
              {i.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

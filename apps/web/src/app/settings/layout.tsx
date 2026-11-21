// The settings area (spec 0006, ticket #529; GLOSSARY: Workspace, Workspace Role): your own settings and the workspace's.
// Everyone opens it; what each page lets you change is decided by the core. The top bar's frame shows one side nav of
// both; the sidebar frame has its own grouped Settings list beside the workspace's pages (app-shell.tsx) and your own
// pages sit in the user menu, so no second list is drawn here.
import { currentActor } from "@/lib/viewer";
import { layoutChoice } from "@/lib/layout-choice";
import { SettingsNav } from "@/components/settings-nav";
import { workspaceLinks } from "@/lib/settings-links";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  if ((await layoutChoice()) === "sidebar") return <>{children}</>;
  const actor = await currentActor();
  const groups = [
    { label: "You", links: [{ href: "/schedule", label: "My schedule" }, { href: "/settings/profile", label: "Profile" }, { href: "/settings/deliveries", label: "Deliveries" }, { href: "/settings/alerts", label: "Alerts" }, { href: "/settings/appearance", label: "Appearance" }, { href: "/settings/assistants", label: "Connected assistants" }] },
    { label: "Workspace", links: workspaceLinks(actor.role) },
  ];
  return (
    <div className="grid gap-8 md:grid-cols-[12rem_minmax(0,1fr)]">
      <SettingsNav groups={groups} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

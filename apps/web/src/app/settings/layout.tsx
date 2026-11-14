// The settings area (spec 0006; GLOSSARY: Workspace, Workspace Role): your own settings and the workspace's, with
// one side nav. Everyone opens it; what each page lets you change is decided by the core.
import { currentActor } from "@/lib/viewer";
import { SettingsNav } from "@/components/settings-nav";
import { workspaceLinks } from "@/lib/settings-links";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const actor = await currentActor();
  const groups = [
    { label: "You", links: [{ href: "/settings/profile", label: "Profile" }, { href: "/settings/deliveries", label: "Deliveries" }] },
    { label: "Workspace", links: workspaceLinks(actor.role) },
  ];
  return (
    <div className="grid gap-8 md:grid-cols-[12rem_minmax(0,1fr)]">
      <SettingsNav groups={groups} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

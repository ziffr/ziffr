// Where the workspace's own pages are (spec 0006; GLOSSARY: Workspace, Workspace Role): one list for the settings
// side nav and the top bar's Workspace menu, so both always agree.
import type { WorkspaceRoleName } from "@ziffr/core/actor";

/** The workspace's pages a person with this role is shown. The Audit log is for Owners and Admins; its page decides
 * again who may read it. */
export function workspaceLinks(role: WorkspaceRoleName): { href: string; label: string }[] {
  const admin = role === "owner" || role === "admin";
  return [
    { href: "/settings/workspace", label: "General" },
    { href: "/team", label: "Members and Groups" },
    { href: "/connectors", label: "Connectors" },
    { href: "/workflows", label: "Workflows" },
    { href: "/sources", label: "Sources" },
    { href: "/settings/keys", label: "Access Keys" },
    { href: "/activity", label: "Activity" },
    ...(admin ? [{ href: "/audit", label: "Audit log" }] : []),
  ];
}

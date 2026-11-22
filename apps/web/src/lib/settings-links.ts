// Where the workspace's own pages are (spec 0006; GLOSSARY: Workspace, Workspace Role): one list that the sidebar's trees and the
// search draw from, so all always agree.
import type { WorkspaceRoleName } from "@ziffr/core/actor";

/** The workspace's pages a person with this role is shown. The Audit log is for Owners and Admins; its page decides
 * again who may read it. */
export function workspaceLinks(role: WorkspaceRoleName): { href: string; label: string }[] {
  const admin = role === "owner" || role === "admin";
  // A Guest only sees what is shared with them and creates nothing (GLOSSARY: Workspace Role): no member list or
  // Groups, no Workflows of their own to set up, no Packs, no Access Keys. The pages refuse or filter again in the core.
  const member = role !== "guest";
  return [
    { href: "/settings/workspace", label: "General" },
    ...(member ? [{ href: "/team", label: "Members and Groups" }] : []),
    { href: "/connectors", label: "Connectors" },
    ...(member ? [{ href: "/workflows", label: "Workflows" }] : []),
    // Packs add to the Workspace; Guests see none of it (spec 0030).
    ...(member ? [{ href: "/settings/packs", label: "Packs" }] : []),
    ...(member ? [{ href: "/settings/keys", label: "Access Keys" }] : []),
    // Feeds write into the workspace without a person, so only Owners and Admins set them up (spec 0012).
    ...(admin ? [{ href: "/settings/feeds", label: "Feeds" }] : []),
    // Webhooks send Workspace data to addresses outside Ziffr, so the same people set them (spec 0034).
    ...(admin ? [{ href: "/settings/webhooks", label: "Webhooks" }] : []),
    { href: "/changes", label: "Changes" },
    // What could be tidied: counts only, for those who manage the Workspace (spec 0031).
    ...(admin ? [{ href: "/settings/usage", label: "Usage" }] : []),
    ...(admin ? [{ href: "/audit", label: "Audit log" }] : []),
    // The whole Workspace as one file: its Owner only (spec 0040).
    ...(role === "owner" ? [{ href: "/settings/export", label: "Workspace Export" }] : []),
  ];
}

/** A link of the sidebar's trees. */
export type TreeLink = { href: string; label: string };

/** The sidebar's Workspace group (spec 0036, ticket #529): the pages people open daily, then Settings. Guests get no
 * Workspace group at all (#504 Q1); every row is one the role can use, so none leads to a refusal. */
export function workspaceTree(role: WorkspaceRoleName): TreeLink[] {
  if (role === "guest") return [];
  return [
    { href: "/team", label: "Members and Groups" },
    { href: "/workflows", label: "Workflows" },
    // Sources, the Outbox and Who gets what are tabs of Connectors (#532).
    { href: "/connectors", label: "Connectors" },
    { href: "/settings/workspace", label: "Settings" },
  ];
}

/** The one Settings page's grouped list (#529): what Owners and Admins set up, in three groups. Rows only for roles that
 * can use them: Feeds, Webhooks, Size and Retention, Usage and the Audit log are for Owners and Admins (specs 0012,
 * 0029, 0031, 0033, 0034); Guests have none of it. */
export function settingsGroups(role: WorkspaceRoleName): { label: string; links: TreeLink[] }[] {
  if (role === "guest") return [];
  const admin = role === "owner" || role === "admin";
  return [
    { label: "Workspace", links: [{ href: "/settings/workspace", label: "General" }, ...(admin ? [{ href: "/settings/workspace#size", label: "Size and Retention" }] : []), { href: "/themes", label: "Themes" }, { href: "/settings/packs", label: "Packs" }, ...(role === "owner" ? [{ href: "/settings/export", label: "Workspace Export" }] : [])] },
    { label: "Programs", links: [{ href: "/settings/keys", label: "Access Keys" }, ...(admin ? [{ href: "/settings/feeds", label: "Feeds" }, { href: "/settings/webhooks", label: "Webhooks" }] : [])] },
    { label: "Records", links: [{ href: "/changes", label: "Changes" }, ...(admin ? [{ href: "/settings/usage", label: "Usage" }, { href: "/audit", label: "Audit log" }] : [])] },
  ];
}

/** Whether `path` is on `href` (its hash ignored) or below it. */
export function onPage(path: string, href: string): boolean {
  const page = href.split("#")[0];
  return path === page || path.startsWith(page + "/");
}

/** Whether `path` is a page of the Settings list, so the page shows it beside its content. */
export function inSettings(path: string, groups: { links: TreeLink[] }[]): boolean {
  return groups.some((g) => g.links.some((l) => onPage(path, l.href)));
}

// The four Workspace Roles in words (GLOSSARY: Workspace Role): one place for the name and the one line that says what the
// role may do, used by the Team page, the Setup Guide's Team step and anything else that explains a role. Pure.
import type { WorkspaceRoleName } from "./actor";

/** Each Workspace Role's name and the one line that says what it may do. */
export const WORKSPACE_ROLE_WORDS: Record<WorkspaceRoleName, { label: string; line: string }> = {
  owner: { label: "Owner", line: "Manages everything, including who else is an Owner. A Workspace can have several." },
  admin: { label: "Admin", line: "Manages settings, Groups and members, but cannot remove Owners." },
  member: { label: "Member", line: "Makes and shares Metrics, dashboards and decks, and sends in values." },
  guest: { label: "Guest", line: "Sees only what is shared with them, answers questions and sends in values; makes nothing." },
};

/** The roles in the order they are explained. */
export const WORKSPACE_ROLE_ORDER: readonly WorkspaceRoleName[] = ["owner", "admin", "member", "guest"];

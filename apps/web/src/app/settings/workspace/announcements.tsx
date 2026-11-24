"use client";
// GLOSSARY: Announcement, Workspace Role. The Announcements section of the Workspace settings page (spec 0054): what an
// Owner or Admin tells the Workspace's people in one plain line. The list and the form are the Installation's
// (components/announcements-editor.tsx) without its audience and sign-in fields; the actions are the Workspace's own.
import { AnnouncementsSection, type AnnouncementRow, type AnnouncementsKind } from "@/components/announcements-editor";
import { createWorkspaceAnnouncement, deleteWorkspaceAnnouncement, setWorkspaceAnnouncementActive, updateWorkspaceAnnouncement } from "@/app/settings-actions";
import { WORKSPACE_ANNOUNCEMENTS_ACTIVE_MAX } from "@ziffr/core/announcement-rules";

const KIND: AnnouncementsKind = {
  activeMax: WORKSPACE_ANNOUNCEMENTS_ACTIVE_MAX, installation: false,
  intro: "One plain line above every screen for the people of this Workspace, for a change in how you work or anything else they should read. Guests do not see it.",
  create: createWorkspaceAnnouncement, update: updateWorkspaceAnnouncement, setActive: setWorkspaceAnnouncementActive, remove: deleteWorkspaceAnnouncement,
};

/** The Workspace's Announcements: the list with its actions, and the Add button. Owners and Admins only. */
export function WorkspaceAnnouncements({ rows }: { rows: AnnouncementRow[] }) {
  return <AnnouncementsSection rows={rows} kind={KIND} />;
}

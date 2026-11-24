"use client";
// GLOSSARY: Workspace Role, Group, Away. What the Members and Groups page holds, kept in one small store so the
// side panels (which the Slide-over host draws outside the page's own tree, from a node made once when it opens)
// show the current people and Groups after every change instead of the copy they were opened with.
import { useSyncExternalStore } from "react";
import type { WorkspaceRoleName } from "@ziffr/core/actor";
import type { Group, Profile } from "@ziffr/core/types";
import type { BusinessFunction } from "@ziffr/pack/business-functions";

/** One invitation that is open, as the page loads it (Owners and Admins only). */
type OpenInvitation = { id: number; email: string | null; role: string; expires_at: string; email_sent_at: string | null; email_sends: number; email_error: string | null; held_at: string | null; name: string | null };

/** A person with a login and their Workspace Role (the job title is `role` of the profile). */
type Member = Profile & { workspaceRole: WorkspaceRoleName };

/** Everything the People and Groups tabs and their panels show; the server page builds it from what the viewer may see. */
export type TeamData = {
  viewer: string;
  canEdit: boolean;
  isOwner: boolean;
  people: Member[];
  contacts: Profile[];
  /** The Groups a person can be put in (not "Everyone in the workspace", which Ziffr keeps itself). */
  groups: Group[];
  away: { user_id: string; starts: string; ends: string }[];
  /** Each member's Business Function: given only to Owners and Admins (null for everyone else). */
  functions: { personId: string; function: BusinessFunction }[] | null;
  invitations: OpenInvitation[];
  joinRequests: { id: number; person: { id: string; name: string; email: string | null } }[];
  mailOn: boolean;
  joinDomain: string | null;
  myDomain: string | null;
  /** A Trial Workspace: invitations go by email only, and Domain Joining is off (spec 0040). */
  trial: boolean;
};

let current: TeamData | null = null;
const listeners = new Set<() => void>();

/** Puts the page's latest data where the panels read it. */
export function setTeamData(next: TeamData) {
  current = next;
  listeners.forEach((l) => l());
}

/** The latest data; null before the page has set it. */
export function useTeamData(): TeamData | null {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => current, () => null);
}

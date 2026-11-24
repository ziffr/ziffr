// GLOSSARY: Announcement. What the app says on every screen for this visit, decided on the server from the Installation
// alone: the demo's built-in notice (not a row, so nothing can edit or delete it) and the Announcements an Installation
// Admin wrote. Nothing here depends on who the person is, and the text reaches every visitor's browser, so it carries only
// what the line shows (AGENTS.md rule 3).
import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { DEMO_RESET_MINUTES } from "@ziffr/core/demo-reset-line";
import { sessionStartedAt } from "@/lib/session-start";
import { DEMO_VISIT_COOKIE } from "@/lib/demo-visit-cookie";
import type { ActiveAnnouncement, PublicAnnouncement } from "@ziffr/core/installation-announcements";
import type { Announcement } from "@/lib/announcement-state";

/** The id of the demo's reset notice. */
export const DEMO_RESET_ANNOUNCEMENT = "demo-reset";

/** The Announcements of a visit: in the demo, that it is shared and resets (changes open) or that it saves nothing (read-only); `offersTrials` adds the way to a trial. */
export function announcementsFor(input: { demo: boolean; changes: boolean; offersTrials: boolean }): Announcement[] {
  if (!input.demo) return [];
  const text = input.changes
    ? `This is a shared demo that anyone can change. It resets every ${DEMO_RESET_MINUTES} minutes after a change, so what you make here disappears. Nothing you enter leaves this demo.`
    : "This demo is read-only: look around as anyone. Nothing you do is saved and nothing is sent.";
  return [{ id: DEMO_RESET_ANNOUNCEMENT, text, ...(input.offersTrials ? { link: { href: "/demo/leave", label: "Try it for real with a trial of your own" } } : {}) }];
}

/** An Installation Announcement as the line takes it. Its key holds the time of its last change, so an edited one comes back after a dismissal. */
export function fromInstallation(rows: ActiveAnnouncement[]): Announcement[] {
  return rows.map((r) => ({ id: `${r.id}:${r.updatedAt}`, text: r.text, level: r.level, dismissible: r.dismissible, ...(r.link ? { link: r.link } : {}) }));
}

/** A public Announcement as the sign-in page's line takes it: there is no visit to dismiss in, so it is simply shown. */
export function fromPublic(rows: PublicAnnouncement[]): Announcement[] {
  return rows.map((r, i) => ({ id: `public-${i}`, text: r.text, level: r.level, dismissible: false, ...(r.link ? { link: r.link } : {}) }));
}

/** Names this visit, so a dismissal ends with it: a hash of the demo visit's id, or of the time the person signed in. Never the id itself. */
export async function announcementScope(demo: boolean): Promise<string> {
  const source = demo ? ((await cookies()).get(DEMO_VISIT_COOKIE)?.value ?? "demo") : String((await sessionStartedAt())?.getTime() ?? "session");
  return createHash("sha256").update(source).digest("hex").slice(0, 12);
}

/** What the sign-in page adds of its own: the public lines, read only when nobody is in the demo. A demo visitor on the sign-in
 * page already has the shell, which shows the same lines (the Installation's, for everyone), so adding them again would show each twice. */
export async function signInAnnouncements(demo: boolean, load: () => Promise<PublicAnnouncement[]>): Promise<Announcement[]> {
  return demo ? [] : fromPublic(await load());
}

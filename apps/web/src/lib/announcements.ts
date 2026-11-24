// GLOSSARY: Announcement. What the app says on every screen for this visit, decided on the server from the Installation
// alone (today: the demo's reset notice). Nothing here depends on who the person is, and the text reaches every visitor's
// browser, so it never holds anything private. Operator-set Announcements may join this list later.
import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { DEMO_RESET_MINUTES } from "@ziffr/core/demo-reset-line";
import { sessionStartedAt } from "@/lib/session-start";
import { DEMO_VISIT_COOKIE } from "@/lib/demo-visit-cookie";
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

/** Names this visit, so a dismissal ends with it: a hash of the demo visit's id, or of the time the person signed in. Never the id itself. */
export async function announcementScope(demo: boolean): Promise<string> {
  const source = demo ? ((await cookies()).get(DEMO_VISIT_COOKIE)?.value ?? "demo") : String((await sessionStartedAt())?.getTime() ?? "session");
  return createHash("sha256").update(source).digest("hex").slice(0, 12);
}

import "server-only";
// The desktop-only message on a page (spec 0055; GLOSSARY: Screen Link): the note of larger-screen-note.tsx with the
// one thing only the server knows, whether this person may email themself the link.
import { isDemo } from "@/lib/auth";
import { currentWorkspaceId, myWorkspaces, viewerId } from "@/lib/viewer";
import { LargerScreenNote } from "./larger-screen-note";

/** Whether "Send me the link" is offered: not in the demo, which sends nothing, not to a Guest and not to someone with no
 * Workspace yet (the email is one of a Workspace's Deliveries). Only what is shown: the core decides again on a press. */
export async function maySendLink(): Promise<boolean> {
  if (await isDemo()) return false;
  const mine = await myWorkspaces(await viewerId());
  if (!mine.length) return false;
  const current = await currentWorkspaceId();
  return mine.some((w) => w.id === current && w.role !== "guest");
}

/** "This is easier on a larger screen" at the top of the page at `path`, shown on a phone only; `look` is the address of
 * a view that only reads. */
export async function DesktopOnly({ path, look }: { path: string; look?: string }) {
  return <LargerScreenNote path={path} send={await maySendLink()} look={look ? { href: look } : undefined} />;
}

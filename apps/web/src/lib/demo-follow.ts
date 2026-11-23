// A demo page open across a Demo Reset (GLOSSARY: Demo Reset; spec 0051, ticket 7): the seed's dashboards and decks have new
// ids after a reset, so a page for an id that is gone but was kept in `demo_previous_ids` goes to the same name's new id.
// Only where visitors may change the demo (the setting in effect), so with it off a page for an unknown id is what it was.
import "server-only";
import { redirect } from "next/navigation";
import { demoChangesInEffect } from "@ziffr/core/demo-reset-decision";
import { demoSuccessor, type SuccessorKind } from "@ziffr/core/demo-successor";
import { settingsInEffect } from "@ziffr/core/settings-in-effect";
import { isDemo } from "@/lib/auth";
import { currentActor } from "@/lib/viewer";

const BASE: Record<SuccessorKind, string> = { dashboard: "/dashboards", deck: "/decks" };

/** Redirects to the successor of an id that is not found, with the rest of the address (`rest`: "/present", "?view=read"), and
 * returns when there is none (not the demo, the setting off, nothing kept, nothing the person may open by that name). */
export async function followDemoSuccessor(kind: SuccessorKind, oldId: number, rest = ""): Promise<void> {
  if (!(await isDemo()) || !demoChangesInEffect(await settingsInEffect())) return;
  const to = await demoSuccessor(await currentActor(), kind, oldId).catch(() => null);
  if (to !== null) redirect(`${BASE[kind]}/${to}${rest}`);
}

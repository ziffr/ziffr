// Appearance (#505; GLOSSARY: Appearance): which look the server draws a page in. A signed-in person's stored choice
// decides, so it follows them to every device; the browser's cookie covers screens with no person (sign-in, the
// demo, where nothing is stored). The root layout writes the result on <html>, so the first paint is already right.
import { cookies } from "next/headers";
import { APPEARANCE_COOKIE, parseAppearance, type Appearance } from "@ziffr/core/appearance";
import { myAppearance } from "@ziffr/core/profile";
import type { Actor } from "@ziffr/core/actor";

/** The choice this browser last made; System without one. */
export async function browserAppearance(): Promise<Appearance> {
  return parseAppearance((await cookies()).get(APPEARANCE_COOKIE)?.value);
}

/** The choice to draw with: the actor's stored one, or the browser's where there is no real person (the demo). */
export async function appearanceFor(actor: Actor | null, demo: boolean): Promise<Appearance> {
  return actor && !demo ? myAppearance(actor) : browserAppearance();
}

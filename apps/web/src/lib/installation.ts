import "server-only";
// Who acts on the Installation (spec 0025; GLOSSARY: Installation Admin): the signed-in person behind the session,
// never a demo visitor's made-up person, whatever the demo cookie says. The core decides what they may do.
import type { InstallationActor } from "@ziffr/core/installation-admins";
import { signedIn } from "./auth";

/** The signed-in person as an InstallationActor, or null when nobody is signed in. */
export async function installationActor(): Promise<InstallationActor | null> {
  const who = await signedIn();
  return who ? { personId: who.personId } : null;
}

/** The release this server runs, such as "0.12.0" (the product version, not a GLOSSARY Version), as its image was
 * built (ADR 0014); null for a build without it (`pnpm prototype`). Shown to Installation Admins only: /api/health
 * tells nobody else which release runs. */
export function ziffrVersion(): string | null {
  const v = process.env.ZIFFR_VERSION?.trim();
  return v && v !== "dev" ? v.slice(0, 64) : null;
}

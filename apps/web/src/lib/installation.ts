import "server-only";
// Who acts on the Installation (spec 0025; GLOSSARY: Installation Admin, Admin Address): the signed-in person behind
// the session, never a demo visitor's made-up person, whatever the demo cookie says. The core decides what they may do.
// Where the Installation has an Admin Address (spec 0066), its pages and actions answer only there: asked here as well
// as in the middleware, because a server action can be posted to any page's address.
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { adminPagesHere, requestSide } from "@ziffr/core/admin-address";
import { isInstallationAdmin, type InstallationActor } from "@ziffr/core/installation-admins";
import { signedIn } from "./auth";

/** The signed-in person as an InstallationActor, on any address: for what is the person's own though only an
 * Installation Admin may (their Practice Workspace), and for whether to offer a way to the panel. */
export async function signedInActor(): Promise<InstallationActor | null> {
  const who = await signedIn();
  return who ? { personId: who.personId } : null;
}

/** Whether this request may reach the panel at all: anywhere, or only at the Admin Address where one is set. */
export async function panelAnswersHere(): Promise<boolean> {
  return adminPagesHere(await headers());
}

/** Whether this request reached the Admin Address, which serves only signing in and the panel. */
export async function atAdminAddress(): Promise<boolean> {
  return requestSide(await headers()) === "admin";
}

/** The signed-in person as an InstallationActor for the panel's operations, or null when nobody is signed in or the
 * request did not come where the panel answers. */
export async function installationActor(): Promise<InstallationActor | null> {
  return (await panelAnswersHere()) ? signedInActor() : null;
}

/** The Installation Admin a page of the panel is drawn for. Anyone signed out is sent to sign in and back to `path`;
 * anyone else, and any request away from the Admin Address, gets "not found". */
export async function panelPageActor(path: string): Promise<InstallationActor> {
  if (!(await panelAnswersHere())) notFound();
  const actor = await signedInActor();
  if (!actor) redirect(`/login?next=${path}`);
  if (!(await isInstallationAdmin(actor))) notFound();
  return actor;
}

/** The release this server runs, such as "0.12.0" (the product version, not a GLOSSARY Version), as its image was
 * built (ADR 0014); null for a build without it (`pnpm prototype`). Shown to Installation Admins only: /api/health
 * tells nobody else which release runs. */
export function ziffrVersion(): string | null {
  const v = process.env.ZIFFR_VERSION?.trim();
  return v && v !== "dev" ? v.slice(0, 64) : null;
}

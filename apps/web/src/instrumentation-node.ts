// The Node half of the start hook (spec 0025, ticket #196; GLOSSARY: Installation Admin): prints the setup code.
import { prepareSetupCode } from "@ziffr/core/installation-admins";

/** Prints a new setup code while the Installation has no Installation Admin; never stops the server from starting. */
export async function announceSetupCode(): Promise<void> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  try {
    await prepareSetupCode({ fresh: true });
  } catch {
    // The database may not be up yet (or not migrated): the claim page makes a code when it is opened.
    console.error("Ziffr: no setup code could be made at start; opening /installation makes one.");
  }
}

import "server-only";
import { createClient } from "@supabase/supabase-js";

// The web app's own database access, with the service role: only to find the signed-in person and their membership
// (auth.ts, viewer.ts) and for the demo's "view as" and reset. Every page read and change goes through the core, and
// CI checks that no other file uses this (.github/scripts/app-db-access.mjs; docs/security/threat-model.md).
export const db = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

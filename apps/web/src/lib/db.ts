import "server-only";
import { createClient } from "@supabase/supabase-js";

// PROTOTYPE: everything goes through the server with the service role.
// There is no per-user auth; "View as…" is a cookie (see viewer.ts).
export const db = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

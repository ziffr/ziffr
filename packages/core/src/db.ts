// The core's database access (spec 0001: one core). Only core functions use the service role, after checking who
// acts and in which Workspace; Row Level Security stays on with no policies, so nothing else can read the tables.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/** The service-role client, made on first use from SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. */
export function db(): SupabaseClient {
  // The service role never runs in a browser: a client component importing this fails at once.
  if (typeof window !== "undefined") throw new Error("The core's database access runs on the server only.");
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for the core.");
    client = createClient(url, key, { auth: { persistSession: false } });
  }
  return client;
}

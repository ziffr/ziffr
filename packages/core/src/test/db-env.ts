// Points the core at the local Supabase for database tests, unless SUPABASE_URL and the service key are already set
// (as in CI). The service key of a local Supabase is a fixed development key, not a secret.
import { execFileSync } from "node:child_process";

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  const status = JSON.parse(execFileSync("supabase", ["status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
  process.env.SUPABASE_URL ??= status.API_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= status.SERVICE_ROLE_KEY;
}

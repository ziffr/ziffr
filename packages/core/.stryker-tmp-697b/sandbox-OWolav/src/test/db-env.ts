// @ts-nocheck
// Points the core at the local Supabase for database tests, unless SUPABASE_URL and the service key are already set
// (as in CI). The service key of a local Supabase is a fixed development key, not a secret.
import { execFileSync } from "node:child_process";

/** The settings `supabase status -o json` prints. While a container's health check is slow (often under load) it
 * fails and prints none, though the database answers; so it is asked again, for up to a minute. */
function localStatus(): { API_URL?: string; SERVICE_ROLE_KEY?: string } {
  for (let attempt = 0; attempt < 30; attempt++) {
    let out = "";
    try {
      out = execFileSync("supabase", ["status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    } catch (e) {
      out = String((e as { stdout?: string }).stdout ?? "");
    }
    try {
      const status = JSON.parse(out.slice(out.indexOf("{")));
      if (status.API_URL && status.SERVICE_ROLE_KEY) return status;
    } catch {
      // Not JSON yet: try again.
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2000);
  }
  throw new Error("Local Supabase does not answer: start it with `supabase start`.");
}

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  const status = localStatus();
  process.env.SUPABASE_URL ??= status.API_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= status.SERVICE_ROLE_KEY;
}

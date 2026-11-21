// Vitest global setup for the database tests: waits until the API answers a real query before any test file starts.
// Right after `supabase db reset` (and CI's first start) PostgREST has not yet reconnected to the database and answers
// PGRST001 "no connection to the server" for a few seconds; the first test files to run failed with it (#476).
// It also makes sure the demo Workspace is seeded: CI and `pnpm prototype` seed it with supabase/seed.sql on reset, but
// a database started from a bare config (agents' own stacks) has none, and the demo tests then failed until another
// test happened to reset it (#489).
import "./db-env";

/** Polls the REST API for one row of a small table until it answers, for up to a minute. */
export default async function waitForDatabaseApi(): Promise<void> {
  const url = `${process.env.SUPABASE_URL}/rest/v1/profiles?select=id&limit=1`;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  let last = "no answer";
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const res = await fetch(url, { headers: { apikey: key, authorization: `Bearer ${key}` } });
      if (res.ok) return await ensureDemoSeeded(url.split("/rest/v1")[0]!, key);
      last = `${res.status} ${await res.text()}`;
    } catch (e) {
      last = String(e);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`The database API did not become ready: ${last}`);
}

/** Seeds the demo Workspace the way seed.sql does when it has no Dashboards, so every database starts with it. */
async function ensureDemoSeeded(base: string, key: string): Promise<void> {
  const headers = { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" };
  const demo = "d3e00000-0000-4000-8000-000000000001"; // DEMO_WORKSPACE_ID (team.ts), not imported: this runs before the app code
  const probe = await fetch(`${base}/rest/v1/dashboards?select=id&workspace_id=eq.${demo}&limit=1`, { headers });
  if (!probe.ok) throw new Error(`The demo could not be checked: ${probe.status} ${await probe.text()}`);
  if ((await probe.json() as unknown[]).length > 0) return;
  const seed = await fetch(`${base}/rest/v1/rpc/demo_reset`, { method: "POST", headers, body: JSON.stringify({ min_gap: "0 seconds" }) });
  if (!seed.ok) throw new Error(`The demo could not be seeded: ${seed.status} ${await seed.text()}`);
}

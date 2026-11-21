// Vitest global setup for the database tests: waits until the API answers a real query before any test file starts.
// Right after `supabase db reset` (and CI's first start) PostgREST has not yet reconnected to the database and answers
// PGRST001 "no connection to the server" for a few seconds; the first test files to run failed with it (#476).
import "./db-env";

/** Polls the REST API for one row of a small table until it answers, for up to a minute. */
export default async function waitForDatabaseApi(): Promise<void> {
  const url = `${process.env.SUPABASE_URL}/rest/v1/profiles?select=id&limit=1`;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  let last = "no answer";
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const res = await fetch(url, { headers: { apikey: key, authorization: `Bearer ${key}` } });
      if (res.ok) return;
      last = `${res.status} ${await res.text()}`;
    } catch (e) {
      last = String(e);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`The database API did not become ready: ${last}`);
}

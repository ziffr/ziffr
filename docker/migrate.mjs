// Brings an Installation's database up to this version (spec 0015, ADR 0008), on every start of Docker Compose, after
// Auth made its schema and before the app starts. Migrations are applied by the Supabase CLI (`supabase db push`),
// the same command and the same history table as with a Supabase project of one's own, so an Installation can move
// between the two. Migrations only add (AGENTS.md), so the app of the version before keeps working meanwhile.
// The first time, it also fills in the demo's made-up company, unless ZIFFR_DEMO=0.
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, writeFileSync } from "node:fs";

const env = process.env;
const DIR = env.ZIFFR_KEYS_DIR || "/keys";

// The CLI writes notes beside the migrations; this service's user owns nothing in /app, so it works on a copy.
const work = "/tmp/ziffr-migrate";
cpSync("/app/supabase", `${work}/supabase`, { recursive: true });
const push = spawnSync("supabase", ["db", "push", "--db-url", env.ZIFFR_DB_URL, "--include-all", "--yes"], {
  cwd: work,
  stdio: ["ignore", "inherit", "inherit"],
  env: { ...env, HOME: work, SUPABASE_TELEMETRY_DISABLED: "1", DO_NOT_TRACK: "1" },
});
if (push.status !== 0) {
  console.error("Ziffr: the migrations could not be applied; the app does not start on a database it does not fit.");
  process.exit(push.status ?? 1);
}

const demoDone = `${DIR}/state/demo-filled`;
if (env.ZIFFR_DEMO !== "0" && !existsSync(demoDone)) {
  // Through PostgREST with the service role, as the app's own reset does: demo_reset is granted to nothing else.
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/demo_reset`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ min_gap: "0 seconds" }),
  });
  if (!res.ok) {
    // The demo is not worth stopping the Installation for; visitors can fill it in from the login page.
    console.error(`Ziffr: the demo could not be filled in (${res.status}): ${(await res.text()).slice(0, 300)}`);
  } else {
    writeFileSync(demoDone, new Date().toISOString() + "\n");
    console.log("Ziffr: the demo is filled in.");
  }
}
console.log("Ziffr: the database is up to date.");

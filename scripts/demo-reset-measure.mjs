// Measures what one reset of the demo costs (spec 0051, ticket 1; GLOSSARY: Demo Reset): the time, the rows written and
// the WAL bytes of `demo_reset` alone (the SQL step), then of the whole job (`demo_reset` plus the core's part,
// `resetDemoWorkspace`: pins, Snapshots, the close, Filled-in Values, the Outbox), so the owner can see on a copy of
// demo.ziffr.net's database whether a reset every 15 minutes is small. Run it against a COPY, never the live demo:
// it resets the demo twice.
//
//   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
//   ZIFFR_APP_URL=http://localhost:3000 ZIFFR_JOB_SECRET=... node scripts/demo-reset-measure.mjs
//
// Needs `psql` on the path and the app running against the same database (the job route does the core's part), with
// ZIFFR_DEMO_CHANGES off (or the demo marked changed), as the job skips a clean, young demo where it is on. The
// secret is only sent to the app as the jobs guide says (docs/guides/jobs.md). CPU is not read here: watch the
// database's and the app's CPU while it runs (`docker stats`), or read the times beside the box's cores.
import { execFileSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const DB = process.env.DATABASE_URL;
const APP = process.env.ZIFFR_APP_URL || "http://localhost:3000";
const SECRET = process.env.ZIFFR_JOB_SECRET;
if (!DB || !SECRET) {
  console.error("Set DATABASE_URL (a copy of the demo's database), ZIFFR_APP_URL and ZIFFR_JOB_SECRET.");
  process.exit(1);
}

/** Runs one statement in psql and returns its single value, trimmed. */
function sql(statement) {
  return execFileSync(process.env.PSQL || "psql", [DB, "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", statement], { encoding: "utf8" }).trim();
}

/** Rows inserted, updated and deleted in every public table so far, and the WAL position. */
function counters() {
  const rows = sql("select coalesce(sum(n_tup_ins + n_tup_upd + n_tup_del), 0) from pg_stat_user_tables where schemaname = 'public'");
  return { rows: Number(rows), lsn: sql("select pg_current_wal_lsn()") };
}

/** What `work` cost: seconds, rows touched and WAL bytes. */
async function measure(label, work) {
  await sleep(1500); // The statistics are flushed about a second after a transaction ends.
  const before = counters();
  const started = process.hrtime.bigint();
  await work();
  const seconds = Number(process.hrtime.bigint() - started) / 1e9;
  await sleep(1500);
  const after = counters();
  const wal = Number(sql(`select pg_wal_lsn_diff('${after.lsn}', '${before.lsn}')`));
  console.log(`${label}: ${seconds.toFixed(2)} s, ${after.rows - before.rows} rows touched, ${(wal / 1048576).toFixed(2)} MB of WAL (${wal} bytes)`);
  return { seconds, rows: after.rows - before.rows, wal };
}

console.log(`Database: ${sql("select current_database() || ' on ' || version()")}`);
console.log(`Demo rows now: ${sql("select count(*) from observations where workspace_id = 'd3e00000-0000-4000-8000-000000000001'")} values`);

await measure("demo_reset alone (the SQL step)", async () => {
  sql("select demo_reset(interval '0 seconds')");
});
// demo_reset says false inside its minimum gap, so the whole job waits for it to pass.
console.log("Waiting 61 seconds for the minimum gap between two resets...");
await sleep(61_000);
await measure("the whole job (demo_reset + the core's part)", async () => {
  const res = await fetch(`${APP}/api/jobs/demo-reset`, { method: "POST", headers: { authorization: `Bearer ${SECRET}` } });
  const body = await res.text();
  if (!res.ok || !body.includes('"reset":true')) throw new Error(`The job answered ${res.status} ${body.slice(0, 200)}: it did not reset.`);
});
console.log(`Generation now: ${sql("select generation from demo_state")}`);
console.log("The core's part is the difference between the two lines. Dead rows left for vacuum:", sql("select coalesce(sum(n_dead_tup), 0) from pg_stat_user_tables where schemaname = 'public'"));

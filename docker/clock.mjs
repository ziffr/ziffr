// The scheduler of a Docker Compose Installation (spec 0015; the jobs: docs/guides/jobs.md). Calls the app's jobs
// with the job secret: Workflows at the start of every hour (each workspace runs at its own hour), deliveries every
// five minutes. A failed call is logged and tried at the next turn; the jobs themselves catch up on what was missed.
import { writeFileSync } from "node:fs";

const APP = process.env.ZIFFR_APP_URL || "http://app:3000";
// Touched on every turn; the health check in docker/compose.yml looks at its age.
const ALIVE = "/tmp/ziffr-clock-alive";
const SECRET = process.env.ZIFFR_JOB_SECRET;
if (!SECRET || SECRET.length < 32) {
  console.error("Ziffr clock: ZIFFR_JOB_SECRET is missing or shorter than 32 characters.");
  process.exit(1);
}

async function call(job, quiet404 = false) {
  try {
    const res = await fetch(`${APP}/api/jobs/${job}`, {
      method: "POST",
      headers: { authorization: `Bearer ${SECRET}` },
      signal: AbortSignal.timeout(10 * 60_000),
    });
    // A job for something this Installation does not offer (no demo, no trials) answers 404: nothing to say.
    if (quiet404 && res.status === 404) return;
    console.log(`${new Date().toISOString()} ${job}: ${res.status} ${(await res.text()).slice(0, 200)}`);
  } catch (e) {
    console.error(`${new Date().toISOString()} ${job}: ${e instanceof Error ? e.message : e}`);
  }
}

// The demo is seeded again every night, at 03:30 UTC, away from the hour when Workflows run, so its made-up history
// keeps reaching up to today (visitors cannot change it). Trials are reminded, closed and deleted every hour at twenty
// past (spec 0021). Both are offered from the settings file or the Installation settings page (spec 0025), so the
// clock calls them unless docker/init.mjs says no, and a job for something not offered answers 404 quietly.
const DEMO_RESET = process.env.ZIFFR_DEMO_RESET !== "0";
const TRIAL_CLEANUP = process.env.ZIFFR_TRIAL_CLEANUP !== "0";

// One turn a minute: deliveries on every fifth minute, Workflows on the hour.
let last = -1;
setInterval(() => {
  writeFileSync(ALIVE, "");
  const now = new Date();
  const minute = Math.floor(now.getTime() / 60_000);
  if (minute === last) return;
  last = minute;
  if (now.getUTCMinutes() % 5 === 0) void call("deliveries");
  if (now.getUTCMinutes() === 0) void call("workflows");
  if (DEMO_RESET && now.getUTCHours() === 3 && now.getUTCMinutes() === 30) void call("demo-reset", true);
  if (TRIAL_CLEANUP && now.getUTCMinutes() === 20) void call("trial-cleanup", true);
  // Unused Workspaces (spec 0029): daily at 04:10 UTC; it does nothing unless ZIFFR_DELETE_UNUSED_AFTER_DAYS is set.
  if (now.getUTCHours() === 4 && now.getUTCMinutes() === 10) void call("unused-workspaces");
}, 15_000);
writeFileSync(ALIVE, "");
console.log(`Ziffr clock: calling ${APP} (Workflows hourly, deliveries every five minutes${DEMO_RESET ? ", the demo's seed nightly at 03:30 UTC where it is offered" : ""}${TRIAL_CLEANUP ? ", trials hourly where they are offered" : ""}, unused Workspaces daily).`);

// The scheduler of a Docker Compose Installation (spec 0015; the jobs: docs/guides/jobs.md). Calls the app's jobs
// with the job secret: Workflows at the start of every hour (each workspace runs at its own hour), deliveries every
// five minutes. A failed call is logged and tried at the next turn; the jobs themselves catch up on what was missed.
import { spawn } from "node:child_process";
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
// Where visitors may change the demo (spec 0051: ZIFFR_DEMO_CHANGES, in effect only in a demo-only Ziffr; the setting
// does not exist as a page setting yet), the job is called every 15 minutes, at 10, 25, 40 and 55 past, and resets only
// a demo a visitor changed or one that is no longer young. Off, as today: nightly at 03:30 UTC.
const DEMO_CHANGES = process.env.ZIFFR_DEMO_CHANGES === "1" && process.env.ZIFFR_DEMO_ONLY === "1";
const TRIAL_CLEANUP = process.env.ZIFFR_TRIAL_CLEANUP !== "0";

// The Usage Feed (spec 0031) is a Feed, outside Ziffr (ADR 0006): a program of its own that the clock only starts, as
// a cron would. Off unless both keys are in the clock's settings (docker/init.mjs writes them from the settings file
// and nowhere else): no keys, no child, no outgoing request. It does not get the job secret.
const USAGE_FEED = Boolean(process.env.ZIFFR_USAGE_KEY?.trim() && process.env.ZIFFR_USAGE_FEED_KEY?.trim());

/** Runs the Usage Feed once with a week of backfill and logs its summary line and exit code; a failed run is tried the next day. */
function runUsageFeed() {
  const { ZIFFR_JOB_SECRET: _secret, ...rest } = process.env;
  const child = spawn(process.execPath, ["docker/usage-feed.mjs", "run", "--backfill", "7"], {
    env: { ...rest, ZIFFR_APP_URL: APP },
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 10 * 60_000,
  });
  let out = "";
  const keep = (chunk) => { out = (out + chunk).slice(-2000); };
  child.stdout.on("data", keep);
  child.stderr.on("data", keep);
  child.on("error", (e) => console.error(`${new Date().toISOString()} usage-feed: ${e.message}`));
  child.on("close", (code) => {
    const line = out.trim().split("\n").pop() ?? "";
    console.log(`${new Date().toISOString()} usage-feed: exit ${code}${line ? `: ${line.slice(0, 300)}` : ""}`);
  });
}

// One turn a minute: deliveries on every fifth minute, Workflows on the hour.
let last = -1;
setInterval(() => {
  writeFileSync(ALIVE, "");
  const now = new Date();
  const minute = Math.floor(now.getTime() / 60_000);
  if (minute === last) return;
  last = minute;
  if (now.getUTCMinutes() % 5 === 0) void call("deliveries");
  // Workspace Keys (spec 0028): every five minutes, two past, the rows still in clear are sealed a little at a time; a
  // turn with nothing to do is a few counts, and without ZIFFR_SECRETS_KEY it only answers that it waits.
  if (now.getUTCMinutes() % 5 === 2) void call("workspace-keys");
  if (now.getUTCMinutes() === 0) void call("workflows");
  // Heads-ups (spec 0041): every hour, ten past; a Workspace is scanned at most every six hours, so most calls are a few counts.
  if (now.getUTCMinutes() === 10) void call("heads-ups");
  if (DEMO_RESET && !DEMO_CHANGES && now.getUTCHours() === 3 && now.getUTCMinutes() === 30) void call("demo-reset", true);
  if (DEMO_RESET && DEMO_CHANGES && now.getUTCMinutes() % 15 === 10) void call("demo-reset", true);
  if (TRIAL_CLEANUP && now.getUTCMinutes() === 20) void call("trial-cleanup", true);
  // Unused Workspaces (spec 0029): daily at 04:10 UTC; it does nothing unless ZIFFR_DELETE_UNUSED_AFTER_DAYS is set.
  if (now.getUTCHours() === 4 && now.getUTCMinutes() === 10) void call("unused-workspaces");
  // Usage figures (spec 0031): the day's rollup, daily at 04:40 UTC; it only counts, and sends nothing anywhere.
  if (now.getUTCHours() === 4 && now.getUTCMinutes() === 40) void call("usage-rollup");
  // ...and the Usage Feed at 05:00 UTC, after the rollup, only where it was turned on with its two keys.
  if (USAGE_FEED && now.getUTCHours() === 5 && now.getUTCMinutes() === 0) runUsageFeed();
  // The monthly usage digest (spec 0031): daily at 07:00 UTC; the job acts on days 1 to 7 of a month, once per Owner and
  // month, queues the emails and does nothing without working email.
  if (now.getUTCHours() === 7 && now.getUTCMinutes() === 0) void call("usage-digest");
  // Retention (spec 0033): daily at 02:40 UTC, away from the other jobs. Confirmed Retentions start and are reminded of,
  // then old values are condensed or deleted in small steps; it does nothing where no Metric has a Retention.
  if (now.getUTCHours() === 2 && now.getUTCMinutes() === 40) void call("retention");
}, 15_000);
writeFileSync(ALIVE, "");
console.log(`Ziffr clock: calling ${APP} (Workflows and Heads-ups hourly, deliveries and the Workspace Keys' re-encryption every five minutes${DEMO_RESET ? (DEMO_CHANGES ? ", the demo's reset every 15 minutes when it was changed" : ", the demo's seed nightly at 03:30 UTC where it is offered") : ""}${TRIAL_CLEANUP ? ", trials hourly where they are offered" : ""}, unused Workspaces daily, Retention daily at 02:40 UTC${USAGE_FEED ? ", the Usage Feed daily at 05:00 UTC" : ""}).`);

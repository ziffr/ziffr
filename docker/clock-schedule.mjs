// What the clock of a Docker Compose Installation (docker/clock.mjs) knows about the demo, and when it calls the demo's
// reset job (spec 0051, docs/guides/jobs.md). Kept apart from the clock so docker/init.mjs writes exactly what the clock
// reads, and both can be tried without starting either.

/** The demo settings the clock needs, taken from the settings init sees: the clock's own environment is its settings file alone, so these must be written to it or the clock never calls the 15-minute reset. Only "1" is written, as the app reads only "1". */
export function demoSettingsForClock(settings) {
  return Object.fromEntries(["ZIFFR_DEMO_ONLY", "ZIFFR_DEMO_CHANGES"].filter((k) => settings[k] === "1").map((k) => [k, "1"]));
}

/** Whether visitors may change the demo, as the clock reads it: both settings, as in the core's `demoChangesInEffect`. */
export function demoChangesOn(settings) {
  return settings.ZIFFR_DEMO_CHANGES === "1" && settings.ZIFFR_DEMO_ONLY === "1";
}

/** Whether the clock calls the demo's reset job at this minute: every 15 minutes (10, 25, 40, 55 past) where visitors may change the demo, nightly at 03:30 UTC otherwise; never when ZIFFR_DEMO_RESET=0. */
export function demoResetDue(now, settings) {
  if (settings.ZIFFR_DEMO_RESET === "0") return false;
  if (demoChangesOn(settings)) return now.getUTCMinutes() % 15 === 10;
  return now.getUTCHours() === 3 && now.getUTCMinutes() === 30;
}

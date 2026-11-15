// The arguments of a Feed command (spec 0012, GLOSSARY: Feed): `run <file>` with its options, shared by `ziffr-feed`
// and Feeds built on the kit, such as `ziffr-feed-sql`. Pure.

/** What `--help` and a wrong call print, for a command named `name` that runs a `what`. */
export function usage(name = "ziffr-feed", what = "A module whose default export is defineFeed({ name, metrics })."): string {
  return `Usage: ${name} run <feed file> [--backfill N] [--dry-run] [--json]

  <feed file>    ${what}
  --backfill N   Also fill the N periods before the current one where they have no value yet.
  --dry-run      Fetch and show what would be sent; send nothing.
  --json         Print the whole report as JSON.

Environment: ZIFFR_URL (where Ziffr runs) and ZIFFR_FEED_KEY (a Feed Key from Settings, Feeds).`;
}

/** A command's arguments, checked: `run <file>` and its options. */
export function parseArgs(argv: string[], help = usage()): { file: string; backfill: number; dryRun: boolean; json: boolean } {
  const [command, file, ...rest] = argv;
  if (command !== "run" || !file) throw new Error(help);
  let backfill = 0, dryRun = false, json = false;
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === "--dry-run") dryRun = true;
    else if (rest[i] === "--json") json = true;
    else if (rest[i] === "--backfill") {
      backfill = Number(rest[++i]);
      if (!Number.isInteger(backfill) || backfill < 0 || backfill > 1000) throw new Error("--backfill takes a whole number from 0 to 1000.");
    } else throw new Error(`Unknown option ${rest[i]}.\n\n${help}`);
  }
  return { file, backfill, dryRun, json };
}

/** Prints a run's report the way the commands do, and sets a failing exit code when a fetch failed or Ziffr refused
 * a value, so a scheduler notices. */
export function printReport(report: import("./index.js").RunReport, args: { dryRun: boolean; json: boolean }, summary: (r: import("./index.js").RunReport) => string): void {
  if (args.json) console.log(JSON.stringify(report, null, 2));
  else {
    if (args.dryRun) for (const i of report.items) console.log(`${i.metric}\t${i.period}\t${i.value}${i.breakdown ? `\t(${i.breakdown.length} breakdown rows)` : ""}`);
    console.log(summary(report));
  }
  if (report.failed.length || report.counts.refused) process.exitCode = 1;
}

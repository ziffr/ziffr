#!/usr/bin/env node
// The `ziffr-feed-sql` command (spec 0012, GLOSSARY: Feed): `ziffr-feed-sql run feed.yaml` runs a SQL Feed once, with
// ZIFFR_URL, ZIFFR_FEED_KEY and the read-only connection string (FEED_SQL_URL, or the variable the file names) from
// the environment. Exits 1 when a query failed or Ziffr refused a value, so the scheduler notices.
import { parseArgs, printReport, runAsCommand, runFeed, summary, usage } from "@ziffr/feed-kit";
import { openRunner, readConfig, sqlFeed } from "./index.js";

async function main() {
  const args = parseArgs(process.argv.slice(2), usage("ziffr-feed-sql", "A YAML file: name, connection_env and a query per Metric slug."));
  const config = await readConfig(args.file);
  const db = await openRunner(config, process.env);
  try {
    const report = await runFeed(sqlFeed(config, db), { backfill: args.backfill, dryRun: args.dryRun, log: (line) => console.error(line) });
    printReport(report, args, summary);
  } finally {
    await db.close();
  }
}

// Run only as the command, not when a test imports it.
runAsCommand(import.meta.url, main);

#!/usr/bin/env node
// The `ziffr-feed-sql` command (spec 0012, GLOSSARY: Feed): `ziffr-feed-sql run feed.yaml` runs a SQL Feed once, with
// ZIFFR_URL, ZIFFR_FEED_KEY and the read-only connection string (FEED_SQL_URL, or the variable the file names) from
// the environment. Exits 1 when a query failed or Ziffr refused a value, so the scheduler notices.
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs, printReport, runFeed, summary, usage } from "@ziffr/feed-kit";
import { connect, DEFAULT_CONNECTION_ENV, readConfig, sqlFeed } from "./index.js";

async function main() {
  const args = parseArgs(process.argv.slice(2), usage("ziffr-feed-sql", "A YAML file: name, connection_env and a query per Metric slug."));
  const config = await readConfig(args.file);
  const variable = config.connection_env ?? DEFAULT_CONNECTION_ENV;
  const url = process.env[variable];
  if (!url) throw new Error(`Set ${variable} to a read-only connection string for the database.`);
  const db = connect(url, config.statement_timeout_ms);
  try {
    const report = await runFeed(sqlFeed(config, db), { backfill: args.backfill, dryRun: args.dryRun, log: (line) => console.error(line) });
    printReport(report, args, summary);
  } finally {
    await db.close();
  }
}

// The bin is a symlink (node_modules/.bin), so the real path of what was started is compared.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(resolve(process.argv[1]))).href) {
  main().catch((e) => {
    console.error((e as Error).message);
    process.exit(1);
  });
}

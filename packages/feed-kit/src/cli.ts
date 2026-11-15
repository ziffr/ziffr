#!/usr/bin/env node
// The `ziffr-feed` command (spec 0012, GLOSSARY: Feed): `ziffr-feed run <file>` loads a Feed (a module whose default
// export is defineFeed(...)) and runs it once, with ZIFFR_URL and ZIFFR_FEED_KEY from the environment. Meant for
// cron, a GitHub Action, a container or any scheduler. Exits 1 when a fetch failed or Ziffr refused a value, so the
// scheduler notices.
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { runFeed, summary, type FeedDefinition } from "./index.js";
import { parseArgs, printReport } from "./args.js";

export { parseArgs } from "./args.js";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const mod = await import(pathToFileURL(resolve(args.file)).href) as { default?: FeedDefinition };
  if (!mod.default) throw new Error(`${args.file} has no default export; export default defineFeed({ ... }).`);
  const report = await runFeed(mod.default, { backfill: args.backfill, dryRun: args.dryRun, log: (line) => console.error(line) });
  printReport(report, args, summary);
}

// Run only as the command, not when a test imports parseArgs.
// The bin is a symlink (node_modules/.bin), so the real path of what was started is compared.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(resolve(process.argv[1]))).href) {
  main().catch((e) => {
    console.error((e as Error).message);
    process.exit(1);
  });
}

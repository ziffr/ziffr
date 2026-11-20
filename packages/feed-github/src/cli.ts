#!/usr/bin/env node
// The `ziffr-feed-github` command (spec 0031, GLOSSARY: Feed): `ziffr-feed-github run [--dry-run]` reads a repository's
// public download counts, stars and forks and sends them with a Feed Key. Off while the Feed Key is missing: it says
// so, sends nothing and exits 0, so a scheduled job stays green. Exits 1 when GitHub could not be read or Ziffr
// refused a value, so the scheduler notices.
import { parseArgs, printReport, runAsCommand, runFeed, summary } from "@ziffr/feed-kit";
import { githubFeed, readRepo, settingsFrom } from "./index.js";

const HELP = `Usage: ziffr-feed-github run [--dry-run] [--json]

  --dry-run      Read GitHub and show what would be sent; send nothing.
  --json         Print the whole report as JSON.

Settings: ZIFFR_GITHUB_FEED_KEY (without it nothing runs), ZIFFR_GITHUB_FEED_URL (where the Workspace runs),
ZIFFR_GITHUB_REPO (default ziffr/ziffr) and GITHUB_TOKEN (optional, only lifts GitHub's rate limit).`;

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  // The kit's parser wants a feed file; this Feed is built in, so a placeholder stands in for it.
  const args = parseArgs([command ?? "", "-", ...rest], HELP);
  const settings = settingsFrom(process.env);
  if (!settings) {
    console.log("GitHub Feed is off: ZIFFR_GITHUB_FEED_KEY is not set (add it as a secret to turn it on). Nothing was sent.");
    return;
  }
  // Read first: a failing GitHub is one message and one exit code, not one failure per Metric.
  const figures = await readRepo(settings);
  const report = await runFeed(githubFeed(async () => figures), { url: settings.feedUrl, feedKey: settings.feedKey, dryRun: args.dryRun, log: (line) => console.error(line) });
  printReport(report, args, summary);
}

// Run only as the command, not when a test imports it.
runAsCommand(import.meta.url, main);

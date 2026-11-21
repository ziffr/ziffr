#!/usr/bin/env node
// The `ziffr-feed-usage` command (spec 0031, GLOSSARY: Usage Feed): `ziffr-feed-usage run [--backfill N] [--dry-run]`
// reads the Installation's Usage figures with a Usage Key and sends them with a Feed Key. Off while either key is
// missing: it says so, sends nothing and exits 0, so a cron line can stay in place. Exits 1 when a figure could not be
// fetched or Ziffr refused a value, so the scheduler notices.
import { parseArgs, printReport, runAsCommand, runFeed, summary } from "@ziffr/feed-kit";
import { readUsage, readWorkspaceUsage, settingsFrom, usageFeed, workspaceSettingsFrom } from "./index.js";

const HELP = `Usage: ziffr-feed-usage run [--workspace] [--backfill N] [--dry-run] [--json]

  --workspace    Send one Workspace's own figures (views, values by Source, what goes unused) instead of the
                 Installation's totals: read with an Access Key that has the scope "Read usage figures".

  --backfill N   Also fill the N periods before the current one where they have no value yet.
  --dry-run      Fetch and show what would be sent; send nothing.
  --json         Print the whole report as JSON.

Settings: ZIFFR_USAGE_KEY and ZIFFR_USAGE_FEED_KEY (both, or nothing runs), ZIFFR_USAGE_SOURCE_URL (default
ZIFFR_APP_URL) and ZIFFR_USAGE_FEED_URL (default: the source).
With --workspace: ZIFFR_USAGE_ACCESS_KEY and ZIFFR_USAGE_FEED_KEY (both, or nothing runs) and ZIFFR_USAGE_FEED_URL
(default ZIFFR_USAGE_SOURCE_URL, then ZIFFR_APP_URL): the Installation that holds the Workspace.`;

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  // The kit's parser wants a feed file; the Usage Feed is built in, so a placeholder stands in for it.
  const workspaceMode = rest.includes("--workspace");
  const args = parseArgs([command ?? "", "-", ...rest.filter((a) => a !== "--workspace")], HELP);
  if (workspaceMode) {
    const own = workspaceSettingsFrom(process.env);
    if (!own) {
      console.log("Usage Feed (--workspace) is off: set ZIFFR_USAGE_ACCESS_KEY and ZIFFR_USAGE_FEED_KEY to turn it on. Nothing was sent.");
      return;
    }
    const days = await readWorkspaceUsage(own);
    const report = await runFeed(usageFeed(async () => days, "workspace"), { url: own.url, feedKey: own.feedKey, backfill: args.backfill, dryRun: args.dryRun, log: (line) => console.error(line) });
    printReport(report, args, summary);
    return;
  }
  const settings = settingsFrom(process.env);
  if (!settings) {
    console.log("Usage Feed is off: set ZIFFR_USAGE_KEY and ZIFFR_USAGE_FEED_KEY to turn it on. Nothing was sent.");
    return;
  }
  // Read first: a failing endpoint is one message and one exit code, not one failure per figure.
  const rows = await readUsage(settings);
  const feed = usageFeed(async () => rows);
  const report = await runFeed(feed, { url: settings.feedUrl, feedKey: settings.feedKey, backfill: args.backfill, dryRun: args.dryRun, log: (line) => console.error(line) });
  printReport(report, args, summary);
}

// Run only as the command, not when a test imports it.
runAsCommand(import.meta.url, main);

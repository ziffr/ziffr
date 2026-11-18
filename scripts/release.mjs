#!/usr/bin/env node
// `pnpm release` (ADR 0004): presses the Release button, the same as Actions → Release → Run workflow on main, and
// prints the link to the run. The run does the whole release on GitHub (.github/workflows/release.yml); nothing is
// changed on this computer, so a stale branch or tag here cannot stop it. Only the repository's owner can start it.
import { execFileSync } from "node:child_process";

const REPO = "ziffr/ziffr";
const gh = (...args) => execFileSync("gh", [...args, "-R", REPO], { encoding: "utf8" }).trim();
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const latest = () => JSON.parse(gh("run", "list", "--workflow", "release.yml", "--event", "workflow_dispatch", "--limit", "1", "--json", "databaseId,url"))[0];

const before = latest()?.databaseId;
gh("workflow", "run", "release.yml", "--ref", "main");
let url = `https://github.com/${REPO}/actions/workflows/release.yml`;
for (let i = 0; i < 12; i++) {
  await pause(5000);
  const run = latest();
  if (run && run.databaseId !== before) { url = run.url; break; }
}
console.log(`The release is running on GitHub; nothing more to do:\n  ${url}\nIt merges the release once its checks pass, tags it, and publishes the release and the image.`);

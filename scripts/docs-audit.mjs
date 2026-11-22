#!/usr/bin/env node
// A cheap docs audit before a release (ticket #571, part 6): which user guide chapters describe screens that changed
// since the last release tag, and were not touched since. A person reads each listed chapter next to the release notes
// (`node scripts/next-release.mjs`) and fixes it or opens a ticket. Changes nothing. Needs the full git history.
import { execFileSync } from "node:child_process";
import { previousTag } from "./next-release.mjs";
import { chaptersToUpdate, readChapters } from "./guide-screens.mjs";

const since = previousTag();
const changed = execFileSync("git", ["diff", "--name-only", `${since}..HEAD`], { encoding: "utf8" }).split("\n").filter(Boolean);
// chaptersToUpdate drops a chapter that changed too, which is what is wanted: those were kept up to date.
const stale = chaptersToUpdate(changed, readChapters("."));
console.log(`Docs audit since ${since}: ${stale.length} chapter(s) describe changed screens and did not change.\n`);
for (const s of stale) console.log(`- [ ] ${s.chapter}\n${s.files.map((f) => `      ${f}`).join("\n")}`);
if (stale.length) console.log("\nRead each chapter beside the release notes; fix it, or open a ticket for what is left.");

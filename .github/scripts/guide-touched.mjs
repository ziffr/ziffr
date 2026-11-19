// A pull request that changes a screen must also change the user guide's chapter that describes it
// (docs/user-guide/README.md), so the guide never tells people about options that moved or are gone. Which files a
// chapter describes is in its "<!-- screens: … -->" line. The label "no-guide-change" lets a maintainer say a change
// alters nothing people see, such as a refactoring.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { chaptersToUpdate, readChapters } from "../../scripts/guide-screens.mjs";

const base = `origin/${process.env.GITHUB_BASE_REF || "main"}`;
let labels = [];
try {
  const pr = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH ?? "", "utf8")).pull_request;
  labels = (pr?.labels ?? []).map((l) => l.name);
  // The labels as they are now, not as they were when the run started: a re-run keeps its first event, so a label
  // added since would not count (the release-note check reads them the same way).
  if (pr?.number && process.env.GH_TOKEN) {
    const now = execFileSync("gh", ["api", `repos/${process.env.GITHUB_REPOSITORY}/issues/${pr.number}/labels`, "--jq", ".[].name"], { encoding: "utf8" });
    labels = now.split("\n").filter(Boolean);
  }
} catch {
  // Locally there is no pull request, so no label; if GitHub cannot be asked, the event's labels count.
}
if (labels.includes("no-guide-change")) {
  console.log("Label no-guide-change set.");
  process.exit(0);
}
const changed = execFileSync("git", ["diff", "--name-only", `${base}...HEAD`], { encoding: "utf8" }).split("\n").filter(Boolean);
const missing = chaptersToUpdate(changed, readChapters("."));
if (!missing.length) {
  console.log("No screen changed without its user guide chapter.");
  process.exit(0);
}
for (const m of missing) console.log(`${m.chapter} describes these changed files:\n  ${m.files.join("\n  ")}`);
console.log("Update those chapters in the same pull request, so the guide matches the screens.");
console.log("If the change alters nothing people see (a refactoring, a fix behind the scenes), ask a maintainer for the label no-guide-change.");
process.exit(1);

// Client code never shows the message of an error a server action threw (ticket 192): a production build replaces it
// with a generic text, so the person would never learn why. Actions return `{ error }` (lib/action-result.ts) and the
// browser shows that, or `shown(err)` for a refusal it turned back into an error (lib/action-error.ts).
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..");
/** Reading a caught error's message: `(err as Error).message`, `err.message`, `e.message`. */
const READS_MESSAGE = /\((?:e|err|error) as Error\)\.message|\b(?:err|e)\.message\b/;

/** Client files not moved to `{ error }` yet (part 1 of ticket 192 did Metrics, Workflows, Feeds, Connectors and the workspace and profile settings). The list only
 * shrinks: the test fails for a file on it that no longer needs to be, so it is taken off. */
const NOT_YET = new Set([
  "app/dashboards/[id]/snapshots/[sid]/screen.tsx",
  "app/dashboards/screen.tsx",
  "app/invite/[token]/join.tsx",
  "app/settings/assistants/connections.tsx",
  "app/settings/keys/keys.tsx",
  "app/settings/workspace/clock.tsx",
  "app/team/members.tsx",
  "app/team/screen.tsx",
  "app/themes/screen.tsx",
  "app/themes/slides-editor.tsx",
  "app/welcome/form.tsx",
  "components/new-dashboard-dialog.tsx",
  "components/save-dashboard-template-dialog.tsx",
  "components/save-template-dialog.tsx",
  "components/snapshot-menu.tsx",
  "components/versions-panel.tsx",
  "components/view-links.tsx",
  "components/widget-frame.tsx",
]);

function clientFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return clientFiles(full);
    if (!/\.tsx?$/.test(name) || /\.test\.tsx?$/.test(name)) return [];
    return readFileSync(full, "utf8").slice(0, 200).includes('"use client"') ? [full] : [];
  });
}

describe("client code and server action errors", () => {
  const files = clientFiles(ROOT).map((f) => ({ rel: path.relative(ROOT, f), text: readFileSync(f, "utf8") }));

  it("never shows the message of an error thrown by a server action", () => {
    const offending = files.filter((f) => READS_MESSAGE.test(f.text) && !NOT_YET.has(f.rel)).map((f) => f.rel);
    expect(offending).toEqual([]);
  });

  it("lists only files that still need moving", () => {
    const done = [...NOT_YET].filter((rel) => !READS_MESSAGE.test(files.find((f) => f.rel === rel)?.text ?? ""));
    expect(done).toEqual([]);
  });
});

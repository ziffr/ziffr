// Every path that puts settings, a title or a layout onto a widget, a dashboard or a template passes the demo's gates for a
// visitor (GLOSSARY: Demo Mode; spec 0051, ticket 9): the text rules and key allow-list (`visitorSettings`) and the size and
// budget gates (`assertVisitorRoom`, `visitorTemplateWidgets`, `visitorSize`). Without a database the paths are read from the
// source: each function that writes widget settings must name its gate, and a new writer must be added here or it fails.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const src = (f: string) => readFileSync(join(__dirname, f), "utf8");
/** The text of one top-level function, from its declaration to the next one. */
function body(file: string, name: string): string {
  const s = src(file);
  const m = new RegExp(`(?:export )?async function ${name}\\(`).exec(s);
  expect(m, `${file} has no ${name}`).not.toBeNull();
  const next = s.slice(m!.index + 10).search(/\n(?:export )?(?:async )?function |\n\/\*\*/);
  return s.slice(m!.index, next < 0 ? undefined : m!.index + 10 + next);
}

describe("every writer of a widget's settings in dashboards.ts, dashboard-templates.ts and templates.ts", () => {
  it("passes the size gate before it writes", () => {
    for (const [file, fn] of [["dashboards.ts", "placeWidget"], ["dashboards.ts", "updateWidget"], ["dashboards.ts", "applyTemplate"], ["dashboards.ts", "saveToPool"]]) {
      expect(body(file, fn), `${fn} must call assertVisitorRoom`).toContain("assertVisitorRoom(");
    }
    expect(body("dashboard-templates.ts", "createDashboardFromBody")).toContain("visitorTemplateWidgets(");
    expect(body("templates.ts", "store")).toContain("visitorSize(");
  });

  it("passes the text rules and key allow-list for the settings it takes from a browser or a template", () => {
    expect(body("dashboards.ts", "specFrom")).toContain("await droppedSpec(");
    expect(body("dashboards.ts", "droppedSpec")).toContain("visitorSettings(");
    // A Note Widget's words and look pass the same rules, on the way in and on a change.
    expect(src("dashboards.ts")).toMatch(/function noteSettings\([^\n]*\{\n(?:  [^\n]*\n)*?  return visitorSettings\(/);
    expect(body("dashboards.ts", "droppedSpec")).toContain("noteSettings(");
    expect(body("dashboards.ts", "updateNote")).toContain("noteSettings(");
    expect(body("dashboards.ts", "updateWidget")).toContain("visitorSettings(");
    expect(body("dashboards.ts", "fromTeamTemplate")).toContain("visitorSettings(");
    expect(src("dashboards.ts")).toMatch(/export async function visitorTemplateWidgets[\s\S]*visitorSettings\(/);
  });

  it("writes before it checks nowhere: the gate comes before the first write of its function", () => {
    for (const fn of ["placeWidget", "applyTemplate", "saveToPool"]) {
      const b = body("dashboards.ts", fn);
      const gate = b.indexOf("assertVisitorRoom(");
      const write = Math.min(...["insertSealed(", "ensureBaseline(", 'from("widgets").update'].map((w) => (b.includes(w) ? b.indexOf(w) : Infinity)));
      expect(gate, fn).toBeGreaterThan(-1);
      expect(gate, `${fn}: the gate must come before the first write`).toBeLessThan(write);
    }
  });

  it("names its other writers of widgets, so a new one fails here until it is gated or says why it is not", () => {
    const writers = [...src("dashboards.ts").matchAll(/(?:insertSealed\("widgets"|from\("widgets"\)\.update)/g)].length;
    // placeWidget, saveLayout (clamped numbers only), updateWidget, applyTemplate, saveToPool: one write each.
    expect(writers).toBe(5);
    expect(body("dashboards.ts", "saveLayout")).not.toMatch(/settings|title/);
  });
});

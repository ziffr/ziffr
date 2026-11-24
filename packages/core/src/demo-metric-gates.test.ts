// Every writer behind the Metrics, Threads and sharing the demo opens passes its gates BEFORE its first write (GLOSSARY: Demo Mode;
// spec 0051, ticket 11): the text rules, the formula's and series' bounds, the made-up people only, the seed's own things refused.
// Without a database the paths are read from the source: each function that writes must name its gate, and the gate must come before
// the first write, so a refusal never leaves a change half done. A new writer is added here, or it fails to be opened.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const src = (f: string) => readFileSync(join(__dirname, f), "utf8");
/** The text of one top-level function, from its declaration to the next one. */
function body(file: string, name: string): string {
  const s = src(file);
  const m = new RegExp(`(?:export )?(?:async )?function ${name}\\(`).exec(s);
  expect(m, `${file} has no ${name}`).not.toBeNull();
  const next = s.slice(m!.index + 10).search(/\n(?:export )?(?:async )?function |\n\/\*\*/);
  return s.slice(m!.index, next < 0 ? undefined : m!.index + 10 + next);
}
/** The place of the first of these in a function's text, or Infinity. */
const first = (b: string, words: string[]) => Math.min(...words.map((w) => (b.includes(w) ? b.indexOf(w) : Infinity)));

/** [file, function, the gates it must call, the first writes the gates must come before]. */
const WRITERS: [string, string, string[], string[]][] = [
  ["metrics.ts", "createMetric", ["visitorText(", "visitorMembersOnly(", "visitorNumber(", "visitorSlug("], ["reserveIds(", '.from("metrics").insert']],
  ["metrics.ts", "updateMetricDetails", ["visitorNumber(", "visitorOptionalText("], [".update("]],
  ["metrics.ts", "saveSeriesRows", ["visitorSeries(", "visitorOptionalText("], ["upsertSeries("]],
  ["metrics.ts", "removeSeriesRows", ["visitorSeries("], ['.from("series_values").delete']],
  ["derived-metrics.ts", "createDerivedMetric", ["visitorFormula(", "visitorDerivedRoom("], ["createMetric("]],
  ["archived-metrics.ts", "archiveMetric", ["refuseSeededOne("], [".update("]],
  ["archived-metrics.ts", "restoreMetric", ["refuseSeededOne("], [".update("]],
  ["tags.ts", "changeMetricTags", ["refuseInDemoOutsideVisit(", "visitorText("], [".rpc("]],
  ["tags.ts", "renameTag", ["refuseInDemoOutsideVisit(", "visitorText("], [".rpc("]],
  ["tags.ts", "mergeTags", ["refuseInDemoOutsideVisit("], ["mergeInto("]],
  ["tags.ts", "deleteTag", ["refuseInDemoOutsideVisit("], [".rpc("]],
  ["team.ts", "createGroup", ["visitorText("], ['.from("groups").insert']],
  ["team.ts", "renameGroup", ["visitorText(", "refuseSeededOne("], [".update("]],
  ["team.ts", "deleteGroup", ["refuseSeededOne("], [".delete()"]],
  ["team.ts", "setGroupMember", ["refuseSeededOne("], [".upsert(", ".delete()"]],
  ["sharing.ts", "ownedForSharing", ["refuseSeededOne("], ["return obj"]],
  ["sharing.ts", "share", ["ownedForSharing("], [".delete()", ".insert("]],
  ["sharing.ts", "shareWithGroup", ["ownedForSharing("], [".delete()", ".insert("]],
  ["sharing.ts", "requestAccess", ["visitorMembersOnly("], [".insert("]],
  ["questions.ts", "ask", ["visitorOptionalText(", "visitorDue("], ["insertSealed("]],
  ["questions.ts", "reply", ["visitorOptionalText(", "visitorNumber("], ["postReply("]],
  ["questions.ts", "markTaskDone", ["visitorOptionalText("], ["finishTask("]],
  ["questions.ts", "setPreference", ["inDemoVisit("], [".delete()"]],
];

describe("every writer of what the demo opens in this ticket", () => {
  for (const [file, fn, gates, writes] of WRITERS) {
    it(`${file} ${fn} passes ${gates.join(", ")} before its first write`, () => {
      const b = body(file, fn);
      const write = first(b, writes);
      expect(write, `${fn} has none of ${writes.join(", ")}: update this list`).toBeLessThan(Infinity);
      for (const g of gates) {
        expect(b, `${fn} must call ${g}`).toContain(g);
        expect(b.indexOf(g), `${fn}: ${g} must come before the first write`).toBeLessThan(write);
      }
    });
  }

  it("leaves no bare refusal of the demo in the Tags, which a visit's server action would meet", () => {
    expect(src("tags.ts")).not.toMatch(/refuseInDemo\(actor\)/);
  });

  it("makes the slug of a visitor's Metric from its name with a random ending, so no name can take a word the screens use", () => {
    expect(body("metrics.ts", "createMetric")).toMatch(/inDemoVisit\(actor\)\) slug = visitorSlug\(slug, randomBytes\(3\)/);
  });

  it("offers the Workflow of a Metric to no visitor", () => {
    expect(body("metrics.ts", "createMetric")).toMatch(/inDemoVisit\(actor\) && numOrNull\(input\.workflowId\) !== null\) throw/);
  });
});

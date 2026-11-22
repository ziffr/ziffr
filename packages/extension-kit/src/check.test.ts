import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { checkExtensionFiles, IMPLEMENTATION_MAX_LINES, problemLine, type ExtensionProblem } from "./check.js";
import { readExtensionFolder, run } from "./run.js";

const TEST = join(dirname(fileURLToPath(import.meta.url)), "../test");
const GOOD = join(TEST, "good/example");
const BAD = join(TEST, "bad");

/** Every reason the Kit can refuse an Extension for: each must have at least one bad Extension that is refused for it. */
const REASONS = [
  "syntax", "import-not-allowed", "clock", "random", "ambient-global", "network", "dynamic-code", "timer", "string-access",
  "reach-by-property", "any-type", "outside-assignment", "forbidden-word", "missing-file", "empty-file", "wrong-implementation",
  "too-long", "bad-manifest", "license-mismatch",
] as const;

/** A bad Extension is the good example with the files of its folder laid over it, and the files `remove` names taken away. */
function badExtension(name: string): { files: Map<string, string>; rule: string; why: string } {
  const files = readExtensionFolder(GOOD);
  const dir = join(BAD, name);
  const meta = JSON.parse(readFileSync(join(dir, "bad.json"), "utf8")) as { rule: string; why: string; remove: string[] };
  for (const f of readdirSync(dir)) if (f !== "bad.json") files.set(f, readFileSync(join(dir, f), "utf8"));
  for (const f of meta.remove) files.delete(f);
  return { files, rule: meta.rule, why: meta.why };
}

const names = readdirSync(BAD).sort();
const rulesOf = (ps: ExtensionProblem[]) => [...new Set(ps.map((p) => p.rule))];

describe("the good worked example", () => {
  it("passes every check", () => {
    expect(checkExtensionFiles(readExtensionFolder(GOOD))).toEqual([]);
  });

  it("is reported as valid by the command, which ends with 0", () => {
    const res = run(["check", GOOD]);
    expect(res.code).toBe(0);
    expect(res.out).toEqual([`${GOOD}: ziffr-example/spread 1.0.0 has the right shape and passes the static rules.`]);
  });
});

describe("the bad Extensions", () => {
  it("has at least one for every reason the Kit knows, and every one names a reason the Kit knows", () => {
    const named = names.map((n) => badExtension(n).rule);
    expect([...new Set(named)].sort()).toEqual([...REASONS].sort());
  });

  it.each(names)("%s is refused for exactly its one reason, with its file and line", (name) => {
    const { files, rule } = badExtension(name);
    const problems = checkExtensionFiles(files);
    // A bad Extension that passes is a failing test; one refused for a second reason is too.
    expect(problems.length, "refused at all").toBeGreaterThan(0);
    expect(rulesOf(problems)).toEqual([rule]);
    for (const p of problems) {
      expect(p.file, "names its file").not.toBe("");
      // Only a file that is not there has no line.
      if (p.rule !== "missing-file") expect(p.line, problemLine(p)).toBeGreaterThanOrEqual(1);
      else expect(p.line).toBeNull();
    }
  });

  it("names the line of the offence, not of the file's start", () => {
    const at = (name: string, file: string, needle: string) => {
      const { files } = badExtension(name);
      const line = files.get(file)!.split("\n").findIndex((l) => l.includes(needle)) + 1;
      expect(checkExtensionFiles(files).map((p) => [p.file, p.line])).toEqual([[file, line]]);
    };
    at("clock-date-now", "method.ts", "Date.now");
    at("write-to-the-input", "method.ts", "series[0] = 0");
    at("wording-says-because", "wording.ts", "because");
    at("manifest-bad-version", "extension.json", '"version"');
    at("manifest-parameter-range", "extension.json", '"max"');
  });

  it("refuses an implementation of 401 lines, and takes one of exactly 400", () => {
    const { files } = badExtension("longer-than-400-lines");
    const lines = files.get("method.ts")!.trimEnd().split("\n");
    expect(lines).toHaveLength(IMPLEMENTATION_MAX_LINES + 1);
    expect(checkExtensionFiles(files).map((p) => [p.rule, p.line])).toEqual([["too-long", IMPLEMENTATION_MAX_LINES + 1]]);
    files.set("method.ts", `${lines.slice(0, IMPLEMENTATION_MAX_LINES).join("\n")}\n`);
    expect(checkExtensionFiles(files)).toEqual([]);
  });

  it("is written by the command as file:line: message, and ends with 1", () => {
    const { files } = badExtension("clock-date-now");
    const res = run(["check", "x"], () => files);
    expect(res.code).toBe(1);
    expect(res.out).toHaveLength(1);
    expect(res.out[0]).toMatch(/^x\/method\.ts:\d+: uses “Date”/);
  });
});

describe("the command", () => {
  it("says how it is used, and ends with 2, when it is not given a folder", () => {
    expect(run([]).code).toBe(2);
    expect(run(["check"]).code).toBe(2);
  });

  it("ends with 2 for a folder it cannot read", () => {
    expect(run(["check", join(TEST, "nothing-here")]).code).toBe(2);
  });
});

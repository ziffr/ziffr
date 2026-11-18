// The Calculation Catalogue is complete (spec 0022, "The Calculation Catalogue"): every exported function of every
// calculation module (calculation-modules.json) has a row in docs/reference/calculations.md, and every mutant the
// code leaves out of mutation testing is written there with the reason it cannot matter. A new calculation cannot
// slip in untested.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const MODULES: string[] = JSON.parse(read("../calculation-modules.json"));
const CATALOGUE = read("../../../docs/reference/calculations.md");

/** Every function a row's Code column names, by module: "`src/compare.ts`: `compare`, `summary`". */
function catalogued(): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const m of CATALOGUE.matchAll(/`(src\/[\w/-]+\.ts)`: ((?:`\w+`(?:, )?)+)/g)) {
    const names = out.get(m[1]) ?? new Set<string>();
    for (const n of m[2].matchAll(/`(\w+)`/g)) names.add(n[1]);
    out.set(m[1], names);
  }
  return out;
}

describe("the Calculation Catalogue", () => {
  const listed = catalogued();
  it.each(MODULES)("has a row for every exported function of %s", async (module) => {
    const mod = (await import(`../${module}`)) as Record<string, unknown>;
    const functions = Object.keys(mod).filter((k) => typeof mod[k] === "function");
    expect(functions.length, module).toBeGreaterThan(0);
    const missing = functions.filter((f) => !listed.get(module)?.has(f));
    expect(missing, `${module}: add these to docs/reference/calculations.md`).toEqual([]);
  });
  it("names only functions that exist, in calculation modules", async () => {
    for (const [module, names] of listed) {
      expect(MODULES, `${module} is in the catalogue but not in calculation-modules.json`).toContain(module);
      const mod = (await import(`../${module}`)) as Record<string, unknown>;
      for (const n of names) expect(typeof mod[n], `${module}: ${n}`).toBe("function");
    }
  });
  it("writes down every mutant left out of mutation testing, with its reason", () => {
    const written = new Set([...CATALOGUE.matchAll(/^- `(src\/[\w/-]+\.ts)` · (\w+) · .{10,}$/gm)].map((m) => `${m[1]} ${m[2]}`));
    for (const module of MODULES) {
      const lines = read(`../${module}`).split("\n");
      lines.forEach((line, i) => {
        const d = /\/\/ Stryker disable next-line (\w+): (.+)$/.exec(line);
        if (!d) return;
        expect(written.has(`${module} ${d[1]}`), `${module}:${i + 1} leaves out ${d[1]}: write it into the catalogue`).toBe(true);
        expect(d[2].length, `${module}:${i + 1}: give the reason`).toBeGreaterThan(10);
      });
      expect(read(`../${module}`), `${module}: disable mutants one line at a time, with a reason`).not.toMatch(/Stryker disable (?!next-line)/);
    }
  });
});

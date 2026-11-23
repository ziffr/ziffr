// The false-discovery simulation of the Heads-ups about one Metric, part: independent noise, trends and random walks (spec 0041, ticket 15; see test/reference/heads-up-single-sim.ts).
// Several files so that the runs go in parallel: 150 Metrics where nothing happens must give none of the three kinds in at least 99 of 100 runs.
// Not run by the mutation testing: it takes minutes and tests no line on its own.
import { describe, expect, it } from "vitest";
import { FAMILIES, FULL, headsUpsFor, normalsOf, RUNS, SCENARIOS, STEADY } from "../test/reference/heads-up-single-sim";

describe(`150 Metrics where nothing happens (${RUNS} runs of each kind, seeded)`, () => {
  it.each(Object.entries(SCENARIOS).filter(([name]) => ['independent noise', 'trends and random walks'].includes(name)))("%s: no Heads-up of these kinds in at least 99 of 100 runs", (_, families) => {
    let withAny = 0;
    const seen: string[] = [];
    for (let run = 0; run < RUNS; run++) {
      const z = normalsOf(13000 + run);
      const n = 36 + (run % 4) * 12;
      const family = (id: number) => families[(id + run) % families.length];
      const series = new Map(Array.from({ length: 150 }, (_, i) => [i + 1, FAMILIES[family(i + 1)](n, z)] as const));
      const ups = headsUpsFor(series, n, new Map(), (id) => STEADY.has(family(id)));
      if (ups.length > 0) {
        withAny++;
        seen.push(`run ${run}: ${ups.map((u) => `${u.kind} ${u.metrics}: ${u.takeaway.sentence}`).join("; ")}`);
      }
    }
    expect(withAny, seen.join(" | ")).toBeLessThanOrEqual(FULL ? 1 : 0);
  }, 280_000);
});


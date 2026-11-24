import { readFileSync, writeFileSync } from "node:fs";
import { fractionOf } from "../exact";
import { kindsOf, lookAlike } from "./look-alike";

const DIR = "/private/tmp/claude-501/-Users-stefan-Development-repos-ziffr/51965de7-3314-44e2-81df-859f97c7e6ac/scratchpad/opus1033/";
const big = (_k: string, v: unknown) => (typeof v === "bigint" ? v.toString() : v);

test("opus harness", () => {
  const cases = JSON.parse(readFileSync(DIR + "cases.json", "utf8"), (_k, v) => (v === "NaN" ? NaN : v === "Inf" ? Infinity : v === "-Inf" ? -Infinity : v === "-0" ? -0 : v));
  const out = cases.map((c: any) => {
    const t0 = Date.now();
    try {
      let r;
      if (c.level === "prep") {
        const prepared = { span: c.span, periods: c.periods, ids: c.ids, reading: c.reading, values: c.values.map((col: number[]) => col.map((v) => fractionOf(v))) };
        r = kindsOf(prepared as any, { kinds: c.kinds ?? null, yearStart: c.yearStart ?? 1 } as any);
      } else {
        r = lookAlike(c.series, c.span, { kinds: c.kinds ?? null, yearStart: c.yearStart ?? 1 } as any);
      }
      return { r, ms: Date.now() - t0 };
    } catch (e) {
      return { error: String(e), ms: Date.now() - t0 };
    }
  });
  writeFileSync(DIR + "out.json", JSON.stringify(out, big));
});

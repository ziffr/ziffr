// Which days a period is asked on (specs 0067 and #1343; GLOSSARY: Workflow, Asking Schedule).
import { describe, expect, it } from "vitest";
import { askingFor } from "./period-workflows";

describe("the Workflow a period joins", () => {
  it("asks daily, on Mondays, or on the 1st, which also serves quarters and years", () => {
    expect(askingFor("day").days).toEqual({ kind: "every_day" });
    expect(askingFor("week").days).toEqual({ kind: "chosen_weekdays", days: [1] });
    for (const period of ["month", "quarter", "year"] as const) expect(askingFor(period).days).toEqual({ kind: "month_day", day: 1 });
  });
});

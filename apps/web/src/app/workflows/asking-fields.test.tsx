// The Asking Schedule's fields in the Workflow editor (spec 0035, ticket #361; GLOSSARY: Asking Schedule): what each
// kind of days shows, the sentence with the next run, and the warnings.
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { AskingSchedule } from "@ziffr/core/types";
import { AskingFields, type AskingClock } from "./asking-fields";

const clock: AskingClock = { timeZone: "Europe/Berlin", runHour: 8, today: "2026-12-01", hour: 9 };
const draw = (asking: AskingSchedule | undefined, periods: ("day" | "month")[] = ["month"], c: AskingClock = clock) =>
  renderToString(<AskingFields asking={asking} onChange={() => {}} disabled={false} clock={c} periods={periods} dueWorkingDays={3} />).replaceAll("<!-- -->", "");

describe("AskingFields", () => {
  it("offers only the choice while the Workflow runs with the workspace's run", () => {
    const html = draw(undefined);
    expect(html).toContain("With the workspace’s daily run, at 08:00");
    expect(html).not.toContain("Starting day");
    expect(html).not.toContain("Runs every");
  });
  it("says every third day with its next run", () => {
    const html = draw({ hour: 14, days: { kind: "every_n_days", n: 3, from: "2026-12-01" } });
    expect(html).toContain("Runs every third day from 1 December 2026 at 14:00 (Europe/Berlin).");
    expect(html).toContain("Next: ");
    expect(html).toContain("Starting day");
  });
  it("shows the weekdays and the day of the month", () => {
    expect(draw({ hour: null, days: { kind: "chosen_weekdays", days: [1, 4] } })).toContain("Monday and Thursday at 08:00");
    expect(draw({ hour: null, days: { kind: "month_day", day: "last" } })).toContain("on the last day of the month");
  });
  it("warns about skipped periods and about the Due Date, without blocking", () => {
    const html = draw({ hour: 14, days: { kind: "every_n_days", n: 5, from: "2026-12-01" } }, ["day"]);
    expect(html).toContain("asked for the last period only");
    expect(html).toContain("after the Due Date");
    expect(draw({ hour: 14, days: { kind: "every_day" } }, ["day"])).not.toContain("role=\"note\"");
  });
  it("tells without a clock in the demo", () => {
    expect(draw({ hour: 14, days: { kind: "weekdays" } }, ["month"], null)).toContain("Runs on its own days at 14:00.");
  });
});

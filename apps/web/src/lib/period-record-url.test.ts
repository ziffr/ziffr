import { describe, expect, it } from "vitest";
import { periodRecordUrl } from "./period-record-url";

describe("periodRecordUrl", () => {
  it("names the Metric and the period's first day", () => {
    expect(periodRecordUrl("churn-rate", "2026-03-01")).toBe("/metrics/churn-rate/2026-03-01");
  });
  it("keeps odd characters out of the path", () => {
    expect(periodRecordUrl("a/b ?", "2026-03-01")).toBe("/metrics/a%2Fb%20%3F/2026-03-01");
  });
});

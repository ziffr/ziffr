import { describe, expect, it } from "vitest";
import { filledInDetail } from "./filled-in-detail";

const names: Record<string, string> = { sara: "Sara Lind", ada: "Ada Owner" };
const nameOf = (id: string) => names[id];

describe("filledInDetail", () => {
  it("names whom the value was entered for, the period and the role", () => {
    expect(filledInDetail({ period: "2026-10-01", for: "sara", as: "metric_owner", away_set_by: null }, nameOf)).toBe("for Sara Lind, 2026-10-01, as the Metric's owner");
  });

  it("says who set the Away that opened it, unless the submitter set it", () => {
    expect(filledInDetail({ period: "2026-10-01", for: "sara", as: "workflow_owner", away_set_by: "ada" }, nameOf)).toBe("for Sara Lind, 2026-10-01, as the Workflow's owner, while Away (set by Ada Owner)");
    expect(filledInDetail({ period: "2026-10-01", for: "sara", as: "stand_in", away_set_by: "sara" }, nameOf)).toBe("for Sara Lind, 2026-10-01, as the Stand-in, while Away");
  });

  it("reads a person who left as a former member", () => {
    expect(filledInDetail({ period: "2026-10-01", for: "gone", as: "stand_in" }, nameOf)).toBe("for a former member, 2026-10-01, as the Stand-in");
  });
});

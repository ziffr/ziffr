// Pages across a Demo Reset (spec 0051, ticket 7): the redirect's decision, from the old id's name and what the person may open.
import { describe, expect, it } from "vitest";
import { pickSuccessor } from "./demo-successor";

describe("pickSuccessor", () => {
  const open = [{ id: 31, name: "Monthly overview" }, { id: 30, name: "Sales" }, { id: 44, name: "Sales" }];

  it("finds the dashboard of the same name", () => {
    expect(pickSuccessor("Monthly overview", open, 7)).toBe(31);
  });

  it("takes the oldest of two with the same name, so a visitor's namesake never wins", () => {
    expect(pickSuccessor("Sales", open, 8)).toBe(30);
  });

  it("is null when the person may open nothing of that name (and so nothing is hinted at)", () => {
    expect(pickSuccessor("Board pack", open, 9)).toBeNull();
    expect(pickSuccessor("Monthly overview", [], 7)).toBeNull();
  });

  it("never sends a page to itself", () => {
    expect(pickSuccessor("Monthly overview", open, 31)).toBeNull();
  });

  it("matches the name exactly", () => {
    expect(pickSuccessor("monthly overview", open, 7)).toBeNull();
  });
});

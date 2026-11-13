import { describe, expect, it } from "vitest";
import { tokenValid } from "./tokens";

const ben = { metric_id: 1, submitter_id: "ben", stand_in_id: "anna", stands_in_for: null };
const annaForBen = { metric_id: 1, submitter_id: "anna", stands_in_for: "ben", expires_at: "2026-12-01" };

describe("tokens", () => {
  it("always counts a submitter's own Token", () => {
    expect(tokenValid(ben, [ben])).toBe(true);
  });
  it("counts a stand-in's Token while they are the stand-in and it has not expired", () => {
    expect(tokenValid(annaForBen, [ben, annaForBen], "2026-11-13")).toBe(true);
  });
  it("drops a stand-in's Token once someone else stands in, or it expired", () => {
    expect(tokenValid(annaForBen, [{ ...ben, stand_in_id: "sara" }, annaForBen], "2026-11-13")).toBe(false);
    expect(tokenValid(annaForBen, [ben, annaForBen], "2026-12-02")).toBe(false);
  });
});

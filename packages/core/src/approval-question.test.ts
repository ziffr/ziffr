import { describe, expect, it } from "vitest";
import { approvalQuestionForWeb } from "./approval-question";

describe("approvalQuestionForWeb", () => {
  it("drops the chat instructions", () => {
    expect(approvalQuestionForWeb("Approve Revenue for Oct 2026: 118,941 €, below target. Reply “approve”, or “send back:” with what to check.")).toBe("Approve Revenue for Oct 2026: 118,941 €, below target.");
  });
  it("leaves other questions alone", () => {
    expect(approvalQuestionForWeb("Why is churn up?")).toBe("Why is churn up?");
  });
});

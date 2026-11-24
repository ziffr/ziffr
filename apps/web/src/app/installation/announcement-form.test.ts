import { describe, expect, it } from "vitest";
import { fromLocalInput, toLocalInput, windowWords } from "./announcement-form";

describe("announcement form", () => {
  it("round-trips a moment through the browser's own time zone", () => {
    const iso = "2026-11-24T09:30:00.000Z";
    expect(fromLocalInput(toLocalInput(iso))).toBe(iso);
  });
  it("treats empty as none and passes on what is no moment", () => {
    expect(toLocalInput(null)).toBe("");
    expect(fromLocalInput("")).toBeNull();
    expect(fromLocalInput("soon")).toBe("soon");
  });
  it("writes the window in words", () => {
    expect(windowWords(null, null, "UTC")).toBe("Always");
    expect(windowWords("2026-11-24T09:30:00Z", null, "UTC")).toBe("From 24 Nov 2026, 09:30");
    expect(windowWords(null, "2026-11-24T09:30:00Z", "UTC")).toBe("Until 24 Nov 2026, 09:30");
    expect(windowWords("2026-11-24T09:30:00Z", "2026-11-24T11:00:00Z", "UTC")).toBe("24 Nov 2026, 09:30 to 24 Nov 2026, 11:00");
  });
});

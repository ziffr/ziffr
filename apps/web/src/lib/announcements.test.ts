// What the app announces: only in the demo, with the reset interval taken from the core's schedule.
import { describe, expect, it, vi } from "vitest";
import { DEMO_RESET_MINUTES } from "@ziffr/core/demo-reset-line";

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/session-start", () => ({ sessionStartedAt: async () => null }));
import { announcementsFor, DEMO_RESET_ANNOUNCEMENT } from "./announcements";

describe("announcementsFor", () => {
  it("says nothing outside the demo", () => {
    expect(announcementsFor({ demo: false, changes: true, offersTrials: true })).toEqual([]);
  });
  it("in a demo visitors may change, says it is shared and when it resets", () => {
    const [one, ...rest] = announcementsFor({ demo: true, changes: true, offersTrials: false });
    expect(rest).toEqual([]);
    expect(one.id).toBe(DEMO_RESET_ANNOUNCEMENT);
    expect(one.text).toContain("shared demo that anyone can change");
    expect(one.text).toContain(`every ${DEMO_RESET_MINUTES} minutes`);
    expect(one.link).toBeUndefined();
  });
  it("in a read-only demo, keeps the look-around meaning and names no reset", () => {
    const [one] = announcementsFor({ demo: true, changes: false, offersTrials: false });
    expect(one.text).toMatch(/read-only: look around/);
    expect(one.text).not.toMatch(/resets/);
  });
  it("links to a trial only where this Ziffr offers trials", () => {
    expect(announcementsFor({ demo: true, changes: true, offersTrials: true })[0].link?.href).toBe("/demo/leave");
  });
});

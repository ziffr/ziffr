// What the app announces: only in the demo, with the reset interval taken from the core's schedule.
import { describe, expect, it, vi } from "vitest";
import { DEMO_RESET_MINUTES } from "@ziffr/core/demo-reset-line";

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/session-start", () => ({ sessionStartedAt: async () => null }));
import { announcementsFor, DEMO_RESET_ANNOUNCEMENT, fromInstallation, fromPublic } from "./announcements";

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

describe("fromInstallation and fromPublic", () => {
  it("keys an Installation line by id and last change, so an edit brings it back", () => {
    const row = { id: "u1", text: "Maintenance", level: "warning" as const, dismissible: false, updatedAt: "2027-02-01T10:00:00Z" };
    const [one] = fromInstallation([row]);
    expect(one.id).toBe("u1:2027-02-01T10:00:00Z");
    expect(fromInstallation([{ ...row, updatedAt: "2027-02-01T11:00:00Z" }])[0].id).not.toBe(one.id);
    expect(one).toMatchObject({ text: "Maintenance", level: "warning", dismissible: false });
    expect(one.link).toBeUndefined();
  });
  it("carries the link, and a public line is never dismissible and holds no more than text, link and level", () => {
    const [one] = fromPublic([{ text: "Down", level: "info", link: { href: "https://status.example.org/", label: "Status" } }]);
    expect(one.link).toEqual({ href: "https://status.example.org/", label: "Status" });
    expect(Object.keys(one).sort()).toEqual(["dismissible", "id", "level", "link", "text"]);
    expect(one.dismissible).toBe(false);
  });
});

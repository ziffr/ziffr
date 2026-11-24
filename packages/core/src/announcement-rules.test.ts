// The Announcement rules (spec 0054; GLOSSARY: Announcement): plain text, https-only links, the window and the order.
import { describe, expect, it } from "vitest";
import { Refused } from "./actor";
import {
  announcementHref, announcementState, announcementText, installationAnnouncementFields, orderAnnouncements, plainLine,
} from "./announcement-rules";

describe("the text", () => {
  it("is one plain line: breaks become spaces, hidden and bidirectional characters go", () => {
    expect(plainLine("  Down\n\tat   10\u0000:00‮ reversed‏ ")).toBe("Down at 10:00 reversed");
  });
  it("takes 1 to 280 characters, counted as characters", () => {
    expect(announcementText("x".repeat(280))).toHaveLength(280);
    expect(() => announcementText("x".repeat(281))).toThrow(Refused);
    expect(() => announcementText("   ‮ ")).toThrow(Refused);
    expect(() => announcementText(42)).toThrow(Refused);
    expect([...announcementText("😀".repeat(280))]).toHaveLength(280);
    expect(() => announcementText("😀".repeat(281))).toThrow(Refused);
  });
  it("keeps markup as plain words, for the screen to show as text", () => {
    expect(announcementText("<b>Down</b> [x](https://a.test)")).toBe("<b>Down</b> [x](https://a.test)");
  });
});

describe("the link", () => {
  it("is https only, parsed, without credentials", () => {
    expect(announcementHref("https://status.example.test/maintenance")).toBe("https://status.example.test/maintenance");
    for (const bad of ["http://a.test", "javascript:alert(1)", "data:text/html,x", "//a.test", "https://user:pw@a.test/", "https://a.test/ x", "https://", "ftp://a.test", "https://a.test/‮", ""])
      expect(() => announcementHref(bad), bad).toThrow(Refused);
  });
  it("is at most 500 characters", () => {
    expect(() => announcementHref(`https://a.test/${"x".repeat(500)}`)).toThrow(Refused);
  });
});

describe("the fields", () => {
  const ok = { text: "Maintenance tonight" };
  it("have defaults: info, everyone, on, dismissible, not public, no window", () => {
    expect(installationAnnouncementFields(ok)).toEqual({ text: "Maintenance tonight", link: null, level: "info", startsAt: null, endsAt: null, active: true, dismissible: true, audience: "everyone", public: false });
  });
  it("need both parts of a link, or neither", () => {
    expect(() => installationAnnouncementFields({ ...ok, link: { href: "https://a.test" } })).toThrow(Refused);
    expect(() => installationAnnouncementFields({ ...ok, link: { label: "More" } })).toThrow(Refused);
    expect(installationAnnouncementFields({ ...ok, link: { href: "https://a.test/x", label: "More" } }).link).toEqual({ href: "https://a.test/x", label: "More" });
    expect(() => installationAnnouncementFields({ ...ok, link: { href: "https://a.test", label: "x".repeat(41) } })).toThrow(Refused);
  });
  it("take only the two levels and the two audiences", () => {
    expect(() => installationAnnouncementFields({ ...ok, level: "error" })).toThrow(Refused);
    expect(() => installationAnnouncementFields({ ...ok, audience: "admins" })).toThrow(Refused);
    expect(() => installationAnnouncementFields({ ...ok, dismissible: "no" })).toThrow(Refused);
  });
  it("need the start before the end, and dates with a zone", () => {
    expect(() => installationAnnouncementFields({ ...ok, startsAt: "2027-03-02T10:00:00Z", endsAt: "2027-03-02T10:00:00Z" })).toThrow(Refused);
    expect(() => installationAnnouncementFields({ ...ok, startsAt: "2027-03-02T10:00:00" })).toThrow(Refused);
    expect(() => installationAnnouncementFields({ ...ok, endsAt: "tomorrow" })).toThrow(Refused);
    const f = installationAnnouncementFields({ ...ok, startsAt: "2027-03-02T11:00:00+01:00", endsAt: "2027-03-02T12:00:00Z" });
    expect(f.startsAt).toBe("2027-03-02T10:00:00.000Z");
  });
  it("show on the sign-in page only when for everyone", () => {
    expect(() => installationAnnouncementFields({ ...ok, public: true, audience: "demo" })).toThrow(Refused);
    expect(installationAnnouncementFields({ ...ok, public: true }).public).toBe(true);
  });
  it("refuse something that is not an object", () => {
    expect(() => installationAnnouncementFields(null)).toThrow(Refused);
    expect(() => installationAnnouncementFields("text")).toThrow(Refused);
  });
});

describe("state and order", () => {
  const now = new Date("2027-03-02T10:00:00Z");
  it("says off, scheduled, running or ended", () => {
    expect(announcementState({ active: false, startsAt: null, endsAt: null }, now)).toBe("off");
    expect(announcementState({ active: true, startsAt: "2027-03-02T11:00:00Z", endsAt: null }, now)).toBe("scheduled");
    expect(announcementState({ active: true, startsAt: "2027-03-02T09:00:00Z", endsAt: "2027-03-02T11:00:00Z" }, now)).toBe("running");
    expect(announcementState({ active: true, startsAt: null, endsAt: "2027-03-02T10:00:00Z" }, now)).toBe("ended");
  });
  it("puts a warning before an info, then the earlier start, then the earlier made", () => {
    const item = (id: string, level: string, startsAt: string | null, createdAt: string) => ({ id, level, startsAt, createdAt });
    const sorted = orderAnnouncements([
      item("late-info", "info", "2027-03-03T00:00:00.000Z", "1"), item("no-start-info", "info", null, "2"),
      item("warn-late", "warning", "2027-03-05T00:00:00.000Z", "3"), item("warn-early", "warning", "2027-03-04T00:00:00.000Z", "4"),
    ]).map((i) => i.id);
    expect(sorted).toEqual(["warn-early", "warn-late", "no-start-info", "late-info"]);
  });
});

// The Announcement rules (spec 0054; GLOSSARY: Announcement): plain text, https-only links, the window and the order.
import { describe, expect, it } from "vitest";
import { Refused } from "./actor";
import {
  announcementHref, announcementId, announcementState, keepingSwitch, announcementText, installationAnnouncementFields, orderAnnouncements, plainLine, workspaceAnnouncementFields,
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

describe("hidden characters", () => {
  it("removes zero-width, soft hyphen, joiner, word joiner, BOM and tag characters, and a lone surrogate", () => {
    const hidden = ["\u200B", "\u200C", "\u200D", "\u2060", "\u2064", "\u00AD", "\u180E", "\u034F", "\uFEFF", "\u{E0041}", "\u{E007F}"];
    for (const h of hidden) expect(plainLine(`a${h}b`), JSON.stringify(h)).toBe("ab");
    expect(plainLine("a\uD83Db")).toBe("a\uFFFDb");
    expect(announcementText("Maint\u200Benance")).toBe("Maintenance");
  });
  it("refuses them in a link rather than cleaning it", () => {
    expect(() => announcementHref("https://a.test/\u200B")).toThrow(Refused);
    expect(() => announcementHref("https://a.test/\u{E0041}")).toThrow(Refused);
  });
  it("keeps emoji whole", () => {
    expect(plainLine("Up \u{1F600}")).toBe("Up \u{1F600}");
  });
});

describe("a Workspace Announcement's fields", () => {
  it("have the same rules without an audience or a sign-in page, and ignore those if sent", () => {
    expect(workspaceAnnouncementFields({ text: "New due date", audience: "demo", public: true })).toEqual({ text: "New due date", link: null, level: "info", startsAt: null, endsAt: null, active: true, dismissible: true });
    expect(() => workspaceAnnouncementFields({ text: "x", link: { href: "http://a.test", label: "x" } })).toThrow(Refused);
    expect(() => workspaceAnnouncementFields({ text: "x", level: "error" })).toThrow(Refused);
    expect(() => workspaceAnnouncementFields(null)).toThrow(Refused);
  });
  it("take ids of the shape of a uuid only", () => {
    expect(announcementId("0B6E0F2A-1C1D-4B7A-9C55-0123456789AB")).toBe("0b6e0f2a-1c1d-4b7a-9c55-0123456789ab");
    for (const bad of ["1 or 1=1", "", 7, null, "0b6e0f2a-1c1d-4b7a-9c55-0123456789ab,x"]) expect(() => announcementId(bad)).toThrow(/does not exist/);
  });
});

describe("changing an Announcement", () => {
  it("keeps the stored switch when none is sent, and takes the one that is sent", () => {
    expect(keepingSwitch({ text: "x" }, false)).toEqual({ text: "x", active: false });
    expect(keepingSwitch({ text: "x" }, true)).toEqual({ text: "x", active: true });
    expect(keepingSwitch({ text: "x", active: true }, false)).toEqual({ text: "x", active: true });
    expect(keepingSwitch(null, false)).toBeNull();
  });
});

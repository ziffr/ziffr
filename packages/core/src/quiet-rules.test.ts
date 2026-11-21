// Quiet Hours rules (ticket #519): which local hours and days are quiet, when they end, across midnight, weekends,
// half-hour zones and clock changes, and the checks on an untrusted rule.
import { describe, expect, it } from "vitest";
import { NEVER_QUIET, checkRule, isQuietAt, neverQuiet, quietEnd, type QuietRule } from "./quiet-rules";

const zone = (n: unknown) => n === "Asia/Tokyo" || n === "Europe/Berlin" || n === "Asia/Kolkata" || n === "UTC";
const night: QuietRule = { fromHour: 19, toHour: 7, days: [], timeZone: null };
const at = (s: string) => new Date(s);
const iso = (d: Date | null) => d?.toISOString() ?? null;

describe("isQuietAt", () => {
  it("covers the hours of a night across midnight, and not its end hour", () => {
    for (const h of [19, 23, 0, 6]) expect(isQuietAt(night, 3, h)).toBe(true);
    for (const h of [7, 12, 18]) expect(isQuietAt(night, 3, h)).toBe(false);
  });
  it("covers a daytime window from its first hour up to, not including, its last", () => {
    const lunch: QuietRule = { fromHour: 12, toHour: 14, days: [], timeZone: null };
    expect([11, 12, 13, 14].map((h) => isQuietAt(lunch, 1, h))).toEqual([false, true, true, false]);
  });
  it("has no hours when from and to are the same, and whole days are quiet at every hour", () => {
    expect(isQuietAt({ ...night, fromHour: 8, toHour: 8 }, 2, 8)).toBe(false);
    const weekend: QuietRule = { fromHour: 8, toHour: 8, days: [0, 6], timeZone: null };
    expect([0, 3, 23].map((h) => isQuietAt(weekend, 6, h))).toEqual([true, true, true]);
    expect(isQuietAt(weekend, 1, 12)).toBe(false);
  });
});

describe("neverQuiet", () => {
  it("is true only for no hours and no days", () => {
    expect(neverQuiet(NEVER_QUIET)).toBe(true);
    expect(neverQuiet(night)).toBe(false);
    expect(neverQuiet({ ...NEVER_QUIET, days: [0] })).toBe(false);
  });
});

describe("quietEnd", () => {
  it("is null outside quiet hours", () => {
    expect(quietEnd(night, at("2026-11-20T12:00:00Z"), "UTC")).toBeNull();
  });
  it("ends at the next local hour that is not quiet, also after midnight", () => {
    expect(iso(quietEnd(night, at("2026-11-20T20:30:00Z"), "UTC"))).toBe("2026-11-21T07:00:00.000Z");
    expect(iso(quietEnd(night, at("2026-11-21T02:15:10Z"), "UTC"))).toBe("2026-11-21T07:00:00.000Z");
  });
  it("reads the rule in its own time zone before the Workspace's", () => {
    // 11:00 UTC is 20:00 in Tokyo: quiet there until 07:00 Tokyo, 22:00 UTC. In UTC it is not quiet.
    expect(iso(quietEnd({ ...night, timeZone: "Asia/Tokyo" }, at("2026-11-20T11:00:00Z"), "UTC"))).toBe("2026-11-20T22:00:00.000Z");
    expect(quietEnd(night, at("2026-11-20T11:00:00Z"), "UTC")).toBeNull();
    expect(iso(quietEnd(night, at("2026-11-20T11:00:00Z"), "Asia/Tokyo"))).toBe("2026-11-20T22:00:00.000Z");
  });
  it("skips whole quiet days and the night after them", () => {
    // Friday 20:00 Tokyo, weekend quiet: Monday 07:00 Tokyo is Sunday 22:00 UTC.
    const weekend: QuietRule = { fromHour: 19, toHour: 7, days: [0, 6], timeZone: "Asia/Tokyo" };
    expect(iso(quietEnd(weekend, at("2026-11-20T11:00:00Z"), "UTC"))).toBe("2026-11-22T22:00:00.000Z");
  });
  it("lines up with zones on a half hour", () => {
    // 20:00 UTC is 01:30 in Kolkata; the quiet night ends at 07:00 there, 01:30 UTC.
    expect(iso(quietEnd({ ...night, timeZone: "Asia/Kolkata" }, at("2026-11-20T20:00:00Z"), "UTC"))).toBe("2026-11-21T01:30:00.000Z");
  });
  it("holds through the night a clock change shortens or lengthens", () => {
    // Berlin turned clocks forward on 29 March 2026 (02:00 to 03:00): the night 28 to 29 March ends at 07:00 CEST = 05:00 UTC.
    expect(iso(quietEnd({ ...night, timeZone: "Europe/Berlin" }, at("2026-03-28T22:00:00Z"), "UTC"))).toBe("2026-03-29T05:00:00.000Z");
    // And back on 25 October 2026 (03:00 to 02:00): 07:00 CET = 06:00 UTC.
    expect(iso(quietEnd({ ...night, timeZone: "Europe/Berlin" }, at("2026-10-24T22:00:00Z"), "UTC"))).toBe("2026-10-25T06:00:00.000Z");
    // An instant inside the hour that repeats is still inside the night.
    expect(iso(quietEnd({ ...night, timeZone: "Europe/Berlin" }, at("2026-10-25T00:30:00Z"), "UTC"))).toBe("2026-10-25T06:00:00.000Z");
  });
  it("still lets a message out when a rule has no end, a week on at most", () => {
    const always = { fromHour: 0, toHour: 0, days: [0, 1, 2, 3, 4, 5, 6], timeZone: null };
    expect(quietEnd(always, at("2026-11-20T12:00:00Z"), "UTC")!.getTime() - at("2026-11-20T12:00:00Z").getTime()).toBeLessThanOrEqual(8 * 86_400_000);
  });
});

describe("checkRule", () => {
  it("returns a clean rule: days once each and sorted, the zone or null", () => {
    expect(checkRule({ fromHour: 19, toHour: 7, days: [6, 0, 6], timeZone: "Asia/Tokyo" }, zone)).toEqual({ fromHour: 19, toHour: 7, days: [0, 6], timeZone: "Asia/Tokyo" });
    expect(checkRule({ fromHour: 0, toHour: 0, days: [] }, zone)).toEqual(NEVER_QUIET);
  });
  it("refuses a missing rule, hours that are not whole hours of a day, and days that are not weekdays", () => {
    expect(checkRule(null, zone)).toMatch(/missing/);
    expect(checkRule("19", zone)).toMatch(/missing/);
    for (const [fromHour, toHour] of [[24, 0], [-1, 0], [1.5, 2], ["7", 8], [0, null]]) expect(checkRule({ fromHour, toHour, days: [] }, zone)).toMatch(/hours/);
    for (const days of [undefined, "0", [7], [-1], [0.5], ["0"], [0, 1, 2, 3, 4, 5, 6, 0]]) expect(checkRule({ fromHour: 1, toHour: 2, days }, zone)).toMatch(/days/);
  });
  it("refuses all seven days, so a message can always leave, and a time zone that is not known", () => {
    expect(checkRule({ fromHour: 1, toHour: 2, days: [0, 1, 2, 3, 4, 5, 6] }, zone)).toMatch(/at least one day/);
    expect(checkRule({ fromHour: 1, toHour: 2, days: [], timeZone: "Mars/Olympus" }, zone)).toMatch(/time zone/);
  });
});

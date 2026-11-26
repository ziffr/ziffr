// When a connection notice is sent: always for an account not announced yet, a few times for one announced already,
// and a summary above the ceiling.
import { describe, expect, it } from "vitest";
import { CEILING_PER_DAY, CEILING_PER_HOUR, noticeRef, REPEATS_PER_DAY, REPEATS_PER_HOUR, SUMMARY_NOTICE, whatToSend, type EarlierNotice } from "./connection-notice-rules";

const NOW = Date.UTC(2026, 10, 26, 12);
const MINUTE = 60_000;
const ref = (account: number | string, what: "got" | "lost" = "got") => noticeRef(what, "telegram", String(account));
const sent = (r: string, minutesAgo: number, failed = false): EarlierNotice => ({ ref: r, at: NOW - minutesAgo * MINUTE, failed });
const many = (count: number, of: (i: number) => string, minutesAgo = 10) => Array.from({ length: count }, (_, i) => sent(of(i), minutesAgo));

describe("a notice's reference", () => {
  it("is the same for the same account, tells services, accounts and directions apart, and names none", () => {
    expect(ref(123456789)).toBe(ref(123456789));
    expect(new Set([ref(123456789), ref(123456780), ref(123456789, "lost"), noticeRef("got", "slack", "123456789")]).size).toBe(4);
    expect(ref(123456789)).not.toContain("123456789");
  });
});

describe("an account already announced", () => {
  it("is announced again only while there were few notices in the hour and the day", () => {
    expect(whatToSend(many(REPEATS_PER_HOUR - 1, () => ref("a")), ref("a"), NOW)).toBe("notice");
    expect(whatToSend(many(REPEATS_PER_HOUR, () => ref("a")), ref("a"), NOW)).toBe("nothing");
    // Notices about other accounts count towards the number too.
    expect(whatToSend([sent(ref("a"), 30), ...many(REPEATS_PER_HOUR - 1, (i) => ref(i))], ref("a"), NOW)).toBe("nothing");
    expect(whatToSend(many(REPEATS_PER_HOUR, () => ref("a"), 61), ref("a"), NOW)).toBe("notice");
    expect(whatToSend(many(REPEATS_PER_DAY - 1, () => ref("a"), 61), ref("a"), NOW)).toBe("notice");
    expect(whatToSend(many(REPEATS_PER_DAY, () => ref("a"), 61), ref("a"), NOW)).toBe("nothing");
  });
});

describe("an account not announced yet", () => {
  const busy = many(REPEATS_PER_DAY, () => ref("a"));
  it("is announced also past the limit for repeats", () => {
    expect(whatToSend(busy.slice(0, CEILING_PER_HOUR - 1), ref("b"), NOW)).toBe("notice");
    expect(whatToSend(many(REPEATS_PER_HOUR, () => ref("a")), ref("a", "lost"), NOW)).toBe("notice");
  });
  it("is one whose notice failed, or was more than a day ago", () => {
    const others = many(REPEATS_PER_HOUR, (i) => ref(i));
    expect(whatToSend([...others, sent(ref("a"), 5, true)], ref("a"), NOW)).toBe("notice");
    expect(whatToSend([...others, sent(ref("a"), 25 * 60)], ref("a"), NOW)).toBe("notice");
    expect(whatToSend([...others, sent(ref("a"), 5)], ref("a"), NOW)).toBe("nothing");
  });
});

describe("above the ceiling", () => {
  it("one summary an hour takes the place of single notices", () => {
    const full = many(CEILING_PER_HOUR, (i) => ref(i));
    expect(whatToSend(full.slice(1), ref("new"), NOW)).toBe("notice");
    expect(whatToSend(full, ref("new"), NOW)).toBe("summary");
    expect(whatToSend([...full, sent(SUMMARY_NOTICE, 5)], ref("newer"), NOW)).toBe("nothing");
    // A summary that failed told nobody, so another one goes.
    expect(whatToSend([...full, sent(SUMMARY_NOTICE, 5, true)], ref("newer"), NOW)).toBe("summary");
    // An hour later single notices go again, while the day has room.
    expect(whatToSend([...many(CEILING_PER_HOUR, (i) => ref(i), 61), sent(SUMMARY_NOTICE, 61)], ref("new"), NOW)).toBe("notice");
  });
  it("holds for the day too, and summaries do not count towards it", () => {
    const day = many(CEILING_PER_DAY, (i) => ref(i), 90);
    expect(whatToSend([...day.slice(1), sent(SUMMARY_NOTICE, 70)], ref("new"), NOW)).toBe("notice");
    expect(whatToSend(day, ref("new"), NOW)).toBe("summary");
    expect(whatToSend([...day, sent(SUMMARY_NOTICE, 61)], ref("new"), NOW)).toBe("summary");
    expect(whatToSend([...day, sent(SUMMARY_NOTICE, 59)], ref("new"), NOW)).toBe("nothing");
  });
});

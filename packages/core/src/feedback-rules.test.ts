// The rules of Feedback (spec 0049, ticket #915) without a database: kinds, words, route, version.
import { describe, expect, it } from "vitest";
import {
  cleanAppVersion, cleanFeedbackWords, cleanRejectionReason, FEEDBACK_REASON_MAX, FEEDBACK_WORDS_MAX, feedbackKind, feedbackMode, newFeedbackStatus, normalizeRoute,
} from "./feedback-rules";

describe("mode", () => {
  it("is direct unless the setting says review exactly", () => {
    expect(feedbackMode({})).toBe("direct");
    expect(feedbackMode({ ZIFFR_FEEDBACK_MODE: "" })).toBe("direct");
    expect(feedbackMode({ ZIFFR_FEEDBACK_MODE: "direct" })).toBe("direct");
    expect(feedbackMode({ ZIFFR_FEEDBACK_MODE: "anything" })).toBe("direct");
    expect(feedbackMode({ ZIFFR_FEEDBACK_MODE: " Review " })).toBe("review");
  });
  it("gives new feedback open in direct and waiting for review in review", () => {
    expect(newFeedbackStatus("direct")).toBe("open");
    expect(newFeedbackStatus("review")).toBe("waiting_for_review");
  });
});

describe("rejection reason", () => {
  it("is required, cleaned and bounded", () => {
    expect(cleanRejectionReason("  Not ours\u0000 ")).toEqual({ ok: true, reason: "Not ours" });
    for (const r of ["", "  ", undefined, 3, null]) expect(cleanRejectionReason(r).ok).toBe(false);
    expect(cleanRejectionReason("x".repeat(FEEDBACK_REASON_MAX)).ok).toBe(true);
    expect(cleanRejectionReason("x".repeat(FEEDBACK_REASON_MAX + 1)).ok).toBe(false);
  });
});

describe("kind", () => {
  it("accepts the three kinds and nothing else", () => {
    for (const k of ["problem", "idea", "question"]) expect(feedbackKind(k)).toBe(k);
    for (const k of ["Problem", "bug", "", null, 3, {}, ["idea"]]) expect(feedbackKind(k)).toBeNull();
  });
});

describe("words", () => {
  it("trims, makes line breaks plain and drops control characters", () => {
    expect(cleanFeedbackWords("  a\r\nb\u0000c\u0007  ")).toEqual({ ok: true, words: "a\nbc" });
  });
  it("refuses nothing, only whitespace, a non-string and too long", () => {
    for (const w of ["", "   \n ", undefined, 7, null]) expect(cleanFeedbackWords(w).ok).toBe(false);
    expect(cleanFeedbackWords("x".repeat(FEEDBACK_WORDS_MAX)).ok).toBe(true);
    expect(cleanFeedbackWords("x".repeat(FEEDBACK_WORDS_MAX + 1)).ok).toBe(false);
  });
});

describe("route", () => {
  it("keeps a plain path and drops the query and the fragment", () => {
    expect(normalizeRoute("/settings/members?metric=Revenue#top")).toBe("/settings/members");
    expect(normalizeRoute("/")).toBe("/");
  });
  it("hides what names something in a Workspace", () => {
    expect(normalizeRoute("/metrics/monthly-revenue")).toBe("/metrics/:name");
    expect(normalizeRoute("/dashboards/12/edit")).toBe("/dashboards/:name");
    expect(normalizeRoute("/metrics/monthly-revenue/2026-03-01")).toBe("/metrics/:name");
    expect(normalizeRoute("/v/abcdef")).toBe("/v/:name");
    expect(normalizeRoute("/foo/123456")).toBe("/foo/:id");
    expect(normalizeRoute("/foo/0a1b2c3d4e5f60718293")).toBe("/foo/:id");
  });
  it("drops what is not a path of this app", () => {
    for (const r of ["https://evil.example/x", "//evil.example", "metrics", "/a b", "/a/../b", "/é", "/x".repeat(200), "/a%2fb", null, 4, ""]) expect(normalizeRoute(r)).toBeNull();
  });
});

describe("app version", () => {
  it("accepts a version number and nothing else", () => {
    expect(cleanAppVersion("0.11.0")).toBe("0.11.0");
    expect(cleanAppVersion("1.2.3-rc.1")).toBe("1.2.3-rc.1");
    for (const v of ["v1.2.3", "1.2", "latest", "1.2.3 Revenue", null, 1]) expect(cleanAppVersion(v)).toBeNull();
  });
});

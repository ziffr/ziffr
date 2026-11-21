// Sending limits (ticket #516): every range and default is the one the review of fixed values proposed, a value
// outside its range is refused in a sentence, and no limit can be switched off. Pure: no database.
import { describe, expect, it } from "vitest";
import { INSTALLATION_SETTINGS, SETTINGS_SECTIONS } from "./installation-catalogue";
import { SENDING_LIMITS, sendingLimitDefault, sendingLimitFrom, sendingLimitOf, sendingLimitProblem } from "./sending-limits";
import { MAX_ATTEMPTS, MAIL_PER_SENDER_PER_DAY, MAIL_PER_WORKSPACE_PER_DAY } from "./mail";
import { VALUES_PER_DAY } from "./api-submissions";
import { FEED_VALUES_PER_DAY } from "./feeds";
import { WEBHOOKS_PER_WORKSPACE, WEBHOOK_SENDS_PER_WORKSPACE_PER_DAY } from "./webhook-limits";
import { ALERTS_PER_WORKSPACE, ALERT_MESSAGES_PER_WORKSPACE_PER_DAY } from "./alert-limits";

/** The review's rows 1 to 4 and 7 to 17 (docs/reviews/2026-11-fixed-values.md, section 2): [key, name, min, max, default]. */
const REVIEW: [string, string, number, number, number][] = [
  ["mailPerWorkspace", "ZIFFR_LIMIT_EMAILS_PER_WORKSPACE_PER_DAY", 50, 100_000, 500],
  ["chatPerWorkspace", "ZIFFR_LIMIT_CHAT_MESSAGES_PER_WORKSPACE_PER_DAY", 50, 50_000, 500],
  ["mailPerPerson", "ZIFFR_LIMIT_EMAILS_PER_PERSON_PER_DAY", 20, 5_000, 300],
  ["sendAttempts", "ZIFFR_LIMIT_SEND_ATTEMPTS", 1, 10, 5],
  ["alertsPerWorkspace", "ZIFFR_LIMIT_ALERTS_PER_WORKSPACE", 50, 10_000, 500],
  ["alertMessagesPerWorkspace", "ZIFFR_LIMIT_ALERT_MESSAGES_PER_WORKSPACE_PER_DAY", 100, 100_000, 2_000],
  ["invitationsPerWorkspace", "ZIFFR_LIMIT_INVITATION_EMAILS_PER_WORKSPACE_PER_DAY", 10, 2_000, 50],
  ["valuesPerKey", "ZIFFR_LIMIT_VALUES_PER_KEY_PER_DAY", 100, 1_000_000, 1_000],
  ["valuesPerFeed", "ZIFFR_LIMIT_VALUES_PER_FEED_PER_DAY", 1_000, 10_000_000, 10_000],
  ["callsPerKey", "ZIFFR_LIMIT_CALLS_PER_KEY_PER_MINUTE", 30, 6_000, 60],
  ["webhooksPerWorkspace", "ZIFFR_LIMIT_WEBHOOKS_PER_WORKSPACE", 1, 50, 5],
  ["webhookSendsPerWorkspace", "ZIFFR_LIMIT_WEBHOOK_SENDS_PER_WORKSPACE_PER_DAY", 100, 1_000_000, 10_000],
  ["signInLinksPerNetwork", "ZIFFR_LIMIT_SIGN_IN_LINKS_PER_NETWORK_PER_HOUR", 5, 500, 20],
  ["contactsPerWorkspace", "ZIFFR_LIMIT_CONTACTS_PER_WORKSPACE", 100, 100_000, 1_000],
  ["snapshotsPerDashboard", "ZIFFR_LIMIT_SNAPSHOTS_PER_DASHBOARD", 100, 50_000, 500],
];

describe("the sending limits", () => {
  it("are the review's, each with its range and default", () => {
    expect(SENDING_LIMITS.map((l) => [l.key, l.name, l.min, l.max, l.default])).toEqual(REVIEW);
  });

  it("never allow zero or less, and keep every default inside its range", () => {
    for (const l of SENDING_LIMITS) {
      expect(l.min).toBeGreaterThanOrEqual(1);
      expect(l.default).toBeGreaterThanOrEqual(l.min);
      expect(l.default).toBeLessThanOrEqual(l.max);
      expect(l.max).toBeLessThanOrEqual(10_000_000);
      expect(sendingLimitProblem(l, "0")).toMatch(/cannot be switched off/);
    }
  });

  it("are Installation Settings of the section Sending limits, named ZIFFR_LIMIT_*, with help and the range in words", () => {
    expect(SETTINGS_SECTIONS.find((s) => s.id === "sending")).toMatchObject({ title: "Sending limits", ready: true });
    const settings = INSTALLATION_SETTINGS.filter((s) => s.section === "sending");
    expect(settings.map((s) => s.name)).toEqual(REVIEW.map((r) => r[1]));
    for (const [i, s] of settings.entries()) {
      expect(s.name).toMatch(/^ZIFFR_LIMIT_[A-Z_]+$/);
      expect(s.secret).toBe(false);
      expect(s.placeholder).toBe(String(REVIEW[i][4]));
      expect(s.help).toContain(`${REVIEW[i][2].toLocaleString("en-US")} to ${REVIEW[i][3].toLocaleString("en-US")}`);
    }
  });

  it("refuse a value outside the range, or not a whole number, with a sentence that names the range", () => {
    for (const [key, , min, max] of REVIEW) {
      const l = sendingLimitOf(key as never);
      expect(sendingLimitProblem(l, String(min))).toBeNull();
      expect(sendingLimitProblem(l, String(max))).toBeNull();
      expect(sendingLimitProblem(l, ` ${l.default} `)).toBeNull();
      expect(sendingLimitProblem(l, String(min - 1))).toBe(`${l.label} must be from ${min.toLocaleString("en-US")} to ${max.toLocaleString("en-US")}; it cannot be switched off or left without a limit.`);
      expect(sendingLimitProblem(l, String(max + 1))).toContain(`must be from ${min.toLocaleString("en-US")} to ${max.toLocaleString("en-US")}`);
      for (const bad of ["", "-1", "1.5", "1e3", "ten", "0x10", "99999999999"]) {
        expect(sendingLimitProblem(l, bad)).toBe(`${l.label} is a whole number from ${min.toLocaleString("en-US")} to ${max.toLocaleString("en-US")}.`);
      }
    }
  });

  it("are read from the settings: the number set, else the default, never a value outside the range", () => {
    for (const [key, name, min, max, def] of REVIEW) {
      expect(sendingLimitFrom({}, key as never)).toBe(def);
      expect(sendingLimitFrom({ [name]: String(min) }, key as never)).toBe(min);
      expect(sendingLimitFrom({ [name]: ` ${max} ` }, key as never)).toBe(max);
      for (const bad of ["0", String(min - 1), String(max + 1), "", "many", "-3"]) expect(sendingLimitFrom({ [name]: bad }, key as never)).toBe(def);
    }
  });

  it("have the code's exported constants as their defaults", () => {
    expect(sendingLimitDefault("mailPerWorkspace")).toBe(MAIL_PER_WORKSPACE_PER_DAY);
    expect([MAX_ATTEMPTS, MAIL_PER_SENDER_PER_DAY, VALUES_PER_DAY, FEED_VALUES_PER_DAY, WEBHOOKS_PER_WORKSPACE, WEBHOOK_SENDS_PER_WORKSPACE_PER_DAY, ALERTS_PER_WORKSPACE, ALERT_MESSAGES_PER_WORKSPACE_PER_DAY])
      .toEqual([5, 300, 1_000, 10_000, 5, 10_000, 500, 2_000]);
  });
});

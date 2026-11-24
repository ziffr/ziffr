// The fixed words of a Test Message (GLOSSARY: Test Message): nothing typed by anyone reaches them but the Workspace's name.
import { describe, expect, it } from "vitest";
import { limitWords, NO_WAY_HERE, TEST_PER_DAY, TEST_PER_WAY_PER_WINDOW, TEST_WINDOW_MINUTES, testText } from "./test-message-words";

describe("the text of a Test Message", () => {
  it("names the Workspace and the way, and asks for nothing", () => {
    expect(testText("Acme", "slack")).toBe("This is a test from Ziffr for Acme. If you can read it here, Ziffr reaches you on Slack. Nothing to answer.");
    expect(testText("<!here> A&B <https://x|go>", "slack")).not.toMatch(/[<>&]/);
    expect(testText("Acme", "email")).toContain("on email");
    expect(testText("", "telegram")).toBe("This is a test from Ziffr. If you can read it here, Ziffr reaches you on Telegram. Nothing to answer.");
  });
  it("keeps a long or multi-line Workspace name to one short line", () => {
    const text = testText(`Acme\n\n${"x".repeat(500)}`, "email");
    expect(text).not.toContain("\n");
    expect(text.length).toBeLessThan(250);
  });
});

describe("the reasons and the limits", () => {
  it("say what is missing and who adds it, with no address or secret", () => {
    for (const reason of Object.values(NO_WAY_HERE)) expect(reason).not.toMatch(/@|token|secret|password/i);
    expect(NO_WAY_HERE.slackApp).toContain("This Ziffr has no Slack app");
    expect(NO_WAY_HERE.mail).toContain("no mail server");
    expect(NO_WAY_HERE.telegramBot).toContain("no Telegram bot");
  });
  it("say which limit and when it resets", () => {
    const now = Date.parse("2027-01-27T10:00:00Z");
    expect(limitWords("window", "2027-01-27T10:04:00Z", now)).toBe(`You sent ${TEST_PER_WAY_PER_WINDOW} test messages by this way in the last ${TEST_WINDOW_MINUTES} minutes. Try again in 4 minutes.`);
    expect(limitWords("window", "2027-01-27T10:00:10Z", now)).toContain("in 1 minute.");
    expect(limitWords("day", "2027-01-27T15:00:00Z", now)).toBe(`You sent ${TEST_PER_DAY} test messages today. Try again in 5 hours.`);
  });
});

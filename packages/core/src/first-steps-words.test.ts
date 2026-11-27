// The fixed words and rules of First Steps' last three screens (spec 0067; GLOSSARY: First Steps).
import { describe, expect, it } from "vitest";
import { colleagueWords, contactName, nameList, replyWords, sentWords, whenWords } from "./first-steps-words";

describe("what became of a reply", () => {
  it("has the spec's words, with only the person's own address in them", () => {
    expect(replyWords("refused", "a@example.test")).toBe("Your reply was not recorded. Ziffr emailed you why.");
    expect(replyWords("form_link", null)).toBe("Your reply was not recorded. Ziffr emailed you why.");
    expect(replyWords("held", null)).toBe("Check your inbox for a link that confirms your reply.");
    expect(replyWords("wrong_sender", "a@example.test")).toBe("A reply came from another address, so it was not counted. Reply from a@example.test.");
    expect(replyWords("expired", null)).toBe("That request is too old. Ask again.");
  });
  it("promises no email where none may have gone, and says nothing about a reply that was taken", () => {
    for (const outcome of ["unverified", "empty", "too_many", "limited"]) expect(replyWords(outcome, null)).toBe("Your reply was not recorded.");
    for (const outcome of ["recorded", "taken", "replied", "unknown_token", "duplicate", "anything else"]) expect(replyWords(outcome, "a@example.test")).toBeNull();
  });
});

describe("after a request went", () => {
  it("names the address and the subject, and how to answer", () => {
    expect(sentWords({ state: "sent", address: "a@example.test", metric: "Signups", reply: true })).toBe("Sent to a@example.test. Look for an email whose subject starts with “What’s the number for Signups”. Reply to it with the number.");
    expect(sentWords({ state: "queued", address: null, metric: "Signups", reply: false })).toBe("On its way. Look for an email whose subject starts with “What’s the number for Signups”. Open the link in the email and type the number.");
  });
});

describe("a day and hour", () => {
  it("is written in words", () => {
    expect(whenWords("2026-11-30", 9)).toBe("Monday 30 November at 09:00");
  });
});

describe("a colleague", () => {
  it("is named by the part of the address before the @", () => {
    expect(contactName("sam.doe@example.test")).toBe("sam.doe");
    expect(contactName(`${"a".repeat(100)}@example.test`)).toHaveLength(80);
  });
  it("is said to be asked only once they accept while an invitation is open", () => {
    for (const state of ["invited", "link", "waiting"] as const) expect(colleagueWords({ state, name: "sam", when: null }).at(-1)).toBe("Ziffr asks them once they accept.");
    expect(colleagueWords({ state: "link", name: "sam", when: null, note: "Too many invitation emails today; send the link yourself." })[0]).toBe("Too many invitation emails today; send the link yourself.");
    expect(colleagueWords({ state: "outbox", name: "sam", when: null })).toEqual(["sam is added. The request waits in the Outbox."]);
    expect(colleagueWords({ state: "asked", name: "sam", when: "Monday 30 November at 09:00" })).toEqual(["Ziffr asks sam from now on. It first asks on Monday 30 November at 09:00."]);
  });
  it("lists names briefly", () => {
    expect(nameList([])).toBe("");
    expect(nameList(["You"])).toBe("You");
    expect(nameList(["You", "sam"])).toBe("You and sam");
    expect(nameList(["You", "a", "b", "c", "d"])).toBe("You, a and 3 more");
  });
});

// First Steps' answers in the browser (spec 0067; GLOSSARY: First Steps): what is read back from the browser's storage,
// what the browser's settings propose, and which screen `?step=` opens.
import { describe, expect, it } from "vitest";
import { answersToSend, NO_ANSWERS, questionScreens, screenFor } from "@ziffr/core/first-steps-screens";
import { browserDefaults } from "./browser";
import { draftKey, readDraft } from "./draft";

describe("the kept draft", () => {
  it("is one per person, and one per Workspace once it exists", () => {
    expect(draftKey("ada", null)).not.toBe(draftKey("bo", null));
    expect(draftKey("ada", "w1")).not.toBe(draftKey("ada", null));
  });

  it("reads back what was answered", () => {
    const answers = { ...NO_ANSWERS, who: "team", role: "sales", industry: "saas", segment: "b2b", name: "Corner Shop", country: "DE", currency: "EUR", timeZone: "Europe/Berlin", weekStart: 1 };
    expect(readDraft(JSON.stringify(answers))).toEqual(answers);
  });

  it("takes nothing from a text that is not answers", () => {
    for (const text of [null, "", "no json", "[1]", "7", "null"]) expect(readDraft(text)).toBeNull();
  });

  it("drops every field that is not on its list, and anything unknown", () => {
    const read = readDraft(JSON.stringify({ who: "everyone", role: "__proto__", industry: 3, segment: {}, topic: "x", name: "n".repeat(5000), country: "XX", currency: "no", timeZone: "z".repeat(100), weekStart: 4, email: "a colleague" }));
    expect(read).toEqual({ ...NO_ANSWERS, name: "n".repeat(120) });
  });
});

describe("the browser's own settings", () => {
  it("propose a country and its currency only from a region the language names", () => {
    expect(browserDefaults("de-CH", "Europe/Zurich")).toMatchObject({ country: "CH", currency: "CHF", timeZone: "Europe/Zurich", weekStart: 1 });
    expect(browserDefaults("de", undefined)).toMatchObject({ country: null, currency: null, timeZone: null });
  });

  it("say nothing rather than fail on what they cannot read", () => {
    expect(browserDefaults("not a language!", "Mars/Olympus")).toEqual({ country: null, currency: null, timeZone: null, weekStart: null });
  });
});

describe("the screen a step opens", () => {
  it("starts at the first question and keeps the other branch out", () => {
    expect(screenFor(null, null, null)).toBe("who");
    expect(screenFor("workspace", null, null)).toBe("who");
    expect(screenFor("role", "me", null)).toBe("who");
    expect(screenFor("sets", "team", null)).toBe("workspace");
    expect(screenFor("nonsense", "team", null)).toBe("who");
  });

  it("resumes where the Workspace is, and opens its questions again", () => {
    expect(screenFor(null, "team", "start")).toBe("start");
    expect(screenFor(null, "team", "sender")).toBe("sender");
    expect(screenFor("who", "team", "value")).toBe("who");
    expect(screenFor("first", "me", "start")).toBe("first");
    expect(screenFor("role", "me", "start")).toBe("start");
  });

  it("asks one branch's questions and sends only its answers", () => {
    expect(questionScreens("me")).toEqual(["who", "topic", "workspace"]);
    const answers = { ...NO_ANSWERS, role: "sales" as const, topic: "health" as const };
    expect(answersToSend({ ...answers, who: "me" })).toMatchObject({ role: null, topic: "health" });
    expect(answersToSend({ ...answers, who: "team" })).toMatchObject({ role: "sales", topic: null });
  });
});
